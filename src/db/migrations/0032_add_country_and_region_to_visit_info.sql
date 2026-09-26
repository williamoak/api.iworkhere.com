ALTER TABLE IF EXISTS joinaunion.visit_info ADD COLUMN IF NOT EXISTS country VARCHAR(128);
ALTER TABLE IF EXISTS joinaunion.visit_info ADD COLUMN IF NOT EXISTS region VARCHAR(128);
ALTER TABLE IF EXISTS public.visit_info ADD COLUMN IF NOT EXISTS country VARCHAR(128);
ALTER TABLE IF EXISTS public.visit_info ADD COLUMN IF NOT EXISTS region VARCHAR(128);

UPDATE joinaunion.visit_info
SET country = 'CA', region = 'British Columbia'
WHERE city = 'Vancouver' AND (country IS NULL OR region IS NULL);

UPDATE joinaunion.visit_info
SET country = 'CA', region = 'Alberta'
WHERE city = 'Edmonton' AND (country IS NULL OR region IS NULL);

UPDATE joinaunion.visit_info
SET city = 'Edmonton', country = 'CA', region = 'Alberta'
WHERE latitude > 53 AND latitude < 54 AND longitude > -114 AND longitude < -113 AND (city IS NULL OR country IS NULL OR region IS NULL);

UPDATE joinaunion.visit_info
SET city = 'Vancouver', country = 'CA', region = 'British Columbia'
WHERE latitude > 49 AND latitude < 50 AND longitude > -124 AND longitude < -123 AND (city IS NULL OR country IS NULL OR region IS NULL);
