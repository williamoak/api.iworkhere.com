/**
 * @myDocBlock v3.1
 * @file auth.ts
 * @internal
 * @module validation/auth
 * @tag auth, validation, zod
 * @version 1.0.0
 * @path src/validation/auth.ts
 * @summary Single source of truth for auth-related input validation.
 *
 * @description
 *   Re-usable zod fragments for password, username, email, and app_key
 *   validation, plus a composed registration schema.
 *
 *   These fragments are intended to be imported by every auth route
 *   (register, login, password reset, etc.) so that policy is defined
 *   once and applied consistently.
 *
 * POLICY SUMMARY
 * ------------------------------------------------------------------
 *   Password:
 *     - Length: 8–72 characters (max enforced by UTF-8 byte length to
 *       respect bcrypt's 72-byte input limit).
 *     - Character set: NIST 800-63B - all printable Unicode allowed.
 *     - Whitespace: internal spaces allowed (passphrases); leading and
 *       trailing whitespace rejected.
 *     - Complexity: NO arbitrary "must contain one of each" rules.
 *       NIST 800-63B explicitly recommends against them in favor of
 *       length-and-allow-list approaches.
 *
 *   Email:
 *     - Length: up to 48 characters.
 *     - Structurally valid per zod's built-in email validator.
 *     - Rejected: empty local part, empty domain, consecutive dots
 *       anywhere, multiple '@' signs.
 *     - Normalized: trimmed and lowercased.
 *
 *   Username:
 *     - Length: 1–64 characters (no lower bound by request, upper bound
 *       chosen for sane indexing and display).
 *     - Character set: ASCII letters, digits, and the separators
 *       '.', '_', '-'. NO '@' (usernames must not look like emails).
 *     - No leading or trailing separator; no consecutive separators.
 *     - Normalized: trimmed and lowercased.
 *     - Reserved names rejected (see RESERVED_USERNAMES).
 *
 *   app_key:
 *     - Non-empty string after trim. Authoritative validation happens
 *       in resolveAuthContext at runtime.
 */

import { z } from 'zod'

/* ------------------------------------------------------------------ */
/* Constants                                                          */
/* ------------------------------------------------------------------ */

/** Hard lower bound on password length. */
export const PASSWORD_MIN_LENGTH = 8

/**
 * Hard upper bound on password length, in UTF-8 bytes.
 * bcryptjs silently truncates input past 72 bytes; we reject instead.
 */
export const PASSWORD_MAX_BYTES = 72

/** Hard upper bound on email length, in characters. */
export const EMAIL_MAX_LENGTH = 48

/** Hard upper bound on username length, in characters. */
export const USERNAME_MAX_LENGTH = 64

/** Reserved usernames that cannot be claimed regardless of availability. */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  'admin',
  'administrator',
  'root',
  'system',
  'api',
  'support',
  'help',
  'null',
  'undefined',
  'me',
  'self',
])

/* ------------------------------------------------------------------ */
/* Internal helpers                                                   */
/* ------------------------------------------------------------------ */

/** UTF-8 byte length of a string. */
function utf8ByteLength(input: string): number {
  return Buffer.byteLength(input, 'utf8')
}

/**
 * Returns true if the string starts or ends with the given character set,
 * or contains two consecutive characters from that set.
 */
function hasBadSeparatorRun(input: string, separators: string): boolean {
  if (input.length === 0) return false
  if (separators.includes(input[0]!)) return true
  if (separators.includes(input[input.length - 1]!)) return true
  for (let i = 1; i < input.length; i++) {
    if (separators.includes(input[i]!) && separators.includes(input[i - 1]!)) {
      return true
    }
  }
  return false
}

/* ------------------------------------------------------------------ */
/* Password                                                           */
/* ------------------------------------------------------------------ */

