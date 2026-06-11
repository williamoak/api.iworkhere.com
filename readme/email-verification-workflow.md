# Email Verification Workflow

## Overview
The email verification workflow ensures users verify ownership of their email address before activation. This document itemizes each step, configuration, and testing approach.

---

## 1. User Registration Flow

### Step-by-Step Execution

**Endpoint**: `PUT /v1/auth/register`

1. **User submits registration request**
   - Request body: `{ app_key, username, email, password }`
   - Route: `src/routes/v1/auth/register/PUT.ts`

2. **Request validation**
   - Middleware: `makeValidator(registrationBodySchema)`
   - Validates email format, password strength, etc.
   - Returns 400 if invalid

3. **Rate limiting check** (5 requests / 60 seconds per email)
   - Middleware: `rateLimitMiddleware` on all auth routes
   - Key: `IP|email`
   - Returns 429 if exceeded

4. **Resolve application context**
   - Service: `resolveAuthContext(body)`
   - Validates `app_key` exists and is enabled
   - Returns applicationId
   - Returns 401 if invalid

5. **Database transaction begins**
   - Transaction: `db.transaction(async (tx) => { ... })`
   - All-or-nothing atomicity

6. **Create user record**
   - Table: `users`
   - Status: `pending` (not yet verified)
   - Columns: `id, username, email, statusCode, emailVerifiedAt, createdAt, updatedAt`

7. **Create local auth credentials**
   - Table: `user_auth_local`
   - Store hashed password (bcrypt)
   - Set `isEnabled: true`

8. **Enforce password history**
   - Service: `enforcePasswordHistory(userId, password, passwordHash)`
   - Prevents reusing old passwords (if implemented)

9. **Create user-application binding**
   - Table: `user_applications`
   - Link user to application with role `user`
   - Set `isEnabled: true`

10. **Generate verification token**
    - Service: `issueEmailVerificationToken(...)`
    - Generate 32 random bytes (hex)
    - Hash token with SHA256 (only hash stored)
    - Calculate expiration: now + `EMAIL_VERIFY_TOKEN_TTL_SECONDS` (default: needs to be set in .env)
    - Insert into `email_verification_tokens` table
    - Return raw token (unhashed) to caller

11. **Transaction commits**
    - All changes persisted atomically

12. **Send verification email**
    - Service: `sendVerificationEmail({ email, token, userId })`
    - Constructs verification URL: `{APP_URL}/v1/auth/emailverify?token={token}`
    - Sends email via SMTP (Brevo)
    - Logs to `email_audit_logs` table (sent or failed)
    - **Does not fail registration if email send fails**

13. **Return success response**
    - Status: 201 Created
    - Body:
      ```json
      {
        "user": {
          "id": "uuid",
          "username": "bill",
          "email": "bill@example.com",
          "status": "pending"
        }
      }
      ```

14. **User receives email**
    - Email template: Simple HTML with verification link
    - Link format: `{APP_URL}/v1/auth/emailverify?token={raw_token}`
    - User clicks link or copies token

---

## 2. Email Verification Flow (User Clicks Link)

### Endpoint: `GET /v1/auth/emailverify?token={token}`

1. **User clicks email link**
   - Browser navigates to: `https://api.iworkhere.com/v1/auth/emailverify?token=abc123xyz...`

2. **Query validation**
   - Middleware: `makeValidator`
   - Validates `token` is present and non-empty
   - Returns 400 if missing

3. **Verify token**
   - Service: `verifyEmailToken(token)`
   - Hash provided token with SHA256
   - Query `email_verification_tokens` for matching `tokenHash`
   - If not found → AuthError 401 `INVALID_TOKEN`

4. **Check token expiration**
   - Compare `expiresAt` with current time
   - If expired → AuthError 401 `TOKEN_EXPIRED`

5. **Database transaction begins**
   - All-or-nothing atomicity

6. **Activate user account**
   - Update `users` table
   - Set `statusCode = 'active'`
   - Set `emailVerifiedAt = now()`

7. **Delete used token**
   - Delete from `email_verification_tokens` where `id = tokenId`
   - Prevents token reuse

8. **Transaction commits**

