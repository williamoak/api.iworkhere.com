/**
 * @myDocBlock v2.3
 * @file DELETE.ts
 * @external
 * @module routes/v1/localization
 * @tag localization
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path /v1/localization
 * @summary Delete a localization record.
 *
 * @description
 * Deletes a localization record using deterministic resolution:
 *   1) id / uuid — deletes the exact record by UUID
 *   2) slug + lang — deletes the exact matching record
 *   3) slug only — deletes the record ONLY if exactly one record exists
 *
 * Ambiguous deletes are rejected with 409 CONFLICT.
 * Automatically dirties the in-memory cache of supported languages and slugnames.
 *
 * @query
 * {
 *   "id": {
 *     "type": "string",
 *     "required": false,
 *     "description": "Exact UUID of the localization record to delete"
 *   },
 *   "slug": {
 *     "type": "string",
 *     "required": false,
 *     "description": "Localization slug identifier"
 *   },
 *   "lang": {
 *     "type": "string",
 *     "required": false,
 *     "description": "Language code (required to disambiguate if multiple languages exist for slug)"
 *   }
 * }
 *
 * @response
 * {
 *   "success": true
 * }
 *
 * @requires
 * {
 *   "tables": ["localizations"],
 *   "services": ["dbService"]
 * }
 */

import type { Request, Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@services/dbService';
import { localizations, type Localization } from '@db/schema/localizations';
import { logger } from '@helpers/logger';
import { dirtyCache } from '@cache/localizationCache';
import type { LocalizationRecord } from './GET';

/* ------------------------------------------------------------------ */
/* Validation                                                         */
/* ------------------------------------------------------------------ */

export const schema = {
    query: z.object({
        id: z.string().trim().optional(),
        uuid: z.string().trim().optional(),
        slug: z.string().trim().min(1).optional(),
        lang: z.string().trim().min(1).optional(),
    }),
};

/* ------------------------------------------------------------------ */
/* Repository                                                         */
/* ------------------------------------------------------------------ */

export interface LocalizationDeleteRepository {
    deleteById(id: string): Promise<boolean>;
    deleteBySlugAndLang(slug: string, lang: string): Promise<boolean>;
    findBySlug(slug: string): Promise<LocalizationRecord[]>;
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

export const dbLocalizationDeleteRepository: LocalizationDeleteRepository = {
    async deleteById(id: string): Promise<boolean> {
        const rows = await db
            .delete(localizations)
            .where(eq(localizations.id, id))
            .returning({ id: localizations.id });

        return rows.length === 1;
    },

    async deleteBySlugAndLang(slug: string, lang: string): Promise<boolean> {
        const rows = await db
            .delete(localizations)
            .where(
                and(
                    eq(localizations.slug, slug),
                    eq(localizations.lang, lang),
                ),
            )
            .returning({ id: localizations.id });

        return rows.length === 1;
    },

    async findBySlug(slug: string): Promise<LocalizationRecord[]> {
        const rows = await db
            .select()
            .from(localizations)
            .where(eq(localizations.slug, slug));

        return rows.map(mapRow);
    },
};

/* ------------------------------------------------------------------ */
/* HTTP Handler Factory                                               */
/* ------------------------------------------------------------------ */

export function makeDeleteLocalizationHandler(repo: LocalizationDeleteRepository = dbLocalizationDeleteRepository) {
    return async function DELETE(req: Request, res: Response) {
        try {
            const querySource = (req.query && Object.keys(req.query).length > 0)
                ? req.query
                : ((req as any).validated?.query ?? req.body ?? {});

            const id = (typeof querySource.id === 'string' && querySource.id.trim()) ||
                       (typeof querySource.uuid === 'string' && querySource.uuid.trim()) ||
                       undefined;
            const slug = typeof querySource.slug === 'string' && querySource.slug.trim() ? querySource.slug.trim() : undefined;
            const lang = typeof querySource.lang === 'string' && querySource.lang.trim() ? querySource.lang.trim() : undefined;

            if (!id && !slug) {
                return res.status(400).json({
                    error: 'INVALID_REQUEST',
                    message: 'Must provide id, uuid, or slug to delete',
                });
            }

            // 1. Delete by ID/UUID
            if (id) {
                const deleted = await repo.deleteById(id);
                if (!deleted) {
                    return res.status(404).json({
                        error: 'NOT_FOUND',
                        message: 'Localization record not found',
                    });
                }
                dirtyCache();
                return res.status(200).json({ success: true });
            }

            // 2. Delete by slug + lang
            if (slug && lang) {
                const deleted = await repo.deleteBySlugAndLang(slug, lang);
                if (!deleted) {
                    return res.status(404).json({
                        error: 'NOT_FOUND',
                        message: `Localization record not found for slug '${slug}' and lang '${lang}'`,
                    });
                }
                dirtyCache();
                return res.status(200).json({ success: true });
            }

            // 3. Delete by slug only (unambiguous)
            if (slug) {
                const matches = await repo.findBySlug(slug);
                if (matches.length === 0) {
                    return res.status(404).json({
                        error: 'NOT_FOUND',
                        message: `Localization not found for slug '${slug}'`,
                    });
                }

                if (matches.length > 1) {
                    return res.status(409).json({
                        error: 'CONFLICT',
                        message: `Multiple localization records found for slug '${slug}'. Provide 'lang' to disambiguate.`,
                    });
                }

                const deleted = await repo.deleteById(matches[0].id);
                if (!deleted) {
                    return res.status(404).json({
                        error: 'NOT_FOUND',
                        message: 'Localization record could not be deleted',
                    });
                }
                dirtyCache();
                return res.status(200).json({ success: true });
            }
        } catch (err) {
            logger.error('DELETE /v1/localization error:', err);
            return res.status(500).json({
                error: 'INTERNAL_ERROR',
                message: 'Failed to delete localization record',
            });
        }
    };
}

const DELETE = makeDeleteLocalizationHandler(dbLocalizationDeleteRepository);
export default DELETE;

export const __test__ = {
    dbLocalizationDeleteRepository,
    makeDeleteLocalizationHandler,
};
