import { describe, expect, it } from 'vitest';
import {
  isAllowedTenantSchemaName,
  isValidTenantSchemaName,
  quoteTenantSchemaName,
} from '@db/tenantSchema';

describe('tenant schema identifiers', () => {
  it.each(['bill', 'joinaunion', 'michael', 'tenant_2'])(
    'accepts safe schema name %s',
    (name) => {
      expect(isValidTenantSchemaName(name)).toBe(true);
      expect(quoteTenantSchemaName(name)).toBe(`"${name}"`);
    },
  );

  it.each(['bill', 'joinaunion', 'michael', 'localhost', 'public'])(
    'allows configured schema %s',
    (name) => {
      expect(isAllowedTenantSchemaName(name)).toBe(true);
    },
  );

  it.each(['tenant_2', 'arbitrary', 'pg_catalog'])(
    'accepts syntactically valid schema %s',
    (name) => {
      expect(isValidTenantSchemaName(name)).toBe(true);
      expect(isAllowedTenantSchemaName(name)).toBe(true);
    },
  );

  it.each([
    '',
    'Public',
    'tenant-name',
    'tenant.name',
    'tenant; DROP SCHEMA public',
    'tenant" ; SELECT 1; --',
    `${'a'.repeat(64)}`,
    '2tenant',
  ])('rejects unsafe schema name %s', (name) => {
    expect(isValidTenantSchemaName(name)).toBe(false);
    expect(() => quoteTenantSchemaName(name)).toThrow(
      'Invalid tenant schema name',
    );
  });
});
