-- Purpose: Reset users table to identity-only model
-- Safe: No user data exists

DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
                       id UUID PRIMARY KEY,
                       username TEXT NOT NULL UNIQUE,
                       email TEXT UNIQUE,

                       status TEXT NOT NULL
                           REFERENCES "public"."user_statuses"(code),

                       email_verified_at TIMESTAMPTZ,

                       created_at TIMESTAMPTZ NOT NULL,
                       updated_at TIMESTAMPTZ NOT NULL
);
