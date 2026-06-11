import { describe, test, expect } from 'vitest';
import { warframeClassEnum, warframeInsertSchema, warframeUpdateSchema, warframeUpdateByNameSchema } from '../../src/validation/warframe';

describe('warframe validation', () => {
  describe('warframeClassEnum', () => {
    test('should allow valid classes', () => {
      expect(warframeClassEnum.safeParse('normal').success).toBe(true);
      expect(warframeClassEnum.safeParse('prime').success).toBe(true);
      expect(warframeClassEnum.safeParse('umbra').success).toBe(true);
    });
    test('should reject invalid classes', () => {
      expect(warframeClassEnum.safeParse('foo').success).toBe(false);
    });
  });

  describe('warframeInsertSchema', () => {
    test('should allow valid insert', () => {
      expect(warframeInsertSchema.safeParse({ name: 'Excalibur', class: 'normal' }).success).toBe(true);
    });
    test('should reject invalid insert (missing fields)', () => {
      expect(warframeInsertSchema.safeParse({ name: 'Excalibur' }).success).toBe(false);
      expect(warframeInsertSchema.safeParse({ class: 'normal' }).success).toBe(false);
    });
  });

  describe('warframeUpdateSchema', () => {
    test('should allow valid update', () => {
      // Need a valid UUID
      expect(warframeUpdateSchema.safeParse({ warframe_id: '123e4567-e89b-12d3-a456-426614174000', name: 'Excalibur' }).success).toBe(true);
    });
    test('should reject invalid update (missing warframe_id)', () => {
      expect(warframeUpdateSchema.safeParse({ name: 'Excalibur' }).success).toBe(false);
    });
  });

  describe('warframeUpdateByNameSchema', () => {
    test('should allow valid update by name', () => {
      expect(warframeUpdateByNameSchema.safeParse({ name: 'Excalibur', class: 'prime' }).success).toBe(true);
    });
    test('should reject invalid update by name (missing name)', () => {
      expect(warframeUpdateByNameSchema.safeParse({ class: 'prime' }).success).toBe(false);
    });
  });
});
