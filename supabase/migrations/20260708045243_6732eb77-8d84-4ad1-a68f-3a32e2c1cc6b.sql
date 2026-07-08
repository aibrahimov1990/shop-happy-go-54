
CREATE POLICY "Admins can upload broadcast images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'broadcast-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can read broadcast images"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'broadcast-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete broadcast images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'broadcast-images' AND public.has_role(auth.uid(), 'admin'));
