import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { validate as validateUuid } from 'uuid';
import { userDevices } from '@db/schema/user_devices';
import { visitInfo } from '@db/schema/visit_info';
import { db } from '@services/dbService';

export function normalizeDeviceId(deviceId: string): string {
    const normalized = deviceId.trim().toLowerCase();
    if (!validateUuid(normalized)) throw new Error('Invalid device ID');
    return normalized;
}

export function claimDevice(accountId: string, deviceId: string, linkageSource = 'explicit_transition') {
    return db.insert(userDevices).values({ accountId, deviceId: normalizeDeviceId(deviceId), linkageSource }).returning();
}

export function listAccountDevices(accountId: string) {
    return db.select().from(userDevices).where(eq(userDevices.accountId, accountId));
}

export function resolveActiveDeviceIds(accountId: string) {
    return db.select({ deviceId: userDevices.deviceId }).from(userDevices)
        .where(and(eq(userDevices.accountId, accountId), isNull(userDevices.revokedAt)));
}

export function revokeDevice(accountId: string, deviceId: string) {
    return db.update(userDevices).set({ revokedAt: new Date() }).where(and(
        eq(userDevices.accountId, accountId),
        eq(userDevices.deviceId, normalizeDeviceId(deviceId)),
        isNull(userDevices.revokedAt),
    )).returning();
}


export function getAccountExperience(accountId: string, limit = 50, offset = 0) {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const safeOffset = Math.max(offset, 0);
    return db.selectDistinct({ visit: visitInfo })
        .from(visitInfo)
        .leftJoin(userDevices, eq(userDevices.deviceId, visitInfo.deviceId))
        .where(or(
            eq(visitInfo.userId, accountId),
            and(eq(userDevices.accountId, accountId), isNull(userDevices.revokedAt)),
        ))
        .orderBy(desc(visitInfo.touchTime), desc(visitInfo.id))
        .limit(safeLimit)
        .offset(safeOffset);
}
