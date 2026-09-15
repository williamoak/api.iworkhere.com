import { describe, it, expect } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { configTable } from '../../../src/db/schema/config';

describe('Config Schema', () => {
  it('should define all required columns', () => {
    expect(configTable.id).toBeDefined();
    expect(configTable.name).toBeDefined();
    expect(configTable.value).toBeDefined();
    expect(configTable.version).toBeDefined();
    expect(configTable.createdAt).toBeDefined();
    expect(configTable.updatedAt).toBeDefined();
  });

  it('should configure indexes and unique constraints properly', () => {
    const config = getTableConfig(configTable);
    expect(config.name).toBe('config');
    expect(config.indexes.length).toBe(3);
    const indexNames = config.indexes.map((idx: any) => idx.config?.name || idx.name || (idx as any).name);
    // Let's check config.indexes structure
    expect(config.indexes[0].config.name).toBe('config_name_version_unique');
    expect(config.indexes[1].config.name).toBe('config_name_idx');
    expect(config.indexes[2].config.name).toBe('config_name_version_idx');
  });
});
