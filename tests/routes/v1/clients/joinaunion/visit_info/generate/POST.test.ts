import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Request, Response } from 'express';

import handler, {
    DEFAULT_FALLBACK_PAGES,
    REDIS_PAGES_KEY,
    extractUniquePages,
    generateVisitJourneys,
    getDynamicPages,
    getJourneyEndProbability,
    getWidgetAbandonProbability,
    WIDGET_CLICK_PROBABILITY,
    WIDGET_PROVINCES,
    WIDGET_INDUSTRIES,
    WIDGET_MODES,
    resetLocalPageCache,
    resolveCountryRegion,
    __test__,
} from '@routes/v1/clients/joinaunion/visit_info/generate/POST';
import { db } from '@services/dbService';
import { cacheStore } from '@cache/cacheStore';

vi.mock('@services/dbService', () => ({
    db: {
        delete: vi.fn(),
        insert: vi.fn(),
        selectDistinct: vi.fn(),
    },
}));

function response() {
    const res = {
        status: vi.fn(),
        json: vi.fn(),
    } as unknown as Response;
    vi.mocked(res.status).mockReturnValue(res);
    return res;
}

describe('POST /v1/clients/joinaunion/visit_info/generate', () => {
    let insertedValues: unknown;

    beforeEach(() => {
        vi.clearAllMocks();
        resetLocalPageCache();
        insertedValues = undefined;
        vi.spyOn(cacheStore, 'get').mockResolvedValue(null);
        vi.spyOn(cacheStore, 'set').mockResolvedValue(undefined);
        vi.mocked(db.delete).mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
        } as any);
        vi.mocked(db.insert).mockReturnValue({
            values: vi.fn().mockImplementation((values) => {
                insertedValues = values;
                return Promise.resolve();
            }),
        } as any);
        vi.mocked(db.selectDistinct).mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([
                    { note: 'visit: Home' },
                    { note: 'visit: Your Rights' },
                    { note: 'visit: Why Unions' },
                    { note: 'visit: Resources' },
                    { note: 'visit: About' },
                    { note: 'visit: Contact' },
                    { note: 'visit: Privacy' },
                ]),
            }),
        } as any);
    });

    test('resolves country and region selectors to city places', async () => {
        const canada = await resolveCountryRegion('Canada', 'Ontario');
        const unitedStates = await resolveCountryRegion('US', 'California');

        expect(canada).toEqual(expect.arrayContaining([expect.objectContaining({ regionName: 'Ontario' })]));
        expect(canada?.every((place) => place.countryCode === 'CA')).toBe(true);
        expect(unitedStates).toEqual(expect.arrayContaining([expect.objectContaining({ countryCode: 'US' })]));
    });

    test('defaults to the package-selected country and all regions', async () => {
        const places = await resolveCountryRegion();

        expect(places?.length).toBeGreaterThan(0);
        expect(new Set(places?.map((place) => place.countryCode)).size).toBe(1);
        expect(new Set(places?.map((place) => place.regionName)).size).toBeGreaterThan(1);
    });

    test('resolves all regions for the selected country', async () => {
        const places = await resolveCountryRegion('United States', 'all');

        expect(places?.length).toBeGreaterThan(0);
        expect(places?.every((place) => place.countryCode === 'US')).toBe(true);
        expect(new Set(places?.map((place) => place.regionName)).size).toBeGreaterThan(1);
    });

    test('generates the requested number of journeys, each starting at home', async () => {
        const generated = await generateVisitJourneys({
            numRecs: 25,
            locationSource: 'generated',
            country: 'Canada',
            region: 'Ontario',
            random: () => 0.08,
            deviceId: (() => {
                let sequence = 0;
                return () => `device-${++sequence}`;
            })(),
            userId: (() => {
                let sequence = 0;
                return () => `user-${++sequence}`;
            })(),
            now: new Date('2026-09-23T12:00:00.000Z'),
        });

        expect(generated.journeys).toBe(25);
        expect(generated.records.length).toBeGreaterThanOrEqual(50);
        expect(generated.records[0].note).toBe('visit: Home');
        expect(generated.records.every((record) => record.locationSource === 'generated')).toBe(true);
        expect(generated.records.every((record) => record.note !== 'visit: Sample Client')).toBe(true);
        expect(generated.records.every((record) => typeof record.city === 'string' && record.city.length > 0)).toBe(true);
        expect(generated.records.every((record) => record.country === 'CA')).toBe(true);
        expect(generated.records.every((record) => record.region === 'Ontario')).toBe(true);
        expect(new Set(generated.records.slice(0, 10).map((record) => record.deviceId)).size).toBe(5);
        expect(generated.records.every((record) => record.requestMethod === 'GET')).toBe(true);
        expect(generated.records.every((record) => typeof record.userId === 'string' && record.userId.length > 0)).toBe(true);
    });

    test('keeps generated coordinates within a quarter degree of the selected city', async () => {
        const generated = await generateVisitJourneys({
            numRecs: 1,
            locationSource: 'generated',
            country: 'Canada',
            region: 'Ontario',
            places: [{
                latitude: 40,
                longitude: -80,
                city: 'Test City',
                countryCode: 'CA',
                regionCode: 'ON',
                regionName: 'Ontario',
            }],
            random: () => 0,
            now: new Date('2026-09-23T12:00:00.000Z'),
        });

        expect(generated.records[0]).toMatchObject({ latitude: 39.75, longitude: -80.25 });
        expect(generated.records.every((record) => record.latitude === generated.records[0].latitude)).toBe(true);
        expect(generated.records.every((record) => record.longitude === generated.records[0].longitude)).toBe(true);
        expect(generated.records.every((record) => record.city === 'Test City')).toBe(true);
        expect(generated.records.every((record) => record.country === 'CA')).toBe(true);
        expect(generated.records.every((record) => record.region === 'Ontario')).toBe(true);
    });

    test('ensures all records within any given journey have identical lat, long, city, country, and region', async () => {
        let callCount = 0;
        const places = [
            {
                latitude: 49.2827,
                longitude: -123.1207,
                city: 'Vancouver',
                countryCode: 'CA',
                regionCode: 'BC',
                regionName: 'British Columbia',
            },
            {
                latitude: 43.6532,
                longitude: -79.3832,
                city: 'Toronto',
                countryCode: 'CA',
                regionCode: 'ON',
                regionName: 'Ontario',
            },
        ];

        const generated = await generateVisitJourneys({
            numRecs: 5,
            locationSource: 'test_consistent_location',
            country: 'Canada',
            region: 'all',
            places,
            random: () => {
                callCount += 1;
                return 0.08 + ((callCount * 0.17) % 0.8);
            },
        });

        expect(generated.journeys).toBe(5);
        expect(generated.records.length).toBeGreaterThanOrEqual(10);

        const journeys: (typeof generated.records)[] = [];
        let currentJourney: typeof generated.records = [];

        for (const record of generated.records) {
            if (currentJourney.length === 0) {
                currentJourney.push(record);
            } else {
                const prev = currentJourney[currentJourney.length - 1];
                const timeDiff = (record.touchTime.getTime() - prev.touchTime.getTime()) / 1000;
                if (record.deviceId === prev.deviceId && timeDiff <= 300) {
                    currentJourney.push(record);
                } else {
                    journeys.push(currentJourney);
                    currentJourney = [record];
                }
            }
        }
        if (currentJourney.length > 0) {
            journeys.push(currentJourney);
        }

        expect(journeys.length).toBe(5);
        for (const journey of journeys) {
            expect(journey.length).toBeGreaterThanOrEqual(2);
            const first = journey[0];
            for (const record of journey) {
                expect(record.latitude).toBe(first.latitude);
                expect(record.longitude).toBe(first.longitude);
                expect(record.city).toBe(first.city);
                expect(record.country).toBe(first.country);
                expect(record.region).toBe(first.region);
            }
        }
    });

    test.each([
        [{}, 'loc_src is required'],
        [{ loc_src: 'generated', num_recs: 1.5 }, 'num_recs must be an integer'],
        [{ loc_src: 'generated', num_recs: 10001 }, 'num_recs must not be greater than 10,000'],
        [{ loc_src: 'generated', country: 'Atlantis', region: 'Ontario' }, 'country'],
        [{ loc_src: 'generated', start_at: 'not-a-valid-date' }, 'unable to parse'],
        [{ loc_src: 'generated', duration: 'invalid-duration' }, 'unable to parse'],
        [{ loc_src: 'generated', start_at: 'July 17th 2025', end_at: 'June 17th 2025' }, 'must be before end_at'],
    ])('rejects invalid request %#', async (body, message) => {
        const res = response();
        await handler({ body } as Request, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining(message) }));
        expect(db.delete).not.toHaveBeenCalled();
    });

    test('deletes the source and inserts the requested journeys', async () => {
        const res = response();
        await handler({ body: { num_recs: 3, loc_src: 'generated', country: 'Canada', region: 'British Columbia' } } as Request, res);

        expect(db.delete).toHaveBeenCalledOnce();
        expect(db.insert).toHaveBeenCalledOnce();
        expect(insertedValues).toEqual(expect.arrayContaining([
            expect.objectContaining({
                deviceId: expect.any(String),
                userId: expect.any(String),
                requestMethod: 'GET',
                latitude: expect.any(Number),
                longitude: expect.any(Number),
                locationSource: 'generated',
                city: expect.any(String),
                country: expect.any(String),
                region: expect.any(String),
                note: expect.stringMatching(/^visit: /),
            }),
        ]));
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            inserted_records: expect.any(Number),
            journeys: 3,
            start_date: expect.any(String),
            end_date: expect.any(String),
            duration: expect.any(String),
        }));
        expect((insertedValues as unknown[]).length).toBeGreaterThanOrEqual(6);
    });

    test('creates multiple visit_info rows for one requested journey', async () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        const res = response();
        await handler({ body: { num_recs: 1, loc_src: 'testrun', country: 'CA', region: 'all' } } as Request, res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            requested_records: 1,
            journeys: 1,
            inserted_records: expect.any(Number),
        }));
        expect((insertedValues as unknown[]).length).toBeGreaterThan(1);
        expect(new Set((insertedValues as any[]).map((record) => record.deviceId)).size).toBe(1);
        expect((insertedValues as any[])[0].note).toBe('visit: Home');
    });

    describe('dynamic page resolution and caching', () => {
        beforeEach(() => {
            resetLocalPageCache();
        });

        test('extractUniquePages normalizes notes, excludes endpoints and invalid entries, and ensures Home', () => {
            const rawNotes = [
                'visit: Home',
                'visit: Your Rights',
                'visit: /v1/auth/me',
                'visit: /api/clients',
                'visit: About',
                'visit:   Contact Us   ',
                'malformed note',
                null,
                undefined,
                'visit: ' + 'A'.repeat(100), // exceeds 64 chars
            ];

            const pages = extractUniquePages(rawNotes);
            expect(pages).toContain('Home');
            expect(pages).toContain('Your Rights');
            expect(pages).toContain('About');
            expect(pages).toContain('Contact Us');
            expect(pages).not.toContain('/v1/auth/me');
            expect(pages).not.toContain('/api/clients');
            expect(pages).not.toContain('malformed note');
        });

        test('extractUniquePages ensures Home even when list is empty', () => {
            expect(extractUniquePages([])).toEqual(['Home']);
            expect(extractUniquePages([null, undefined])).toEqual(['Home']);
        });

        test('getDynamicPages returns in-memory cache when already populated', async () => {
            const getSpy = vi.spyOn(cacheStore, 'get');
            vi.mocked(db.selectDistinct).mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockResolvedValue([{ note: 'visit: Custom Page' }]),
                }),
            } as any);

            const pages1 = await getDynamicPages();
            expect(pages1).toContain('Custom Page');
            expect(pages1).toContain('Home');

            // Second call should hit local memory without consulting Redis or DB
            getSpy.mockClear();
            vi.mocked(db.selectDistinct).mockClear();

            const pages2 = await getDynamicPages();
            expect(pages2).toBe(pages1);
            expect(getSpy).not.toHaveBeenCalled();
            expect(db.selectDistinct).not.toHaveBeenCalled();
        });

        test('getDynamicPages populates from Redis on cache hit', async () => {
            const redisPages = ['Home', 'Redis Page 1', 'Redis Page 2'];
            vi.spyOn(cacheStore, 'get').mockResolvedValue(redisPages as any);

            const pages = await getDynamicPages();
            expect(pages).toEqual(redisPages);
            expect(db.selectDistinct).not.toHaveBeenCalled();
        });

        test('getDynamicPages queries database and stores in Redis on cache miss', async () => {
            vi.spyOn(cacheStore, 'get').mockResolvedValue(null);
            const setSpy = vi.spyOn(cacheStore, 'set').mockResolvedValue(undefined);

            vi.mocked(db.selectDistinct).mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockResolvedValue([
                        { note: 'visit: Pricing' },
                        { note: 'visit: FAQ' },
                        { note: 'visit: /v1/status' },
                    ]),
                }),
            } as any);

            const pages = await getDynamicPages();
            expect(pages).toEqual(expect.arrayContaining(['Home', 'Pricing', 'FAQ']));
            expect(pages).not.toContain('/v1/status');
            expect(setSpy).toHaveBeenCalledWith(REDIS_PAGES_KEY, pages, 86400000);
        });

        test('getDynamicPages falls back to DEFAULT_FALLBACK_PAGES on database error', async () => {
            vi.spyOn(cacheStore, 'get').mockRejectedValue(new Error('Redis down'));
            vi.mocked(db.selectDistinct).mockImplementation(() => {
                throw new Error('Database connection failure');
            });

            const pages = await getDynamicPages();
            expect(pages).toEqual(DEFAULT_FALLBACK_PAGES);
        });

        test('getDynamicPages falls back to DEFAULT_FALLBACK_PAGES when database returns empty notes', async () => {
            vi.spyOn(cacheStore, 'get').mockResolvedValue(null);
            vi.mocked(db.selectDistinct).mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockResolvedValue([]),
                }),
            } as any);

            const pages = await getDynamicPages();
            expect(pages).toEqual(expect.arrayContaining(['Home', 'Your Rights', 'Why Unions']));
        });

        test('nextPage selects an alternative page or returns the same if only one exists', () => {
            const { nextPage } = __test__;
            expect(nextPage('Home', ['Home'], () => 0)).toBe('Home');

            const choices = ['Home', 'About', 'Contact'];
            const next = nextPage('Home', choices, () => 0.5);
            expect(next).not.toBe('Home');
            expect(choices).toContain(next);
        });

        test('generateVisitJourneys uses custom pages when provided in options', async () => {
            const customPages = ['Home', 'Custom Page A', 'Custom Page B'];
            const generated = await generateVisitJourneys({
                numRecs: 5,
                locationSource: 'testrun',
                country: 'Canada',
                region: 'Ontario',
                pages: customPages,
                random: () => 0,
                places: [{
                    latitude: 45,
                    longitude: -75,
                    city: 'Ottawa',
                    countryCode: 'CA',
                    regionCode: 'ON',
                    regionName: 'Ontario',
                }],
            });

            expect(generated.records.length).toBeGreaterThan(0);
            expect(generated.records.every((r) => {
                const note = r.note;
                return customPages.some((p) => note === `visit: ${p}`);
            })).toBe(true);
        });
    });

    describe('natural language date range resolution', () => {
        const places = [{
            latitude: 49.2827,
            longitude: -123.1207,
            city: 'Vancouver',
            countryCode: 'CA',
            regionCode: 'BC',
            regionName: 'British Columbia',
        }];

        test('generates timestamps bounded by explicit start_at and end_at', async () => {
            const startStr = 'June 17th 2025';
            const endStr = 'July 17th 2025';

            const generated = await generateVisitJourneys({
                numRecs: 10,
                locationSource: 'test_dates',
                country: 'Canada',
                region: 'all',
                places,
                start_at: startStr,
                end_at: endStr,
            });

            expect(generated.journeys).toBe(10);
            expect(generated.records.length).toBeGreaterThanOrEqual(20);

            const minDate = new Date('2025-06-17T00:00:00.000Z');
            const maxDate = new Date('2025-07-17T23:59:59.999Z');

            for (const record of generated.records) {
                expect(record.touchTime.getTime()).toBeGreaterThanOrEqual(minDate.getTime());
                expect(record.touchTime.getTime()).toBeLessThanOrEqual(maxDate.getTime());
            }

            // Verify chronological progression
            for (let i = 1; i < generated.records.length; i++) {
                expect(generated.records[i].touchTime.getTime()).toBeGreaterThanOrEqual(
                    generated.records[i - 1].touchTime.getTime()
                );
            }
        });

        test('generates timestamps bounded by relative start_at and duration', async () => {
            const fixedNow = new Date('2026-09-26T12:00:00.000Z');

            const generated = await generateVisitJourneys({
                numRecs: 5,
                locationSource: 'test_relative',
                country: 'Canada',
                region: 'all',
                places,
                startat: '3 months ago',
                duration: '1 month',
                now: fixedNow,
            });

            expect(generated.journeys).toBe(5);
            // 3 months ago is late June 2026, 1 month duration ends late July 2026
            for (const record of generated.records) {
                expect(record.touchTime.getTime()).toBeLessThan(fixedNow.getTime());
                expect(record.touchTime.getFullYear()).toBe(2026);
                expect(record.touchTime.getMonth()).toBeGreaterThanOrEqual(5); // June
                expect(record.touchTime.getMonth()).toBeLessThanOrEqual(7); // August
            }
        });

        test('defaults to 1 month prior to now when date parameters omitted', async () => {
            const fixedNow = new Date('2026-09-26T12:00:00.000Z');

            const generated = await generateVisitJourneys({
                numRecs: 5,
                locationSource: 'test_default',
                country: 'Canada',
                region: 'all',
                places,
                now: fixedNow,
            });

            const oneMonthAgo = new Date('2026-08-25T00:00:00.000Z');

            for (const record of generated.records) {
                expect(record.touchTime.getTime()).toBeGreaterThanOrEqual(oneMonthAgo.getTime());
                expect(record.touchTime.getTime()).toBeLessThanOrEqual(fixedNow.getTime());
            }
        });

        test('handles query parameters for date range via HTTP handler', async () => {
            const res = response();
            await handler(
                {
                    body: { loc_src: 'query_test', num_recs: 2, country: 'Canada', region: 'all' },
                    query: { startat: '2025-05-01', duration: '2 weeks' },
                } as unknown as Request,
                res
            );

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    ok: true,
                    start_date: 'May 1, 2025',
                    end_date: 'May 15, 2025',
                    duration: '14 days',
                })
            );
            expect(insertedValues).toBeDefined();
            const records = insertedValues as any[];
            expect(records.length).toBeGreaterThanOrEqual(4);

            const startLimit = new Date('2025-05-01T00:00:00.000Z');
            const endLimit = new Date('2025-05-16T00:00:00.000Z');

            for (const r of records) {
                expect(r.touchTime.getTime()).toBeGreaterThanOrEqual(startLimit.getTime());
                expect(r.touchTime.getTime()).toBeLessThanOrEqual(endLimit.getTime());
            }
        });

        test('stops at today date and terminates generation when end_at or start_at + duration extends into future', async () => {
            const fixedNow = new Date('2026-09-26T12:00:00.000Z');

            const generated = await generateVisitJourneys({
                numRecs: 5,
                locationSource: 'test_future_clamp',
                country: 'Canada',
                region: 'all',
                places,
                startat: '2026-09-20T00:00:00.000Z',
                duration: '1 month', // would extend to Oct 20, 2026 in the future
                now: fixedNow,
            });

            expect(generated.journeys).toBeGreaterThanOrEqual(1);
            expect(generated.records.length).toBeGreaterThanOrEqual(2);

            for (const record of generated.records) {
                expect(record.touchTime.getTime()).toBeGreaterThanOrEqual(new Date('2026-09-20T00:00:00.000Z').getTime());
                expect(record.touchTime.getTime()).toBeLessThanOrEqual(fixedNow.getTime());
            }
        });

        test('stops journey and terminates generation when calculated date reaches end of window', async () => {
            const startAt = new Date('2026-01-01T00:00:00.000Z');
            const endAt = new Date('2026-01-01T00:01:00.000Z'); // very tight 1-minute window

            const generated = await generateVisitJourneys({
                numRecs: 10,
                locationSource: 'test_tight_window',
                country: 'Canada',
                region: 'Ontario',
                places,
                startAt,
                endAt,
                now: new Date('2026-09-26T12:00:00.000Z'),
                random: () => 0.5, // Predictable step increments
            });

            for (const record of generated.records) {
                expect(record.touchTime.getTime()).toBeGreaterThanOrEqual(startAt.getTime());
                expect(record.touchTime.getTime()).toBeLessThanOrEqual(endAt.getTime());
            }
        });
    });

    describe('journey termination conditions', () => {
        const testPlaces = [
            {
                latitude: 49.2827,
                longitude: -123.1207,
                city: 'Vancouver',
                countryCode: 'CA',
                regionCode: 'BC',
                regionName: 'British Columbia',
            },
        ];

        test('ends a journey when all available pages have been visited', async () => {
            const customPages = ['Home', 'About', 'Contact'];
            let stepCounter = 0;
            const generated = await generateVisitJourneys({
                numRecs: 1,
                locationSource: 'test_all_pages',
                country: 'Canada',
                region: 'Ontario',
                places: testPlaces,
                pages: customPages,
                random: () => {
                    stepCounter += 1;
                    // Never trigger probability-based break (return 0.99)
                    // For nextPage selection, choose predictable next page
                    return 0.99;
                },
                now: new Date('2026-09-23T12:00:00.000Z'),
            });

            expect(generated.journeys).toBe(1);
            const visitedNotes = generated.records.map((r) => r.note);
            const distinctPages = new Set(visitedNotes);
            expect(distinctPages.size).toBe(customPages.length);
            // Must have terminated as soon as all 3 pages were visited
            expect(distinctPages).toEqual(new Set(['visit: Home', 'visit: About', 'visit: Contact']));
        });

        test('ends a journey when total time on site reaches 20 minutes', async () => {
            let callCount = 0;
            const manyPages = ['Home', ...Array.from({ length: 100 }, (_, i) => `Page${i}`)];
            const generated = await generateVisitJourneys({
                numRecs: 1,
                locationSource: 'test_20_mins',
                country: 'Canada',
                region: 'Ontario',
                places: testPlaces,
                pages: manyPages,
                random: () => {
                    callCount += 1;
                    // Return 1.0 so probability break never triggers (random < 1.0 is false for 1.0)
                    // durationSeconds = 1 + Math.floor(1.0 * 30) = 31s
                    return 1.0;
                },
                startat: '2026-01-01T00:00:00.000Z',
                endat: '2026-01-02T00:00:00.000Z',
            });

            expect(generated.journeys).toBe(1);
            const firstTime = generated.records[0].touchTime.getTime();
            const lastTime = generated.records[generated.records.length - 1].touchTime.getTime();
            const totalDurationMs = lastTime - firstTime;

            // Total journey elapsed time must be less than 20 minutes (1,200,000 ms)
            expect(totalDurationMs).toBeLessThanOrEqual(20 * 60 * 1000);
            expect(totalDurationMs).toBeGreaterThan(19 * 60 * 1000);
        });

        test('ends a journey when user spends 10 minutes on any single page', async () => {
            const customPages = ['Home', 'About', ...Array.from({ length: 50 }, (_, i) => `Page${i}`)];
            let stepIndex = 0;
            const generated = await generateVisitJourneys({
                numRecs: 1,
                locationSource: 'test_10_mins_page',
                country: 'Canada',
                region: 'Ontario',
                places: testPlaces,
                pages: customPages,
                random: () => {
                    stepIndex += 1;
                    // Return 0 so nextPage always alternates between Home and About (first choice)
                    // and durationSeconds = 1 + Math.floor(0 * 30) = 1s, or return a controlled float
                    return 0.95;
                },
                startat: '2026-01-01T00:00:00.000Z',
                endat: '2026-01-02T00:00:00.000Z',
            });

            expect(generated.journeys).toBe(1);
            expect(generated.records.length).toBeGreaterThanOrEqual(2);
            // Verify that total distinct pages is less than customPages length
            const distinctPages = new Set(generated.records.map((r) => r.note));
            expect(distinctPages.size).toBeLessThan(customPages.length);
        });
    });

    describe('journey end probability calculation', () => {
        test('computes exact progression for 1 to 5 pages and beyond', () => {
            // 1 page => 5%
            expect(getJourneyEndProbability(1)).toBe(0.05);
            // 2 pages => 5 + 2 + 4 = 11%
            expect(getJourneyEndProbability(2)).toBe(0.11);
            // 3 pages => 5 + 2 + 4 + 6 = 17%
            expect(getJourneyEndProbability(3)).toBe(0.17);
            // 4 pages => 5 + 2 + 4 + 6 + 8 = 25%
            expect(getJourneyEndProbability(4)).toBe(0.25);
            // 5 pages => 5 + 2 + 4 + 6 + 8 + 10 = 35%
            expect(getJourneyEndProbability(5)).toBe(0.35);
            // 6 pages => 5 + 42 = 47%
            expect(getJourneyEndProbability(6)).toBe(0.47);
            // 7 pages => 5 + 56 = 61%
            expect(getJourneyEndProbability(7)).toBe(0.61);
            // 8 pages => 5 + 72 = 77%
            expect(getJourneyEndProbability(8)).toBe(0.77);
            // 9 pages => 5 + 90 = 95%
            expect(getJourneyEndProbability(9)).toBe(0.95);
            // 10 pages => 5 + 110 = 115% -> capped at 1.0 (100%)
            expect(getJourneyEndProbability(10)).toBe(1.0);
            expect(getJourneyEndProbability(20)).toBe(1.0);
        });

        test('handles step <= 0', () => {
            expect(getJourneyEndProbability(0)).toBe(0);
            expect(getJourneyEndProbability(-1)).toBe(0);
        });
    });

    describe('production safety, user mapping, and cache invalidation', () => {
        test('assigns consistent 1-to-1 userId per deviceId across multiple journeys', async () => {
            const places = await resolveCountryRegion('Canada', 'all');
            const generated = await generateVisitJourneys({
                numRecs: 20,
                locationSource: 'test_user_device_mapping',
                country: 'Canada',
                region: 'all',
                places: places!,
                now: new Date('2026-09-26T12:00:00.000Z'),
            });

            const deviceToUserMap = new Map<string, string>();
            for (const record of generated.records) {
                if (deviceToUserMap.has(record.deviceId)) {
                    expect(record.userId).toBe(deviceToUserMap.get(record.deviceId));
                } else {
                    deviceToUserMap.set(record.deviceId, record.userId);
                }
            }
            expect(deviceToUserMap.size).toBeGreaterThan(0);
        });

        test('requires confirm_delete: true in production environment', async () => {
            const prevEnv = process.env.NODE_ENV;
            try {
                process.env.NODE_ENV = 'production';
                const req = {
                    body: {
                        num_recs: 1,
                        loc_src: 'prod_test',
                    },
                } as Request;
                const res = response();

                await handler(req, res);

                expect(res.status).toHaveBeenCalledWith(400);
                expect(res.json).toHaveBeenCalledWith(
                    expect.objectContaining({
                        error: 'INVALID_REQUEST',
                        message: expect.stringContaining('Mass deletion in production requires confirm_delete: true'),
                    })
                );

                const reqAllowed = {
                    body: {
                        num_recs: 1,
                        loc_src: 'prod_test',
                        confirm_delete: true,
                    },
                } as Request;
                const resAllowed = response();

                await handler(reqAllowed, resAllowed);
                expect(resAllowed.status).toHaveBeenCalledWith(200);
            } finally {
                process.env.NODE_ENV = prevEnv;
            }
        });

        test('invalidates manage endpoint cache on successful generation', async () => {
            const delWhereSpy = vi.spyOn(cacheStore, 'delWhere').mockResolvedValue(undefined);
            const req = {
                body: {
                    num_recs: 1,
                    loc_src: 'cache_inv_test',
                },
            } as Request;
            const res = response();

            await handler(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(delWhereSpy).toHaveBeenCalled();
        });

        test('handles large record sets with chunked database inserts and camelCase parameters', async () => {
            const insertCalls: any[] = [];
            vi.mocked(db.insert).mockReturnValue({
                values: vi.fn().mockImplementation((values) => {
                    insertCalls.push(values);
                    return Promise.resolve();
                }),
            } as any);

            const req = {
                body: {
                    num_recs: 1000,
                    loc_src: 'testrun',
                    country: 'CA',
                    region: 'all',
                    startat: 'Jan 1st 2025',
                    endAt: 'today',
                },
            } as Request;
            const res = response();

            await handler(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    ok: true,
                    location_source: 'testrun',
                    requested_records: 1000,
                    inserted_records: expect.any(Number),
                    journeys: 1000,
                }),
            );
            // 1000 journeys typically generate ~2000-3000 records, resulting in multiple batch inserts
            expect(insertCalls.length).toBeGreaterThanOrEqual(2);
            for (const batch of insertCalls) {
                expect(batch.length).toBeLessThanOrEqual(1000);
            }
        });

        test('accepts camelCase and alias property names (numRecs, locSrc, startAt, endAt)', async () => {
            const req = {
                body: {
                    numRecs: 5,
                    locSrc: 'camel_case_test',
                    country: 'CA',
                    region: 'all',
                    startAt: '2025-01-01',
                    endAt: '2025-06-01',
                },
            } as Request;
            const res = response();

            await handler(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    ok: true,
                    location_source: 'camel_case_test',
                    requested_records: 5,
                }),
            );
        });
    });

    describe('widget journey flow and progressive abandonment probabilities', () => {
        test('getWidgetAbandonProbability returns exact step abandonment rates', () => {
            expect(getWidgetAbandonProbability(1)).toBe(0.10);
            expect(getWidgetAbandonProbability(2)).toBe(0.20);
            expect(getWidgetAbandonProbability(3)).toBe(0.30);
            expect(getWidgetAbandonProbability(4)).toBe(0.40);
            expect(getWidgetAbandonProbability(0)).toBe(0);
            expect(getWidgetAbandonProbability(5)).toBe(0);
        });

        test('WIDGET_CLICK_PROBABILITY is 80%', () => {
            expect(WIDGET_CLICK_PROBABILITY).toBe(0.80);
        });

        test('generates widget steps and abandons after step 1 when abandon check passes (10%)', async () => {
            // Sequence of random values:
            // 1. widget enter check: 0.5 (< 0.80 -> enters widget)
            // 2. province/industry/mode index lookups: 0
            // 3. step 1 abandon check: 0.05 (< 0.10 -> abandons after step 1)
            let call = 0;
            const values = [0.5, 0, 0, 0, 0.05];
            const generated = await generateVisitJourneys({
                numRecs: 1,
                locationSource: 'widget_abandon_step1',
                country: 'Canada',
                region: 'Ontario',
                places: [{
                    latitude: 43.6532,
                    longitude: -79.3832,
                    city: 'Toronto',
                    countryCode: 'CA',
                    regionCode: 'ON',
                    regionName: 'Ontario',
                }],
                random: () => values[call++] ?? 0.05,
                enableWidget: true,
            });

            expect(generated.journeys).toBe(1);
            expect(generated.records.length).toBe(2);
            expect(generated.records[0].note).toBe('visit: Home');
            expect(generated.records[1].note).toBe('visit: Home#step1:Ontario');
        });

        test('generates widget steps through step 2 and abandons after step 2 (20%)', async () => {
            // Step 1 abandon: 0.15 (>= 0.10, does not abandon)
            // Step 2 abandon: 0.15 (< 0.20, abandons after step 2)
            let call = 0;
            const values = [
                0.5, // enters widget (< 0.8)
                0, 0, 0, // province, industry, mode
                0.15, // step 1 abandon check (>= 0.10 -> continue)
                0.5, // step 2 duration
                0.15, // step 2 abandon check (< 0.20 -> abandon)
            ];
            const generated = await generateVisitJourneys({
                numRecs: 1,
                locationSource: 'widget_abandon_step2',
                country: 'Canada',
                region: 'Ontario',
                places: [{
                    latitude: 43.6532,
                    longitude: -79.3832,
                    city: 'Toronto',
                    countryCode: 'CA',
                    regionCode: 'ON',
                    regionName: 'Ontario',
                }],
                random: () => values[call++] ?? 0.15,
                enableWidget: true,
            });

            expect(generated.journeys).toBe(1);
            expect(generated.records.length).toBe(3);
            expect(generated.records[0].note).toBe('visit: Home');
            expect(generated.records[1].note).toBe('visit: Home#step1:Ontario');
            expect(generated.records[2].note).toMatch(/^visit: Home#step2:/);
        });

        test('generates widget steps through step 3 and abandons after step 3 (30%)', async () => {
            // Step 1: 0.25 (>= 0.10)
            // Step 2: 0.25 (>= 0.20)
            // Step 3: 0.25 (< 0.30 -> abandon)
            let call = 0;
            const values = [
                0.5, // enters widget
                0, 0, 0, // selections
                0.25, // step 1 check (continue)
                0.5, // duration
                0.25, // step 2 check (continue)
                0.5, // duration
                0.25, // step 3 check (abandon)
            ];
            const generated = await generateVisitJourneys({
                numRecs: 1,
                locationSource: 'widget_abandon_step3',
                country: 'Canada',
                region: 'Ontario',
                places: [{
                    latitude: 43.6532,
                    longitude: -79.3832,
                    city: 'Toronto',
                    countryCode: 'CA',
                    regionCode: 'ON',
                    regionName: 'Ontario',
                }],
                random: () => values[call++] ?? 0.25,
                enableWidget: true,
            });

            expect(generated.journeys).toBe(1);
            expect(generated.records.length).toBe(4);
            expect(generated.records[0].note).toBe('visit: Home');
            expect(generated.records[1].note).toBe('visit: Home#step1:Ontario');
            expect(generated.records[2].note).toMatch(/^visit: Home#step2:/);
            expect(generated.records[3].note).toBe('visit: Home#step3');
        });

        test('generates widget steps through step 4 and abandons after step 4 (40%)', async () => {
            // Step 1: 0.35 (>= 0.10)
            // Step 2: 0.35 (>= 0.20)
            // Step 3: 0.35 (>= 0.30)
            // Step 4: 0.35 (< 0.40 -> abandon)
            let call = 0;
            const values = [
                0.5, // enters widget
                0, 0, 0, // selections
                0.35, // step 1 check
                0.5, // duration
                0.35, // step 2 check
                0.5, // duration
                0.35, // step 3 check
                0.5, // duration
                0.35, // step 4 check (abandon)
            ];
            const generated = await generateVisitJourneys({
                numRecs: 1,
                locationSource: 'widget_abandon_step4',
                country: 'Canada',
                region: 'Ontario',
                places: [{
                    latitude: 43.6532,
                    longitude: -79.3832,
                    city: 'Toronto',
                    countryCode: 'CA',
                    regionCode: 'ON',
                    regionName: 'Ontario',
                }],
                random: () => values[call++] ?? 0.35,
                enableWidget: true,
            });

            expect(generated.journeys).toBe(1);
            expect(generated.records.length).toBe(5);
            expect(generated.records[0].note).toBe('visit: Home');
            expect(generated.records[1].note).toBe('visit: Home#step1:Ontario');
            expect(generated.records[2].note).toMatch(/^visit: Home#step2:/);
            expect(generated.records[3].note).toBe('visit: Home#step3');
            expect(generated.records[4].note).toMatch(/^visit: Home#step4:/);
        });

        test('completes full widget flow and proceeds to Union Guide when no abandonment occurs', async () => {
            // Step 1: 0.45 (>= 0.10)
            // Step 2: 0.45 (>= 0.20)
            // Step 3: 0.45 (>= 0.30)
            // Step 4: 0.45 (>= 0.40 -> complete!)
            let call = 0;
            const values = [
                0.5, // enters widget (< 0.8)
                0, 0, 0, // selections
                0.45, // step 1 check
                0.5, // duration
                0.45, // step 2 check
                0.5, // duration
                0.45, // step 3 check
                0.5, // duration
                0.45, // step 4 check (>= 0.40 -> complete!)
                0.5, // duration to union guide
            ];
            const generated = await generateVisitJourneys({
                numRecs: 1,
                locationSource: 'widget_complete',
                country: 'Canada',
                region: 'Ontario',
                places: [{
                    latitude: 43.6532,
                    longitude: -79.3832,
                    city: 'Toronto',
                    countryCode: 'CA',
                    regionCode: 'ON',
                    regionName: 'Ontario',
                }],
                random: () => values[call++] ?? 0.45,
                enableWidget: true,
            });

            expect(generated.journeys).toBe(1);
            expect(generated.records.length).toBe(6);
            expect(generated.records[0].note).toBe('visit: Home');
            expect(generated.records[1].note).toBe('visit: Home#step1:Ontario');
            expect(generated.records[2].note).toMatch(/^visit: Home#step2:/);
            expect(generated.records[3].note).toBe('visit: Home#step3');
            expect(generated.records[4].note).toMatch(/^visit: Home#step4:/);
            expect(generated.records[5].note).toBe('visit: Union Guide');
        });

        test('performs standard page walk when widget is disabled or random >= 0.80', async () => {
            const generated = await generateVisitJourneys({
                numRecs: 1,
                locationSource: 'non_widget_journey',
                country: 'Canada',
                region: 'Ontario',
                pages: ['Home', 'Your Rights', 'Why Unions'],
                enableWidget: false,
                random: () => 0.08,
                places: [{
                    latitude: 43.6532,
                    longitude: -79.3832,
                    city: 'Toronto',
                    countryCode: 'CA',
                    regionCode: 'ON',
                    regionName: 'Ontario',
                }],
            });

            expect(generated.journeys).toBe(1);
            expect(generated.records[0].note).toBe('visit: Home');
            expect(generated.records[1].note).toBe('visit: Your Rights');
        });
    });
});