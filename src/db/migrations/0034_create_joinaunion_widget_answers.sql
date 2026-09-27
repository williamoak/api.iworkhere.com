CREATE SCHEMA IF NOT EXISTS joinaunion;

CREATE TABLE IF NOT EXISTS joinaunion.widget_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    province VARCHAR(128) NOT NULL,
    industry VARCHAR(128) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS widget_answers_recipient_created_at_idx ON joinaunion.widget_answers (recipient, created_at);
CREATE INDEX IF NOT EXISTS widget_answers_email_idx ON joinaunion.widget_answers (email);
CREATE INDEX IF NOT EXISTS widget_answers_province_industry_idx ON joinaunion.widget_answers (province, industry);
CREATE INDEX IF NOT EXISTS widget_answers_created_at_idx ON joinaunion.widget_answers (created_at);
