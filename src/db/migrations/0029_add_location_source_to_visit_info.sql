ALTER TABLE IF EXISTS joinaunion.visit_info ADD COLUMN IF NOT EXISTS location_source VARCHAR(32);
ALTER TABLE IF EXISTS public.visit_info ADD COLUMN IF NOT EXISTS location_source VARCHAR(32);
