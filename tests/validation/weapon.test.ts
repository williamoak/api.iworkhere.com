import { describe, test, expect } from 'vitest';
import { weaponInsertSchema, weaponUpdateSchema, weaponUpdateByNameSchema } from '../../src/validation/weapon';

describe('weapon validation', () => {
  describe('weaponInsertSchema', () => {
    test('should allow valid insert', () => {
      expect(weaponInsertSchema.safeParse({ name: 'Braton' }).success).toBe(true);
    });
    test('should reject invalid insert (missing name)', () => {
      expect(weaponInsertSchema.safeParse({ }).success).toBe(false);
    });
  });

  describe('weaponUpdateSchema', () => {
    test('should allow valid update', () => {
      expect(weaponUpdateSchema.safeParse({ weapon_id: '123e4567-e89b-12d3-a456-426614174000', name: 'Braton' }).success).toBe(true);
    });
    test('should reject invalid update (missing weapon_id)', () => {
      expect(weaponUpdateSchema.safeParse({ name: 'Braton' }).success).toBe(false);
    });
  });

  describe('weaponUpdateByNameSchema', () => {
    test('should allow valid update by name', () => {
      expect(weaponUpdateByNameSchema.safeParse({ name: 'Braton', class: 'rifle' }).success).toBe(true);
    });
    test('should reject invalid update by name (missing name)', () => {
      expect(weaponUpdateByNameSchema.safeParse({ class: 'rifle' }).success).toBe(false);
    });
  });
});