9. **Redirect to success page**
   - Redirect: `{APP_URL}/verification-success?status=verified`
   - User sees success message

---

## 3. Verification via API (Alternative)

### Endpoint: `PUT /v1/auth/emailverify`

**Same as GET flow, but:**
- Request body: `{ "token": "abc123xyz..." }`
- Response: JSON instead of redirect
- Returns:
  ```json
  {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "status": "active"
    }
  }
  ```

---

## 4. Resend Verification Email Flow

### Endpoint: `PUT /v1/auth/emailverify/resend`

1. **User requests resend**
   - Request body: `{ "app_key": "...", "email": "user@example.com" }`
   - Route: `src/routes/v1/auth/emailverify/resend/PUT.ts`

2. **Rate limiting check** (5 requests / 60 seconds per email)
   - Same as register flow

3. **Resolve application context**
   - Validate `app_key`

4. **Find pending user**
   - Query `users` joined with `user_applications`
   - Where: email matches, app enabled, user status = `pending`
   - If not found or already active → return success anyway (non-enumerating)

5. **Database transaction begins**

6. **Delete old tokens**
   - Delete all `email_verification_tokens` for this user
   - Ensures only one active token at a time

7. **Generate new token**
   - Same process as registration
   - New random bytes, new expiration

8. **Transaction commits**

9. **Send email again**
   - Same template as registration
   - Logs to audit table

10. **Return success**
    - Status: 200 OK
    - Body: `{ "ok": true }`
    - **Always returns success** (even if user not found, already verified, or email send failed)

---

## Configuration

### Required Environment Variables

```env
# SMTP Configuration (for email sending)
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=someAcc098790@smtp-brevo.com
SMTP_PASS=some-secret-goes-here
SMTP_FROM_EMAIL=noreply@iworkhere.com

# Application URL (for verification links)
APP_URL=https://api.iworkhere.com

# Token TTL (in seconds) - MUST BE SET
EMAIL_VERIFY_TOKEN_TTL_SECONDS=3600  # Default: 1 hour

# Cleanup job interval (in milliseconds) - Optional
CLEANUP_JOB_INTERVAL_MS=3600000  # Default: 1 hour
```

### Database Tables

1. **users** - User accounts
2. **email_verification_tokens** - Active verification tokens
3. **email_audit_logs** - Email send audit trail
4. **user_applications** - User-app bindings

---

## Testing the Email Service

### Option 1: Ethereal Email (Testing Only)

Ethereal is a fake SMTP service. Perfect for development.

1. **Get Ethereal credentials**
   ```bash
   npm run ethereal
   # Or manually: https://ethereal.email/
   ```

2. **Update .env.development**
   ```env
   SMTP_HOST=smtp.ethereal.email
   SMTP_PORT=587
   SMTP_USER=your-ethereal-user@ethereal.email
   SMTP_PASS=your-ethereal-password
   SMTP_FROM_EMAIL=test@example.com
   ```

3. **Register a user**
   ```bash
   curl -X PUT http://localhost:4300/v1/auth/register \
     -H "Content-Type: application/json" \
     -d '{
       "app_key": "your-app-key",
       "username": "testuser",
       "email": "test@example.com",
       "password": "SecurePass123!"
     }'
   ```

4. **Check email**
   - Console will print: `[mailer] Preview URL: https://ethereal.email/message/...`
   - Click link to view fake email in browser

### Option 2: Real SMTP (Brevo)

Already configured in .env.development. Uses real email.

1. **Register a user** (same curl as above)
2. **Check your inbox** for the verification email
3. **Click the link** or extract the token

### Option 3: Mock Email (Unit Tests)

For automated tests, mock the `sendEmail` function:

```typescript
import { vi } from 'vitest';
import * as mailer from '@helpers/mailer';

vi.mock('@helpers/mailer', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

// Now registration won't actually send emails
// But you can verify the function was called:
expect(mailer.sendEmail).toHaveBeenCalledWith(
  expect.objectContaining({ to: 'test@example.com' })
);
```

---

## Workflow Diagram

