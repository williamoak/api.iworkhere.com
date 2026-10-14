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
 *     "userId": "00000000-0000-0000-0000-000000000001",
 *     "journeys": [
 *       {
 *         "city": "Toronto",
 *         "country": "CA",
 *         "region": "Ontario",
 *         "latitude": 43.6532,
 *         "longitude": -79.3832,
 *         "startTime": "2026-09-01T10:00:00.000Z",
 *         "endTime": "2026-09-01T10:00:45.000Z",
 *         "totalDurationSeconds": 65,
 *         "totalDuration": "01:05.00",
 *         "pages": [
 *           {
 *             "page": "Home",
 *             "note": "visit: Home",
 *             "touchTime": "2026-09-01T10:00:00.000Z",
 *             "duration": "00:20",
 *             "durationSeconds": 20,
 *             "touched": 1
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
import {
    countJourneys,
    type VisitInfoRow,
} from './journeys';
import {
    filterRecord,
    processManageRecords,
    processJourneyRecords,
    isJourneyQuery,
    parseOutputShape,
    isStreamRequest,
    type ManageQueryParams,
    type RawVisitRecord,
    type ManageQueryRepository,
} from './POST';

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
}

export interface Journey {
    city: string | null;
    country: string | null;
    region: string | null;
    latitude: number | null;
    longitude: number | null;
    startTime: string;
    endTime: string;
    totalDurationSeconds: number;
    totalDuration: string;
    pages: PageVisit[];
}

export interface DeviceJourneys {
    deviceId: string;
    userId: string | null;
    journeys: Journey[];
}

export interface VisitRow {
    deviceId: string;
    userId?: string | null;
    touchTime: Date | string;
    latitude?: number | null;
    longitude?: number | null;
    note: string | null;
    city: string | null;
    country?: string | null;
    region?: string | null;
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
            userId: string | null;
            latitude: number | null;
            longitude: number | null;
            note: string | null;
            city: string | null;
            country: string | null;
            region: string | null;
        }>
    >();

    for (const row of rows) {
        if (row.note && row.note.toLowerCase().includes('/v1/')) continue;
        if (!deviceMap.has(row.deviceId)) {
            deviceMap.set(row.deviceId, []);
        }
        const touchTime = row.touchTime instanceof Date ? row.touchTime : new Date(row.touchTime);
        deviceMap.get(row.deviceId)!.push({
            touchTime,
            userId: row.userId ?? null,
            latitude: row.latitude ?? null,
            longitude: row.longitude ?? null,
            note: row.note,
            city: row.city ?? null,
            country: row.country ?? null,
            region: row.region ?? null,
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

        let deviceUserId: string | null = null;

        const journeys: Journey[] = rawJourneys.map((journeyRecords) => {
            let journeyCity: string | null = null;
            let journeyCountry: string | null = null;
            let journeyRegion: string | null = null;
            let journeyLatitude: number | null = null;
            let journeyLongitude: number | null = null;

            for (const r of journeyRecords) {
                if (!journeyCity && r.city) journeyCity = r.city;
                if (!journeyCountry && r.country) journeyCountry = r.country;
                if (!journeyRegion && r.region) journeyRegion = r.region;
                if (journeyLatitude === null && r.latitude !== null && r.latitude !== undefined) journeyLatitude = r.latitude;
                if (journeyLongitude === null && r.longitude !== null && r.longitude !== undefined) journeyLongitude = r.longitude;

                if (!deviceUserId && r.userId) deviceUserId = r.userId;
            }

            const k = journeyRecords.length;
            const stepDurations: number[] = [];
            let totalPriorDurationSecs = 0;

            for (let j = 0; j < k - 1; j++) {
                const cur = journeyRecords[j];
                const next = journeyRecords[j + 1];
                const diffMs = next.touchTime.getTime() - cur.touchTime.getTime();
                const dur = Math.max(0, Math.round(diffMs / 1000));
                stepDurations.push(dur);
                totalPriorDurationSecs += dur;
            }

            let lastPageDurationSec = 0;
            if (k > 1) {
                lastPageDurationSec = Math.round(totalPriorDurationSecs / (k - 1));
            }
            stepDurations.push(lastPageDurationSec);

            const aggregatedPagesMap = new Map<string, PageVisit>();

            for (let j = 0; j < k; j++) {
                const current = journeyRecords[j];
                const durationSec = stepDurations[j];
                const pageName = extractPageName(current.note);

                const existing = aggregatedPagesMap.get(pageName);
                if (existing) {
                    existing.touched += 1;
                    existing.durationSeconds += durationSec;
                    existing.duration = formatDuration(existing.durationSeconds, false);
                    if (!existing.note && current.note) existing.note = current.note;
                } else {
                    aggregatedPagesMap.set(pageName, {
                        page: pageName,
                        note: current.note,
                        touchTime: current.touchTime.toISOString(),
                        duration: formatDuration(durationSec, false),
                        durationSeconds: durationSec,
                        touched: 1,
                    });
                }
            }

            const pages = Array.from(aggregatedPagesMap.values());
            const startTime = journeyRecords[0].touchTime.toISOString();
            const endTime = journeyRecords[journeyRecords.length - 1].touchTime.toISOString();
            const totalDurationSeconds = pages.reduce((sum, p) => sum + p.durationSeconds, 0);
            const totalDuration = formatDuration(totalDurationSeconds);

            return {
                city: journeyCity,
                country: journeyCountry,
                region: journeyRegion,
                latitude: journeyLatitude,
                longitude: journeyLongitude,
                startTime,
                endTime,
                totalDurationSeconds,
                totalDuration,
                pages,
            };
        });

        results.push({
            deviceId,
            userId: deviceUserId,
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
            userId: visitInfo.userId,
            touchTime: visitInfo.touchTime,
            latitude: visitInfo.latitude,
            longitude: visitInfo.longitude,
            note: visitInfo.note,
            city: visitInfo.city,
            country: visitInfo.country,
            region: visitInfo.region,
        })
        .from(visitInfo)
        .where(eq(visitInfo.locationSource, source))
        .orderBy(asc(visitInfo.deviceId), asc(visitInfo.touchTime));

    return buildDeviceJourneys(rows as VisitRow[]);
}

export function extractManageParams(req: Request): Record<string, unknown> {
    const query = (req.query || {}) as Record<string, unknown>;
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;

    let container: Record<string, unknown> = {};
    const rawFilterSet = query.filterSet ?? query.filter_set ?? query.params ?? query.filterSetJson ?? query.filter;
    if (typeof rawFilterSet === 'string') {
        try {
            const parsed = JSON.parse(rawFilterSet);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                container = parsed as Record<string, unknown>;
            }
        } catch {
            // ignore
        }
    } else if (rawFilterSet && typeof rawFilterSet === 'object' && !Array.isArray(rawFilterSet)) {
        container = rawFilterSet as Record<string, unknown>;
    }

    return {
        ...container,
        ...body,
        ...query,
    };
}

export function hasManageOverloadParams(params: Record<string, unknown>): boolean {
    const rawOutputShape =
        params.output_shape ??
        params.outputShape ??
        params.shape ??
        params.output_fields ??
        params.outputFields;

    if (rawOutputShape !== undefined) return true;

    if (params.filters !== undefined) return true;
    if (params.startDate !== undefined || params.start_date !== undefined) return true;
    if (params.endDate !== undefined || params.end_date !== undefined) return true;
    if (params.sector !== undefined) return true;
    if (params.region !== undefined && params.region !== '') return true;
    if (params.sortColumn !== undefined || params.sort_column !== undefined) return true;
    if (params.pageStartRecord !== undefined || params.page_start_record !== undefined) return true;
    if (params.pageEndRecord !== undefined || params.page_end_record !== undefined) return true;
    if (params.dataset !== undefined && params.dataset !== '') return true;
    if (params.stream !== undefined || params.chunk_batches !== undefined) return true;

    return false;
}

export function normalizeRawOutputShape(raw: unknown): unknown {
    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            try {
                return JSON.parse(trimmed);
            } catch {
                const inner = trimmed.slice(1, -1).trim();
                if (inner.length > 0) {
                    const parts = inner.split(',').map((p) => p.trim().replace(/^["']|["']$/g, ''));
                    const shapeObj: Record<string, unknown> = {};
                    for (const part of parts) {
                        const kv = part.split(':').map((s) => s.trim().replace(/^["']|["']$/g, ''));
                        if (kv.length === 2) {
                            shapeObj[kv[0]] = kv[1];
                        } else {
                            shapeObj[part] = part;
                        }
                    }
                    return shapeObj;
                }
            }
        } else if (trimmed.length > 0) {
            return { [trimmed]: trimmed };
        }
    }
    return raw;
}

export const defaultGetManageQueryRepository: ManageQueryRepository = {
    getManageData: async (params: ManageQueryParams): Promise<Record<string, unknown>[]> => {
        const rows = await db
            .select({
                id: visitInfo.id,
                deviceId: visitInfo.deviceId,
                userId: visitInfo.userId,
                requestMethod: visitInfo.requestMethod,
                touchTime: visitInfo.touchTime,
                latitude: visitInfo.latitude,
                longitude: visitInfo.longitude,
                locationSource: visitInfo.locationSource,
                city: visitInfo.city,
                country: visitInfo.country,
                region: visitInfo.region,
                note: visitInfo.note,
            })
            .from(visitInfo);

        if (
            isJourneyQuery(params) ||
            (params.countFields &&
                params.countFields.length > 0 &&
                params.columns.length === 0)
        ) {
            return processJourneyRecords(rows as RawVisitRecord[], params);
        }

        return processManageRecords(rows as RawVisitRecord[], params);
    },
    getRawRecords: async (): Promise<RawVisitRecord[]> => {
        const rows = await db
            .select({
                id: visitInfo.id,
                deviceId: visitInfo.deviceId,
                userId: visitInfo.userId,
                requestMethod: visitInfo.requestMethod,
                touchTime: visitInfo.touchTime,
                latitude: visitInfo.latitude,
                longitude: visitInfo.longitude,
                locationSource: visitInfo.locationSource,
                city: visitInfo.city,
                country: visitInfo.country,
                region: visitInfo.region,
                note: visitInfo.note,
            })
            .from(visitInfo);

        return rows as RawVisitRecord[];
    },
};

export function makeGetManageHandler(repo: ManageQueryRepository = defaultGetManageQueryRepository) {
    return async function GET(req: Request, res: Response): Promise<Response> {
        try {
            const params = extractManageParams(req);

            if (!hasManageOverloadParams(params)) {
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
            }

            const rawOutputShape = normalizeRawOutputShape(
                params.output_shape ??
                params.outputShape ??
                params.shape ??
                params.output_fields ??
                params.outputFields ??
                { count: 'count' }
            );

            let parsedShape;
            try {
                parsedShape = parseOutputShape(rawOutputShape);
            } catch (parseErr) {
                return res.status(400).json({
                    error: 'INVALID_REQUEST',
                    message: parseErr instanceof Error ? parseErr.message : 'Invalid output_shape',
                });
            }

            let filters = params.filters;
            if (typeof filters === 'string') {
                try {
                    filters = JSON.parse(filters);
                } catch {
                    filters = undefined;
                }
            }

            const queryParams: ManageQueryParams = {
                columns: parsedShape.columns,
                functions: parsedShape.functions,
                countFields: parsedShape.countFields,
                dataset:
                    typeof params.dataset === 'string'
                        ? params.dataset
                        : typeof params.location_source === 'string'
                          ? params.location_source
                          : typeof params.locationSource === 'string'
                            ? params.locationSource
                            : typeof params.source === 'string'
                              ? params.source
                              : undefined,
                startDate:
                    typeof params.startDate === 'string'
                        ? params.startDate
                        : typeof params.start_date === 'string'
                          ? params.start_date
                          : undefined,
                endDate:
                    typeof params.endDate === 'string'
                        ? params.endDate
                        : typeof params.end_date === 'string'
                          ? params.end_date
                          : undefined,
                sector: typeof params.sector === 'string' ? params.sector : undefined,
                region: typeof params.region === 'string' ? params.region : undefined,
                filters: filters && typeof filters === 'object' ? (filters as Record<string, string[]>) : undefined,
                query: typeof params.query === 'string' ? params.query : typeof params.where === 'string' ? params.where : undefined,
                sortColumn:
                    typeof params.sortColumn === 'string'
                        ? params.sortColumn
                        : typeof params.sort_column === 'string'
                          ? params.sort_column
                          : undefined,
                sortDirection:
                    params.sortDirection === 'desc' || params.sort_direction === 'desc'
                        ? 'desc'
                        : 'asc',
                pageStartRecord: Number.isFinite(
                    Number(params.pageStartRecord ?? params.page_start_record),
                )
                    ? Number(params.pageStartRecord ?? params.page_start_record)
                    : 0,
                pageEndRecord: Number.isFinite(
                    Number(params.pageEndRecord ?? params.page_end_record),
                )
                    ? Number(params.pageEndRecord ?? params.page_end_record)
                    : (params.limit !== undefined && Number.isFinite(Number(params.limit))) ||
                      (params.pageSize !== undefined && Number.isFinite(Number(params.pageSize))) ||
                      (params.page_size !== undefined && Number.isFinite(Number(params.page_size))) ||
                      (params.max_records !== undefined && Number.isFinite(Number(params.max_records))) ||
                      (params.maxRecords !== undefined && Number.isFinite(Number(params.maxRecords)))
                    ? (Number.isFinite(Number(params.pageStartRecord ?? params.page_start_record))
                        ? Number(params.pageStartRecord ?? params.page_start_record)
                        : 0) +
                      Number(
                          params.limit ??
                          params.pageSize ??
                          params.page_size ??
                          params.max_records ??
                          params.maxRecords,
                      ) -
                      1
                    : undefined,
            };

            let data: Record<string, unknown>[];

            if (parsedShape.countFields.length > 0 && parsedShape.columns.length === 0) {
                const rawRecords = repo.getRawRecords
                    ? await repo.getRawRecords()
                    : ((await repo.getManageData({
                          columns: [
                              { outputKey: 'id', columnKey: 'id' },
                              { outputKey: 'deviceId', columnKey: 'deviceId' },
                              { outputKey: 'touchTime', columnKey: 'touchTime' },
                              { outputKey: 'note', columnKey: 'note' },
                              { outputKey: 'city', columnKey: 'city' },
                              { outputKey: 'region', columnKey: 'region' },
                              { outputKey: 'country', columnKey: 'country' },
                              { outputKey: 'locationSource', columnKey: 'locationSource' },
                          ],
                          dataset: queryParams.dataset,
                          startDate: queryParams.startDate,
                          endDate: queryParams.endDate,
                          sector: queryParams.sector,
                          region: queryParams.region,
                          filters: queryParams.filters,
                      })) as RawVisitRecord[]);

                const matchingRecords = (rawRecords as RawVisitRecord[]).filter((r) =>
                    filterRecord(r, queryParams),
                );
                const journeyCount = countJourneys(matchingRecords as VisitInfoRow[]);

                const entry: Record<string, unknown> = {};
                for (const cf of parsedShape.countFields) {
                    entry[cf.outputKey] = journeyCount;
                }
                data = [entry];
            } else if (isJourneyQuery(queryParams)) {
                if (repo.getRawRecords) {
                    const rawRecords = await repo.getRawRecords();
                    data = processJourneyRecords(rawRecords as RawVisitRecord[], queryParams);
                } else {
                    data = await repo.getManageData(queryParams);
                }
            } else {
                data = await repo.getManageData(queryParams);
            }

            if (isStreamRequest(req)) {
                res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
                res.setHeader('Transfer-Encoding', 'chunked');
                res.setHeader('Cache-Control', 'no-cache, no-transform');
                res.setHeader('X-Content-Type-Options', 'nosniff');
                res.status(200);

                const chunkSize =
                    Number(
                        params.chunkSize ??
                        params.chunk_size ??
                        params.batchSize ??
                        params.batch_size,
                    ) || 0;
                const sendAsChunks =
                    (params.chunk_batches === true ||
                        params.chunk_arrays === true ||
                        params.as_chunks === true) &&
                    chunkSize > 0;

                if (Array.isArray(data)) {
                    if (sendAsChunks) {
                        for (let i = 0; i < data.length; i += chunkSize) {
                            const chunk = data.slice(i, i + chunkSize);
                            res.write(JSON.stringify(chunk) + '\n');
                        }
                    } else {
                        for (const record of data) {
                            res.write(JSON.stringify(record) + '\n');
                        }
                    }
                }

                res.end();
                return res;
            }

            return res.status(200).json(data);
        } catch (err) {
            logger.error('GET /v1/clients/joinaunion/visit_info/manage error:', err);

            return res.status(500).json({
                error: 'INTERNAL_ERROR',
                message: 'Failed to retrieve device journeys',
            });
        }
    };
}

const GET = makeGetManageHandler(defaultGetManageQueryRepository);
export default GET;

export const __test__ = {
    getDeviceJourneysBySource,
    buildDeviceJourneys,
    extractPageName,
    formatDuration,
    DEFAULT_SOURCE,
    MAX_SOURCE_LENGTH,
    MAX_JOURNEY_GAP_MS,
    makeGetManageHandler,
    defaultGetManageQueryRepository,
    extractManageParams,
    hasManageOverloadParams,
    normalizeRawOutputShape,
};
