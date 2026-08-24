/**
 * @myDocBlock v2.3
 * @file PUT.ts
 * @external
 * @module routes/v1/localization
 * @tag localization
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path /v1/localization
 * @summary Create or update a localization record.
 *
 * @description
 * Inserts or updates a localization record identified by (slug, lang).
 * If a matching record exists, its text, metadata, and timestamp are updated in place.
 * Otherwise, a new localization record is inserted.
 * Automatically dirties the in-memory cache of supported languages and slugnames.
 *
 * @query
 *   {}
 *
 * @requestExample
 * {
 *   "slug": "welcome_message",
 *   "lang": "en_ca",
 *   "text": "Welcome to our Canadian portal",
 *   "languageName": "Canadian English",
 *   "codepage": "UTF-8",
 *   "direction": "ltr",
 *   "description": "Greeting message on home page"
 * }
 *
 * @response
 * {
 *   "id": "uuid",
 *   "slug": "welcome_message",
 *   "lang": "en_ca",
 *   "languageName": "Canadian English",
 *   "text": "Welcome to our Canadian portal",
 *   "value": "Welcome to Canadian portal",
 *   "codepage": "UTF-8",
 *   "direction": "ltr",
 *   "description": "Greeting message on home page",
 *   "createdAt": "ISO-8601",
 *   "updatedAt": "ISO-8601"
 * }
 *
 * @requires
 * {
 *   "tables": ["localizations"],
 *   "services": ["dbService"],
 *   "libraries": ["uuidv7"]
 * }
 */

