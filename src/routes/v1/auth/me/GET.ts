/**
 * @myDocBlock
 * @file
 * @version 1.0.3-debug
 * @path /v1/auth/me
 * @summary Canonical authenticated-identity verification endpoint (HEAVILY instrumented).
 *
 * @description
 * DEBUG NOTES
 * - Enable logging with: AUTH_ME_DEBUG=1
 * - Logs raw Authorization header + raw bearer token + hashes (do not commit)
 * - This handler does NOT check auth_tokens; middleware does. It consumes req.auth.userId.
 */

import type { Request, Response } from 'express'
import { createHash, randomUUID } from 'node:crypto'
import { getUserById } from '@services/users/getUserById'
export const authRequired = true

const AUTH_ME_DEBUG = process.env.AUTH_ME_DEBUG === '1'

function dbg(reqId: string, phase: string, fields: Record<string, unknown> = {}): void {
    if (!AUTH_ME_DEBUG) return
    // eslint-disable-next-line no-console
    console.log(
        JSON.stringify({
            tag: 'auth.me',
            reqId,
            phase,
            t: new Date().toISOString(),
            ...fields,
        })
    )
}

function hashHex(alg: 'sha256' | 'sha1' | 'md5', input: string): string {
    return createHash(alg).update(input).digest('hex')
}

function base64UrlToUtf8(b64url: string): string {
    const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4
    const padded = pad ? b64 + '='.repeat(4 - pad) : b64
    return Buffer.from(padded, 'base64').toString('utf8')
}

function tryDecodeJwt(token: string): unknown {
    const parts = token.split('.')
    if (parts.length !== 3) return { looksLikeJwt: false }

    try {
        const headerRaw = base64UrlToUtf8(parts[0]!)
        const payloadRaw = base64UrlToUtf8(parts[1]!)
        let headerJson: unknown = headerRaw
        let payloadJson: unknown = payloadRaw

        try { headerJson = JSON.parse(headerRaw) } catch { /* ignore */ }
        try { payloadJson = JSON.parse(payloadRaw) } catch { /* ignore */ }

        return { looksLikeJwt: true, headerRaw, payloadRaw, headerJson, payloadJson }
    } catch (e) {
        return { looksLikeJwt: true, error: e instanceof Error ? e.message : String(e) }
    }
}

export async function GET(req: Request, res: Response): Promise<void> {
    const start = Date.now()
    const reqId =
        (req.get('x-request-id')?.trim() || '').slice(0, 128) || randomUUID()

    res.on('finish', () => {
        dbg(reqId, 'finish', {
            statusCode: res.statusCode,
            durationMs: Date.now() - start,
        })
    })

    dbg(reqId, 'enter', {
        method: req.method,
        url: req.url,
        path: (req as any).path,
        originalUrl: (req as any).originalUrl,
        ip: req.ip,
        headers: req.headers, // includes authorization
    })

    try {
        const authHeaderRaw = req.get('authorization')
        const userId = (req as any).auth?.userId as string | undefined

        dbg(reqId, 'auth.inbound', {
            authorizationRaw: authHeaderRaw,
            reqAuthObject: (req as any).auth,
            userId,
        })

        // Parse token (if present) and log EVERYTHING about it
        if (authHeaderRaw && authHeaderRaw.toLowerCase().startsWith('bearer ')) {
            const tokenRaw = authHeaderRaw.slice('bearer '.length).trim()

            dbg(reqId, 'auth.token', {
                tokenRaw,
                tokenLen: tokenRaw.length,
                tokenSha256: hashHex('sha256', tokenRaw),
                tokenSha1: hashHex('sha1', tokenRaw),
                tokenMd5: hashHex('md5', tokenRaw),
                jwtDecoded: tokenRaw ? tryDecodeJwt(tokenRaw) : null,
            })
        } else {
            dbg(reqId, 'auth.token', {
                note: 'Authorization header missing or not Bearer.',
            })
        }

        if (!authHeaderRaw || !authHeaderRaw.toLowerCase().startsWith('bearer ')) {
            dbg(reqId, 'reject', { reason: 'missing_or_non_bearer_authorization' })
            res.status(401).json({ error: 'UNAUTHORIZED' })
            return
        }

        if (!userId) {
            dbg(reqId, 'reject', {
                reason: 'missing_req_auth_userId',
                note: 'If this happens, authMiddleware likely did not attach req.auth.',
            })
            res.status(401).json({ error: 'UNAUTHORIZED' })
            return
        }

        dbg(reqId, 'db.getUserById.start', { userId })
        const user = await getUserById(userId)
        dbg(reqId, 'db.getUserById.result', { userFound: Boolean(user), user })

        if (!user) {
            dbg(reqId, 'reject', { reason: 'user_not_found', userId })
            res.status(401).json({ error: 'UNAUTHORIZED' })
            return
        }

        dbg(reqId, 'gates', {
            status: (user as any).status,
            eulaAccepted: (user as any).eulaAccepted,
        })

        if ((user as any).status === 'locked') {
            dbg(reqId, 'reject', { reason: 'account_locked' })
            res.status(423).json({ error: 'ACCOUNT_LOCKED' })
            return
        }

        if ((user as any).status === 'disabled') {
            dbg(reqId, 'reject', { reason: 'account_disabled' })
            res.status(403).json({ error: 'ACCOUNT_DISABLED' })
            return
        }

        if ((user as any).eulaAccepted === false) {
            dbg(reqId, 'reject', { reason: 'eula_required' })
            res.status(403).json({ error: 'EULA_REQUIRED' })
            return
        }

        const responseBody = {
            id: (user as any).id,
            username: (user as any).username,
            email: (user as any).email ?? null,
            status: (user as any).status,
        }

        dbg(reqId, 'success', { responseBody })

        res.status(200).json(responseBody)
    } catch (err) {
        dbg(reqId, 'error', {
            name: err instanceof Error ? err.name : undefined,
            message: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
        })
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' })
    }
}

export default GET