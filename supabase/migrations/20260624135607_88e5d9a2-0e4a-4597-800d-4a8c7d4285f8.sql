
-- Replace overly-permissive SELECT policy on edit_items
DROP POLICY IF EXISTS "Read items of accessible edits" ON public.edit_items;

CREATE POLICY "Read items of accessible edits"
ON public.edit_items
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.edits e
    WHERE e.id = edit_items.edit_id
      AND (
        e.shopper_id = auth.uid()
        OR e.client_user_id = auth.uid()
        OR lower(e.client_email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
        OR public.has_role(auth.uid(), 'admin'::app_role)
      )
  )
);

-- Restrict client UPDATE policy on edits with a WITH CHECK that prevents changing fields other than viewed_at
DROP POLICY IF EXISTS "Clients can mark viewed" ON public.edits;

CREATE POLICY "Clients can mark viewed"
ON public.edits
FOR UPDATE
USING (client_user_id = auth.uid())
WITH CHECK (
  client_user_id = auth.uid()
  AND shopper_id IS NOT DISTINCT FROM (SELECT shopper_id FROM public.edits WHERE id = edits.id)
  AND client_email IS NOT DISTINCT FROM (SELECT client_email FROM public.edits WHERE id = edits.id)
  AND client_user_id IS NOT DISTINCT FROM (SELECT client_user_id FROM public.edits WHERE id = edits.id)
  AND title IS NOT DISTINCT FROM (SELECT title FROM public.edits WHERE id = edits.id)
  AND note IS NOT DISTINCT FROM (SELECT note FROM public.edits WHERE id = edits.id)
  AND status IS NOT DISTINCT FROM (SELECT status FROM public.edits WHERE id = edits.id)
);
