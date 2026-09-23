import type { Request, Response } from 'express';
import { getAccountExperience } from '@services/joinaunion/deviceService';

export const authRequired = true;

function numberParam(value: unknown, fallback: number) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export default async function GET(req: Request, res: Response) {
    const accountId = (req as any).auth?.userId;
    if (!accountId) return res.status(401).json({ error: 'UNAUTHORIZED' });
    const limit = numberParam(req.query.limit, 50);
    const offset = numberParam(req.query.offset, 0);
    return res.json({ items: await getAccountExperience(accountId, limit, offset), limit: Math.min(limit, 100), offset });
}