import type { Request, Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { uuidv7 } from 'uuidv7';

import { db } from '@services/dbService';
import { localizations, type Localization } from '@db/schema/localizations';
import { logger } from '@helpers/logger';
import { dirtyCache } from '@cache/localizationCache';
import type { LocalizationRecord } from './GET';

/* ------------------------------------------------------------------ */
/* Validation                                                         */
/* ------------------------------------------------------------------ */

export const schema = {
    body: z.object({
        id: z.string().trim().optional(),
        slug: z.string().trim().min(1, 'slug is required'),
        lang: z.string().trim().min(1, 'lang is required'),
        text: z.string().min(0, 'text is required'),
        languageName: z.string().trim().optional().nullable(),
        codepage: z.string().trim().optional().nullable(),
        direction: z.string().trim().optional().nullable(),
        description: z.string().trim().optional().nullable(),
    }),
};

export type LocalizationWriteInput = z.infer<typeof schema.body>;

/* ------------------------------------------------------------------ */
/* Repository                                                         */
/* ------------------------------------------------------------------ */

export interface LocalizationWriteRepository {
    findBySlugAndLang(slug: string, lang: string): Promise<LocalizationRecord | null>;
    getById(id: string): Promise<LocalizationRecord | null>;
    insert(record: {
        id: string;
        slug: string;
        lang: string;
        text: string;
        languageName?: string | null;
        codepage?: string | null;
        direction?: string | null;
        description?: string | null;
    }): Promise<LocalizationRecord>;
    update(id: string, patch: {
        text?: string;
        languageName?: string | null;
        codepage?: string | null;
        direction?: string | null;
        description?: string | null;
    }): Promise<LocalizationRecord>;
}

function mapRow(row: Localization): LocalizationRecord {
    return {
        id: row.id,
        slug: row.slug,
        lang: row.lang,
        languageName: row.languageName,
        text: row.text,
        value: row.text,
        codepage: row.codepage,
        direction: row.direction,
        description: row.description,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

export const dbLocalizationWriteRepository: LocalizationWriteRepository = {
    async findBySlugAndLang(slug: string, lang: string) {
        const rows = await db
            .select()
            .from(localizations)
            .where(
                and(
                    eq(localizations.slug, slug),
                    eq(localizations.lang, lang),
                ),
            )
            .limit(1);

        return rows.length === 1 ? mapRow(rows[0]) : null;
    },

    async getById(id: string) {
        const rows = await db
            .select()
            .from(localizations)
            .where(eq(localizations.id, id))
            .limit(1);

        return rows.length === 1 ? mapRow(rows[0]) : null;
    },

    async insert(record) {
        const rows = await db
            .insert(localizations)
            .values({
                id: record.id,
                slug: record.slug,
                lang: record.lang,
                text: record.text,
                languageName: record.languageName ?? null,
                codepage: record.codepage ?? 'UTF-8',
                direction: record.direction ?? 'ltr',
                description: record.description ?? null,
                createdAt: new Date(),
                updatedAt: new Date(),
            })
            .returning();

        return mapRow(rows[0]);
    },

    async update(id, patch) {
        const rows = await db
            .update(localizations)
            .set({
                ...(patch.text !== undefined ? { text: patch.text } : {}),
                ...(patch.languageName !== undefined ? { languageName: patch.languageName } : {}),
                ...(patch.codepage !== undefined ? { codepage: patch.codepage } : {}),
                ...(patch.direction !== undefined ? { direction: patch.direction } : {}),
                ...(patch.description !== undefined ? { description: patch.description } : {}),
                updatedAt: new Date(),
            })
            .where(eq(localizations.id, id))
            .returning();

        return mapRow(rows[0]);
    },
};

/* ------------------------------------------------------------------ */
/* Upsert Logic                                                       */
/* ------------------------------------------------------------------ */

export async function upsertLocalization(
    payload: LocalizationWriteInput,
    repo: LocalizationWriteRepository = dbLocalizationWriteRepository,
): Promise<LocalizationRecord> {
    const slug = payload.slug.trim();
    const lang = payload.lang.trim();

    // Check if record exists by id (if provided) or by (slug, lang)
    let existing: LocalizationRecord | null = null;
    if (payload.id) {
        existing = await repo.getById(payload.id);
    }
    if (!existing) {
        existing = await repo.findBySlugAndLang(slug, lang);
    }

    let result: LocalizationRecord;

    if (existing) {
        result = await repo.update(existing.id, {
            text: payload.text,
            languageName: payload.languageName !== undefined ? payload.languageName : existing.languageName,
            codepage: payload.codepage !== undefined ? payload.codepage : existing.codepage,
            direction: payload.direction !== undefined ? payload.direction : existing.direction,
            description: payload.description !== undefined ? payload.description : existing.description,
        });
    } else {
        result = await repo.insert({
            id: payload.id || uuidv7(),
            slug,
            lang,
            text: payload.text,
            languageName: payload.languageName ?? null,
            codepage: payload.codepage ?? 'UTF-8',
            direction: payload.direction ?? 'ltr',
            description: payload.description ?? null,
        });
    }

    // Dirty the in-memory cache so subsequent GET requests discover new/updated languages & slugs
    dirtyCache();

    return result;
}

/* ------------------------------------------------------------------ */
/* HTTP Handler                                                       */
/* ------------------------------------------------------------------ */

export function makePutLocalizationHandler(repo: LocalizationWriteRepository = dbLocalizationWriteRepository) {
    return async function PUT(req: Request, res: Response) {
        try {
            const rawBody = req.body ?? {};
            const parseResult = schema.body.safeParse(rawBody);

            if (!parseResult.success) {
                const issues = parseResult.error.issues || parseResult.error.errors || [];
                return res.status(400).json({
                    error: 'VALIDATION_ERROR',
                    message: issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
                });
            }

            const record = await upsertLocalization(parseResult.data, repo);
            return res.status(200).json(record);
        } catch (err) {
            logger.error('PUT /v1/localization error:', err);
            return res.status(500).json({
                error: 'INTERNAL_ERROR',
                message: 'Failed to insert or update localization',
            });
        }
    };
}

const PUT = makePutLocalizationHandler(dbLocalizationWriteRepository);
export default PUT;

export const __test__ = {
    dbLocalizationWriteRepository,
    makePutLocalizationHandler,
    upsertLocalization,
};
