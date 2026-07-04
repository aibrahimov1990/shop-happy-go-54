
-- Revoke public/anon/authenticated EXECUTE on all SECURITY DEFINER trigger / dispatcher helpers.
REVOKE EXECUTE ON FUNCTION public.claim_edit_for_client() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_edits_client_immutability() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_messages_read_only_updates() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_shopper_for_sellier_domain() FROM PUBLIC, anon, authenticated;

-- has_role is called from RLS policies for signed-in users; keep authenticated EXECUTE but revoke anon.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
