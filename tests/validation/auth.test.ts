/**
 * @myDocBlock v3.1
 * @file auth.test.ts
 * @internal
 * @module tests/validation/auth
 * @tag auth, validation, test
 * @version 1.0.0
 * @path tests/validation/auth.test.ts
 * @summary Tests the auth validation policy declared in src/validation/auth.ts.
 *
 * @description
 *   This is the executable form of the POLICY SUMMARY at the top of
 *   src/validation/auth.ts. Each rule documented there has at least one
 *   passing and one failing test below.
 */

import { describe, test, expect } from 'vitest'

import {
    PASSWORD_MIN_LENGTH,
    PASSWORD_MAX_BYTES,
    EMAIL_MAX_LENGTH,
    USERNAME_MAX_LENGTH,
    passwordSchema,
    emailSchema,
    usernameSchema,
    appKeySchema,
    registrationBodySchema,
} from '@validation/auth'

/* ------------------------------------------------------------------ */
/* Small helpers                                                      */
/* ------------------------------------------------------------------ */

/** Asserts the parse failed and returns the human-readable messages. */
function failureMessages(result: { success: boolean; error?: any }): string[] {
    if (result.success) {
        throw new Error('expected parse to fail, but it succeeded')
    }
    return result.error.issues.map((i: { message: string }) => i.message)
}

/**
 * Build a string whose UTF-8 byte length is exactly `bytes`, using ASCII
 * 'a' (1 byte each).
 */
function asciiOfBytes(bytes: number): string {
    return 'a'.repeat(bytes)
}

/* ------------------------------------------------------------------ */
/* passwordSchema                                                     */
/* ------------------------------------------------------------------ */

describe('passwordSchema', () => {
    test('accepts a typical password', () => {
        const result = passwordSchema.safeParse('goodpassword')
        expect(result.success).toBe(true)
    })

    test('accepts a password with internal spaces (passphrase)', () => {
        const result = passwordSchema.safeParse('correct horse battery')
        expect(result.success).toBe(true)
    })

    test(`rejects passwords shorter than ${PASSWORD_MIN_LENGTH} characters`, () => {
        const tooShort = 'a'.repeat(PASSWORD_MIN_LENGTH - 1)
        const result = passwordSchema.safeParse(tooShort)
        expect(result.success).toBe(false)
        expect(failureMessages(result).join(' ')).toMatch(/at least/)
    })

    test('rejects leading whitespace', () => {
        const result = passwordSchema.safeParse(' goodpassword')
        expect(result.success).toBe(false)
        expect(failureMessages(result).join(' ')).toMatch(/whitespace/)
    })

    test('rejects trailing whitespace', () => {
        const result = passwordSchema.safeParse('goodpassword ')
        expect(result.success).toBe(false)
        expect(failureMessages(result).join(' ')).toMatch(/whitespace/)
    })

    test(`accepts exactly ${PASSWORD_MAX_BYTES} bytes (boundary)`, () => {
        const atLimit = asciiOfBytes(PASSWORD_MAX_BYTES)
        const result = passwordSchema.safeParse(atLimit)
        expect(result.success).toBe(true)
    })

    test(`rejects ${PASSWORD_MAX_BYTES + 1} bytes (just over)`, () => {
        const overLimit = asciiOfBytes(PASSWORD_MAX_BYTES + 1)
        const result = passwordSchema.safeParse(overLimit)
        expect(result.success).toBe(false)
        expect(failureMessages(result).join(' ')).toMatch(/exceed/)
    })

    test('counts bytes, not characters (Unicode is wider than 1)', () => {
        // '🔒' is 4 bytes in UTF-8. 18 of them = 72 bytes. 19 = 76 bytes.
        const exactly72 = '🔒'.repeat(18)
        const over72 = '🔒'.repeat(19)
        expect(passwordSchema.safeParse(exactly72).success).toBe(true)
        expect(passwordSchema.safeParse(over72).success).toBe(false)
    })

    test('rejects non-string input', () => {
        const result = passwordSchema.safeParse(12345 as unknown as string)
        expect(result.success).toBe(false)
    })
})

/* ------------------------------------------------------------------ */
/* emailSchema                                                        */
/* ------------------------------------------------------------------ */

describe('emailSchema', () => {
    test('accepts a typical email', () => {
        const result = emailSchema.safeParse('bill@example.com')
        expect(result.success).toBe(true)
        if (result.success) expect(result.data).toBe('bill@example.com')
    })

    test('lowercases on the way out', () => {
        const result = emailSchema.safeParse('Bill@Example.COM')
        expect(result.success).toBe(true)
        if (result.success) expect(result.data).toBe('bill@example.com')
    })

    test('trims surrounding whitespace', () => {
        const result = emailSchema.safeParse('  bill@example.com  ')
        expect(result.success).toBe(true)
        if (result.success) expect(result.data).toBe('bill@example.com')
    })

    test('rejects empty string', () => {
        const result = emailSchema.safeParse('')
        expect(result.success).toBe(false)
    })

    test('rejects structurally invalid email', () => {
        const result = emailSchema.safeParse('not-an-email')
        expect(result.success).toBe(false)
    })

    test('rejects consecutive @ signs', () => {
        const result = emailSchema.safeParse('bill@@example.com')
        expect(result.success).toBe(false)
    })

    test('rejects consecutive dots in the local part', () => {
        const result = emailSchema.safeParse('bill..oak@example.com')
        expect(result.success).toBe(false)
    })

    test(`rejects emails longer than ${EMAIL_MAX_LENGTH} characters`, () => {
        // 49 chars total: 39 'a' + '@example.com' (=12) = 51 chars. Trim to limit+1.
        const local = 'a'.repeat(EMAIL_MAX_LENGTH - '@example.com'.length + 1)
        const tooLong = `${local}@example.com`
        expect(tooLong.length).toBeGreaterThan(EMAIL_MAX_LENGTH)
        const result = emailSchema.safeParse(tooLong)
        expect(result.success).toBe(false)
    })
})

