/**
 * @myDocBlock
 * @file localMiddleware.ts
 * @internal
 * @module Middleware
 * @tag localization, middleware, i18n
 * @version 1.0.1
 * @author william.r.oak@gmail.com
 * @path src/middleware/localMiddleware.ts
 * @summary Localization middleware and translation resolver.
 * @description
 *   Provides a localization lookup function that takes a slugname and a
 *   language code (supporting standards like en_ca, can_fr, en_us, eng, fr, etc.)
 *   and returns the localized text string to display.
 *   Also acts as Express middleware attaching `req.localize`, `req.t`, `req.lang`,
 *   and `res.locals.t` for use across display pages and templates.
 *
 * @query {
 *   "lang": {
 *     "type": "string",
 *     "required": false,
 *     "description": "Optional language override query parameter"
 *   }
 * }
 * @requestExample none
 * @response none
 * @requires {
 *   "database": "localizations table",
 *   "services": ["dbService"]
 * }
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { logger } from '@helpers/logger';
import {
    dbLocalizationRepository,
    getLanguageCandidates,
    extractLanguage,
    cleanLanguageCode,
    type LocalizationRepository,
} from '@routes/v1/localization/GET';

/* ------------------------------------------------------------------ */
/* Global types declaration                                           */
/* ------------------------------------------------------------------ */

declare global {
    namespace Express {
        interface Request {
            lang?: string;
            locale?: string;
            localize?: (
                slug: string,
                langOverride?: string,
                fallbackText?: string,
            ) => Promise<string>;
            getLocalization?: (
                slug: string,
                langOverride?: string,
                fallbackText?: string,
            ) => Promise<string>;
            t?: (
                slug: string,
                langOverride?: string,
                fallbackText?: string,
            ) => Promise<string>;
        }
    }
}

/* ------------------------------------------------------------------ */
/* Active repository reference (allows seam for testing)             */
/* ------------------------------------------------------------------ */

let activeRepo: LocalizationRepository = dbLocalizationRepository;

export function setLocalizationRepository(repo: LocalizationRepository): void {
    activeRepo = repo;
}

export function resetLocalizationRepository(): void {
    activeRepo = dbLocalizationRepository;
}

/* ------------------------------------------------------------------ */
/* Core Localization Function                                         */
/* ------------------------------------------------------------------ */

/**
 * Resolves a localized text string given a slug name and language code.
 *
 * @param slug - The slug identifier for the string (e.g. 'username', 'welcome_message')
 * @param lang - Standard or dialect language code (e.g. 'en_ca', 'can_fr', 'en_us', 'eng', 'fr')
 * @param fallbackText - Optional fallback string if translation is not found (defaults to slug)
 * @returns The resolved text string to display
 */
export async function getLocalization(
    slug: string,
    lang?: string,
    fallbackText?: string,
): Promise<string> {
    if (!slug || typeof slug !== 'string') {
        return fallbackText ?? '';
    }

    try {
        const record = await activeRepo.findBySlugAndLang(
            slug.trim(),
            lang || 'en',
        );
        if (record && record.text !== undefined && record.text !== null) {
            return record.text;
        }
    } catch (err) {
        logger.error(
            `[LOCALIZATION] Failed to resolve slug "${slug}" for lang "${lang}":`,
            err,
        );
    }

    return fallbackText !== undefined ? fallbackText : slug;
}

export const localize = getLocalization;
export const getLocalizedText = getLocalization;

/* ------------------------------------------------------------------ */
/* Language Detection Helper                                          */
/* ------------------------------------------------------------------ */

export { cleanLanguageCode, extractLanguage };

/**
 * Resolves the language code from the HTTP request context.
 * Checks query param -> headers (x-language-hint, accept-language, x-lang, etc.) -> cookies -> default.
 */
export function resolveLanguage(req?: Request, defaultLang = 'en'): string {
    if (!req) return defaultLang;
    return extractLanguage(req) || defaultLang;
}

/* ------------------------------------------------------------------ */
/* Middleware Factory & Implementation                                */
/* ------------------------------------------------------------------ */

export interface LocalMiddlewareOptions {
    defaultLang?: string;
}

/**
 * Creates an Express middleware that initializes localization context.
 */
export function createLocalMiddleware(
    options?: LocalMiddlewareOptions,
): RequestHandler {
    const defaultLang = options?.defaultLang || 'en';

    return async (req: Request, res: Response, next: NextFunction) => {
        const currentLang = resolveLanguage(req, defaultLang);

        const localizeFn = (
            slug: string,
            langOverride?: string,
            fallbackText?: string,
        ) => {
            return getLocalization(
                slug,
                langOverride || currentLang,
                fallbackText,
            );
        };

        req.lang = currentLang;
        req.locale = currentLang;
        req.localize = localizeFn;
        req.getLocalization = localizeFn;
        req.t = localizeFn;

        if (res.locals) {
            res.locals.lang = currentLang;
            res.locals.locale = currentLang;
            res.locals.localize = localizeFn;
            res.locals.t = localizeFn;
        }

        next();
    };
}

/**
 * Polymorphic localMiddleware function:
 *
 * 1) When called with (slug, lang) -> returns Promise<string>
 *    Example: await localMiddleware('username', 'en_ca')
 *
 * 2) When used as Express middleware -> app.use(localMiddleware()) or app.use(localMiddleware)
 *    Example: app.use(localMiddleware())
 */
export function localMiddleware(
    arg1?: string | Request | LocalMiddlewareOptions,
    arg2?: string | Response,
    arg3?: NextFunction,
): any {
    // 1. Direct function call: localMiddleware(slug, lang, fallback?)
    if (typeof arg1 === 'string') {
        return getLocalization(
            arg1,
            typeof arg2 === 'string' ? arg2 : undefined,
        );
    }

    // 2. Direct Express middleware execution: localMiddleware(req, res, next)
    if (
        arg1 &&
        typeof arg1 === 'object' &&
        'headers' in arg1 &&
        typeof arg3 === 'function'
    ) {
        return createLocalMiddleware()(arg1 as Request, arg2 as Response, arg3);
    }

    // 3. Factory execution: localMiddleware(options) -> RequestHandler
    const options =
        arg1 && typeof arg1 === 'object' && !('headers' in arg1)
            ? (arg1 as LocalMiddlewareOptions)
            : undefined;
    return createLocalMiddleware(options);
}

export default localMiddleware;

export const __test__ = {
    getLanguageCandidates,
    setLocalizationRepository,
    resetLocalizationRepository,
    activeRepo: () => activeRepo,
};
