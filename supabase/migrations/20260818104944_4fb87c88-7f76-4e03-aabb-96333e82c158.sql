CREATE TABLE public.launch_credit_config (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false,
  amount_gbp numeric(10,2) NOT NULL DEFAULT 100.00,
  starts_at timestamptz NOT NULL DEFAULT '2026-08-22T09:00:00Z',
  ends_at timestamptz NOT NULL DEFAULT '2026-08-23T11:00:00Z',
  max_codes integer NOT NULL DEFAULT 2000,
  require_verified_email boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.launch_credit_config TO service_role;
ALTER TABLE public.launch_credit_config ENABLE ROW LEVEL SECURITY;

INSERT INTO public.launch_credit_config (id) VALUES (1);

CREATE TABLE public.launch_credit_blocked_domains (
  domain text PRIMARY KEY
);
GRANT ALL ON public.launch_credit_blocked_domains TO service_role;
ALTER TABLE public.launch_credit_blocked_domains ENABLE ROW LEVEL SECURITY;

INSERT INTO public.launch_credit_blocked_domains (domain) VALUES
 ('mailinator.com'),('guerrillamail.com'),('10minutemail.com'),('tempmail.com'),
 ('temp-mail.org'),('yopmail.com'),('throwawaymail.com'),('sharklasers.com'),
 ('trashmail.com'),('getnada.com'),('dispostable.com'),('maildrop.cc'),
 ('fakeinbox.com'),('mohmal.com'),('emailondeck.com'),('spam4.me'),
 ('grr.la'),('mailnesia.com'),('tempr.email'),('moakt.com');

CREATE TABLE public.app_launch_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  email_normalised text NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  shopify_discount_id text,
  shopify_customer_id text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  redeemed_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text
);
CREATE INDEX idx_app_launch_credits_email_normalised ON public.app_launch_credits (email_normalised);
CREATE INDEX idx_app_launch_credits_redeemed_at ON public.app_launch_credits (redeemed_at);

GRANT SELECT ON public.app_launch_credits TO authenticated;
GRANT ALL ON public.app_launch_credits TO service_role;
ALTER TABLE public.app_launch_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own launch credit"
  ON public.app_launch_credits FOR SELECT TO authenticated
  USING (auth.uid() = user_id);