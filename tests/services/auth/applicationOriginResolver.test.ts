import { describe, test, expect, vi, beforeEach } from 'vitest'
import { Request } from 'express'
import { AuthError } from '@services/auth/authContext'
import { resolveApplicationFromRequest } from '@services/auth/applicationOriginResolver'
import { db } from '@services/dbService'
import * as authContextModule from '@services/auth/authContext'

/**
 * ------------------------------------------------------------
 * MOCKS
 * ------------------------------------------------------------
 */

vi.mock('@services/dbService', () => ({
    db: {
        select: vi.fn(),
    },
}))

vi.mock('@helpers/config', () => ({
    config: {
        APP_URL: undefined
    }
}))

vi.mock('@db/schema', () => ({
    applications: { id: 'app_id', appKey: 'app_key', isEnabled: true },
    applicationOrigins: { isEnabled: true },
}))

vi.mock('@services/auth/authContext', async () => {
    const actual = await vi.importActual('@services/auth/authContext')
    return {
        ...actual,
        resolveAuthContext: vi.fn(),
    }
})

/**
 * ------------------------------------------------------------
 * HELPERS
 * ------------------------------------------------------------
 */

beforeEach(() => {
    vi.clearAllMocks()
})

const createMockRequest = (overrides: Partial<Request> = {}): Request => ({
    query: {},
    body: {},
    get: ((header: string): any => undefined) as any,
    ...overrides,
} as unknown as Request)

/**
 * ------------------------------------------------------------
 * TESTS
 * ------------------------------------------------------------
 */

describe('applicationOriginResolver', () => {

    describe('resolveApplicationFromRequest', () => {
        test('resolves from explicit app_key in query', async () => {
            const req = createMockRequest({
                query: { app_key: 'explicit-key' }
            })
            
            vi.mocked(authContextModule.resolveAuthContext).mockResolvedValue({
                applicationId: 'app1',
                applicationKey: 'explicit-key'
            })

            const result = await resolveApplicationFromRequest(req)

            expect(authContextModule.resolveAuthContext).toHaveBeenCalledWith({
                app_key: 'explicit-key'
            })
            expect(result.applicationId).toBe('app1')
        })

        test('resolves from explicit app_key in body', async () => {
            const req = createMockRequest({
                body: { app_key: 'body-key' }
            })
            
            vi.mocked(authContextModule.resolveAuthContext).mockResolvedValue({
                applicationId: 'app2',
                applicationKey: 'body-key'
            })

            const result = await resolveApplicationFromRequest(req)

            expect(authContextModule.resolveAuthContext).toHaveBeenCalledWith({
                app_key: 'body-key'
            })
            expect(result.applicationId).toBe('app2')
        })

        test('resolves from origin header', async () => {
            const req = createMockRequest({
                get: ((header: string) => header === 'origin' ? 'https://example.com' : undefined) as any
            })
            
            ;(db.select as any).mockReturnValue({
                from: () => ({
                    innerJoin: () => ({
                        where: () => ({
                            limit: () => Promise.resolve([{
                                applicationId: 'app3',
                                applicationKey: 'key3',
                                applicationEnabled: true,
                                originEnabled: true,
                            }])
                        })
                    })
                })
            })

            const result = await resolveApplicationFromRequest(req)
            expect(result.applicationId).toBe('app3')
        })

        test('throws APP_ORIGIN_REQUIRED if no key and no origin', async () => {
            const req = createMockRequest()
            await expect(resolveApplicationFromRequest(req)).rejects.toThrow(AuthError)
            await expect(resolveApplicationFromRequest(req)).rejects.toMatchObject({
                code: 'APP_ORIGIN_REQUIRED'
            })
        })
    })

    describe('resolveAuthContextFromOrigin DB logic', () => {
        test('throws APP_ORIGIN_NOT_FOUND if db returns empty', async () => {
            ;(db.select as any).mockReturnValue({
                from: () => ({
                    innerJoin: () => ({
                        where: () => ({
                            limit: () => Promise.resolve([])
                        })
                    })
                })
            })

            const req = createMockRequest({
                get: ((header: string) => header === 'origin' ? 'https://missing.com' : undefined) as any
            })
            
            await expect(resolveApplicationFromRequest(req)).rejects.toMatchObject({
                code: 'APP_ORIGIN_NOT_FOUND'
            })
        })

        test('throws APP_ORIGIN_DISABLED if origin is disabled', async () => {
            ;(db.select as any).mockReturnValue({
                from: () => ({
                    innerJoin: () => ({
                        where: () => ({
                            limit: () => Promise.resolve([{
                                applicationId: 'app',
                                applicationKey: 'key',
                                applicationEnabled: true,
                                originEnabled: false,
                            }])
                        })
                    })
                })
            })

            const req = createMockRequest({
                get: ((header: string) => header === 'origin' ? 'https://disabled.com' : undefined) as any
            })
            
            await expect(resolveApplicationFromRequest(req)).rejects.toMatchObject({
                code: 'APP_ORIGIN_DISABLED'
            })
        })
    })
})
