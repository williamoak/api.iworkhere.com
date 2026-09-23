import { describe, it, expect } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { userDevices } from '../../../src/db/schema/user_devices';

describe('UserDevices Schema', () => {
  it('is tenant-scoped and defines ownership fields', () => {
    const config = getTableConfig(userDevices);
    expect(config.name).toBe('user_devices');
    expect(config.schema).toBe('joinaunion');
    expect(userDevices.accountId).toBeDefined();
    expect(userDevices.deviceId).toBeDefined();
    expect(userDevices.revokedAt).toBeDefined();
  });

  it('defines ownership lookup indexes', () => {
    const config = getTableConfig(userDevices);
    const indexNames = config.indexes.map((index: any) => index.config?.name || index.name);
    expect(indexNames).toContain('user_devices_account_id_device_id_idx');
    expect(indexNames).toContain('user_devices_account_id_active_idx');
    expect(indexNames).toContain('user_devices_device_id_idx');
    expect(config.indexes.map((index: any) => index.config?.name || index.name)).toContain('user_devices_active_device_unique');
  });
});
