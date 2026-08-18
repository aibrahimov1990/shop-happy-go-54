ALTER TABLE public.broadcasts
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS completed_at timestamptz NULL;

UPDATE public.broadcasts SET status = 'completed', completed_at = created_at WHERE completed_at IS NULL;