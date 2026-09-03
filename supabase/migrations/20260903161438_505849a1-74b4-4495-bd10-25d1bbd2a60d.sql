CREATE TABLE public.drop_countdown_config (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false,
  headline text NOT NULL DEFAULT 'The £2,500 Drop',
  starts_at timestamptz NOT NULL DEFAULT '2026-09-26T09:00:00Z',
  hide_at timestamptz NOT NULL DEFAULT '2026-09-27T09:00:00Z',
  live_message text NOT NULL DEFAULT 'Live now',
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.drop_countdown_config TO anon;
GRANT SELECT ON public.drop_countdown_config TO authenticated;
GRANT ALL ON public.drop_countdown_config TO service_role;

ALTER TABLE public.drop_countdown_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drop countdown config is publicly readable"
  ON public.drop_countdown_config FOR SELECT
  TO anon, authenticated
  USING (true);

INSERT INTO public.drop_countdown_config (id) VALUES (1);