import * as chrono from 'chrono-node';
import parseDuration from 'parse-duration';

export interface DateRangeOptions {
    startAt?: string | Date | number | null;
    start_at?: string | Date | number | null;
    startat?: string | Date | number | null;
    endAt?: string | Date | number | null;
    end_at?: string | Date | number | null;
    endat?: string | Date | number | null;
    duration?: string | number | null;
    now?: Date | number;
}

export interface ResolvedDateRange {
    startAt: Date;
    endAt: Date;
    durationMs: number;
    startDate: string;
    endDate: string;
    duration: string;
}

const MONTH_NAMES = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Formats a Date into "MMM D, YYYY" pattern (e.g. "Jun 17, 2025", "Sep 23, 2026").
 */
export function formatDate(date: Date): string {
    const month = MONTH_NAMES[date.getUTCMonth()];
    const day = date.getUTCDate();
    const year = date.getUTCFullYear();
    return `${month} ${day}, ${year}`;
}

function addCalendarMonths(base: Date, count: number): Date {
    const d = new Date(base.getTime());
    const targetMonth = d.getUTCMonth() + count;
    d.setUTCMonth(targetMonth);
    if (d.getUTCMonth() !== ((targetMonth % 12) + 12) % 12) {
        d.setUTCDate(0);
    }
    return d;
}

function addCalendarYears(base: Date, count: number): Date {
    return addCalendarMonths(base, count * 12);
}

/**
 * Expresses the duration between two dates (or elapsed milliseconds) in plain English
 * (e.g. "1 month", "12 hours", "4 months and 3 days", "1 year, 2 months and 3 days").
 */
