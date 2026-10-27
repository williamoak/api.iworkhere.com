CREATE TABLE IF NOT EXISTS consumed_webauthn_ceremonies (
    jti UUID PRIMARY KEY,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS consumed_webauthn_ceremonies_expires_at_idx
    ON consumed_webauthn_ceremonies (expires_at);
