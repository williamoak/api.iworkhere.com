-- Add user_id and request_method to visit_info table
ALTER TABLE IF EXISTS joinaunion.visit_info ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE IF EXISTS joinaunion.visit_info ADD COLUMN IF NOT EXISTS request_method TEXT;

-- Create indexes for the new columns
CREATE INDEX IF NOT EXISTS visit_info_user_id_idx ON joinaunion.visit_info(user_id);
CREATE INDEX IF NOT EXISTS visit_info_request_method_idx ON joinaunion.visit_info(request_method);
