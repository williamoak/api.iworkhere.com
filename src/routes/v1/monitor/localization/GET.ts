/**
 * @myDocBlock v2.3
 * @file GET.ts
 * @external
 * @module routes/v1/monitor/localization
 * @tag localization, monitor
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path /v1/monitor/localization
 * @summary Resolve localized text with automatic server-side translation.
 *
 * @description
 * Fetches a localization record by slug and language.
 * If the record does not exist, it automatically attempts to generate a translation
 * using the provided fallback text (if available) or the base English source.
 * The resulting translation is persisted to the database and cached.
 *
 * @query
 * {
 *   "slug": {
 *     "type": "string",
 *     "required": true,
 *     "description": "Localization slug identifier"
 *   },
 *   "lang": {
 *     "type": "string",
 *     "required": false,
 *     "description": "Target language code (defaults to X-Lang header or en_ca)"
 *   },
 *   "fallback": {
 *     "type": "string",
 *     "required": false,
 *     "description": "Optional fallback/source text to use for translation if slug is missing"
 *   }
 * }
 *
 * @requestExample
 * { "method": "GET", "url": "/v1/monitor/localization?slug=welcome&lang=fr&fallback=Welcome" }
 *
 * @response
 * {
 *   "id": "uuid",
 *   "slug": "welcome",
 *   "lang": "fr",
 *   "text": "Bienvenue",
 *   "value": "Bienvenue",
 *   "languageName": "French",
 *   "createdAt": "ISO-8601",
 *   "updatedAt": "ISO-8601"
 * }
 *
 * @requires
 * {
 *   "tables": ["localizations"],
 *   "services": ["dbService", "localizationResolverService"]
 * }
 */

import type { Request, Response } from 'express';
import { dbLocalizationRepository, extractLanguage } from '@routes/v1/localization/GET';
import { resolveAndTranslateLocalization } from '@services/localizationResolverService';
import { logger } from '@helpers/logger';

export default async function GET(req: Request, res: Response) {
    try {
        const slug = req.query.slug as string;
        if (!slug || typeof slug !== 'string') {
            return res.status(400).json({
                error: 'INVALID_REQUEST',
                message: 'slug query parameter is required',
            });
        }

        const lang = (req.query.lang as string) || extractLanguage(req) || 'en_ca';
        const fallback = req.query.fallback as string;

        // 1. Try to find existing record
        let record = await dbLocalizationRepository.findBySlugAndLang(slug, lang);

        // 2. If not found and it's not English, or if we have a fallback hint, try to translate/resolve
        if (!record) {
            record = await resolveAndTranslateLocalization({
                slug,
                lang,
                fallbackText: fallback,
            });
        }

        if (!record) {
            return res.status(404).json({
                error: 'NOT_FOUND',
                message: `Localization not found for slug '${slug}' in language '${lang}'`,
            });
        }

        return res.status(200).json(record);
    } catch (err) {
        logger.error('GET /v1/monitor/localization error:', err);
        return res.status(500).json({
            error: 'INTERNAL_ERROR',
            message: 'Failed to resolve localization',
        });
    }
}
