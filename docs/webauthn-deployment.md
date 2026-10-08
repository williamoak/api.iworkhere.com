# WebAuthn deployment configuration

The API uses explicit WebAuthn configuration. It never trusts an origin or RP ID supplied by a request.

Required environment variables:

- `WEBAUTHN_RP_ID`: the registrable RP ID, for example `joinaunion.iworkhere.com`.
- `WEBAUTHN_ALLOWED_ORIGINS`: comma-separated HTTPS origins, for example `https://joinaunion.iworkhere.com`.
- `WEBAUTHN_CEREMONY_SECRET`: a high-entropy signing secret used for short-lived ceremony payloads.

Optional variables:

- `WEBAUTHN_RP_NAME`: authenticator-facing display name; defaults to `iworkhere`.
- `WEBAUTHN_CEREMONY_TTL_SECONDS`: ceremony lifetime from 30 to 900 seconds; defaults to 300.
- `WEBAUTHN_PREVIOUS_CEREMONY_SECRET`: previous secret during key rotation. Remove it after all ceremonies signed with the old key have expired.

Use HTTPS in production. Back up the database before applying migrations. The `passkey_credentials` table stores only credential IDs, public keys, counters, transports, and management metadata; private keys and raw assertions are never stored.

The migration is forward-only. If deployment must be rolled back, deploy the prior application code while retaining the additive table; remove the table only through a separately reviewed forward migration after confirming that no passkey accounts depend on it.
