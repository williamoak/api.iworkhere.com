const TENANT_SCHEMA_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;

export function isValidTenantSchemaName(value: string): boolean {
  return TENANT_SCHEMA_PATTERN.test(value);
}

export function isAllowedTenantSchemaName(value: string): boolean {
  return isValidTenantSchemaName(value);
}

export function quoteTenantSchemaName(value: string): string {
  if (!isValidTenantSchemaName(value)) {
    throw new Error('Invalid tenant schema name');
  }

  return `"${value}"`;
}