/* ------------------------------------------------------------------ */
/* usernameSchema                                                     */
/* ------------------------------------------------------------------ */

describe('usernameSchema', () => {
    test('accepts a typical username', () => {
        const result = usernameSchema.safeParse('bill')
        expect(result.success).toBe(true)
        if (result.success) expect(result.data).toBe('bill')
    })

    test('lowercases on the way out', () => {
        const result = usernameSchema.safeParse('BillOak')
        expect(result.success).toBe(true)
        if (result.success) expect(result.data).toBe('billoak')
    })

    test('allows the documented separators in the middle', () => {
        for (const v of ['bill.oak', 'bill_oak', 'bill-oak']) {
            const result = usernameSchema.safeParse(v)
            expect(result.success).toBe(true)
        }
    })

    test('rejects @ in username (must use email field)', () => {
        const result = usernameSchema.safeParse('bill@example.com')
        expect(result.success).toBe(false)
    })

    test('rejects characters outside the allowed set', () => {
        for (const v of ['bill!', 'bill space', 'bill+oak', 'bill#1']) {
            const result = usernameSchema.safeParse(v)
            expect(result.success).toBe(false)
        }
    })

    test('rejects leading separator', () => {
        const result = usernameSchema.safeParse('.bill')
        expect(result.success).toBe(false)
    })

    test('rejects trailing separator', () => {
        const result = usernameSchema.safeParse('bill_')
        expect(result.success).toBe(false)
    })

    test('rejects consecutive separators', () => {
        for (const v of ['bill..oak', 'bill__oak', 'bill--oak', 'bill._oak']) {
            const result = usernameSchema.safeParse(v)
            expect(result.success).toBe(false)
        }
    })

    test(`rejects usernames longer than ${USERNAME_MAX_LENGTH}`, () => {
        const tooLong = 'a'.repeat(USERNAME_MAX_LENGTH + 1)
        const result = usernameSchema.safeParse(tooLong)
        expect(result.success).toBe(false)
    })

    test('rejects reserved usernames (lowercase)', () => {
        const result = usernameSchema.safeParse('admin')
        expect(result.success).toBe(false)
    })

    test('rejects reserved usernames in any case (lowercasing happens before reserved check)', () => {
        for (const v of ['ADMIN', 'Admin', 'aDmIn', 'Root', 'SUPPORT']) {
            const result = usernameSchema.safeParse(v)
            expect(result.success).toBe(false)
        }
    })
})

/* ------------------------------------------------------------------ */
/* appKeySchema                                                       */
/* ------------------------------------------------------------------ */

describe('appKeySchema', () => {
    test('accepts a non-empty key', () => {
        const result = appKeySchema.safeParse('iworkhere.bill')
        expect(result.success).toBe(true)
    })

    test('trims surrounding whitespace', () => {
        const result = appKeySchema.safeParse('  iworkhere.bill  ')
        expect(result.success).toBe(true)
        if (result.success) expect(result.data).toBe('iworkhere.bill')
    })

    test('rejects empty string', () => {
        const result = appKeySchema.safeParse('')
        expect(result.success).toBe(false)
    })

    test('rejects whitespace-only', () => {
        const result = appKeySchema.safeParse('   ')
        expect(result.success).toBe(false)
    })
})

/* ------------------------------------------------------------------ */
/* registrationBodySchema (composition)                               */
/* ------------------------------------------------------------------ */

describe('registrationBodySchema', () => {
    const goodBody = {
        app_key: 'iworkhere.bill',
        username: 'bill',
        email: 'bill@example.com',
        password: 'goodpassword',
    }

    test('accepts a fully valid body', () => {
        const result = registrationBodySchema.safeParse(goodBody)
        expect(result.success).toBe(true)
    })

    test('normalizes username and email on the way out', () => {
        const result = registrationBodySchema.safeParse({
            ...goodBody,
            username: 'BillOak',
            email: 'Bill@Example.COM',
        })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.username).toBe('billoak')
            expect(result.data.email).toBe('bill@example.com')
        }
    })

    test('returns the password unchanged (no normalization)', () => {
        const result = registrationBodySchema.safeParse({
            ...goodBody,
            password: 'SomeMixed Case Pass',
        })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.password).toBe('SomeMixed Case Pass')
        }
    })

    test('rejects when any single field is invalid', () => {
        const cases: Array<Partial<typeof goodBody>> = [
            { app_key: '' },
            { username: 'admin' },
            { email: 'not-an-email' },
            { password: 'short' },
        ]
        for (const override of cases) {
            const result = registrationBodySchema.safeParse({
                ...goodBody,
                ...override,
            })
            expect(result.success).toBe(false)
        }
    })
})
