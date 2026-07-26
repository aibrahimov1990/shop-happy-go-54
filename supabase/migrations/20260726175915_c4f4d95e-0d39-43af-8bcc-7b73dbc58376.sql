-- Archive table for removed device tokens (recoverable deletion)
CREATE TABLE public.device_tokens_deleted (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL,
  platform text,
  user_id uuid,
  token_created_at timestamptz,
  token_updated_at timestamptz,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL,
  broadcast_id uuid
);

GRANT SELECT ON public.device_tokens_deleted TO authenticated;
GRANT ALL ON public.device_tokens_deleted TO service_role;

ALTER TABLE public.device_tokens_deleted ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view archived device tokens"
  ON public.device_tokens_deleted FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_device_tokens_deleted_deleted_at ON public.device_tokens_deleted (deleted_at);
CREATE INDEX idx_device_tokens_deleted_token ON public.device_tokens_deleted (token);

-- Prune archive rows older than 90 days
CREATE OR REPLACE FUNCTION public.prune_device_token_archive(_older_than_days integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE removed integer;
BEGIN
  DELETE FROM public.device_tokens_deleted
  WHERE deleted_at < now() - make_interval(days => _older_than_days);
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_device_token_archive(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_device_token_archive(integer) TO service_role;

SELECT cron.schedule(
  'prune-device-token-archive',
  '45 3 * * 1',
  $cron$ SELECT public.prune_device_token_archive(90); $cron$
);

-- Broadcast reporting columns for the circuit breaker
ALTER TABLE public.broadcasts
  ADD COLUMN IF NOT EXISTS suspect_failure_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS systemic_suspected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dominant_error_code text;