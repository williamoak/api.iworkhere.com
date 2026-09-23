import type { Request, Response } from 'express';
import { listAccountDevices } from '@services/joinaunion/deviceService';

export const authRequired = true;

export default async function GET(req: Request, res: Response) {
    const accountId = (req as any).auth?.userId;
    if (!accountId) return res.status(401).json({ error: 'UNAUTHORIZED' });
    return res.json(await listAccountDevices(accountId));
}
