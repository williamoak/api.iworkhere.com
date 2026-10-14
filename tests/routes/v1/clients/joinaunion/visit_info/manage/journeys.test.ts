import { describe, expect, it } from 'vitest';
import {
    isSystemEvent,
    parsePageNote,
    formatDuration,
    parseVisitTime,
    visitIdentity,
    buildJourney,
    buildJourneys,
    countJourneys,
    type VisitInfoRow,
} from '@routes/v1/clients/joinaunion/visit_info/manage/journeys';

describe('journeys helper module', () => {
    describe('isSystemEvent', () => {
        it('identifies /v1/ system events from strings and objects', () => {
            expect(isSystemEvent('visit: /v1/auth/refresh')).toBe(true);
            expect(isSystemEvent('visit: /V1/AUTH/ME')).toBe(true);
            expect(isSystemEvent({ note: 'visit: /v1/auth/me' })).toBe(true);
            expect(isSystemEvent({ page_name: '/v1/auth/tokens' })).toBe(true);
            expect(isSystemEvent('visit: Home')).toBe(false);
            expect(isSystemEvent({ note: 'visit: Contact Us#Healthcare' })).toBe(false);
            expect(isSystemEvent(null)).toBe(false);
        });
    });

    describe('parsePageNote', () => {
        it('strips leading visit: prefix and separates notes after #', () => {
            expect(parsePageNote('visit: Home#step1:Alberta')).toEqual({
                page_name: 'Home',
                notes: 'step1:Alberta',
            });
        });

        it('handles note without # separator', () => {
            expect(parsePageNote('visit: Dashboard')).toEqual({
                page_name: 'Dashboard',
                notes: '',
            });
        });

        it('handles note without visit prefix', () => {
            expect(parsePageNote('Contact Us#query=help')).toEqual({
                page_name: 'Contact Us',
                notes: 'query=help',
            });
        });

        it('handles null, undefined, and empty string', () => {
            expect(parsePageNote(null)).toEqual({ page_name: '', notes: '' });
            expect(parsePageNote(undefined)).toEqual({ page_name: '', notes: '' });
            expect(parsePageNote('')).toEqual({ page_name: '', notes: '' });
        });
    });

    describe('formatDuration', () => {
        it('formats seconds into human readable strings', () => {
            expect(formatDuration(10)).toBe('10s');
            expect(formatDuration(80)).toBe('1m 20s');
            expect(formatDuration(3600)).toBe('1h 0m 0s');
            expect(formatDuration(3905)).toBe('1h 5m 5s');
            expect(formatDuration(0)).toBe('0s');
        });
    });

    describe('parseVisitTime', () => {
        it('parses ISO date strings, numbers, and Date objects', () => {
            const date = new Date('2026-09-30T10:00:00.000Z');
            expect(parseVisitTime('2026-09-30T10:00:00.000Z')).toBe(date.getTime());
            expect(parseVisitTime(date)).toBe(date.getTime());
            expect(parseVisitTime(1759226400000)).toBe(1759226400000);
            expect(parseVisitTime('invalid-date')).toBeNull();
            expect(parseVisitTime(null)).toBeNull();
        });
    });

    describe('visitIdentity', () => {
        it('uses id when present', () => {
            const row: VisitInfoRow = { id: 'rec-123', device_id: 'dev-1', touch_time: '2026-09-01T10:00:00.000Z' };
            expect(visitIdentity(row)).toBe('id\u0001rec-123');
        });

        it('builds composite key when id is absent', () => {
            const row: VisitInfoRow = {
                device_id: 'dev-1',
                touch_time: '2026-09-01T10:00:00.000Z',
                note: 'visit: Home',
                city: 'Toronto',
                region: 'Ontario',
                country: 'CA',
            };
            expect(visitIdentity(row)).toBe('dev-1\u00012026-09-01T10:00:00.000Z\u0001visit: Home\u0001Toronto\u0001Ontario\u0001CA');
        });
    });

    describe('buildJourneys and countJourneys', () => {
        it('builds journeys starting from Home and segments consecutive Home visits', () => {
            const rows: VisitInfoRow[] = [
                // Visits before Home should be dropped
                { device_id: 'dev-1', touch_time: '2026-09-01T09:50:00.000Z', note: 'visit: Contact', city: 'Toronto' },
                // Journey 1
                { device_id: 'dev-1', touch_time: '2026-09-01T10:00:00.000Z', note: 'visit: Home', city: 'Toronto' },
                { device_id: 'dev-1', touch_time: '2026-09-01T10:01:00.000Z', note: 'visit: About', city: 'Toronto' },
                // Journey 2 (new Home)
                { device_id: 'dev-1', touch_time: '2026-09-01T10:10:00.000Z', note: 'visit: Home', city: 'Toronto' },
                { device_id: 'dev-1', touch_time: '2026-09-01T10:12:00.000Z', note: 'visit: Pricing', city: 'Toronto' },
            ];

            const journeys = buildJourneys(rows);
            expect(journeys).toHaveLength(2);
            expect(journeys[0].journey_id).toBe('journey-1');
            expect(journeys[0].pages[0].page_name).toBe('Home');
            expect(journeys[0].journey_num_pages).toBe(2);
            expect(journeys[0].journey_duration_seconds).toBe(120); // 60s transition + 60s average

            expect(journeys[1].journey_id).toBe('journey-2');
            expect(journeys[1].pages[0].page_name).toBe('Home');
            expect(journeys[1].journey_num_pages).toBe(2);
            expect(journeys[1].journey_duration_seconds).toBe(240); // 120s transition + 120s average

            expect(countJourneys(rows)).toBe(2);
        });

        it('filters out single-page bounces where duration is 0', () => {
            const rows: VisitInfoRow[] = [
                { device_id: 'dev-bounce', touch_time: '2026-09-01T10:00:00.000Z', note: 'visit: Home', city: 'Calgary' },
            ];

            const journeys = buildJourneys(rows);
            expect(journeys).toHaveLength(0);
            expect(countJourneys(rows)).toBe(0);
        });

        it('deduplicates identical records', () => {
            const rows: VisitInfoRow[] = [
                { id: '1', device_id: 'dev-dup', touch_time: '2026-09-01T10:00:00.000Z', note: 'visit: Home', city: 'Edmonton' },
                { id: '1', device_id: 'dev-dup', touch_time: '2026-09-01T10:00:00.000Z', note: 'visit: Home', city: 'Edmonton' },
                { id: '2', device_id: 'dev-dup', touch_time: '2026-09-01T10:01:00.000Z', note: 'visit: Features', city: 'Edmonton' },
            ];

            const journeys = buildJourneys(rows);
            expect(journeys).toHaveLength(1);
            expect(journeys[0].journey_num_pages).toBe(2);
            expect(countJourneys(rows)).toBe(1);
        });

        it('handles camelCase and snake_case properties seamlessly', () => {
            const rows = [
                { deviceId: 'dev-camel', touchTime: new Date('2026-09-01T10:00:00.000Z'), note: 'visit: Home', city: 'Montreal' },
                { deviceId: 'dev-camel', touchTime: new Date('2026-09-01T10:00:30.000Z'), note: 'visit: Help', city: 'Montreal' },
            ] as unknown as VisitInfoRow[];

            const journeys = buildJourneys(rows);
            expect(journeys).toHaveLength(1);
            expect(journeys[0].device_id).toBe('dev-camel');
            expect(journeys[0].journey_duration_seconds).toBe(60);
            expect(countJourneys(rows)).toBe(1);
        });

        it('filters out system event notes containing /v1/ from page count, journey details, and records', () => {
            const rows: VisitInfoRow[] = [
                {
                    id: '1',
                    device_id: 'dev-sys',
                    touch_time: '2026-10-13T23:43:28.043Z',
                    note: 'visit: Home',
                    city: 'Vancouver',
                    country: 'CA',
                    region: 'British Columbia',
                },
                {
                    id: '2',
                    device_id: 'dev-sys',
                    touch_time: '2026-10-13T23:43:28.148Z',
                    note: 'visit: /v1/auth/refresh',
                    city: null,
                    country: null,
                    region: null,
                },
                {
                    id: '3',
                    device_id: 'dev-sys',
                    touch_time: '2026-10-13T23:43:28.191Z',
                    note: 'visit: /v1/auth/me',
                    city: null,
                    country: null,
                    region: null,
                },
                {
                    id: '4',
                    device_id: 'dev-sys',
                    touch_time: '2026-10-13T23:44:28.043Z',
                    note: 'visit: Contact',
                    city: 'Vancouver',
                    country: 'CA',
                    region: 'British Columbia',
                },
            ];

            const journeys = buildJourneys(rows);
            expect(journeys).toHaveLength(1);
            expect(journeys[0].journey_num_pages).toBe(2);
            expect(journeys[0].city).toBe('Vancouver');
            expect(journeys[0].country).toBe('CA');
            expect(journeys[0].region).toBe('British Columbia');
            expect(journeys[0].pages).toHaveLength(2);
            expect(journeys[0].pages.map((p) => p.page_name)).toEqual(['Home', 'Contact']);
            expect(journeys[0].pages.some((p) => p.page_name.includes('/v1/'))).toBe(false);
            expect(journeys[0].records).toBeUndefined();
            expect(journeys[0].journey_duration_seconds).toBe(120); // 60s transition + 60s avg
            expect(countJourneys(rows)).toBe(1);
        });

        it('drops single home page visit accompanied only by /v1/ system events (treating it as a bounce)', () => {
            const rows: VisitInfoRow[] = [
                {
                    id: 'f3903ca0-6885-4b62-9867-dd61f4df0a28',
                    deviceId: '01a01f7c-20e8-762a-a9f8-44dafdc2f972',
                    touchTime: '2026-10-13T23:43:28.043Z',
                    city: 'Vancouver',
                    country: 'CA',
                    region: 'British Columbia',
                    note: 'visit: Home',
                },
                {
                    id: 'a8f2b389-545f-4f2b-b3ba-4cf87cf82e90',
                    deviceId: '01a01f7c-20e8-762a-a9f8-44dafdc2f972',
                    touchTime: '2026-10-13T23:43:28.148Z',
                    note: 'visit: /v1/auth/refresh',
                },
                {
                    id: '7482fba8-43b1-42d9-8487-314a9b597d81',
                    deviceId: '01a01f7c-20e8-762a-a9f8-44dafdc2f972',
                    touchTime: '2026-10-13T23:43:28.191Z',
                    note: 'visit: /v1/auth/me',
                },
            ];

            const journeys = buildJourneys(rows);
            expect(journeys).toHaveLength(0);
            expect(countJourneys(rows)).toBe(0);
        });

        it('preserves all consecutive intake widget steps on Home within the same journey', () => {
            const rows: VisitInfoRow[] = [
                {
                    id: '1',
                    deviceId: 'dev-1',
                    touchTime: '2026-10-13T20:00:00.000Z',
                    city: 'Vancouver',
                    country: 'CA',
                    region: 'British Columbia',
                    note: 'visit: Home',
                },
                {
                    id: '2',
                    deviceId: 'dev-1',
                    touchTime: '2026-10-13T20:00:05.000Z',
                    city: 'Vancouver',
                    country: 'CA',
                    region: 'British Columbia',
                    note: 'visit: Home#step1:British Columbia',
                },
                {
                    id: '3',
                    deviceId: 'dev-1',
                    touchTime: '2026-10-13T20:00:10.000Z',
                    city: 'Vancouver',
                    country: 'CA',
                    region: 'British Columbia',
                    note: 'visit: Home#step2:Healthcare',
                },
                {
                    id: '4',
                    deviceId: 'dev-1',
                    touchTime: '2026-10-13T20:00:15.000Z',
                    city: 'Vancouver',
                    country: 'CA',
                    region: 'British Columbia',
                    note: 'visit: Home#step3',
                },
                {
                    id: '5',
                    deviceId: 'dev-1',
                    touchTime: '2026-10-13T20:00:20.000Z',
                    city: 'Vancouver',
                    country: 'CA',
                    region: 'British Columbia',
                    note: 'visit: Home#step4:anon',
                },
                {
                    id: '6',
                    deviceId: 'dev-1',
                    touchTime: '2026-10-13T20:00:25.000Z',
                    city: 'Vancouver',
                    country: 'CA',
                    region: 'British Columbia',
                    note: 'visit: Union Guide',
                },
            ];

            const journeys = buildJourneys(rows);
            expect(journeys).toHaveLength(1);
            expect(journeys[0].journey_num_pages).toBe(6);
            expect(journeys[0].pages).toHaveLength(6);
            expect(journeys[0].pages.map((p) => p.notes)).toEqual([
                '',
                'step1:British Columbia',
                'step2:Healthcare',
                'step3',
                'step4:anon',
                '',
            ]);
            expect(journeys[0].records).toBeUndefined();
            expect(countJourneys(rows)).toBe(1);
        });

        it('does not treat Home#xxx as a valid journey start when not preceded by base Home', () => {
            const rows: VisitInfoRow[] = [
                {
                    id: '1',
                    deviceId: 'dev-orphan',
                    touchTime: '2026-10-13T20:00:00.000Z',
                    city: 'Vancouver',
                    country: 'CA',
                    region: 'British Columbia',
                    note: 'visit: Home#step1:British Columbia',
                },
                {
                    id: '2',
                    deviceId: 'dev-orphan',
                    touchTime: '2026-10-13T20:00:05.000Z',
                    city: 'Vancouver',
                    country: 'CA',
                    region: 'British Columbia',
                    note: 'visit: Home#step2:Healthcare',
                },
                {
                    id: '3',
                    deviceId: 'dev-orphan',
                    touchTime: '2026-10-13T20:00:10.000Z',
                    city: 'Vancouver',
                    country: 'CA',
                    region: 'British Columbia',
                    note: 'visit: Union Guide',
                },
            ];

            const journeys = buildJourneys(rows);
            expect(journeys).toHaveLength(0);
            expect(countJourneys(rows)).toBe(0);
        });

        it('discards orphaned Home#xxx visits before a valid base Home journey starts', () => {
            const rows: VisitInfoRow[] = [
                {
                    id: '1',
                    deviceId: 'dev-start',
                    touchTime: '2026-10-13T20:00:00.000Z',
                    city: 'Vancouver',
                    country: 'CA',
                    region: 'British Columbia',
                    note: 'visit: Home#step2:Healthcare',
                },
                {
                    id: '2',
                    deviceId: 'dev-start',
                    touchTime: '2026-10-13T20:05:00.000Z',
                    city: 'Vancouver',
                    country: 'CA',
                    region: 'British Columbia',
                    note: 'visit: Home',
                },
                {
                    id: '3',
                    deviceId: 'dev-start',
                    touchTime: '2026-10-13T20:05:10.000Z',
                    city: 'Vancouver',
                    country: 'CA',
                    region: 'British Columbia',
                    note: 'visit: Resources',
                },
            ];

            const journeys = buildJourneys(rows);
            expect(journeys).toHaveLength(1);
            expect(journeys[0].pages).toHaveLength(2);
            expect(journeys[0].pages.map((p) => p.page_name)).toEqual(['Home', 'Resources']);
            expect(journeys[0].pages[0].notes).toBe('');
            expect(countJourneys(rows)).toBe(1);
        });
    });
});
