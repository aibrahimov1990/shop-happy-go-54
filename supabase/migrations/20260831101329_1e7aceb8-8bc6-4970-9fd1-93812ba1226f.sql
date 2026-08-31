ALTER TABLE public.broadcasts
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz NULL,
  ADD COLUMN IF NOT EXISTS image_path text NULL,
  ADD COLUMN IF NOT EXISTS image_url text NULL,
  ADD COLUMN IF NOT EXISTS scheduled_by uuid NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS broadcasts_status_scheduled_for_idx
  ON public.broadcasts (status, scheduled_for);

DROP POLICY IF EXISTS "Admins can view broadcasts" ON public.broadcasts;
CREATE POLICY "Admins and broadcasters can view broadcasts" ON public.broadcasts
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'broadcaster'::app_role)
  );