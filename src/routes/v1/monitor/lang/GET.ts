/**
 * @myDocBlock v2.3
 * @file GET.ts
 * @external
 * @module routes/v1/monitor/lang
 * @tag monitor
 * @version 1.0.0
 * @path /v1/monitor/lang
 * @summary Monitor unique language count.
 *
 * @description
 * Returns the number of unique language values present in the localizations table.
 * Defaults to a count of 2 if the database is unreachable.
 *
 * @query
 * {}
 *
 * @requestExample
 * { "method": "GET", "url": "/v1/monitor/lang" }
 *
 * @response
 * {
 *   "count": 2,
 *   "languages": [["eng", "English(CA)"], ["can_fr", "French(CA)"]]
 * }
 *
 * @requires
 * {
 *   "tables": ["localizations"],
 *   "services": ["dbService"]
 * }
 */

import { Request, Response } from 'express';
import { db } from '@services/dbService';
import { localizations } from '@db/schema/localizations';
import { countries } from '@db/schema/countries';
import { cacheStore } from '@cache/cacheStore';
import { eq, sql } from 'drizzle-orm';
import { fetch } from 'undici';
import { logger } from '@helpers/logger';

/**
 * Internal invocation detection:
 * The routeLoader’s fakeRes object does not have json().
 */
function isInternalInvocation(res: Response): boolean {
    return typeof (res as any).json !== 'function';
}

async function getFlagIcon(languageName: string): Promise<string> {
    if (!languageName) return '';

    // Normalize: "English (CA)" -> "English"
    const lookupName = languageName.split('(')[0].trim();
    const cacheKey = `flagicon:${lookupName}`;
    try {
        const cached = await cacheStore.get<string>(cacheKey);
        if (cached) return cached;
    } catch (err) {
        logger.error('Cache error in getFlagIcon:', err);
    }

    try {
        // 1. Try exact name match
        let dbResult = await db
            .select()
            .from(countries)
            .where(eq(countries.name, lookupName))
            .limit(1);

        // 2. Try matching language name in languages JSONB array
        if (dbResult.length === 0) {
            const results = await db
                .select()
                .from(countries)
                .where(sql`${countries.languages} @> ${JSON.stringify([{ name: lookupName }])}`)
                .limit(1);
            dbResult = results;
        }

        if (dbResult.length > 0) {
            const result = dbResult[0];
            const flag = result.svg || result.flag || '';
            await cacheStore.set(cacheKey, flag, 86400000);
            return flag;
        }
    } catch (err) {
        logger.error('Database error in getFlagIcon:', err);
    }

    try {
        const response = await fetch(`https://countries.dev/name/${encodeURIComponent(lookupName)}`);
        if (response.ok) {
            const data = await response.json() as any[];
            if (data && data.length > 0) {
                // If multiple results, try to find one where the language explicitly matches
                let countryData = data.find(c => 
                    c.languages && Array.isArray(c.languages) && 
                    c.languages.some((l: any) => l.name === lookupName)
                );
                
                // Fallback to the first result if no exact language match found in the name-based results
                if (!countryData) {
                    countryData = data[0];
                }

                const flag = countryData.flag || '';

                let svgContent: string | null = null;
                const flagUrl = countryData.flags?.svg;
                if (flagUrl) {
                    try {
                        const svgResponse = await fetch(flagUrl);
                        if (svgResponse.ok) {
                            svgContent = await svgResponse.text();
                        }
                    } catch (err) {
                        logger.error(`Error fetching SVG content from ${flagUrl}:`, err);
                    }
                }
                
                const finalResult = svgContent || flag;

                // Store in DB - ensure we match the countries schema fields
                const newCountry = {
                    name: lookupName, // We store it under the lookupName to satisfy subsequent lookups
                    alpha2Code: countryData.alpha2Code,
                    alpha3Code: countryData.alpha3Code,
                    cioc: countryData.cioc,
                    capital: countryData.capital,
                    region: countryData.region,
                    subregion: countryData.subregion,
                    population: countryData.population,
                    demonym: countryData.demonym,
                    area: countryData.area,
                    gini: countryData.gini,
                    nativeName: countryData.nativeName,
                    numericCode: countryData.numericCode,
                    flag: countryData.flag,
                    independent: countryData.independent,
                    topLevelDomain: countryData.topLevelDomain,
                    callingCodes: countryData.callingCodes,
                    currencies: countryData.currencies,
                    languages: countryData.languages,
                    latlng: countryData.latlng,
                    borders: countryData.borders,
                    timezones: countryData.timezones,
                    flags: countryData.flags,
                    svg: svgContent,
                    populationDensity: countryData.populationDensity,
                };

                await db.insert(countries).values(newCountry).onConflictDoUpdate({
                    target: countries.name,
                    set: newCountry
                });

                await cacheStore.set(cacheKey, finalResult, 86400000);
                return finalResult;
            }
        }
    } catch (err) {
        logger.error(`Error fetching flag for ${lookupName}:`, err);
    }

    return '';
}

export default async function handler(
    req: Request,
    res: Response
): Promise<{ count: number; languages: (string | null)[][] } | void | Response> {
    const payload = {
        count: 2,
        languages: [
            ['eng', 'English(CA)'],
            ['can_fr', 'French(CA)'],
        ] as (string | null)[][],
    };

    try {
        const result = await db
            .select({
                lang: localizations.lang,
                name: localizations.languageName,
            })
            .from(localizations)
            .groupBy(localizations.lang, localizations.languageName);

        payload.languages = result.map((r) => [r.lang, r.name]);
        payload.count = payload.languages.length;
    } catch (err) {
        logger.error('GET /v1/monitor/lang database error:', err);
        // Default payload is already set
    }

    const withFlags = req.query.withFlags !== undefined || req.query.withflags !== undefined;

    if (withFlags) {
        const languagesWithFlags = await Promise.all(
            payload.languages.map(async ([lang, name]) => {
                const flag = await getFlagIcon(name || '');
                return [lang, name, flag];
            })
        );
        payload.languages = languagesWithFlags;
    }

    if (isInternalInvocation(res)) {
        return payload;
    }

    return res.json(payload);
}