/**
 * NIST 800-63B-aligned password schema.
 *
 * Validation order:
 *   1. is a string
 *   2. no leading or trailing whitespace
 *   3. minimum length (codepoints)
 *   4. maximum byte length (bcrypt input limit)
 *
 * The value is returned unchanged so the hash function sees the user's
 * exact input.
 */
export const passwordSchema = z
  .string({ message: 'Password is required' })
  .superRefine((value, ctx) => {
    if (value !== value.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Password must not start or end with whitespace',
      })
      return
    }

    if (value.length < PASSWORD_MIN_LENGTH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
      })
      return
    }

    if (utf8ByteLength(value) > PASSWORD_MAX_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Password must not exceed ${PASSWORD_MAX_BYTES} bytes`,
      })
    }
  })

/* ------------------------------------------------------------------ */
/* Email                                                              */
/* ------------------------------------------------------------------ */

/**
 * Email schema.
 *   - trims
 *   - enforces structural validity via zod's email validator
 *   - enforces max length
 *   - rejects '@@' and any '..' run (defense in depth on top of the
 *     built-in validator)
 *   - lowercases for storage
 */
export const emailSchema = z
  .string({ message: 'Email is required' })
  .trim()
  .min(1, { message: 'Email is required' })
  .max(EMAIL_MAX_LENGTH, {
    message: `Email must not exceed ${EMAIL_MAX_LENGTH} characters`,
  })
  .email({ message: 'Email is not valid' })
  .refine((v) => !v.includes('@@'), {
    message: 'Email must not contain consecutive @ signs',
  })
  .refine((v) => !v.includes('..'), {
    message: 'Email must not contain consecutive dots',
  })
  .transform((v) => v.toLowerCase())

/* ------------------------------------------------------------------ */
/* Username                                                           */
/* ------------------------------------------------------------------ */

const USERNAME_ALLOWED_CHARS = /^[a-zA-Z0-9._-]+$/
const USERNAME_SEPARATORS = '._-'

/**
 * Username schema.
 *   - trims, lowercases
 *   - 1–64 chars
 *   - If it contains '@', it is validated as an email.
 *   - Otherwise:
 *     - allowed chars: ASCII letters, digits, '.', '_', '-'
 *     - no leading/trailing/consecutive separators
 *   - reserved-words list rejected
 */
export const usernameSchema = z
  .string({ message: 'Username is required' })
  .trim()
  .min(1, { message: 'Username is required' })
  .max(USERNAME_MAX_LENGTH, {
    message: `Username must not exceed ${USERNAME_MAX_LENGTH} characters`,
  })
  .superRefine((val, ctx) => {
    if (val.includes('@')) {
      const emailResult = emailSchema.safeParse(val)
      if (!emailResult.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid email address',
        })
      }
    } else {
      if (!USERNAME_ALLOWED_CHARS.test(val)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Username may only contain letters, digits, dots, underscores, and hyphens',
        })
      } else if (hasBadSeparatorRun(val, USERNAME_SEPARATORS)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Username must not start or end with a separator, nor contain consecutive separators',
        })
      }
    }
  })
  .transform((v) => v.toLowerCase())
  .refine((v) => !RESERVED_USERNAMES.has(v), {
    message: 'Username is reserved',
  })

/* ------------------------------------------------------------------ */
/* app_key                                                            */
/* ------------------------------------------------------------------ */

/**
 * Lightweight app_key schema. The authoritative check is performed by
 * resolveAuthContext at runtime (it verifies the app exists and is enabled).
 */
export const appKeySchema = z
  .string({ message: 'app_key is required' })
  .trim()
  .min(1, { message: 'app_key is required' })

/* ------------------------------------------------------------------ */
/* Composed schemas                                                   */
/* ------------------------------------------------------------------ */

/**
 * Schema for PUT /v1/auth/register request bodies.
 * Compose by importing this directly; do not redefine the fragments
 * elsewhere.
 */
export const registrationBodySchema = z.object({
  app_key: appKeySchema.nullable().optional(),
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
})

export type RegistrationBody = z.infer<typeof registrationBodySchema>