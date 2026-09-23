import type { Request, Response } from 'express';
import { revokeDevice } from '@services/joinaunion/deviceService';

export const authRequired = true;

export default async function DELETE(req: Request, res: Response) {
    const accountId = (req as any).auth?.userId;
    if (!accountId) return res.status(401).json({ error: 'UNAUTHORIZED' });
    const deviceId = req.body?.deviceId ?? req.body?.device_id ?? req.query.deviceId;
    if (typeof deviceId !== 'string') return res.status(400).json({ error: 'INVALID_DEVICE_ID' });
    try {
        return res.json({ revoked: (await revokeDevice(accountId, deviceId)).length > 0 });
    } catch (error) {
        if (error instanceof Error && error.message === 'Invalid device ID') {
            return res.status(400).json({ error: 'INVALID_DEVICE_ID' });
        }
        throw error;
    }
}
