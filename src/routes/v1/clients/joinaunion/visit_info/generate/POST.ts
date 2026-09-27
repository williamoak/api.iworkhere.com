/**
 * @myDocBlock
 * @file POST.ts
 * @external
 * @module clients-joinaunion-visit-info-generate
 * @tag clients, joinaunion, visit_info, generate
 * @version 1.1.0
 * @author william.r.oak@gmail.com
 * @path /v1/clients/joinaunion/visit_info/generate
 * @summary Generate a clean, synthetic visit-history dataset for Joinaunion.
 *
 * @description
 * This administrative endpoint creates plausible browsing journeys for the
 * Joinaunion site and stores one visit_info row for every page reached. It is
 * intended for development, demonstrations, analytics testing, and other
 * controlled data-generation workflows; it does not represent real users or
 * real traffic. Every generated journey starts at the Home page and follows
 * a randomized walk through dynamically discovered website pages (queried from
 * non-endpoint visit notes in joinaunion.visit_info, cached in process memory
 * and Redis, or falling back to standard site pages).
 *
 * Before inserting data, the endpoint deletes every existing visit_info row
 * whose location_source matches loc_src. Reusing the same loc_src therefore
 * replaces the previous generated dataset and keeps repeated runs clean.
 * The endpoint writes GET-style visits with a generated device_id, timestamp,
 * geographic coordinates, city, country, region, location_source, page note,
 * and a generated user_id.
 *
 * Journey behavior:
 * - The requested number of journeys (num_recs) is generated exactly. Each journey
 *   contains at least two page visits so it is visible as a browsing journey.
 * - Available pages are discovered dynamically from joinaunion.visit_info notes,
 *   cached in Redis and Node local memory with a 24-hour TTL, and fall back to
 *   standard pages if empty.
 * - The first 20% of journeys use new device IDs. After that, devices are reused
 *   with 70% probability while newly created IDs are added to the cache.
 * - Journeys are distributed chronologically across the resolved [start_at, end_at]
 *   time window. When unspecified, timestamps default to a 1-month window prior
 *   to execution.
 * - Each page visit advances by 1 to 30 seconds. A journey ends if all unique
 *   pages have been visited, if total time spent on the site reaches 20 minutes,
 *   if total time spent on any single page reaches 10 minutes, or according to
 *   a progressive termination probability (5% for the first page plus double the
 *   triangle sum of completed pages: 1 page: 5%, 2 pages: 11%, 3 pages: 17%,
 *   4 pages: 25%, 5 pages: 35%, etc.).
 * - Places are selected from the offline `@countrystatecity/countries`
 *   dataset. Cities provide generated names and base coordinates for any
 *   supported country and region, with a random offset of up to 0.25 degrees
 *   in each direction for realistic-looking visits. The geographic location
 *   (latitude, longitude, city, country, region) is fixed per journey so all
 *   records within a given journey share the same location.
 *
 * @auth
 * Authentication is not currently required.
 *
 * @body
 * {
 *   "num_recs": 1000,
 *   "loc_src": "generated",
 *   "country": "CA",
 *   "region": "all",
 *   "start_at": "3 months ago",
 *   "duration": "1 month"
 * }
 *
 * @parameters
 * - num_recs: Optional integer number of journeys to create; defaults to 1000
 *   and may not be greater than 10000 or less than 0.
 * - loc_src: Required cleanup and provenance label, limited to 32 characters.
 *   All existing rows with this location_source are deleted before insertion.
 * - country: Optional country name, ISO-2 code, or ISO-3 code. When omitted,
 *   the first country returned by the offline package is used.
 * - region: Optional region/state/province name or code; defaults to `all`.
 *   The value `all` selects cities from every region returned by the package
 *   for the selected country. Otherwise, cities are selected only from the
 *   requested region.
 *   Region and city data comes from the offline package; no request-time
 *   network call is made.
 * - start_at / startat: Optional natural language date (e.g. "June 17th 2025",
 *   "2 months ago", "2025-06-17") specifying window start.
 * - end_at / endat: Optional natural language date specifying window end.
 * - duration: Optional natural language duration (e.g. "1 month", "2 weeks",
 *   "3 days", "48 hours") defining the time span.
 *
 * @response
 * {
 *   "ok": true,
 *   "location_source": "generated",
 *   "requested_records": 1000,
 *   "inserted_records": 2450,
 *   "journeys": 1000,
 *   "devices": 446,
 *   "start_date": "Aug 26, 2026",
 *   "end_date": "Sep 26, 2026",
 *   "duration": "1 month"
 * }
 *
 * @errors
 * Returns 400 for a missing loc_src, a non-integer or out-of-range num_recs,
 * an overlong loc_src, invalid date/duration formats, start_at >= end_at, or
 * an invalid country/region pair. Returns 500 if deletion or insertion fails.
 * A request with num_recs set to 0 still clears matching existing rows and
 * reports zero inserted records.
 *
 * @sideEffects
 * Deletes matching rows from joinaunion.visit_info, then inserts generated
 * rows into that table. No external site navigation or real-time delay occurs.
 */

