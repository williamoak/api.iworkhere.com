CREATE INDEX IF NOT EXISTS location_source_device_touch_idx ON joinaunion.visit_info (location_source, device_id, touch_time);
