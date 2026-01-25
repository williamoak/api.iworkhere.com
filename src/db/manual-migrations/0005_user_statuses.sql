-- 0005_user_statuses.sql
-- Purpose: User account status lookup table

CREATE TABLE IF NOT EXISTS user_statuses (
     code TEXT PRIMARY KEY,
     description TEXT NOT NULL
);
