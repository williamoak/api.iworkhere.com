import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Request, Response } from 'express';

import handler, {
    getDeviceJourneysBySource,
    buildDeviceJourneys,
    extractPageName,
    formatDuration,
    authRequired,
} from '@routes/v1/clients/joinaunion/visit_info/manage/GET';
import { db } from '@services/dbService';

vi.mock('@services/dbService', () => {
    const mockSelect = vi.fn();
    return {
        db: {
            select: mockSelect,
        },
    };
});

function createMockResponse() {
    const res = {
        statusCode: 200,
        body: undefined as any,
        status: vi.fn().mockImplementation(function (this: any, code: number) {
            this.statusCode = code;
            return this;
        }),
        json: vi.fn().mockImplementation(function (this: any, data: any) {
            this.body = data;
            return this;
        }),
    } as unknown as Response & { statusCode: number; body: any };
    return res;
}

function mockQueryChain(results: Array<{
    deviceId: string;
    userId?: string | null;
    touchTime: Date | string;
    latitude?: number | null;
    longitude?: number | null;
    note: string | null;
    city: string | null;
    country?: string | null;
    region?: string | null;
}>) {
    const fromMock = vi.fn();
    const whereMock = vi.fn();
    const orderByMock = vi.fn().mockResolvedValue(results);

    vi.mocked(db.select).mockReturnValue({
        from: fromMock.mockReturnValue({
            where: whereMock.mockReturnValue({
                orderBy: orderByMock,
            }),
        }),
    } as any);

    return { fromMock, whereMock, orderByMock };
}

