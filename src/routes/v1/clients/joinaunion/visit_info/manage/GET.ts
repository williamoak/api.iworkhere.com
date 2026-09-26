/**
 * @myDocBlock
 * @file GET.ts
 * @external
 * @module clients-joinaunion-visit-info-manage
 * @tag clients, joinaunion, visit_info, manage
 * @version 1.1.0
 * @author william.r.oak@gmail.com
 * @path /v1/clients/joinaunion/visit_info/manage
 * @summary Retrieve unique device journeys by location source.
 *
 * @description
 * Returns a list of unique devices from joinaunion.visit_info along with their
 * browsing journeys, pages visited, stay durations, page-touch counts, and city
 * information, filtered by location_source (defaults to "generated").
 *
 * A journey begins at the home page and continues until touch_time exceeds the
 * previous touch time for that device by more than 5 minutes. Duplicate views
 * of the same page within a single journey are aggregated into a single entry
 * with total duration summed and the number of touches recorded.
 *
 * @auth
 * Authentication is not required.
 *
 * @query
 * {
 *   "source": {
 *     "type": "string",
 *     "required": false,
 *     "default": "generated",
 *     "description": "Location source filter (defaults to 'generated')"
 *   }
 * }
 *
 * @response
 * [
 *   {
 *     "deviceId": "00000000-0000-0000-0000-000000000000",
 *     "city": "Toronto",
 *     "journeys": [
 *       {
 *         "city": "Toronto",
 *         "startTime": "2026-09-01T10:00:00.000Z",
 *         "endTime": "2026-09-01T10:00:45.000Z",
 *         "totalDurationSeconds": 45,
 *         "totalDuration": "00:45.00",
 *         "pages": [
 *           {
 *             "page": "Home",
 *             "note": "visit: Home",
 *             "touchTime": "2026-09-01T10:00:00.000Z",
 *             "duration": "00:20",
 *             "durationSeconds": 20,
 *             "touched": 1,
 *             "city": "Toronto"
 *           }
 *         ]
 *       }
 *     ]
 *   }
 * ]
 *
 * @errors
 * Returns 400 if the source parameter exceeds 32 characters.
 * Returns 500 if database query fails.
 */

import type { Request, Response } from 'express';
import { eq, asc } from 'drizzle-orm';

import { db } from '@services/dbService';
import { visitInfo } from '@db/schema/visit_info';
import { logger } from '@helpers/logger';

export const authRequired = false;

const DEFAULT_SOURCE = 'generated';
const MAX_SOURCE_LENGTH = 32;
const MAX_JOURNEY_GAP_MS = 5 * 60 * 1000; // 5 minutes

export interface PageVisit {
    page: string;
    note: string | null;
    touchTime: string;
    duration: string;
    durationSeconds: number;
    touched: number;
    city: string | null;
}

export interface Journey {
    city: string | null;
    startTime: string;
    endTime: string;
    totalDurationSeconds: number;
    totalDuration: string;
    pages: PageVisit[];
}

export interface DeviceJourneys {
    deviceId: string;
    city: string | null;
    journeys: Journey[];
}

export interface VisitRow {
    deviceId: string;
    touchTime: Date | string;
    note: string | null;
    city: string | null;
}

function badRequest(res: Response, message: string): Response {
    return res.status(400).json({ error: 'INVALID_REQUEST', message });
}

export function formatDuration(seconds: number, includeCentis: boolean = true): string {
    const totalCentis = Math.max(0, Math.round(seconds * 100));
    const totalSecsInt = Math.floor(totalCentis / 100);
    const centis = totalCentis % 100;

    const days = Math.floor(totalSecsInt / 86400);
    const hours = Math.floor((totalSecsInt % 86400) / 3600);
    const minutes = Math.floor((totalSecsInt % 3600) / 60);
    const secs = totalSecsInt % 60;

    const daysStr = String(days).padStart(2, '0');
    const hoursStr = String(hours).padStart(2, '0');
    const minutesStr = String(minutes).padStart(2, '0');
    const secsStr = String(secs).padStart(2, '0');
    const centisStr = String(centis).padStart(2, '0');

    if (includeCentis) {
        if (days > 0) {
            return `${daysStr}:${hoursStr}:${minutesStr}:${secsStr}.${centisStr}`;
        }
        if (hours > 0) {
            return `${hoursStr}:${minutesStr}:${secsStr}.${centisStr}`;
        }
        return `${minutesStr}:${secsStr}.${centisStr}`;
    }

    if (days > 0) {
        return `${daysStr}:${hoursStr}:${minutesStr}:${secsStr}`;
    }
    if (hours > 0) {
        return `${hoursStr}:${minutesStr}:${secsStr}`;
    }
    return `${minutesStr}:${secsStr}`;
}

export function extractPageName(note: string | null | undefined): string {
    if (!note) return 'unknown';
    const trimmed = note.trim();
    if (!trimmed) return 'unknown';
    if (trimmed.toLowerCase().startsWith('visit:')) {
        const page = trimmed.slice(6).trim();
        return page || 'Home';
    }
    return trimmed;
}