```
┌─────────────────────┐
│  USER REGISTRATION  │
└──────────┬──────────┘
           │
           ▼
    ┌─────────────┐
    │ Validation  │
    │ Rate limit  │
    └──────┬──────┘
           │
           ▼
    ┌──────────────────┐
    │ Create user      │
    │ (status:pending) │
    │ + credentials    │
    └──────┬───────────┘
           │
           ▼
    ┌────────────────────┐
    │ Generate token     │
    │ (hash + store)     │
    └──────┬─────────────┘
           │
           ▼
    ┌────────────────────┐
    │ Send email         │
    │ (with link)        │
    │ Log audit trail    │
    └──────┬─────────────┘
           │
           ▼
┌──────────────────────────┐
│ USER GETS EMAIL          │
│ Clicks verification link │
└──────────┬───────────────┘
           │
           ▼
    ┌─────────────────┐
    │ GET /emailverify│
    │ with token      │
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │ Hash token      │
    │ Lookup in DB    │
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │ Check expiry    │
    └────────┬────────┘
             │
             ▼
    ┌─────────────────────────┐
    │ Activate user           │
    │ (status:active)         │
    │ + set emailVerifiedAt   │
    │ + delete token          │
    └────────┬────────────────┘
             │
             ▼
┌────────────────────────────┐
│ REDIRECT TO SUCCESS PAGE   │
│ User account ready to use  │
└────────────────────────────┘
```

---

## Background Jobs

### Token Cleanup Job

- **When**: Server startup + every 1 hour (configurable)
- **What**: Deletes expired tokens from `email_verification_tokens`
- **Why**: Prevents DB bloat from stale data
- **Config**: `CLEANUP_JOB_INTERVAL_MS` (default: 3,600,000ms)
- **Location**: `src/jobs/cleanupExpiredTokens.ts`
- **Error handling**: Failures logged, doesn't crash server

---

## Error Handling

### Registration Email Failures
- **What happens**: Email send fails (SMTP down, invalid recipient, etc.)
- **User experience**: Registration succeeds, user can request resend
- **Logged**: Error message in `email_audit_logs` and console
- **Recovery**: User calls `/v1/auth/emailverify/resend` to retry

### Token Verification Failures
- **Expired token**: Returns 401 `TOKEN_EXPIRED`, user requests resend
- **Invalid token**: Returns 401 `INVALID_TOKEN`, user requests resend
- **Already verified**: User redirected or error response (already active)

### Rate Limiting
- **Exceeded**: Returns 429 `TOO_MANY_REQUESTS`
- **Retry-After**: Header indicates seconds to wait
- **Per endpoint**: Register, login, resend all have own limits

---

## Database Cleanup

Over time, expired tokens accumulate. The cleanup job runs hourly:

```sql
DELETE FROM email_verification_tokens
WHERE expires_at < now();
```

This keeps the table lean and queries fast.

---

## Audit Logging

Every email send is logged to `email_audit_logs`:

| Column | Purpose |
|--------|---------|
| id | Unique audit record ID |
| user_id | User who triggered send |
| email | Email address sent to |
| email_type | 'verification' or 'password_reset' |
| status | 'sent' or 'failed' |
| error_message | SMTP error details (if failed) |
| created_at | When send was attempted |

**Query examples**:
```sql
-- All failed sends
SELECT * FROM email_audit_logs WHERE status = 'failed';

-- Sends for a specific user
SELECT * FROM email_audit_logs WHERE user_id = '...';

-- Failed sends in last 24 hours
SELECT * FROM email_audit_logs
WHERE status = 'failed'
AND created_at > now() - interval '24 hours';
```

---

## Quick Testing Checklist

- [ ] Set `EMAIL_VERIFY_TOKEN_TTL_SECONDS` in .env.development
- [ ] Choose email provider (Ethereal for dev, Brevo for production)
- [ ] Update `SMTP_*` vars in .env.development
- [ ] Set `APP_URL` correctly
- [ ] Run `npm run drizzle:migrate` to create `email_audit_logs` table
- [ ] Start server: `npm run dev`
- [ ] Register user via API
- [ ] Check email (Ethereal console or inbox)
- [ ] Click verification link
- [ ] Verify user is now `active`
- [ ] Test resend: call `/v1/auth/emailverify/resend`
- [ ] Query audit logs: `SELECT * FROM email_audit_logs;`

