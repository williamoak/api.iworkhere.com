/**
 * @myDocBlock
 * @file POST.ts
 * @external
 * @module config-data-joinaunion-visit-info
 * @path /v1/config/data/joinaunion/visit_info
 * @summary Generate a clean, synthetic visit-history dataset for Joinaunion.
 *
 * @description
 * This administrative endpoint creates plausible browsing journeys for the
 * Joinaunion site and stores one visit_info row for every page reached. It is
 * intended for development, demonstrations, analytics testing, and other
 * controlled data-generation workflows; it does not represent real users or
 * real traffic. Every generated journey starts at the home page and follows
 * a randomized walk through the site's pages, including your rights, why
 * unions, resources, about, contact, and privacy pages.
 *
 * Before inserting data, the endpoint deletes every existing visit_info row
 * whose location_source matches loc_src. Reusing the same loc_src therefore
 * replaces the previous generated dataset and keeps repeated runs clean.
 * The endpoint requires authentication and writes GET-style visits with a
 * generated device_id, timestamp, geographic coordinates, province/territory
 * city, location_source, and page note. user_id is null for generated visits.
 *
 * Journey behavior:
 * - The requested number of rows is generated exactly, including when the
 *   final journey is shorter than a complete walk.
 * - The first 20% of rows use new device IDs. After that, devices are reused
 *   with 70% probability while newly created IDs are added to the cache.
 * - The first journey begins at a randomized point within the previous 30
 *   days. Later journeys begin after the prior journey plus a random gap of
 *   1 to 9,000 seconds; this advances timestamps without waiting in real time.
 * - Each page visit advances by 1 to 30 seconds. After each step, the journey
 *   ends with a probability of 10% plus 5% for every completed step.
 * - Places are selected from the offline `@countrystatecity/countries`
 *   dataset. Cities provide generated names and base coordinates, with a
 *   random offset of up to 0.25 degrees in each direction for realistic-looking visits.
 *
 * @auth
 * Authentication is required. This endpoint should only be exposed to
 * trusted callers because it deletes and recreates data.
 *
 * @body
 * {
 *   "num_recs": 1000,
 *   "loc_src": "generated",
 *   "country": "Canada",
 *   "region": "Ontario"
 * }
 *
 * @parameters
 * - num_recs: Optional integer number of rows to create; defaults to 1000 and
 *   may not be greater than 10000 or less than 0.
 * - loc_src: Required cleanup and provenance label, limited to 32 characters.
 *   All existing rows with this location_source are deleted before insertion.
 * - country: Optional country name, ISO-2 code, or ISO-3 code; defaults to
 *   Canada. Country data comes from the offline package.
 * - region: Optional region/state/province name or code; defaults to Ontario.
 *   Cities are selected only from this region of the selected country.
 *   Region and city data comes from the offline package; no request-time
 *   network call is made.
 *
 * @response
 * {
 *   "ok": true,
 *   "location_source": "generated",
 *   "requested_records": 1000,
 *   "inserted_records": 1000,
 *   "journeys": 246,
 *   "devices": 446
 * }
 *
 * @errors
 * Returns 400 for a missing loc_src, a non-integer or out-of-range num_recs,
 * an overlong loc_src, or an invalid country/region pair. Returns 500 if deletion or
 * insertion fails. A request with num_recs set to 0 still clears matching
 * existing rows and reports zero inserted records.
 *
 * @sideEffects
 * Deletes matching rows from joinaunion.visit_info, then inserts generated
 * rows into that table. No external site navigation or real-time delay occurs.
 */

import type { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
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

export const authRequired = true;

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
    userId: null;
    requestMethod: 'GET';
    touchTime: Date;
    latitude: number;
    longitude: number;
    locationSource: string;
    city: string;
    note: string;
};

export type GeneratorOptions = {
    numRecs: number;
    locationSource: string;
    country: string;
    region: string;
    random?: () => number;
    deviceId?: () => string;
    now?: Date;
    places?: GeoPoint[];
};

type GeneratedJourneys = { records: VisitRecord[]; journeys: number; devices: number };

const PAGES = [
    'home',
    'your_rights',
    'why_unions',
    'resources',
    'about',
    'contact',
    'privacy',
] as const;
type Page = (typeof PAGES)[number];

const DEFAULT_COUNTRY = 'Canada';
const DEFAULT_REGION = 'Ontario';

