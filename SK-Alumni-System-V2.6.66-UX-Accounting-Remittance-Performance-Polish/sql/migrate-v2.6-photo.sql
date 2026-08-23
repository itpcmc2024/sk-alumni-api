-- SK Alumni System V2.6
-- Optional member photo, compressed in browser before upload.
ALTER TABLE public.members
ADD COLUMN IF NOT EXISTS photo_data TEXT;

COMMENT ON COLUMN public.members.photo_data IS
'Optional compressed member photo as JPEG/WEBP data URL. Target <= ~240 KB compressed.';
