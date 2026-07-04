
-- 1. Fix edits "Clients can mark viewed" — enforce immutability via trigger
DROP POLICY IF EXISTS "Clients can mark viewed" ON public.edits;
CREATE POLICY "Clients can mark viewed" ON public.edits
  FOR UPDATE TO authenticated
  USING (client_user_id = auth.uid())
  WITH CHECK (client_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.enforce_edits_client_immutability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Only guard when the updater is the client (not the shopper/admin).
  IF auth.uid() IS NOT NULL
     AND NEW.client_user_id = auth.uid()
     AND (OLD.shopper_id IS DISTINCT FROM NEW.shopper_id)
        OR (OLD.client_email IS DISTINCT FROM NEW.client_email)
        OR (OLD.client_user_id IS DISTINCT FROM NEW.client_user_id)
        OR (OLD.title IS DISTINCT FROM NEW.title)
        OR (OLD.note IS DISTINCT FROM NEW.note)
        OR (OLD.status IS DISTINCT FROM NEW.status)
  THEN
    -- Allow shoppers/admins to change these fields
    IF NOT (public.has_role(auth.uid(), 'shopper'::app_role)
            OR public.has_role(auth.uid(), 'admin'::app_role)
            OR OLD.shopper_id = auth.uid())
    THEN
      RAISE EXCEPTION 'Clients may only update viewed_at on edits';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_edits_client_immutability ON public.edits;
CREATE TRIGGER trg_enforce_edits_client_immutability
  BEFORE UPDATE ON public.edits
  FOR EACH ROW EXECUTE FUNCTION public.enforce_edits_client_immutability();

-- 2. Fix messages "Participants mark read" — restrict to only read_by_* columns for the correct participant
DROP POLICY IF EXISTS "Participants mark read" ON public.messages;
CREATE POLICY "Participants mark read" ON public.messages
  FOR UPDATE TO authenticated
  USING ((shopper_id = auth.uid()) OR (client_user_id = auth.uid()))
  WITH CHECK ((shopper_id = auth.uid()) OR (client_user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.enforce_messages_read_only_updates()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  -- Admins bypass
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;
  -- Immutable content fields
  IF OLD.body IS DISTINCT FROM NEW.body
     OR OLD.sender_id IS DISTINCT FROM NEW.sender_id
     OR OLD.shopper_id IS DISTINCT FROM NEW.shopper_id
     OR OLD.client_user_id IS DISTINCT FROM NEW.client_user_id
     OR OLD.created_at IS DISTINCT FROM NEW.created_at
  THEN
    RAISE EXCEPTION 'Message content is immutable';
  END IF;
  -- Only the client can change read_by_client_at; only the shopper can change read_by_shopper_at
  IF OLD.read_by_client_at IS DISTINCT FROM NEW.read_by_client_at
     AND auth.uid() <> NEW.client_user_id THEN
    RAISE EXCEPTION 'Only the client recipient can mark read_by_client_at';
  END IF;
  IF OLD.read_by_shopper_at IS DISTINCT FROM NEW.read_by_shopper_at
     AND auth.uid() <> NEW.shopper_id THEN
    RAISE EXCEPTION 'Only the shopper recipient can mark read_by_shopper_at';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_messages_read_only_updates ON public.messages;
CREATE TRIGGER trg_enforce_messages_read_only_updates
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_messages_read_only_updates();

-- 3. device_tokens — prevent claiming other devices' anonymous tokens
DROP POLICY IF EXISTS "Users manage their own tokens" ON public.device_tokens;
CREATE POLICY "Users read their own tokens" ON public.device_tokens
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users insert their own tokens" ON public.device_tokens
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update their own tokens" ON public.device_tokens
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete their own tokens" ON public.device_tokens
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- 4. app_events — replace WITH CHECK (true) with owner-scoped check
DROP POLICY IF EXISTS "anyone can insert app events" ON public.app_events;
CREATE POLICY "anyone can insert app events" ON public.app_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- 5. Lock down SECURITY DEFINER helpers + set search_path
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
 RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq AS $function$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$function$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
 RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq AS $function$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq AS $function$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
 RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq AS $function$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$function$;