export function buildDeviceJourneys(rows: VisitRow[]): DeviceJourneys[] {
    const deviceMap = new Map<
        string,
        Array<{
            touchTime: Date;
            note: string | null;
            city: string | null;
        }>
    >();

    for (const row of rows) {
        if (!deviceMap.has(row.deviceId)) {
            deviceMap.set(row.deviceId, []);
        }
        const touchTime = row.touchTime instanceof Date ? row.touchTime : new Date(row.touchTime);
        deviceMap.get(row.deviceId)!.push({
            touchTime,
            note: row.note,
            city: row.city,
        });
    }

    const results: DeviceJourneys[] = [];

    for (const [deviceId, records] of deviceMap.entries()) {
        records.sort((a, b) => a.touchTime.getTime() - b.touchTime.getTime());

        const rawJourneys: Array<typeof records> = [];
        let currentJourney: typeof records = [];

        for (let i = 0; i < records.length; i++) {
            const rec = records[i];
            if (currentJourney.length === 0) {
                currentJourney.push(rec);
            } else {
                const prevRec = currentJourney[currentJourney.length - 1];
                const diffMs = rec.touchTime.getTime() - prevRec.touchTime.getTime();

                if (diffMs > MAX_JOURNEY_GAP_MS) {
                    rawJourneys.push(currentJourney);
                    currentJourney = [rec];
                } else {
                    currentJourney.push(rec);
                }
            }
        }
        if (currentJourney.length > 0) {
            rawJourneys.push(currentJourney);
        }

        let deviceCity: string | null = null;
        const journeys: Journey[] = rawJourneys.map((journeyRecords) => {
            let journeyCity: string | null = null;
            const aggregatedPagesMap = new Map<string, PageVisit>();

            for (let j = 0; j < journeyRecords.length; j++) {
                const current = journeyRecords[j];
                if (!journeyCity && current.city) {
                    journeyCity = current.city;
                }
                if (!deviceCity && current.city) {
                    deviceCity = current.city;
                }

                let durationSec = 0;
                if (j < journeyRecords.length - 1) {
                    const next = journeyRecords[j + 1];
                    const diffMs = next.touchTime.getTime() - current.touchTime.getTime();
                    durationSec = Math.max(0, Math.round(diffMs / 1000));
                }

                const pageName = extractPageName(current.note);
                const existing = aggregatedPagesMap.get(pageName);
                if (existing) {
                    existing.touched += 1;
                    existing.durationSeconds += durationSec;
                    existing.duration = formatDuration(existing.durationSeconds, false);
                    if (!existing.city && current.city) {
                        existing.city = current.city;
                    }
                    if (!existing.note && current.note) {
                        existing.note = current.note;
                    }
                } else {
                    aggregatedPagesMap.set(pageName, {
                        page: pageName,
                        note: current.note,
                        touchTime: current.touchTime.toISOString(),
                        duration: formatDuration(durationSec, false),
                        durationSeconds: durationSec,
                        touched: 1,
                        city: current.city,
                    });
                }
            }

            const pages = Array.from(aggregatedPagesMap.values());
            const startMs = journeyRecords[0].touchTime.getTime();
            const endMs = journeyRecords[journeyRecords.length - 1].touchTime.getTime();
            const startTime = journeyRecords[0].touchTime.toISOString();
            const endTime = journeyRecords[journeyRecords.length - 1].touchTime.toISOString();
            const exactDiffSecs = Math.max(0, (endMs - startMs) / 1000);
            const totalDurationSeconds = pages.reduce((sum, p) => sum + p.durationSeconds, 0);
            const durationForFormat = exactDiffSecs > 0 ? exactDiffSecs : totalDurationSeconds;
            const totalDuration = formatDuration(durationForFormat);

            return {
                city: journeyCity,
                startTime,
                endTime,
                totalDurationSeconds,
                totalDuration,
                pages,
            };
        });

        results.push({
            deviceId,
            city: deviceCity,
            journeys,
        });
    }

    results.sort((a, b) => a.deviceId.localeCompare(b.deviceId));

    return results;
}

export async function getDeviceJourneysBySource(source: string): Promise<DeviceJourneys[]> {
    const rows = await db
        .select({
            deviceId: visitInfo.deviceId,
            touchTime: visitInfo.touchTime,
            note: visitInfo.note,
            city: visitInfo.city,
        })
        .from(visitInfo)
        .where(eq(visitInfo.locationSource, source))
        .orderBy(asc(visitInfo.deviceId), asc(visitInfo.touchTime));

    return buildDeviceJourneys(rows as VisitRow[]);
}

export default async function GET(req: Request, res: Response): Promise<Response> {
    try {
        const rawSource = Array.isArray(req.query.source) ? req.query.source[0] : req.query.source;
        let source = DEFAULT_SOURCE;

        if (typeof rawSource === 'string') {
            const trimmed = rawSource.trim();
            if (trimmed.length > 0) {
                source = trimmed;
            }
        }

        if (source.length > MAX_SOURCE_LENGTH) {
            return badRequest(res, `source must be ${MAX_SOURCE_LENGTH} characters or fewer`);
        }

        const deviceJourneys = await getDeviceJourneysBySource(source);

        return res.status(200).json(deviceJourneys);
    } catch (err) {
        logger.error('GET /v1/clients/joinaunion/visit_info/manage error:', err);

        return res.status(500).json({
            error: 'INTERNAL_ERROR',
            message: 'Failed to retrieve device journeys',
        });
    }
}

export const __test__ = {
    getDeviceJourneysBySource,
    buildDeviceJourneys,
    extractPageName,
    formatDuration,
    DEFAULT_SOURCE,
    MAX_SOURCE_LENGTH,
    MAX_JOURNEY_GAP_MS,
};
