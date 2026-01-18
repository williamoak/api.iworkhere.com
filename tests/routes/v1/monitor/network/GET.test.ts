import type { Request, Response } from 'express'
import { describe, test, expect, vi } from 'vitest'
import handler from '@routes/v1/monitor/network/GET'

describe('GET /v1/monitor/network', () => {
    test('external HTTP invocation responds via res.json()', async () => {
        const req = {} as Request

        const jsonMock = vi.fn()
        const res = {
            json: jsonMock,
        } as unknown as Response

        const result = await handler(req, res)

        expect(jsonMock).toHaveBeenCalledTimes(1)
        expect(jsonMock).toHaveBeenCalledWith({ ok: true })

        // Correct: HTTP handlers do not return a value
        expect(result).toBeUndefined()
    })

    test('internal invocation returns payload directly', async () => {
        const req = {} as Request
        const res = {} as Response

        const result = await handler(req, res)

        expect(result).toEqual({ ok: true })
    })

    test('payload structure is exact and stable', async () => {
        const req = {} as Request
        const res = {} as Response

        const result = await handler(req, res)

        expect(result).toStrictEqual({ ok: true })
    })
})
