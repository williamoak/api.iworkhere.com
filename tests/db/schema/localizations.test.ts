import { describe, it, expect } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { localizations } from '../../../src/db/schema/localizations';

describe('Localizations Schema', () => {
  it('should define all required columns according to best practices', () => {
    expect(localizations.id).toBeDefined();
    expect(localizations.slug).toBeDefined();
    expect(localizations.lang).toBeDefined();
    expect(localizations.languageName).toBeDefined();
    expect(localizations.text).toBeDefined();
    expect(localizations.codepage).toBeDefined();
    expect(localizations.direction).toBeDefined();
    expect(localizations.description).toBeDefined();
    expect(localizations.createdAt).toBeDefined();
    expect(localizations.updatedAt).toBeDefined();
  });

  it('should have correct column field names and properties', () => {
    expect(localizations.slug.name).toBe('slug');
    expect(localizations.lang.name).toBe('lang');
    expect(localizations.languageName.name).toBe('language_name');
    expect(localizations.text.name).toBe('text');
    expect(localizations.codepage.name).toBe('codepage');
    expect(localizations.direction.name).toBe('direction');
    expect(localizations.description.name).toBe('description');
    expect(localizations.createdAt.name).toBe('created_at');
    expect(localizations.updatedAt.name).toBe('updated_at');
  });

  it('should configure indexes and unique constraints properly', () => {
    const config = getTableConfig(localizations);
    expect(config.name).toBe('localizations');
    expect(config.indexes.length).toBeGreaterThan(0);
    const indexNames = config.indexes.map((idx: any) => idx.config?.name || idx.name);
    expect(indexNames).toContain('localizations_slug_lang_unique');
    expect(indexNames).toContain('localizations_slug_idx');
    expect(indexNames).toContain('localizations_lang_idx');
    expect(indexNames).toContain('localizations_lang_slug_idx');
  });
});
