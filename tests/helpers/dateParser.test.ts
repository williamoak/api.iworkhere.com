import { describe, expect, test } from 'vitest';
import {
    formatDate,
    formatDurationEnglish,
    parseDateInput,
    parseDurationInput,
    resolveDateRange,
} from '@helpers/dateParser';

describe('dateParser helper', () => {
    const fixedNow = new Date('2026-09-26T12:00:00.000Z');

    describe('parseDateInput', () => {
        test('parses Date instance', () => {
            const date = new Date('2025-06-17T00:00:00.000Z');
            expect(parseDateInput(date, fixedNow, 'start_at')).toBe(date);
        });

        test('parses numeric timestamp', () => {
            const timestamp = fixedNow.getTime();
            const parsed = parseDateInput(timestamp, fixedNow, 'start_at');
            expect(parsed.getTime()).toBe(timestamp);
        });

        test('parses natural language date string', () => {
            const parsed = parseDateInput('June 17th 2025', fixedNow, 'start_at');
            expect(parsed.getFullYear()).toBe(2025);
            expect(parsed.getMonth()).toBe(5); // June is 5
            expect(parsed.getDate()).toBe(17);
        });

        test('parses relative natural language date string', () => {
            const parsed = parseDateInput('2 months ago', fixedNow, 'start_at');
            expect(parsed.getTime()).toBeLessThan(fixedNow.getTime());
            expect(parsed.getMonth()).toBe(6); // July
        });

        test('parses ISO date string', () => {
            const parsed = parseDateInput('2025-07-15T14:30:00.000Z', fixedNow, 'start_at');
            expect(parsed.toISOString()).toBe('2025-07-15T14:30:00.000Z');
        });

        test('throws on empty string', () => {
            expect(() => parseDateInput('', fixedNow, 'start_at')).toThrow('cannot be empty');
            expect(() => parseDateInput('   ', fixedNow, 'start_at')).toThrow('cannot be empty');
        });

        test('throws on unparseable string', () => {
            expect(() => parseDateInput('not-a-valid-date', fixedNow, 'start_at')).toThrow(
                'unable to parse "not-a-valid-date"'
            );
        });

        test('throws on invalid Date object or timestamp', () => {
            expect(() => parseDateInput(new Date('invalid'), fixedNow, 'start_at')).toThrow(
                'invalid Date object'
            );
            expect(() => parseDateInput(NaN, fixedNow, 'start_at')).toThrow('invalid timestamp');
        });
    });

    describe('parseDurationInput', () => {
        test('parses numeric milliseconds', () => {
            expect(parseDurationInput(60000)).toBe(60000);
        });

        test('parses human-readable duration strings', () => {
            expect(parseDurationInput('48 hours')).toBe(48 * 60 * 60 * 1000);
            expect(parseDurationInput('3 days')).toBe(3 * 24 * 60 * 60 * 1000);
            expect(parseDurationInput('2 weeks')).toBe(14 * 24 * 60 * 60 * 1000);
            expect(parseDurationInput('1 month')).toBeGreaterThan(25 * 24 * 60 * 60 * 1000);
        });

        test('throws on invalid duration string', () => {
            expect(() => parseDurationInput('invalid-duration')).toThrow('unable to parse');
            expect(() => parseDurationInput('')).toThrow('cannot be empty');
        });

        test('throws on negative or zero duration', () => {
            expect(() => parseDurationInput(0)).toThrow('positive number');
            expect(() => parseDurationInput(-500)).toThrow('positive number');
        });
    });

    describe('resolveDateRange', () => {
        test('resolves default 1-month window when no options provided', () => {
            const range = resolveDateRange({ now: fixedNow });
            expect(range.endAt.getTime()).toBe(fixedNow.getTime());
            expect(range.startAt.getTime()).toBeLessThan(range.endAt.getTime());
            // Approx 1 month span
            const diffDays = range.durationMs / (24 * 60 * 60 * 1000);
            expect(diffDays).toBeGreaterThanOrEqual(28);
            expect(diffDays).toBeLessThanOrEqual(31);
        });

        test('resolves explicit natural language start and end dates', () => {
            const range = resolveDateRange({
                start_at: 'June 17th 2025',
                end_at: 'July 17th 2025',
                now: fixedNow,
            });

            expect(range.startAt.getFullYear()).toBe(2025);
            expect(range.startAt.getMonth()).toBe(5);
            expect(range.startAt.getDate()).toBe(17);

            expect(range.endAt.getFullYear()).toBe(2025);
            expect(range.endAt.getMonth()).toBe(6);
            expect(range.endAt.getDate()).toBe(17);

            expect(range.durationMs).toBe(range.endAt.getTime() - range.startAt.getTime());
            expect(range.startAt.getTime()).toBeLessThan(range.endAt.getTime());
        });

        test('supports flat parameter aliases startat and endat', () => {
            const range = resolveDateRange({
                startat: '2025-01-01T00:00:00.000Z',
                endat: '2025-01-15T00:00:00.000Z',
                now: fixedNow,
            });

            expect(range.startAt.toISOString()).toBe('2025-01-01T00:00:00.000Z');
            expect(range.endAt.toISOString()).toBe('2025-01-15T00:00:00.000Z');
            expect(range.durationMs).toBe(14 * 24 * 60 * 60 * 1000);
        });

        test('resolves startAt + duration pattern', () => {
            const range = resolveDateRange({
                startat: '3 months ago',
                duration: '1 month',
                now: fixedNow,
            });

            expect(range.startAt.getTime()).toBeLessThan(fixedNow.getTime());
            expect(range.endAt.getTime()).toBeGreaterThan(range.startAt.getTime());
            const durationDays = range.durationMs / (24 * 60 * 60 * 1000);
            expect(durationDays).toBeGreaterThanOrEqual(28);
            expect(durationDays).toBeLessThanOrEqual(31);
        });

        test('resolves duration only pattern ending at now', () => {
            const range = resolveDateRange({
                duration: '2 weeks',
                now: fixedNow,
            });

            expect(range.endAt.getTime()).toBe(fixedNow.getTime());
            expect(range.durationMs).toBe(14 * 24 * 60 * 60 * 1000);
            expect(range.startAt.getTime()).toBe(fixedNow.getTime() - 14 * 24 * 60 * 60 * 1000);
        });

        test('resolves endAt + duration pattern', () => {
            const range = resolveDateRange({
                end_at: '2025-10-10T12:00:00.000Z',
                duration: '5 days',
                now: fixedNow,
            });

            expect(range.endAt.toISOString()).toBe('2025-10-10T12:00:00.000Z');
            expect(range.durationMs).toBe(5 * 24 * 60 * 60 * 1000);
            expect(range.startAt.toISOString()).toBe('2025-10-05T12:00:00.000Z');
        });

        test('resolves startAt only defaulting endAt to now', () => {
            const range = resolveDateRange({
                start_at: '2026-09-01T00:00:00.000Z',
                now: fixedNow,
            });

            expect(range.startAt.toISOString()).toBe('2026-09-01T00:00:00.000Z');
            expect(range.endAt.getTime()).toBe(fixedNow.getTime());
        });

        test('throws error if startAt is after endAt', () => {
            expect(() =>
                resolveDateRange({
                    start_at: 'July 17th 2025',
                    end_at: 'June 17th 2025',
                    now: fixedNow,
                })
            ).toThrow('must be before end_at');
        });

        test('throws error if startAt equals endAt', () => {
            expect(() =>
                resolveDateRange({
                    start_at: '2025-06-17T12:00:00.000Z',
                    end_at: '2025-06-17T12:00:00.000Z',
                    now: fixedNow,
                })
            ).toThrow('must be before end_at');
        });

        test('throws error if unparseable date is supplied', () => {
            expect(() =>
                resolveDateRange({
                    startat: 'unparseable-date-string',
                    now: fixedNow,
                })
            ).toThrow('unable to parse');
        });

        test('throws error if unparseable duration is supplied', () => {
            expect(() =>
                resolveDateRange({
                    duration: 'not-a-duration',
                    now: fixedNow,
                })
            ).toThrow('unable to parse');
        });

        test('throws error if reference now is invalid', () => {
            expect(() =>
                resolveDateRange({
                    now: new Date('invalid'),
                })
            ).toThrow('Invalid reference timestamp (now)');
        });

        test('returns formatted startDate, endDate, and duration fields', () => {
            const range = resolveDateRange({
                start_at: '2025-06-17T00:00:00.000Z',
                end_at: '2025-07-17T00:00:00.000Z',
                now: fixedNow,
            });

            expect(range.startDate).toBe('Jun 17, 2025');
            expect(range.endDate).toBe('Jul 17, 2025');
            expect(range.duration).toBe('1 month');
        });

        test('caps endAt at referenceNow (today) when end_at is in the future', () => {
            const futureEnd = new Date('2028-01-01T00:00:00.000Z');
            const range = resolveDateRange({
                start_at: '2026-09-01T00:00:00.000Z',
                end_at: futureEnd,
                now: fixedNow, // 2026-09-26T12:00:00.000Z
            });

            expect(range.endAt.getTime()).toBe(fixedNow.getTime());
            expect(range.endDate).toBe('Sep 26, 2026');
            expect(range.durationMs).toBe(fixedNow.getTime() - new Date('2026-09-01T00:00:00.000Z').getTime());
        });

        test('caps endAt at referenceNow (today) when start_at + duration extends into the future', () => {
            const range = resolveDateRange({
                start_at: '2026-09-20T12:00:00.000Z',
                duration: '1 month', // would extend to Oct 20, 2026
                now: fixedNow, // 2026-09-26T12:00:00.000Z
            });

            expect(range.endAt.getTime()).toBe(fixedNow.getTime());
            expect(range.endDate).toBe('Sep 26, 2026');
            expect(range.startDate).toBe('Sep 20, 2026');
            expect(range.duration).toBe('6 days');
        });

        test('throws error if start_at is in the future (after or equal to referenceNow)', () => {
            expect(() =>
                resolveDateRange({
                    start_at: '2027-01-01T00:00:00.000Z',
                    end_at: '2028-01-01T00:00:00.000Z',
                    now: fixedNow,
                })
            ).toThrow('must be before end_at');
        });
    });

    describe('formatDate', () => {
        test('formats date in MMM D, YYYY pattern', () => {
            expect(formatDate(new Date('2025-06-17T12:00:00.000Z'))).toBe('Jun 17, 2025');
            expect(formatDate(new Date('2026-09-23T12:00:00.000Z'))).toBe('Sep 23, 2026');
            expect(formatDate(new Date('2027-01-05T12:00:00.000Z'))).toBe('Jan 5, 2027');
            expect(formatDate(new Date('2024-02-29T12:00:00.000Z'))).toBe('Feb 29, 2024');
            expect(formatDate(new Date('2024-12-31T12:00:00.000Z'))).toBe('Dec 31, 2024');
        });

        test('handles all 12 month abbreviations correctly', () => {
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            for (let m = 0; m < 12; m++) {
                const d = new Date(2025, m, 15);
                expect(formatDate(d)).toBe(`${months[m]} 15, 2025`);
            }
        });
    });

    describe('formatDurationEnglish', () => {
        test('formats single unit durations correctly', () => {
            const d1 = new Date('2026-01-01T00:00:00.000Z');
            const dMonth = new Date('2026-02-01T00:00:00.000Z');
            expect(formatDurationEnglish(d1, dMonth)).toBe('1 month');

            const d2Months = new Date('2026-03-01T00:00:00.000Z');
            expect(formatDurationEnglish(d1, d2Months)).toBe('2 months');

            const dHours = new Date('2026-01-01T12:00:00.000Z');
            expect(formatDurationEnglish(d1, dHours)).toBe('12 hours');

            const d1Hour = new Date('2026-01-01T01:00:00.000Z');
            expect(formatDurationEnglish(d1, d1Hour)).toBe('1 hour');

            const d1Year = new Date('2027-01-01T00:00:00.000Z');
            expect(formatDurationEnglish(d1, d1Year)).toBe('1 year');

            const d3Days = new Date('2026-01-04T00:00:00.000Z');
            expect(formatDurationEnglish(d1, d3Days)).toBe('3 days');
        });

        test('formats multi-unit compound durations', () => {
            const d1 = new Date('2026-01-01T00:00:00.000Z');
            const d4Months3Days = new Date('2026-05-04T00:00:00.000Z');
            expect(formatDurationEnglish(d1, d4Months3Days)).toBe('4 months and 3 days');

            const d1Day2Hours = new Date('2026-01-02T02:00:00.000Z');
            expect(formatDurationEnglish(d1, d1Day2Hours)).toBe('1 day and 2 hours');

            const dCompound = new Date('2027-03-04T00:00:00.000Z');
            expect(formatDurationEnglish(d1, dCompound)).toBe('1 year, 2 months and 3 days');
        });

        test('handles zero elapsed time', () => {
            const d = new Date('2026-01-01T00:00:00.000Z');
            expect(formatDurationEnglish(d, d)).toBe('0 seconds');
        });

        test('handles inverted date arguments by sorting chronologically', () => {
            const d1 = new Date('2026-01-01T00:00:00.000Z');
            const d2 = new Date('2026-02-01T00:00:00.000Z');
            expect(formatDurationEnglish(d2, d1)).toBe('1 month');
        });
    });
});
