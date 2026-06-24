
-- Roles enum & user_roles table (kept separate from profiles for security)
CREATE TYPE public.app_role AS ENUM ('admin', 'shopper', 'client');

CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles readable by owner" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Profiles updatable by owner" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Profiles insertable by owner" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE TABLE public.user_roles (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read their own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Security-definer helper to check roles without RLS recursion
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Auto-create profile + default 'client' role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name')
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'client')
  ON CONFLICT DO NOTHING;

  -- Auto-claim any edits that were addressed to this email before signup
  UPDATE public.edits
  SET client_user_id = NEW.id
  WHERE client_user_id IS NULL
    AND lower(client_email) = lower(NEW.email);

  RETURN NEW;
END;
$$;

-- Edit statuses
CREATE TYPE public.edit_status AS ENUM ('draft', 'sent', 'viewed');

CREATE TABLE public.edits (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  shopper_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  client_email TEXT NOT NULL,
  client_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  note TEXT,
  status public.edit_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.edits TO authenticated;
GRANT ALL ON public.edits TO service_role;
ALTER TABLE public.edits ENABLE ROW LEVEL SECURITY;

-- Shoppers/admins manage their own edits
CREATE POLICY "Shoppers can read their own edits" ON public.edits
  FOR SELECT TO authenticated
  USING (shopper_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Shoppers can create edits" ON public.edits
  FOR INSERT TO authenticated
  WITH CHECK (
    shopper_id = auth.uid()
    AND (public.has_role(auth.uid(), 'shopper') OR public.has_role(auth.uid(), 'admin'))
  );
CREATE POLICY "Shoppers can update their own edits" ON public.edits
  FOR UPDATE TO authenticated
  USING (shopper_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Shoppers can delete their own edits" ON public.edits
  FOR DELETE TO authenticated
  USING (shopper_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
-- Clients see edits addressed to them (claimed) or to their email
CREATE POLICY "Clients can read their own edits" ON public.edits
  FOR SELECT TO authenticated
  USING (
    client_user_id = auth.uid()
    OR lower(client_email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
  );
-- Clients can mark their own edits as viewed
CREATE POLICY "Clients can mark viewed" ON public.edits
  FOR UPDATE TO authenticated
  USING (client_user_id = auth.uid());

CREATE INDEX edits_shopper_idx ON public.edits(shopper_id, created_at DESC);
CREATE INDEX edits_client_user_idx ON public.edits(client_user_id, created_at DESC);
CREATE INDEX edits_client_email_idx ON public.edits(lower(client_email));

-- Edit items
CREATE TABLE public.edit_items (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  edit_id UUID NOT NULL REFERENCES public.edits(id) ON DELETE CASCADE,
  shopify_product_id TEXT NOT NULL,
  shopify_handle TEXT NOT NULL,
  title TEXT NOT NULL,
  image_url TEXT,
  price_amount NUMERIC(12,2),
  price_currency TEXT,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.edit_items TO authenticated;
GRANT ALL ON public.edit_items TO service_role;
ALTER TABLE public.edit_items ENABLE ROW LEVEL SECURITY;
-- Items inherit access from their parent edit
CREATE POLICY "Read items of accessible edits" ON public.edit_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.edits e WHERE e.id = edit_id));
CREATE POLICY "Shoppers write items on their edits" ON public.edit_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.edits e WHERE e.id = edit_id AND (e.shopper_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.edits e WHERE e.id = edit_id AND (e.shopper_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
CREATE INDEX edit_items_edit_idx ON public.edit_items(edit_id, position);

-- Now create the new-user trigger (after edits table exists, referenced by handle_new_user)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable realtime for the client edits inbox
ALTER TABLE public.edits REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.edits;
