
ALTER FUNCTION public.saved_searches_touch_updated_at() SECURITY INVOKER;
REVOKE ALL ON FUNCTION public.saved_searches_touch_updated_at() FROM PUBLIC, anon, authenticated;
