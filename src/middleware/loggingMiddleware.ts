import type { Request, Response, NextFunction } from 'express';
import { db } from '@services/dbService';
import { visitInfo } from '@db/schema/visit_info';
import { configTable } from '@db/schema/config';
import { eq, desc } from 'drizzle-orm';
import crypto from 'crypto';

function formatToUUID(hex: string): string {
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

async function resolveTenantMiddleware(
    tenant: string, 
    middlewareName: string, 
    req: Request, 
    res: Response, 
    next: NextFunction
): Promise<boolean> {
    try {
        // Resolve tenant-specific middleware dynamically
        const module = await import(`./${tenant}/${middlewareName}.js`);
        if (module.default) {
            await module.default(req, res, next);
            return true;
        }
    } catch (e) {
        // Fallback: No tenant-specific middleware found
    }
    return false;
}

export function loggingMiddleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
        const tenant = (req as any).tenant;

        // 1. Check for and execute tenant-specific override
        if (tenant && tenant !== 'public' && tenant !== 'api') {
            const handled = await resolveTenantMiddleware(tenant, 'loggingMiddleware', req, res, next);
            if (handled) return;
        }

        // 2. Base Implementation (Generic Logging)
        const userId = (req as any).auth?.userId || null;

        try {
            const configEntry = await db
                .select()
                .from(configTable)
                .where(eq(configTable.name, 'logging_config'))
                .orderBy(desc(configTable.version))
                .limit(1);

            const loggingConfig = configEntry.length > 0 ? (configEntry[0].value as any) : null;

            if (loggingConfig?.enabled) {
                let deviceId = req.headers['x-device-id'] as string;

                if (!deviceId) {
                    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || 'unknown';
                    const ua = req.headers['user-agent'] || 'unknown';
                    const hash = crypto.createHash('sha256').update(`${ip}-${ua}`).digest('hex');
                    deviceId = formatToUUID(hash);
                }

                const note = (res.locals.visitNote as string) || `visit: ${req.path}`;

                await db.insert(visitInfo).values({
                    deviceId: deviceId,
                    userId: userId,
                    requestMethod: req.method,
                    touchTime: new Date(),
                    note: note
                });
            }
        } catch (e) {
            console.error("Failed to process request logging:", e);
        }

        next();
    };
}
