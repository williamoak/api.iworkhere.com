import { describe, it, expect } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { userStatuses } from '../../../src/db/schema/user_statuses';

describe('UserStatuses Schema', () => {
  it('defines the lifecycle status lookup table', () => {
    const config = getTableConfig(userStatuses);

    expect(config.name).toBe('user_statuses');
    expect(config.schema).toBeUndefined();
    expect(userStatuses.statusCode).toBeDefined();
    expect(userStatuses.description).toBeDefined();
  });

  it('uses status_code as the primary key', () => {
    expect(userStatuses.statusCode.name).toBe('status_code');
    expect(userStatuses.statusCode.primary).toBe(true);
    expect(userStatuses.statusCode.notNull).toBe(true);
  });
});