export function formatDurationEnglish(startAt: Date, endAt: Date): string {
    let d1 = startAt;
    let d2 = endAt;
    if (d1.getTime() > d2.getTime()) {
        const temp = d1;
        d1 = d2;
        d2 = temp;
    }

    let cur = new Date(d1.getTime());

    let years = 0;
    while (true) {
        const next = addCalendarYears(cur, 1);
        if (next.getTime() <= d2.getTime()) {
            cur = next;
            years += 1;
        } else {
            break;
        }
    }

    let months = 0;
    while (true) {
        const next = addCalendarMonths(cur, 1);
        if (next.getTime() <= d2.getTime()) {
            cur = next;
            months += 1;
        } else {
            break;
        }
    }

    let remainingMs = d2.getTime() - cur.getTime();

    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const days = Math.floor(remainingMs / MS_PER_DAY);
    remainingMs %= MS_PER_DAY;

    const MS_PER_HOUR = 60 * 60 * 1000;
    const hours = Math.floor(remainingMs / MS_PER_HOUR);
    remainingMs %= MS_PER_HOUR;

    const MS_PER_MINUTE = 60 * 1000;
    const minutes = Math.floor(remainingMs / MS_PER_MINUTE);
    remainingMs %= MS_PER_MINUTE;

    const seconds = Math.floor(remainingMs / 1000);

    const parts: string[] = [];
    if (years > 0) parts.push(`${years} ${years === 1 ? 'year' : 'years'}`);
    if (months > 0) parts.push(`${months} ${months === 1 ? 'month' : 'months'}`);
    if (days > 0) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
    if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
    if (minutes > 0) parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
    if (seconds > 0) parts.push(`${seconds} ${seconds === 1 ? 'second' : 'seconds'}`);

    if (parts.length === 0) return '0 seconds';
    if (parts.length === 1) return parts[0];
    if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
    return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * Parses a date value (string, Date, or timestamp number) relative to a reference Date.
 */
export function parseDateInput(val: string | Date | number, ref: Date, fieldName: string): Date {
    if (val instanceof Date) {
        if (isNaN(val.getTime())) {
            throw new Error(`Invalid ${fieldName}: invalid Date object`);
        }
        return val;
    }

    if (typeof val === 'number') {
        const d = new Date(val);
        if (isNaN(d.getTime())) {
            throw new Error(`Invalid ${fieldName}: invalid timestamp ${val}`);
        }
        return d;
    }

    if (typeof val === 'string') {
        const trimmed = val.trim();
        if (!trimmed) {
            throw new Error(`Invalid ${fieldName}: value cannot be empty`);
        }

        // 1. Natural language and relative dates via chrono-node
        const parsed = chrono.parseDate(trimmed, ref);
        if (parsed && !isNaN(parsed.getTime())) {
            return parsed;
        }

        // 2. Standard ISO / RFC / date strings fallback
        const native = new Date(trimmed);
        if (!isNaN(native.getTime())) {
            return native;
        }

        throw new Error(`Invalid ${fieldName}: unable to parse "${val}"`);
    }

    throw new Error(`Invalid ${fieldName}: unsupported type`);
}

/**
 * Parses a duration input (string like "1 month", "2 weeks", "48h" or numeric milliseconds).
 */
export function parseDurationInput(val: string | number): number {
    if (typeof val === 'number') {
        if (isNaN(val) || val <= 0) {
            throw new Error('Invalid duration: duration must be a positive number');
        }
        return val;
    }

    if (typeof val === 'string') {
        const trimmed = val.trim();
        if (!trimmed) {
            throw new Error('Invalid duration: value cannot be empty');
        }

        const parseFn = typeof parseDuration === 'function' ? parseDuration : (parseDuration as any).default;
        const ms = parseFn(trimmed);
        if (typeof ms !== 'number' || isNaN(ms) || ms <= 0) {
            throw new Error(`Invalid duration: unable to parse "${val}"`);
        }
        return ms;
    }

    throw new Error('Invalid duration: unsupported type');
}

/**
 * Resolves startAt and endAt boundaries from flexible natural language, ISO dates,
 * and duration expressions. Operates 100% offline without external network calls.
 */
export function resolveDateRange(options: DateRangeOptions = {}): ResolvedDateRange {
    const referenceNow = options.now ? new Date(options.now) : new Date();
    if (isNaN(referenceNow.getTime())) {
        throw new Error('Invalid reference timestamp (now)');
    }

    const rawStart = options.startAt ?? options.start_at ?? options.startat;
    const rawEnd = options.endAt ?? options.end_at ?? options.endat;
    const rawDuration = options.duration;

    const hasStart = rawStart !== undefined && rawStart !== null && String(rawStart).trim() !== '';
    const hasEnd = rawEnd !== undefined && rawEnd !== null && String(rawEnd).trim() !== '';
    const hasDuration = rawDuration !== undefined && rawDuration !== null && String(rawDuration).trim() !== '';

    let startAt: Date;
    let endAt: Date;

    const parsedStart = hasStart ? parseDateInput(rawStart, referenceNow, 'start_at') : null;
    const parsedEnd = hasEnd ? parseDateInput(rawEnd, referenceNow, 'end_at') : null;
    const durationMs = hasDuration ? parseDurationInput(rawDuration) : null;

    if (parsedStart && parsedEnd) {
        startAt = parsedStart;
        endAt = parsedEnd;
    } else if (parsedStart) {
        startAt = parsedStart;
        if (durationMs !== null) {
            endAt = new Date(startAt.getTime() + durationMs);
        } else {
            endAt = referenceNow;
        }
    } else if (parsedEnd) {
        endAt = parsedEnd;
        if (durationMs !== null) {
            startAt = new Date(endAt.getTime() - durationMs);
        } else {
            const fallbackStart = chrono.parseDate('1 month ago', endAt);
            startAt = fallbackStart && !isNaN(fallbackStart.getTime())
                ? fallbackStart
                : new Date(endAt.getTime() - 30 * 24 * 60 * 60 * 1000);
        }
    } else {
        endAt = referenceNow;
        if (durationMs !== null) {
            startAt = new Date(endAt.getTime() - durationMs);
        } else {
            const fallbackStart = chrono.parseDate('1 month ago', referenceNow);
            startAt = fallbackStart && !isNaN(fallbackStart.getTime())
                ? fallbackStart
                : new Date(referenceNow.getTime() - 30 * 24 * 60 * 60 * 1000);
        }
    }

    // When the end_at date is in the future (or start_at + duration goes into the future),
    // stop at today's date (referenceNow).
    if (endAt.getTime() > referenceNow.getTime()) {
        endAt = referenceNow;
    }

    if (startAt.getTime() >= endAt.getTime()) {
        throw new Error(
            `start_at (${startAt.toISOString()}) must be before end_at (${endAt.toISOString()})`
        );
    }

    return {
        startAt,
        endAt,
        durationMs: endAt.getTime() - startAt.getTime(),
        startDate: formatDate(startAt),
        endDate: formatDate(endAt),
        duration: formatDurationEnglish(startAt, endAt),
    };
}