describe('GET /v1/clients/joinaunion/visit_info/manage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('does not require authentication', () => {
        expect(authRequired).toBe(false);
    });

    test('returns structured device journeys with default source="generated"', async () => {
        const t0 = new Date('2026-09-01T10:00:00.000Z');
        const t1 = new Date('2026-09-01T10:00:20.000Z');
        const t2 = new Date('2026-09-01T10:00:45.000Z');

        const mockRows = [
            {
                deviceId: '11111111-1111-1111-1111-111111111111',
                touchTime: t0,
                note: 'visit: Home',
                city: 'Toronto',
            },
            {
                deviceId: '11111111-1111-1111-1111-111111111111',
                touchTime: t1,
                note: 'visit: Your Rights',
                city: 'Toronto',
            },
            {
                deviceId: '11111111-1111-1111-1111-111111111111',
                touchTime: t2,
                note: 'visit: Contact',
                city: 'Toronto',
            },
        ];
        mockQueryChain(mockRows);

        const req = { query: {} } as Request;
        const res = createMockResponse();

        await handler(req, res);

        expect(db.select).toHaveBeenCalledOnce();
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0]).toMatchObject({
            deviceId: '11111111-1111-1111-1111-111111111111',
            city: 'Toronto',
            journeys: [
                {
                    city: 'Toronto',
                    startTime: '2026-09-01T10:00:00.000Z',
                    endTime: '2026-09-01T10:00:45.000Z',
                    totalDurationSeconds: 68,
                    totalDuration: '01:08.00',
                    pages: [
                        {
                            page: 'Home',
                            note: 'visit: Home',
                            touchTime: '2026-09-01T10:00:00.000Z',
                            duration: '00:20',
                            durationSeconds: 20,
                            city: 'Toronto',
                        },
                        {
                            page: 'Your Rights',
                            note: 'visit: Your Rights',
                            touchTime: '2026-09-01T10:00:20.000Z',
                            duration: '00:25',
                            durationSeconds: 25,
                            city: 'Toronto',
                        },
                        {
                            page: 'Contact',
                            note: 'visit: Contact',
                            touchTime: '2026-09-01T10:00:45.000Z',
                            duration: '00:23',
                            durationSeconds: 23,
                            city: 'Toronto',
                        },
                    ],
                },
            ],
        });
    });

    test('accepts custom source query parameter', async () => {
        mockQueryChain([]);

        const req = { query: { source: 'custom_source' } } as unknown as Request;
        const res = createMockResponse();

        await handler(req, res);

        expect(db.select).toHaveBeenCalledOnce();
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith([]);
    });

    test('defaults to "generated" if source parameter is whitespace or empty', async () => {
        mockQueryChain([]);

        const req = { query: { source: '   ' } } as unknown as Request;
        const res = createMockResponse();

        await handler(req, res);

        expect(db.select).toHaveBeenCalledOnce();
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith([]);
    });

    test('handles array query parameter by taking the first entry', async () => {
        mockQueryChain([]);

        const req = { query: { source: ['source1', 'source2'] } } as unknown as Request;
        const res = createMockResponse();

        await handler(req, res);

        expect(db.select).toHaveBeenCalledOnce();
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith([]);
    });

    test('returns empty array when no records match the source', async () => {
        mockQueryChain([]);

        const req = { query: { source: 'nonexistent' } } as unknown as Request;
        const res = createMockResponse();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith([]);
    });

    test('rejects source exceeding 32 characters with 400 Bad Request', async () => {
        const longSource = 'a'.repeat(33);
        const req = { query: { source: longSource } } as unknown as Request;
        const res = createMockResponse();

        await handler(req, res);

        expect(db.select).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                error: 'INVALID_REQUEST',
                message: expect.stringContaining('32 characters or fewer'),
            }),
        );
    });

    test('returns 500 when database query fails', async () => {
        vi.mocked(db.select).mockImplementation(() => {
            throw new Error('Database connection failed');
        });

        const req = { query: {} } as Request;
        const res = createMockResponse();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                error: 'INTERNAL_ERROR',
                message: expect.stringContaining('Failed to retrieve device journeys'),
            }),
        );
    });

    describe('extractPageName helper', () => {
        test('extracts page from "visit: page_name"', () => {
            expect(extractPageName('visit: Home')).toBe('Home');
            expect(extractPageName('visit: Why Unions')).toBe('Why Unions');
            expect(extractPageName('visit: Sample Client')).toBe('Sample Client');
            expect(extractPageName('visit: /v1/auth/me')).toBe('/v1/auth/me');
            expect(extractPageName('VISIT: Contact')).toBe('Contact');
            expect(extractPageName('visit:')).toBe('Home');
        });

        test('returns raw page name when no visit: prefix is present', () => {
            expect(extractPageName('About')).toBe('About');
            expect(extractPageName('/privacy')).toBe('/privacy');
        });

        test('returns "unknown" for null, undefined, or empty values', () => {
            expect(extractPageName(null)).toBe('unknown');
            expect(extractPageName(undefined)).toBe('unknown');
            expect(extractPageName('')).toBe('unknown');
            expect(extractPageName('   ')).toBe('unknown');
        });
    });

    describe('formatDuration helper', () => {
        test('formats 0 seconds', () => {
            expect(formatDuration(0)).toBe('00:00.00');
            expect(formatDuration(0, false)).toBe('00:00');
        });

        test('formats whole seconds', () => {
            expect(formatDuration(45)).toBe('00:45.00');
            expect(formatDuration(45, false)).toBe('00:45');
            expect(formatDuration(471, false)).toBe('07:51');
        });

        test('formats fractional seconds trimmed to 2 decimal places', () => {
            expect(formatDuration(50.422)).toBe('00:50.42');
            expect(formatDuration(33.907)).toBe('00:33.91');
        });

        test('formats minutes and seconds without days and hours', () => {
            // 804.676s = 13m 24.676s
            expect(formatDuration(804.676)).toBe('13:24.68');
            expect(formatDuration(805, false)).toBe('13:25');
            // 143.06s = 2m 23.06s
            expect(formatDuration(143.06)).toBe('02:23.06');
            expect(formatDuration(143, false)).toBe('02:23');
        });

        test('formats hours, minutes, and seconds when days are 0 but hours > 0', () => {
            // 3661.23s = 1h 1m 1.23s
            expect(formatDuration(3661.23)).toBe('01:01:01.23');
            expect(formatDuration(3661, false)).toBe('01:01:01');
            // 7227.50s = 2h 0m 27.50s
            expect(formatDuration(7227.5)).toBe('02:00:27.50');
            expect(formatDuration(7227, false)).toBe('02:00:27');
        });

        test('formats days, hours, minutes, and seconds when days > 0', () => {
            // 93784.56s = 1d 2h 3m 4.56s
            expect(formatDuration(93784.56)).toBe('01:02:03:04.56');
            expect(formatDuration(93784, false)).toBe('01:02:03:04');
        });

        test('handles negative values gracefully', () => {
            expect(formatDuration(-10)).toBe('00:00.00');
            expect(formatDuration(-10, false)).toBe('00:00');
        });
    });

    describe('buildDeviceJourneys helper', () => {
        test('splits journeys when touch_time gap exceeds 5 minutes', () => {
            const t0 = new Date('2026-09-01T10:00:00.000Z');
            const t1 = new Date('2026-09-01T10:00:30.000Z');
            // 6 minutes gap (> 5 minutes)
            const t2 = new Date('2026-09-01T10:06:30.000Z');
            const t3 = new Date('2026-09-01T10:07:00.000Z');

            const rows = [
                {
                    deviceId: 'dev-1',
                    touchTime: t0,
                    note: 'visit: Home',
                    city: 'Ottawa',
                },
                {
                    deviceId: 'dev-1',
                    touchTime: t1,
                    note: 'visit: Resources',
                    city: 'Ottawa',
                },
                {
                    deviceId: 'dev-1',
                    touchTime: t2,
                    note: 'visit: Home',
                    city: 'Ottawa',
                },
                {
                    deviceId: 'dev-1',
                    touchTime: t3,
                    note: 'visit: About',
                    city: 'Ottawa',
                },
            ];

            const result = buildDeviceJourneys(rows);

            expect(result).toHaveLength(1);
            expect(result[0].deviceId).toBe('dev-1');
            expect(result[0].city).toBe('Ottawa');
            expect(result[0].journeys).toHaveLength(2);

            // Journey 1
            expect(result[0].journeys[0].pages).toHaveLength(2);
            expect(result[0].journeys[0].pages[0]).toMatchObject({
                page: 'Home',
                duration: '00:30',
                durationSeconds: 30,
                touched: 1,
            });
            expect(result[0].journeys[0].pages[1]).toMatchObject({
                page: 'Resources',
                duration: '00:30',
                durationSeconds: 30,
                touched: 1,
            });
            expect(result[0].journeys[0].totalDurationSeconds).toBe(60);

            // Journey 2
            expect(result[0].journeys[1].pages).toHaveLength(2);
            expect(result[0].journeys[1].pages[0]).toMatchObject({
                page: 'Home',
                duration: '00:30',
                durationSeconds: 30,
                touched: 1,
            });
            expect(result[0].journeys[1].pages[1]).toMatchObject({
                page: 'About',
                duration: '00:30',
                durationSeconds: 30,
                touched: 1,
            });
            expect(result[0].journeys[1].totalDurationSeconds).toBe(60);
        });

        test('handles multiple devices sorted by deviceId', () => {
            const rows = [
                {
                    deviceId: 'dev-b',
                    touchTime: new Date('2026-09-01T12:00:00.000Z'),
                    note: 'visit: Home',
                    city: null,
                },
                {
                    deviceId: 'dev-a',
                    touchTime: new Date('2026-09-01T11:00:00.000Z'),
                    note: 'visit: Home',
                    city: 'Vancouver',
                },
            ];

            const result = buildDeviceJourneys(rows);

            expect(result).toHaveLength(2);
            expect(result[0].deviceId).toBe('dev-a');
            expect(result[0].city).toBe('Vancouver');
            expect(result[1].deviceId).toBe('dev-b');
            expect(result[1].city).toBeNull();
        });

        test('aggregates duplicate visits to the same page within a single journey', () => {
            const rows = [
                {
                    deviceId: 'dev-dup',
                    touchTime: new Date('2026-09-01T10:00:00.000Z'),
                    note: 'visit: Home',
                    city: 'Edmonton',
                },
                {
                    deviceId: 'dev-dup',
                    touchTime: new Date('2026-09-01T10:00:10.000Z'),
                    note: 'visit: About',
                    city: 'Edmonton',
                },
                {
                    deviceId: 'dev-dup',
                    touchTime: new Date('2026-09-01T10:00:25.000Z'),
                    note: 'visit: Home',
                    city: 'Edmonton',
                },
                {
                    deviceId: 'dev-dup',
                    touchTime: new Date('2026-09-01T10:00:40.000Z'),
                    note: 'visit: Contact',
                    city: 'Edmonton',
                },
                {
                    deviceId: 'dev-dup',
                    touchTime: new Date('2026-09-01T10:01:00.000Z'),
                    note: 'visit: Home',
                    city: 'Edmonton',
                },
            ];

            const result = buildDeviceJourneys(rows);

            expect(result).toHaveLength(1);
            expect(result[0].deviceId).toBe('dev-dup');
            expect(result[0].journeys).toHaveLength(1);

            const journey = result[0].journeys[0];
            // home: (10s) + (15s) + (15s avg last page) = 40s
            // about: (15s)
            // contact: (20s)
            // total distinct pages: 3 (home, about, contact)
            expect(journey.pages).toHaveLength(3);

            expect(journey.pages[0]).toMatchObject({
                page: 'Home',
                duration: '00:40',
                durationSeconds: 40,
                touched: 3,
                city: 'Edmonton',
            });
            expect(journey.pages[1]).toMatchObject({
                page: 'About',
                duration: '00:15',
                durationSeconds: 15,
                touched: 1,
                city: 'Edmonton',
            });
            expect(journey.pages[2]).toMatchObject({
                page: 'Contact',
                duration: '00:20',
                durationSeconds: 20,
                touched: 1,
                city: 'Edmonton',
            });
            expect(journey.totalDurationSeconds).toBe(75);
            expect(journey.totalDuration).toBe('01:15.00');
        });

        test('calculates accurate duration and formatting with fractional seconds', () => {
            const rows = [
                {
                    deviceId: 'dev-fractional',
                    touchTime: new Date('2026-09-17T18:28:28.486Z'),
                    note: 'visit: Home',
                    city: 'Vancouver',
                },
                {
                    deviceId: 'dev-fractional',
                    touchTime: new Date('2026-09-17T18:32:44.122Z'),
                    note: 'visit: Sample Client',
                    city: 'Vancouver',
                },
                {
                    deviceId: 'dev-fractional',
                    touchTime: new Date('2026-09-17T18:37:00.000Z'),
                    note: 'visit: About',
                    city: 'Vancouver',
                },
                {
                    deviceId: 'dev-fractional',
                    touchTime: new Date('2026-09-17T18:41:53.162Z'),
                    note: 'visit: Home',
                    city: 'Vancouver',
                },
            ];

            const result = buildDeviceJourneys(rows);

            expect(result).toHaveLength(1);
            expect(result[0].journeys).toHaveLength(1);
            const journey = result[0].journeys[0];
            // 18:41:53.162 - 18:28:28.486 = 804.676s -> prior total = 256 + 256 + 293 = 805s
            // average for last page = Math.round(805 / 3) = 268s
            // home: 256 + 268 = 524s ('08:44')
            // totalDurationSeconds = 524 + 256 + 293 = 1073s ('17:53.00')
            expect(journey.totalDuration).toBe('17:53.00');
            expect(journey.pages[0]).toMatchObject({
                page: 'Home',
                duration: '08:44',
                durationSeconds: 524,
            });
            expect(journey.pages[1]).toMatchObject({
                page: 'Sample Client',
                duration: '04:16',
                durationSeconds: 256,
            });
            expect(journey.pages[2]).toMatchObject({
                page: 'About',
                duration: '04:53',
                durationSeconds: 293,
            });
        });

        test('handles string touchTime formats', () => {
            const rows = [
                {
                    deviceId: 'dev-str',
                    touchTime: '2026-09-01T10:00:00.000Z',
                    note: 'visit: Home',
                    city: 'Montreal',
                },
                {
                    deviceId: 'dev-str',
                    touchTime: '2026-09-01T10:00:15.000Z',
                    note: 'visit: Privacy',
                    city: 'Montreal',
                },
            ];

            const result = buildDeviceJourneys(rows);

            expect(result).toHaveLength(1);
            expect(result[0].journeys[0].pages[0].duration).toBe('00:15');
            expect(result[0].journeys[0].pages[0].durationSeconds).toBe(15);
            expect(result[0].journeys[0].pages[1].duration).toBe('00:15');
            expect(result[0].journeys[0].pages[1].durationSeconds).toBe(15);
        });

        test('handles single page journey with 0 duration', () => {
            const rows = [
                {
                    deviceId: 'dev-single',
                    touchTime: '2026-09-01T10:00:00.000Z',
                    note: 'visit: Home',
                    city: 'Montreal',
                },
            ];

            const result = buildDeviceJourneys(rows);

            expect(result).toHaveLength(1);
            expect(result[0].journeys[0].pages[0].duration).toBe('00:00');
            expect(result[0].journeys[0].pages[0].durationSeconds).toBe(0);
            expect(result[0].journeys[0].totalDurationSeconds).toBe(0);
            expect(result[0].journeys[0].totalDuration).toBe('00:00.00');
        });

        test('populates country, region, latitude, longitude, and userId across device, journey, and pages', () => {
            const rows = [
                {
                    deviceId: 'dev-geo',
                    userId: 'usr-1234',
                    touchTime: '2026-09-01T10:00:00.000Z',
                    note: 'visit: Home',
                    city: 'Vancouver',
                    country: 'CA',
                    region: 'British Columbia',
                    latitude: 49.2827,
                    longitude: -123.1207,
                },
                {
                    deviceId: 'dev-geo',
                    userId: 'usr-1234',
                    touchTime: '2026-09-01T10:00:20.000Z',
                    note: 'visit: Resources',
                    city: 'Vancouver',
                    country: 'CA',
                    region: 'British Columbia',
                    latitude: 49.2827,
                    longitude: -123.1207,
                },
            ];

            const result = buildDeviceJourneys(rows);

            expect(result).toHaveLength(1);
            expect(result[0]).toMatchObject({
                deviceId: 'dev-geo',
                userId: 'usr-1234',
                city: 'Vancouver',
                country: 'CA',
                region: 'British Columbia',
            });
            expect(result[0].journeys[0]).toMatchObject({
                userId: 'usr-1234',
                city: 'Vancouver',
                country: 'CA',
                region: 'British Columbia',
                latitude: 49.2827,
                longitude: -123.1207,
            });
            expect(result[0].journeys[0].pages[0]).toMatchObject({
                userId: 'usr-1234',
                city: 'Vancouver',
                country: 'CA',
                region: 'British Columbia',
                latitude: 49.2827,
                longitude: -123.1207,
            });
        });
    });

    test('helper getDeviceJourneysBySource returns mapped device journeys', async () => {
        const mockRows = [
            {
                deviceId: 'aaaa-1111',
                touchTime: new Date('2026-09-01T10:00:00.000Z'),
                note: 'visit: Home',
                city: 'Calgary',
            },
        ];
        mockQueryChain(mockRows);

        const result = await getDeviceJourneysBySource('test_source');

        expect(result).toHaveLength(1);
        expect(result[0].deviceId).toBe('aaaa-1111');
        expect(result[0].city).toBe('Calgary');
        expect(result[0].journeys).toHaveLength(1);
    });
});
