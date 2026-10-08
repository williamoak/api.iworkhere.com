CREATE TABLE IF NOT EXISTS passkey_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    credential_id TEXT NOT NULL,
    public_key TEXT NOT NULL,
    sign_count INTEGER NOT NULL DEFAULT 0,
    transports JSONB,
    display_name TEXT,
    last_used_at TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS passkey_credentials_credential_id_unique
    ON passkey_credentials (credential_id);
CREATE INDEX IF NOT EXISTS passkey_credentials_user_application_idx
    ON passkey_credentials (user_id, application_id);
CREATE INDEX IF NOT EXISTS passkey_credentials_application_credential_idx
    ON passkey_credentials (application_id, credential_id);
