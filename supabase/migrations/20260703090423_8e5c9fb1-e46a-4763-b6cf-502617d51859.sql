CREATE TABLE public.wishlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  shopify_product_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, shopify_product_id)
);

CREATE INDEX wishlists_user_id_idx ON public.wishlists(user_id);
CREATE INDEX wishlists_created_at_idx ON public.wishlists(created_at DESC);

GRANT SELECT, INSERT, DELETE ON public.wishlists TO authenticated;
GRANT ALL ON public.wishlists TO service_role;

ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own wishlist"
  ON public.wishlists
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Shoppers and admins can view all wishlists"
  ON public.wishlists
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'shopper') OR public.has_role(auth.uid(), 'admin'));