function randomPoint(places: GeoPoint[], random: () => number): GeoPoint {
    const base = places[Math.floor(random() * places.length)];
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
        const selectedStates = states.filter((state) => stateMatches(state, stateSelector));
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
    countryValue: unknown = DEFAULT_COUNTRY,
    regionValue: unknown = DEFAULT_REGION,
): Promise<GeoPoint[] | null> {
    if (typeof countryValue !== 'string' || countryValue.trim() === '') return null;
    if (typeof regionValue !== 'string' || regionValue.trim() === '') return null;
    const countrySelector = countryValue.trim();
    const stateSelector = regionValue.trim();
    const country = (await getCountries()).find((candidate) => countryMatches(candidate, countrySelector));
    if (!country) return null;
    const places = await loadPlaces(country.iso2, stateSelector);
    return places.length > 0 ? places : null;
}

function nextPage(page: Page, random: () => number): Page {
    const choices = PAGES.filter((candidate) => candidate !== page);
    return choices[Math.floor(random() * choices.length)];
}

function nextDevice(
    cache: string[],
    shouldReuse: boolean,
    random: () => number,
    createDeviceId: () => string,
): string {
    if (shouldReuse && cache.length > 0) return cache[Math.floor(random() * cache.length)];
    const deviceId = createDeviceId();
    cache.push(deviceId);
    return deviceId;
}

export async function generateVisitJourneys(options: GeneratorOptions): Promise<GeneratedJourneys> {
    const random = options.random ?? Math.random;
    const createDeviceId = options.deviceId ?? randomUUID;
    const places = options.places ?? (await resolveCountryRegion(options.country, options.region)) ?? [];
    if (places.length === 0) throw new Error('No geographic places found');
    const records: VisitRecord[] = [];
    const devices: string[] = [];
    let journeys = 0;
    let nextJourneyStart = options.now?.getTime() ?? Date.now();

    while (records.length < options.numRecs) {
        const initialTouchTime = new Date(
            journeys === 0
                ? nextJourneyStart - Math.floor(random() * 30 * 24 * 60 * 60 * 1000)
                : nextJourneyStart,
        );
        const firstTwentyPercent = records.length < options.numRecs * 0.2;
        const reuseDevice = !firstTwentyPercent && random() < 0.7;
        const deviceId = nextDevice(devices, reuseDevice, random, createDeviceId);
        let page: Page = 'home';
        let step = 0;
        let touchTime = initialTouchTime;

        while (records.length < options.numRecs) {
            const point = randomPoint(places, random);
            records.push({
                deviceId,
                userId: null,
                requestMethod: 'GET',
                touchTime,
                latitude: point.latitude,
                longitude: point.longitude,
                locationSource: options.locationSource,
                city: point.city,
                note: `visit: ${page}`,
            });

            step += 1;
            const durationSeconds = 1 + Math.floor(random() * 30);
            touchTime = new Date(touchTime.getTime() + durationSeconds * 1000);
            if (random() < Math.min(1, 0.1 + step * 0.05)) break;
            page = nextPage(page, random);
        }

        journeys += 1;
        nextJourneyStart = touchTime.getTime() + (1 + Math.floor(random() * 9000)) * 1000;
    }

    return { records, journeys, devices: devices.length };
}

function badRequest(res: Response, message: string): Response {
    return res.status(400).json({ error: 'INVALID_REQUEST', message });
}

export default async function POST(req: Request, res: Response): Promise<Response> {
    const body = req.body ?? {};
    const rawNumRecs = body.num_recs ?? 1000;
    const locationSource = typeof body.loc_src === 'string' ? body.loc_src.trim() : '';
    const country = body.country ?? DEFAULT_COUNTRY;
    const region = body.region ?? DEFAULT_REGION;

    if (!locationSource) return badRequest(res, 'loc_src is required');
    if (!Number.isInteger(rawNumRecs)) return badRequest(res, 'num_recs must be an integer');
    if (rawNumRecs < 0) return badRequest(res, 'num_recs must not be negative');
    if (rawNumRecs > 10000) return badRequest(res, 'num_recs must not be greater than 10,000');
    if (locationSource.length > 32) return badRequest(res, 'loc_src must be 32 characters or fewer');
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
        });

        await db.delete(visitInfo).where(eq(visitInfo.locationSource, locationSource));
        if (generated.records.length > 0) await db.insert(visitInfo).values(generated.records);

        return res.status(200).json({
            ok: true,
            location_source: locationSource,
            requested_records: rawNumRecs,
            inserted_records: generated.records.length,
            journeys: generated.journeys,
            devices: generated.devices,
        });
    } catch {
        return res.status(500).json({
            error: 'INTERNAL_ERROR',
            message: 'Failed to generate visit_info journeys',
        });
    }
}

export const __test__ = { resolveCountryRegion, generateVisitJourneys };