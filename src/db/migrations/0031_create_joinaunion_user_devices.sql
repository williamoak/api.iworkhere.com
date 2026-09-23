CREATE SCHEMA IF NOT EXISTS joinaunion;

CREATE TABLE IF NOT EXISTS joinaunion.user_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    device_id UUID NOT NULL,
    first_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    linked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    revoked_at TIMESTAMP WITH TIME ZONE,
    linkage_source TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS user_devices_account_id_device_id_idx ON joinaunion.user_devices (account_id, device_id);
CREATE INDEX IF NOT EXISTS user_devices_account_id_active_idx ON joinaunion.user_devices (account_id, revoked_at);
CREATE INDEX IF NOT EXISTS user_devices_device_id_idx ON joinaunion.user_devices (device_id);
CREATE UNIQUE INDEX IF NOT EXISTS user_devices_active_device_unique ON joinaunion.user_devices (device_id) WHERE revoked_at IS NULL;
