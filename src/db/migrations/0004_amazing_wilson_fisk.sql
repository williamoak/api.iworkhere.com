-- Purpose: Create user_statuses lookup table and rename warframe → warframes
-- Reason: Drizzle diff engine cannot handle rename on CockroachDB

-- =========================
-- WARFRAMES RENAME
-- =========================
ALTER TABLE IF EXISTS warframe
    RENAME TO warframes;

CREATE UNIQUE INDEX IF NOT EXISTS warframes_name_class_uidx
    ON warframes (name, class);
