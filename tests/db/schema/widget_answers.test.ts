import { describe, it, expect } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { widgetAnswers } from '../../../src/db/schema/widget_answers';

describe('WidgetAnswers Schema', () => {
    it('is tenant-scoped under joinaunion and defines all required columns', () => {
        const config = getTableConfig(widgetAnswers);
        expect(config.name).toBe('widget_answers');
        expect(config.schema).toBe('joinaunion');

        expect(widgetAnswers.id).toBeDefined();
        expect(widgetAnswers.recipient).toBeDefined();
        expect(widgetAnswers.email).toBeDefined();
        expect(widgetAnswers.message).toBeDefined();
        expect(widgetAnswers.province).toBeDefined();
        expect(widgetAnswers.industry).toBeDefined();
        expect(widgetAnswers.createdAt).toBeDefined();
    });

    it('configures optimal indexes for recipient chronologies, email lookups, region/industry queries, and timestamps', () => {
        const config = getTableConfig(widgetAnswers);
        const indexNames = config.indexes.map((idx: any) => idx.config?.name || idx.name);

        expect(indexNames).toContain('widget_answers_recipient_created_at_idx');
        expect(indexNames).toContain('widget_answers_email_idx');
        expect(indexNames).toContain('widget_answers_province_industry_idx');
        expect(indexNames).toContain('widget_answers_created_at_idx');
    });
});
