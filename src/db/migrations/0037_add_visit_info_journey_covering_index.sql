CREATE INDEX IF NOT EXISTS idx_visit_info_journey_covering
ON joinaunion.visit_info (region, touch_time DESC)
STORING (device_id, user_id, request_method, latitude, longitude, location_source, city, country, note);
