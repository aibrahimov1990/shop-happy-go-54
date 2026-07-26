ALTER TABLE public.broadcasts
  ADD COLUMN IF NOT EXISTS total_tokens integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS permanent_failure_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transient_failure_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pruned_token_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS signed_in_recipients integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS anonymous_recipients integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS device_tokens_updated_at_idx ON public.device_tokens (updated_at);

CREATE OR REPLACE FUNCTION public.prune_stale_device_tokens(_older_than_days integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE removed integer;
BEGIN
  DELETE FROM public.device_tokens
  WHERE updated_at < now() - make_interval(days => _older_than_days);
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_stale_device_tokens(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_stale_device_tokens(integer) TO service_role;

SELECT cron.unschedule('prune-stale-device-tokens')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune-stale-device-tokens');

SELECT cron.schedule(
  'prune-stale-device-tokens',
  '30 3 * * 1',
  $$ SELECT public.prune_stale_device_tokens(90); $$
);