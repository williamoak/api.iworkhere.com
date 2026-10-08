# Public and shared data inventory

Reviewed before adding passkey storage. The database middleware sets the tenant search path to `<tenant>, public`; explicitly qualified `joinaunion.*` models remain tenant-specific.

| Data | Ownership | Passkey impact |
| --- | --- | --- |
| `users`, `user_statuses`, `applications` | Global identity and application registry | Passkeys attach to both `user_id` and `application_id`. |
| `application_origins`, `user_applications` | Application-scoped | Use these boundaries when resolving passkey ceremonies and authorization. |
| `auth_tokens`, `email_verification_tokens`, `password_reset_tokens` | Application-scoped token records | Passkey sessions must use the existing application-scoped token issuer. |
| `user_auth_local`, `user_auth_oauth`, `user_password_history`, `password_reset_requests`, `email_audit_logs` | Global user identity records | No passkey migration is required. |
| `config`, `localizations`, `countries` | Global/shared reference data | No passkey columns are inferred; per-application WebAuthn settings remain explicit server configuration. |
| `joinaunion.visit_info`, `joinaunion.user_devices`, `joinaunion.widget_answers` | JoinAUnion tenant data | No passkey migration; do not treat tenant scope as application credential scope. |
| `michael.warframes`, `michael.warframe_weapons`, `michael.warframe_modules` | Michael tenant data | No passkey migration. |

## Migration decision

Migration `0036_create_passkey_credentials.sql` is the only migration generated for this feature. It is additive and preserves existing rows because it creates a new table; no public data backfill is needed. It adds foreign keys to global `users` and `applications`, a globally unique credential ID, and lookup indexes for user/application and application/credential access.

Before production rollout:

1. Back up the database and verify the target migration journal.
2. Apply `0036` through `npm run drizzle:apply`.
3. Confirm the table, foreign keys, unique constraint, indexes, and row counts with direct database queries.
4. If rollback is required, deploy the prior application while retaining the additive table; use a reviewed forward migration for any later cleanup.

No changes were made to legacy public tables because their ownership could not be safely inferred or backfilled for passkeys.
