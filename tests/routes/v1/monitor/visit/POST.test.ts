import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import handler from '@routes/v1/monitor/visit/POST';
import { db } from '@services/dbService';

vi.mock('@services/dbService', () => {
    return {
        db: {
            insert: vi.fn(),
        },
    };
});

describe('POST /v1/monitor/visit', () => {
    let mockValues: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockValues = null;
        vi.mocked(db.insert).mockReturnValue({
            values: vi.fn().mockImplementation((val) => {
                mockValues = val;
                return Promise.resolve();
            }),
        } as any);
    });

    test('successfully records visit with payload including location_source and city', async () => {
        const req = {
            body: {
                user_id: '11111111-1111-1111-1111-111111111111',
                device_id: '22222222-2222-2222-2222-222222222222',
                page_name: 'home',
                request_method: 'GET',
                latitude: 41.8781,
                longitude: -87.6298,
                location_source: 'ip_centroid',
                city: 'Chicago',
            },
            headers: {},
            path: '/v1/monitor/visit',
        } as unknown as Request;

        const res = {
            locals: {},
            json: vi.fn().mockImplementation((body) => body),
        } as unknown as Response;

        const result = await handler(req, res);

        expect(res.json).toHaveBeenCalledWith({ ok: true });
        expect(res.locals.visitLocationSource).toBe('ip_centroid');
        expect(res.locals.visitCity).toBe('Chicago');
        expect(res.locals.visitLatitude).toBe(41.8781);
        expect(res.locals.visitLongitude).toBe(-87.6298);
        expect(res.locals.visitNote).toBe('visit: home');
        expect(res.locals.visitLogged).toBe(true);

        expect(mockValues).not.toBeNull();
        expect(mockValues.userId).toBe('11111111-1111-1111-1111-111111111111');
        expect(mockValues.deviceId).toBe('22222222-2222-2222-2222-222222222222');
        expect(mockValues.requestMethod).toBe('GET');
        expect(mockValues.latitude).toBe(41.8781);
        expect(mockValues.longitude).toBe(-87.6298);
        expect(mockValues.locationSource).toBe('ip_centroid');
        expect(mockValues.city).toBe('Chicago');
        expect(mockValues.note).toBe('visit: home');
    });

    test('falls back to X-City and X-Location-Source headers when payload omits them', async () => {
        const req = {
            body: {
                page_name: 'settings',
                latitude: 37.7749,
                longitude: -122.4194,
            },
            headers: {
                'x-location-source': 'gps_precise',
                'x-city': 'San Francisco',
                'x-device-id': '33333333-3333-3333-3333-333333333333',
            },
            path: '/v1/monitor/visit',
        } as unknown as Request;

        const res = {
            locals: {},
            json: vi.fn().mockImplementation((body) => body),
        } as unknown as Response;

        await handler(req, res);

        expect(res.json).toHaveBeenCalledWith({ ok: true });
        expect(mockValues).not.toBeNull();
        expect(mockValues.locationSource).toBe('gps_precise');
        expect(mockValues.city).toBe('San Francisco');
        expect(mockValues.latitude).toBe(37.7749);
        expect(mockValues.longitude).toBe(-122.4194);
    });

    test('handles missing coordinates and location_source gracefully', async () => {
        const req = {
            body: {
                note: 'custom note',
            },
            headers: {},
            path: '/v1/monitor/visit',
        } as unknown as Request;

        const res = {
            locals: {},
            json: vi.fn().mockImplementation((body) => body),
        } as unknown as Response;

        await handler(req, res);

        expect(res.json).toHaveBeenCalledWith({ ok: true });
        expect(mockValues).not.toBeNull();
        expect(mockValues.locationSource).toBeNull();
        expect(mockValues.latitude).toBeNull();
        expect(mockValues.longitude).toBeNull();
        expect(mockValues.note).toBe('custom note');
    });

    test('returns { ok: true } and does not throw when database insert fails', async () => {
        vi.mocked(db.insert).mockReturnValue({
            values: vi.fn().mockRejectedValue(new Error('DB connection failed')),
        } as any);

        const req = {
            body: {
                location_source: 'ip_centroid',
            },
            headers: {},
            path: '/v1/monitor/visit',
        } as unknown as Request;

        const res = {
            locals: {},
            json: vi.fn().mockImplementation((body) => body),
        } as unknown as Response;

        const result = await handler(req, res);

        expect(res.json).toHaveBeenCalledWith({ ok: true });
    });
});