import type { Request, Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
    getCitiesOfState,
    getCountries,
    getStatesOfCountry,
    type ICity,
    type ICountry,
    type IState,
} from '@countrystatecity/countries';

import { db } from '@services/dbService';
import { visitInfo } from '@db/schema/visit_info';
import { cacheStore } from '@cache/cacheStore';
import { resolveDateRange } from '@helpers/dateParser';

/* make this true to enforce authenticated requests, later... */
export const authRequired = false;

export type GeoPoint = {
    latitude: number;
    longitude: number;
    city: string;
    countryCode: string;
    regionCode: string;
    regionName: string;
};

export type VisitRecord = {
    deviceId: string;
    userId: string;
    requestMethod: 'GET';
    touchTime: Date;
    latitude: number;
    longitude: number;
    locationSource: string;
    city: string;
    country: string;
    region: string;
    note: string;
};

export type GeneratorOptions = {
    numRecs: number;
    locationSource: string;
    country: string;
    region: string;
    pages?: string[];
    random?: () => number;
    deviceId?: () => string;
    userId?: () => string;
    now?: Date;
    places?: GeoPoint[];
    startAt?: Date | string | number | null;
    start_at?: Date | string | number | null;
    startat?: Date | string | number | null;
    endAt?: Date | string | number | null;
    end_at?: Date | string | number | null;
    endat?: Date | string | number | null;
    duration?: string | number | null;
};

type GeneratedJourneys = { records: VisitRecord[]; journeys: number; devices: number };

export const REDIS_PAGES_KEY = 'joinaunion:dynamic_pages';
export const DEFAULT_FALLBACK_PAGES = [
    'Home',
    'Your Rights',
    'Why Unions',
    'Resources',
    'About',
    'Contact',
    'Privacy',
] as const;

let localPageCache: string[] | null = null;
let localPageCacheExpiresAt = 0;
const PAGE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function extractUniquePages(notes: (string | null | undefined)[]): string[] {
    const pageSet = new Set<string>();

    for (const note of notes) {
        if (!note || typeof note !== 'string') continue;
        const trimmed = note.trim();
        if (!/^visit:\s*/i.test(trimmed)) continue;
        const pageName = trimmed.replace(/^visit:\s*/i, '').trim();

        if (pageName && !pageName.startsWith('/') && pageName.length <= 64) {
            pageSet.add(pageName);
        }
    }

    pageSet.add('Home');
    return Array.from(pageSet);
}

export function resetLocalPageCache(): void {
    localPageCache = null;
    localPageCacheExpiresAt = 0;
}

export async function getDynamicPages(): Promise<string[]> {
    if (localPageCache && localPageCache.length > 0 && Date.now() < localPageCacheExpiresAt) {
        return localPageCache;
    }

    try {
        const cached = await cacheStore.get<string[]>(REDIS_PAGES_KEY);
        if (Array.isArray(cached) && cached.length > 0) {
            localPageCache = cached;
            localPageCacheExpiresAt = Date.now() + PAGE_CACHE_TTL_MS;
            return localPageCache;
        }
    } catch {
        // Fall through to database on Redis failure
    }

    try {
        const rows = await db
            .selectDistinct({ note: visitInfo.note })
            .from(visitInfo)
            .where(sql`${visitInfo.note} ILIKE 'visit: %' AND ${visitInfo.note} NOT ILIKE 'visit: /%' AND ${visitInfo.note} IS NOT NULL`);

        const rawNotes = rows.map((r) => r.note).filter((n): n is string => Boolean(n));
        const extracted = extractUniquePages(rawNotes);

        localPageCache = extracted.length > 1 ? extracted : [...DEFAULT_FALLBACK_PAGES];
        localPageCacheExpiresAt = Date.now() + PAGE_CACHE_TTL_MS;

        try {
            await cacheStore.set(REDIS_PAGES_KEY, localPageCache, PAGE_CACHE_TTL_MS);
        } catch {
            // Ignore Redis write failure
        }

        return localPageCache;
    } catch {
        localPageCache = [...DEFAULT_FALLBACK_PAGES];
        localPageCacheExpiresAt = Date.now() + PAGE_CACHE_TTL_MS;
        return localPageCache;
    }
}

