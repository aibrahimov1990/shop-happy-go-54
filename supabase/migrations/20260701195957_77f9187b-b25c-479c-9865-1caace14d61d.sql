
CREATE TABLE public.app_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  screen TEXT,
  duration_ms INTEGER,
  platform TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX app_events_created_at_idx ON public.app_events (created_at DESC);
CREATE INDEX app_events_user_id_idx ON public.app_events (user_id);
CREATE INDEX app_events_session_id_idx ON public.app_events (session_id);
CREATE INDEX app_events_event_type_idx ON public.app_events (event_type);

GRANT INSERT ON public.app_events TO anon, authenticated;
GRANT ALL ON public.app_events TO service_role;

ALTER TABLE public.app_events ENABLE ROW LEVEL SECURITY;

-- Anyone (including anonymous) can insert their own analytics events
CREATE POLICY "anyone can insert app events"
  ON public.app_events FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only admins can read (via server function using service role, but keep RLS tight)
CREATE POLICY "admins can read app events"
  ON public.app_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
