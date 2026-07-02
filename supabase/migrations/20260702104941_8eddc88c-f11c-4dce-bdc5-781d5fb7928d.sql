
CREATE TABLE public.app_first_order_discounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  shopify_discount_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_first_order_discounts TO authenticated;
GRANT ALL ON public.app_first_order_discounts TO service_role;
ALTER TABLE public.app_first_order_discounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own discount select" ON public.app_first_order_discounts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
