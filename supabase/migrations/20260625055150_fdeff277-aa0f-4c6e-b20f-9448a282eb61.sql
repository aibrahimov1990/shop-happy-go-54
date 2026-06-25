DROP POLICY IF EXISTS "Clients can read their own edits" ON public.edits;
CREATE POLICY "Clients can read their own edits"
ON public.edits
FOR SELECT
TO authenticated
USING (
  client_user_id = auth.uid()
  OR lower(client_email) = lower(((auth.jwt() ->> 'email')::text))
);