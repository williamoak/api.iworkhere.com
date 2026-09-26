import { describe, it, expect } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { users } from '../../../src/db/schema/users';

describe('Users Schema', () => {
  it('defines the account identity and lifecycle columns', () => {
    const config = getTableConfig(users);

    expect(config.name).toBe('users');
    expect(config.schema).toBeUndefined();
    expect(users.id).toBeDefined();
    expect(users.username).toBeDefined();
    expect(users.email).toBeDefined();
    expect(users.statusCode).toBeDefined();
    expect(users.emailVerifiedAt).toBeDefined();
    expect(users.createdAt).toBeDefined();
    expect(users.updatedAt).toBeDefined();
  });

  it('references user_statuses by status_code', () => {
    const config = getTableConfig(users);
    const foreignKeys = config.foreignKeys.map((foreignKey: any) => foreignKey.getName());

    expect(foreignKeys).toContain('users_status_code_user_statuses_status_code_fk');
  });

  it('defines username and email uniqueness constraints', () => {
    expect(users.username.name).toBe('username');
    expect(users.username.isUnique).toBe(true);
    expect(users.email.name).toBe('email');
    expect(users.email.isUnique).toBe(true);
  });
});
