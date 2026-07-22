
CREATE TABLE public.saved_searches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand TEXT,
  keyword TEXT,
  product_type TEXT,
  max_price NUMERIC,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT saved_searches_has_criteria CHECK (
    brand IS NOT NULL OR keyword IS NOT NULL OR product_type IS NOT NULL
  ),
  CONSTRAINT saved_searches_max_price_positive CHECK (max_price IS NULL OR max_price > 0)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_searches TO authenticated;
GRANT ALL ON public.saved_searches TO service_role;

ALTER TABLE public.saved_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own saved searches"
  ON public.saved_searches FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX saved_searches_user_id_idx ON public.saved_searches(user_id);
CREATE INDEX saved_searches_active_idx ON public.saved_searches(active) WHERE active = true;

CREATE OR REPLACE FUNCTION public.saved_searches_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER saved_searches_updated_at
  BEFORE UPDATE ON public.saved_searches
  FOR EACH ROW EXECUTE FUNCTION public.saved_searches_touch_updated_at();

CREATE TABLE public.saved_search_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  saved_search_id UUID NOT NULL REFERENCES public.saved_searches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shopify_product_id TEXT NOT NULL,
  notified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, shopify_product_id)
);

GRANT SELECT ON public.saved_search_notifications TO authenticated;
GRANT ALL ON public.saved_search_notifications TO service_role;

ALTER TABLE public.saved_search_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own notification history"
  ON public.saved_search_notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX saved_search_notifications_user_id_idx ON public.saved_search_notifications(user_id);
CREATE INDEX saved_search_notifications_notified_at_idx ON public.saved_search_notifications(notified_at DESC);
