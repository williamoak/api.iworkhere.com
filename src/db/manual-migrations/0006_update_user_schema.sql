-- 0005_reset_users.sql
-- Purpose: Reset users table to new auth-compatible schema
-- Safe: legacy users table contains no data

BEGIN;

DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
    id UUID PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    email TEXT UNIQUE,

    status TEXT NOT NULL
        REFERENCES user_statuses(code),

    email_verified_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

COMMIT;
