
CREATE OR REPLACE FUNCTION public.claim_edit_for_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.client_user_id IS NULL AND NEW.client_email IS NOT NULL THEN
    SELECT id INTO NEW.client_user_id
    FROM public.profiles
    WHERE lower(email) = lower(NEW.client_email)
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_claim_edit_for_client ON public.edits;
CREATE TRIGGER trg_claim_edit_for_client
BEFORE INSERT OR UPDATE OF client_email ON public.edits
FOR EACH ROW EXECUTE FUNCTION public.claim_edit_for_client();

-- Backfill existing rows
UPDATE public.edits e
SET client_user_id = p.id
FROM public.profiles p
WHERE e.client_user_id IS NULL
  AND lower(p.email) = lower(e.client_email);
