import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Request, Response } from 'express';

import handler, {
    generateVisitJourneys,
    resolveCountryRegion,
} from '@routes/v1/config/data/joinaunion/visit_info/POST';
import { db } from '@services/dbService';

vi.mock('@services/dbService', () => ({
    db: {
        delete: vi.fn(),
        insert: vi.fn(),
    },
}));

function response() {
    const res = {
        status: vi.fn(),
        json: vi.fn(),
    } as unknown as Response;
    vi.mocked(res.status).mockReturnValue(res);
    return res;
}

describe('POST /v1/config/data/joinaunion/visit_info', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(db.delete).mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
        } as any);
        vi.mocked(db.insert).mockReturnValue({
            values: vi.fn().mockResolvedValue(undefined),
        } as any);
    });

    test('resolves country and region selectors to city places', async () => {
        const canada = await resolveCountryRegion('Canada', 'Ontario');
        const unitedStates = await resolveCountryRegion('US', 'California');

        expect(canada).toEqual(expect.arrayContaining([expect.objectContaining({ regionName: 'Ontario' })]));
        expect(canada?.every((place) => place.countryCode === 'CA')).toBe(true);
        expect(unitedStates).toEqual(expect.arrayContaining([expect.objectContaining({ countryCode: 'US' })]));
    });

    test('defaults to Canada and Ontario', async () => {
        const places = await resolveCountryRegion();

        expect(places).toEqual(expect.arrayContaining([expect.objectContaining({
            countryCode: 'CA',
            regionName: 'Ontario',
        })]));
    });

    test('generates exact-count walks that start at home', async () => {
        const generated = await generateVisitJourneys({
            numRecs: 25,
            locationSource: 'generated',
            country: 'Canada',
            region: 'Ontario',
            random: () => 0,
            deviceId: (() => {
                let sequence = 0;
                return () => `device-${++sequence}`;
            })(),
            now: new Date('2026-09-23T12:00:00.000Z'),
        });

        expect(generated.records).toHaveLength(25);
        expect(generated.records[0].note).toBe('visit: home');
        expect(generated.records.every((record) => record.locationSource === 'generated')).toBe(true);
        expect(generated.records.every((record) => record.note !== 'visit: sample_client')).toBe(true);
        expect(generated.records.every((record) => typeof record.city === 'string' && record.city.length > 0)).toBe(true);
        expect(new Set(generated.records.slice(0, 5).map((record) => record.deviceId)).size).toBe(5);
        expect(generated.records.every((record) => record.requestMethod === 'GET')).toBe(true);
    });

    test('keeps generated coordinates within a quarter degree of the selected city', async () => {
        const generated = await generateVisitJourneys({
            numRecs: 1,
            locationSource: 'generated',
            country: 'Canada',
            region: 'Ontario',
            places: [{
                latitude: 40,
                longitude: -80,
                city: 'Test City',
                countryCode: 'CA',
                regionCode: 'ON',
                regionName: 'Ontario',
            }],
            random: () => 0,
            now: new Date('2026-09-23T12:00:00.000Z'),
        });

        expect(generated.records[0]).toMatchObject({ latitude: 39.75, longitude: -80.25 });
    });

    test.each([
        [{}, 'loc_src is required'],
        [{ loc_src: 'generated', num_recs: 1.5 }, 'num_recs must be an integer'],
        [{ loc_src: 'generated', num_recs: 10001 }, 'num_recs must not be greater than 10,000'],
        [{ loc_src: 'generated', country: 'Atlantis', region: 'Ontario' }, 'country'],
    ])('rejects invalid request %#', async (body, message) => {
        const res = response();
        await handler({ body } as Request, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining(message) }));
        expect(db.delete).not.toHaveBeenCalled();
    });

    test('deletes the source and inserts the requested rows', async () => {
        const res = response();
        await handler({ body: { num_recs: 3, loc_src: 'generated', country: 'Canada', region: 'British Columbia' } } as Request, res);

        expect(db.delete).toHaveBeenCalledOnce();
        expect(db.insert).toHaveBeenCalledOnce();
        const inserted = vi.mocked(db.insert).mock.results[0].value;
        expect(inserted).toBeDefined();
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ inserted_records: 3 }));
    });
});