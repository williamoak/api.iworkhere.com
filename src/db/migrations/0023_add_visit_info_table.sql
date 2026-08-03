CREATE TABLE IF NOT EXISTS joinaunion.visit_info (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL,
    touch_time TIMESTAMP WITH TIME ZONE NOT NULL,
    note TEXT
);

CREATE INDEX IF NOT EXISTS visit_info_id_idx ON joinaunion.visit_info (id);
CREATE INDEX IF NOT EXISTS visit_info_device_id_idx ON joinaunion.visit_info (device_id);
CREATE INDEX IF NOT EXISTS visit_info_touch_time_idx ON joinaunion.visit_info (touch_time);
CREATE INDEX IF NOT EXISTS visit_info_note_idx ON joinaunion.visit_info (note);
CREATE INDEX IF NOT EXISTS visit_info_device_id_note_idx ON joinaunion.visit_info (device_id, note);
CREATE INDEX IF NOT EXISTS visit_info_device_id_touch_time_idx ON joinaunion.visit_info (device_id, touch_time);
