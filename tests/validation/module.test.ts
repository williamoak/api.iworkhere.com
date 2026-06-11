import { describe, test, expect } from 'vitest';
import { 
  moduleSlotTypeEnum, 
  moduleInsertSchema, 
  moduleUpdateSchema, 
  moduleUpdateByNameSchema 
} from '../../src/validation/module';

describe('module validation schemas', () => {
  describe('moduleSlotTypeEnum', () => {
    test('should allow valid slot types', () => {
      expect(moduleSlotTypeEnum.parse('Aura')).toBe('Aura');
      expect(moduleSlotTypeEnum.parse('Exilus')).toBe('Exilus');
      expect(moduleSlotTypeEnum.parse('General')).toBe('General');
      expect(moduleSlotTypeEnum.parse('Arcane')).toBe('Arcane');
    });

    test('should throw error for invalid slot types', () => {
      expect(() => moduleSlotTypeEnum.parse('Invalid')).toThrow();
    });
  });

  describe('moduleInsertSchema', () => {
    test('should validate valid insertion', () => {
      const valid = { name: 'Test Mod' };
      expect(moduleInsertSchema.parse(valid)).toEqual(valid);
    });

    test('should throw error if name is missing', () => {
      const invalid = { capacity: 10 };
      expect(() => moduleInsertSchema.parse(invalid)).toThrow();
    });
  });

  describe('moduleUpdateSchema', () => {
    test('should validate valid update by id', () => {
      const valid = { mod_id: '550e8400-e29b-41d4-a716-446655440000', name: 'Updated Name' };
      expect(moduleUpdateSchema.parse(valid)).toEqual(valid);
    });

    test('should throw error if mod_id is invalid', () => {
      const invalid = { mod_id: 'not-a-uuid', name: 'Updated Name' };
      expect(() => moduleUpdateSchema.parse(invalid)).toThrow();
    });
  });

  describe('moduleUpdateByNameSchema', () => {
    test('should validate valid update by name', () => {
      const valid = { name: 'Test Mod', capacity: 15 };
      expect(moduleUpdateByNameSchema.parse(valid)).toEqual(valid);
    });

    test('should throw error if name is missing', () => {
      const invalid = { capacity: 15 };
      expect(() => moduleUpdateByNameSchema.parse(invalid)).toThrow();
    });
  });
});
