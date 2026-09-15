import { describe, test, expect, vi, beforeEach } from 'vitest'
import { Request } from 'express'
import { AuthError } from '@services/auth/authContext'
import {
    getCallerOrigin,
    normalizeOrigin,
    resolveApplicationFromRequest,
} from '@services/auth/applicationOriginResolver'
import { db } from '@services/dbService'
import * as authContextModule from '@services/auth/authContext'
import { config } from '@helpers/config'

/**
 * ------------------------------------------------------------
 * MOCKS
 * ------------------------------------------------------------
 */

vi.mock('@services/dbService', async () => {
    const { createDbServiceMock } = await import('../../helpers/dbMock');
    return createDbServiceMock();
})

vi.mock('@helpers/config', () => ({
    configGet: vi.fn((key: string) => {
        if (key === 'DEBUG') return 'true';
        if (key === 'EMAIL_VERIFY_TOKEN_TTL_SECONDS') return '3600';
        return undefined;
    }),
    config: {
        DEBUG: 'true'
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
    describe('origin parsing', () => {
        test('normalizes origin protocol, host, and case', () => {
            expect(normalizeOrigin('HTTPS://Example.COM/path?q=1')).toBe('https://example.com')
        })

        test('uses referer origin when origin header is absent', () => {
            const req = createMockRequest({
                get: ((header: string) => header === 'referer' ? 'https://Example.com/page' : undefined) as any,
            })

            expect(getCallerOrigin(req)).toBe('https://example.com')
        })

        test('rejects an invalid origin header', () => {
            const req = createMockRequest({
                get: ((header: string) => header === 'origin' ? 'not a url' : undefined) as any,
            })

            expect(() => getCallerOrigin(req)).toThrowError(
                expect.objectContaining({ code: 'ORIGIN_INVALID', httpStatus: 400 }),
            )
        })

        test('rejects an invalid referer header', () => {
            const req = createMockRequest({
                get: ((header: string) => header === 'referer' ? 'not a url' : undefined) as any,
            })

            expect(() => getCallerOrigin(req)).toThrowError(
                expect.objectContaining({ code: 'REFERER_INVALID', httpStatus: 400 }),
            )
        })
    })

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

        test('uses a valid APP_URL when request has no origin', async () => {
            config.APP_URL = 'https://Configured.Example/path'
            ;(db.select as any).mockReturnValue({
                from: () => ({
                    innerJoin: () => ({
                        where: () => ({
                            limit: () => Promise.resolve([{
                                applicationId: 'configured-app',
                                applicationKey: 'configured-key',
                                applicationEnabled: true,
                                originEnabled: true,
                            }]),
                        }),
                    }),
                }),
            })

            await expect(resolveApplicationFromRequest(createMockRequest())).resolves.toMatchObject({
                applicationId: 'configured-app',
            })
            delete config.APP_URL
        })

        test('requires an origin when APP_URL is invalid', async () => {
            config.APP_URL = 'not a url'

            await expect(resolveApplicationFromRequest(createMockRequest())).rejects.toMatchObject({
                code: 'APP_ORIGIN_REQUIRED',
            })
            delete config.APP_URL
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

        test('throws APP_DISABLED if the resolved application is disabled', async () => {
            ;(db.select as any).mockReturnValue({
                from: () => ({
                    innerJoin: () => ({
                        where: () => ({
                            limit: () => Promise.resolve([{
                                applicationId: 'app',
                                applicationKey: 'key',
                                applicationEnabled: false,
                                originEnabled: true,
                            }]),
                        }),
                    }),
                }),
            })

            await expect(resolveApplicationFromRequest(createMockRequest({
                get: ((header: string) => header === 'origin' ? 'https://disabled-app.com' : undefined) as any,
            }))).rejects.toMatchObject({ code: 'APP_DISABLED' })
        })
    })
})
