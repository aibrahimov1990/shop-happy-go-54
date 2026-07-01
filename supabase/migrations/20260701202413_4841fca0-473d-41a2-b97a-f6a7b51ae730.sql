
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shopper_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_by_client_at timestamptz,
  read_by_shopper_at timestamptz
);

CREATE INDEX messages_pair_idx ON public.messages (shopper_id, client_user_id, created_at DESC);
CREATE INDEX messages_client_unread_idx ON public.messages (client_user_id) WHERE read_by_client_at IS NULL;
CREATE INDEX messages_shopper_unread_idx ON public.messages (shopper_id) WHERE read_by_shopper_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants read messages"
  ON public.messages FOR SELECT TO authenticated
  USING (shopper_id = auth.uid() OR client_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Participants send messages"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (sender_id = shopper_id OR sender_id = client_user_id)
  );

CREATE POLICY "Participants mark read"
  ON public.messages FOR UPDATE TO authenticated
  USING (shopper_id = auth.uid() OR client_user_id = auth.uid())
  WITH CHECK (shopper_id = auth.uid() OR client_user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