const DEFAULT_REGION = 'all';

function randomPoint(places: GeoPoint[], random: () => number): GeoPoint {
    const base = places[Math.min(places.length - 1, Math.max(0, Math.floor(random() * places.length)))];
    return {
        latitude: Math.max(-90, Math.min(90, base.latitude + (random() - 0.5) * 0.5)),
        longitude: Math.max(-180, Math.min(180, base.longitude + (random() - 0.5) * 0.5)),
        city: base.city,
        countryCode: base.countryCode,
        regionCode: base.regionCode,
        regionName: base.regionName,
    };
}

const placeCache = new Map<string, Promise<GeoPoint[]>>();

function countryMatches(country: ICountry, selector: string): boolean {
    const normalized = selector.toLowerCase();
    return [country.iso2, country.iso3, country.name].some((value) => value.toLowerCase() === normalized);
}

function stateMatches(state: IState, selector: string): boolean {
    const normalized = selector.toLowerCase();
    return [state.iso2, state.name, state.iso3166_2 ?? ''].some((value) => value.toLowerCase() === normalized);
}

function cityToPlace(city: ICity, state: IState): GeoPoint | null {
    const latitude = Number(city.latitude);
    const longitude = Number(city.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return {
        latitude,
        longitude,
        city: city.name,
        countryCode: city.country_code,
        regionCode: state.iso2,
        regionName: state.name,
    };
}

async function loadPlaces(countryCode: string, stateSelector: string): Promise<GeoPoint[]> {
    const cacheKey = `${countryCode}:${stateSelector}`;
    const cached = placeCache.get(cacheKey);
    if (cached) return cached;

    const pending = (async () => {
        const states = await getStatesOfCountry(countryCode);
        const selectedStates = stateSelector.toLowerCase() === 'all'
            ? states
            : states.filter((state) => stateMatches(state, stateSelector));
        const cities = await Promise.all(
            selectedStates.map((state) => getCitiesOfState(countryCode, state.iso2)),
        );
        return cities.flatMap((stateCities, index) =>
            stateCities
                .map((city) => cityToPlace(city, selectedStates[index]))
                .filter((place): place is GeoPoint => place !== null),
        );
    })();
    placeCache.set(cacheKey, pending);
    return pending;
}

export async function resolveCountryRegion(
    countryValue?: unknown,
    regionValue: unknown = DEFAULT_REGION,
): Promise<GeoPoint[] | null> {
    if (typeof regionValue !== 'string' || regionValue.trim() === '') return null;
    const stateSelector = regionValue.trim();
    const countries = await getCountries();
    const countrySelector = typeof countryValue === 'string' ? countryValue.trim() : '';
    const country = countrySelector
        ? countries.find((candidate) => countryMatches(candidate, countrySelector))
        : countries[0];
    if (!country) return null;
    const places = await loadPlaces(country.iso2, stateSelector);
    return places.length > 0 ? places : null;
}

function nextPage(page: string, availablePages: string[], random: () => number): string {
    const choices = availablePages.filter((candidate) => candidate !== page);
    if (choices.length === 0) return page;
    return choices[Math.min(choices.length - 1, Math.max(0, Math.floor(random() * choices.length)))];
}

function nextDevice(
    cache: string[],
    shouldReuse: boolean,
    random: () => number,
    createDeviceId: () => string,
): string {
    if (shouldReuse && cache.length > 0) {
        return cache[Math.min(cache.length - 1, Math.max(0, Math.floor(random() * cache.length)))];
    }
    const deviceId = createDeviceId();
    cache.push(deviceId);
    return deviceId;
}

/**
 * Calculates the probability of ending a journey after `step` completed page visits.
 * 1 page => 5% (0.05)
 * 2 pages => 5 + 2 + 4 = 11% (0.11)
 * 3 pages => 5 + 2 + 4 + 6 = 17% (0.17)
 * 4 pages => 5 + 2 + 4 + 6 + 8 = 25% (0.25)
 * 5 pages => 5 + 2 + 4 + 6 + 8 + 10 = 35% (0.35)
 * etc.
 */
export function getJourneyEndProbability(step: number): number {
    if (step <= 0) return 0;
    if (step === 1) return 0.05;
    const percent = 5 + step * (step + 1);
    return Math.min(1, percent / 100);
}

export async function generateVisitJourneys(options: GeneratorOptions): Promise<GeneratedJourneys> {
    const random = options.random ?? Math.random;
    const createDeviceId = options.deviceId ?? randomUUID;
    const createUserId = options.userId ?? randomUUID;
    const places = options.places ?? (await resolveCountryRegion(options.country, options.region)) ?? [];
    if (places.length === 0) throw new Error('No geographic places found');
    const pages = options.pages && options.pages.length > 0 ? options.pages : (await getDynamicPages());

    const referenceNow = options.now ? new Date(options.now) : new Date();
    const nowMs = referenceNow.getTime();

    const { startAt, endAt } = resolveDateRange({
        startAt: options.startAt ?? options.start_at ?? options.startat,
        endAt: options.endAt ?? options.end_at ?? options.endat,
        duration: options.duration,
        now: referenceNow,
    });

    const records: VisitRecord[] = [];
    const devices: string[] = [];
    const deviceToUserMap = new Map<string, string>();
    let journeys = 0;

    if (options.numRecs <= 0) {
        return { records, journeys: 0, devices: 0 };
    }

    const startMs = startAt.getTime();
    const endMs = Math.min(endAt.getTime(), nowMs);
    const totalMs = endMs - startMs;
    const intervalMs = totalMs / options.numRecs;

    while (journeys < options.numRecs) {
        const slotStart = startMs + journeys * intervalMs;
        const slotEnd = startMs + (journeys + 1) * intervalMs;
        const jitterMax = Math.max(0, Math.min(intervalMs * 0.4, intervalMs - 30_000));
        const journeyStartMs = slotStart + Math.floor(random() * jitterMax);
        if (journeyStartMs >= endMs || journeyStartMs >= nowMs) {
            break;
        }

        const initialTouchTime = new Date(Math.max(startMs, Math.min(endMs - 1000, journeyStartMs)));
        if (initialTouchTime.getTime() >= endMs || initialTouchTime.getTime() >= nowMs) {
            break;
        }

        const firstTwentyPercent = journeys < options.numRecs * 0.2;
        const reuseDevice = !firstTwentyPercent && random() < 0.7;
        const deviceId = nextDevice(devices, reuseDevice, random, createDeviceId);
        let userId = deviceToUserMap.get(deviceId);
        if (!userId) {
            userId = createUserId();
            deviceToUserMap.set(deviceId, userId);
        }
        const point = randomPoint(places, random);
        let page = pages.includes('Home') ? 'Home' : pages[0];
        let step = 0;
        let touchTime = initialTouchTime;
        const visitedPages = new Set<string>();
        const pageDwellTimes = new Map<string, number>();

        const journeyMaxMs = Math.min(
            endMs,
            journeys === options.numRecs - 1 ? endMs : Math.max(initialTouchTime.getTime() + 10_000, slotEnd)
        );

        let terminated = false;
        while (true) {
            records.push({
                deviceId,
                userId,
                requestMethod: 'GET',
                touchTime,
                latitude: point.latitude,
                longitude: point.longitude,
                locationSource: options.locationSource,
                city: point.city,
                country: point.countryCode,
                region: point.regionName,
                note: `visit: ${page}`,
            });

            visitedPages.add(page);
            if (pages.length > 0 && visitedPages.size >= pages.length) {
                break;
            }

            step += 1;
            const durationSeconds = 1 + Math.floor(random() * 30);
            const nextTouchMs = touchTime.getTime() + durationSeconds * 1000;
            if (nextTouchMs > endMs || nextTouchMs > nowMs) {
                terminated = true;
                break;
            }

            if (nextTouchMs > journeyMaxMs) {
                break;
            }

            if (nextTouchMs - initialTouchTime.getTime() >= 20 * 60 * 1000) {
                break;
            }

            const currentPageTime = (pageDwellTimes.get(page) ?? 0) + durationSeconds * 1000;
            pageDwellTimes.set(page, currentPageTime);
            if (currentPageTime >= 10 * 60 * 1000) {
                break;
            }

            touchTime = new Date(nextTouchMs);
            if (random() < getJourneyEndProbability(step)) break;
            page = nextPage(page, pages, random);
        }

        journeys += 1;
        if (terminated) {
            break;
        }
    }

    return { records, journeys, devices: devices.length };
}

function badRequest(res: Response, message: string): Response {
    return res.status(400).json({ error: 'INVALID_REQUEST', message });
}

export default async function POST(req: Request, res: Response): Promise<Response> {
    const body = req.body ?? {};
    const query = req.query ?? {};

    const rawNumRecs = body.num_recs ?? (query.num_recs !== undefined ? Number(query.num_recs) : 1000);
    const locationSource = typeof body.loc_src === 'string'
        ? body.loc_src.trim()
        : typeof query.loc_src === 'string'
        ? query.loc_src.trim()
        : '';
    const country = body.country ?? query.country;
    const region = body.region ?? query.region ?? DEFAULT_REGION;

    const rawStartAt = body.start_at ?? body.startat ?? query.start_at ?? query.startat;
    const rawEndAt = body.end_at ?? body.endat ?? query.end_at ?? query.endat;
    const rawDuration = body.duration ?? query.duration;

    if (!locationSource) return badRequest(res, 'loc_src is required');
    if (!Number.isInteger(rawNumRecs)) return badRequest(res, 'num_recs must be an integer');
    if (rawNumRecs < 0) return badRequest(res, 'num_recs must not be negative');
    if (rawNumRecs > 10000) return badRequest(res, 'num_recs must not be greater than 10,000');
    if (locationSource.length > 32) return badRequest(res, 'loc_src must be 32 characters or fewer');

    let resolvedRange;
    try {
        resolvedRange = resolveDateRange({
            start_at: rawStartAt,
            end_at: rawEndAt,
            duration: rawDuration,
        });
    } catch (err: any) {
        return badRequest(res, err?.message ?? 'Invalid date range');
    }

    const isProduction = process.env.NODE_ENV === 'production';
    const confirmDelete = Boolean(
        body.confirm_delete ??
        body.allow_delete ??
        body.force ??
        query.confirm_delete ??
        query.allow_delete ??
        query.force ??
        process.env.ALLOW_MASS_DELETE === 'true'
    );

    if (isProduction && !confirmDelete) {
        return badRequest(
            res,
            'Mass deletion in production requires confirm_delete: true in body or query'
        );
    }

    try {
        const places = await resolveCountryRegion(country, region);
        if (!places) {
            return badRequest(
                res,
                'country and region must identify a supported country and region',
            );
        }
        const generated = await generateVisitJourneys({
            numRecs: rawNumRecs,
            locationSource,
            country: String(country),
            region: String(region),
            places,
            startAt: resolvedRange.startAt,
            endAt: resolvedRange.endAt,
        });

        await db.delete(visitInfo).where(eq(visitInfo.locationSource, locationSource));
        if (generated.records.length > 0) await db.insert(visitInfo).values(generated.records);

        try {
            await cacheStore.delWhere((key) => key.includes('visit_info/manage'));
        } catch {
            // Ignore cache invalidation failure
        }
        resetLocalPageCache();

        return res.status(200).json({
            ok: true,
            location_source: locationSource,
            requested_records: rawNumRecs,
            inserted_records: generated.records.length,
            journeys: generated.journeys,
            devices: generated.devices,
            start_date: resolvedRange.startDate,
            end_date: resolvedRange.endDate,
            duration: resolvedRange.duration,
        });
    } catch {
        return res.status(500).json({
            error: 'INTERNAL_ERROR',
            message: 'Failed to generate visit_info journeys',
        });
    }
}

export const __test__ = {
    resolveCountryRegion,
    generateVisitJourneys,
    getDynamicPages,
    extractUniquePages,
    resetLocalPageCache,
    nextPage,
    getJourneyEndProbability,
};