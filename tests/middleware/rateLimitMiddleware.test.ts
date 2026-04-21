import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Request, Response, NextFunction } from 'express'

import {
    rateLimitMiddleware,
    __resetRateLimitStore,
} from '@src/middleware/rateLimitMiddleware'

/**
 * ------------------------------------------------------------
 * TEST HELPERS
 * ------------------------------------------------------------
 */

function createReq(keyValue: string): Request {
    return {
        ip: keyValue,
    } as unknown as Request
}

function createRes() {
    const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
        setHeader: vi.fn(),
    }

    return res as unknown as Response
}

function createNext(): NextFunction {
    return vi.fn()
}

/**
 * ------------------------------------------------------------
 * TESTS
 * ------------------------------------------------------------
 */

describe('rateLimitMiddleware', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        __resetRateLimitStore()
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.clearAllMocks()
    })

    test('allows requests under the limit', () => {
        const middleware = rateLimitMiddleware({
            key: req => req.ip ?? '',
            max: 2,
            windowMs: 1000,
        })

        const req = createReq('1.2.3.4')
        const res = createRes()
        const next = createNext()

        middleware(req, res, next)
        middleware(req, res, next)

        expect(next).toHaveBeenCalledTimes(2)
        expect(res.status).not.toHaveBeenCalled()
    })

    test('blocks requests over the limit and sets Retry-After', () => {
        const middleware = rateLimitMiddleware({
            key: req => req.ip ?? '',
            max: 1,
            windowMs: 1000,
        })

        const req = createReq('5.6.7.8')
        const res = createRes()
        const next = createNext()

        middleware(req, res, next) // allowed
        middleware(req, res, next) // blocked

        expect(next).toHaveBeenCalledTimes(1)

        expect(res.setHeader).toHaveBeenCalledWith(
            'Retry-After',
            expect.any(String)
        )

        expect(res.status).toHaveBeenCalledWith(429)
        expect(res.json).toHaveBeenCalledWith({
            error: 'TOO_MANY_REQUESTS',
            message: 'Too many requests, please retry later',
        })
    })

    test('resets count after window expiry', () => {
        const middleware = rateLimitMiddleware({
            key: req => req.ip ?? '',
            max: 1,
            windowMs: 1000,
        })

        const req = createReq('9.9.9.9')
        const res = createRes()
        const next = createNext()

        middleware(req, res, next) // allowed
        middleware(req, res, next) // blocked

        vi.advanceTimersByTime(1001)

        middleware(req, res, next) // allowed again

        expect(next).toHaveBeenCalledTimes(2)
        expect(res.status).toHaveBeenCalledTimes(1)
    })

    test('fails open when no rate-limit key is derived', () => {
        const middleware = rateLimitMiddleware({
            key: () => '',
            max: 1,
            windowMs: 1000,
        })

        const req = createReq('')
        const res = createRes()
        const next = createNext()

        middleware(req, res, next)
        middleware(req, res, next)
        middleware(req, res, next)

        expect(next).toHaveBeenCalledTimes(3)
        expect(res.status).not.toHaveBeenCalled()
    })

    test('respects custom error configuration', () => {
        const middleware = rateLimitMiddleware({
            key: req => req.ip ?? '',
            max: 0,
            windowMs: 1000,
            error: {
                status: 418,
                code: 'RATE_LIMITED',
                message: 'Slow down',
            },
        })

        const req = createReq('10.0.0.1')
        const res = createRes()
        const next = createNext()

        middleware(req, res, next)

        expect(next).not.toHaveBeenCalled()
        expect(res.status).toHaveBeenCalledWith(418)
        expect(res.json).toHaveBeenCalledWith({
            error: 'RATE_LIMITED',
            message: 'Slow down',
        })
    })
})
