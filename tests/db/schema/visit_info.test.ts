import { describe, it, expect } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { visitInfo } from '../../../src/db/schema/visit_info';

describe('VisitInfo Schema', () => {
  it('should define all required columns', () => {
    expect(visitInfo.id).toBeDefined();
    expect(visitInfo.deviceId).toBeDefined();
    expect(visitInfo.userId).toBeDefined();
    expect(visitInfo.requestMethod).toBeDefined();
    expect(visitInfo.touchTime).toBeDefined();
    expect(visitInfo.latitude).toBeDefined();
    expect(visitInfo.longitude).toBeDefined();
    expect(visitInfo.locationSource).toBeDefined();
    expect(visitInfo.city).toBeDefined();
    expect(visitInfo.note).toBeDefined();
  });

  it('should configure indexes properly', () => {
    const config = getTableConfig(visitInfo);
    expect(config.name).toBe('visit_info');
    const indexNames = config.indexes.map((idx: any) => idx.config?.name || idx.name);
    expect(indexNames).toContain('device_id_note_idx');
    expect(indexNames).toContain('device_id_touch_time_idx');
    expect(indexNames).toContain('user_id_idx');
    expect(indexNames).toContain('user_id_request_method_idx');
  });
});
