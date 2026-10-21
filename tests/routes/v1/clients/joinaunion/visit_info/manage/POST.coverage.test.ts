/**
 * @myDocBlock
 * @file POST.coverage.test.ts
 * @test
 * @module tests/routes/v1/clients/joinaunion/visit_info/manage
 * @tag clients, joinaunion, visit_info, manage, tests
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path tests/routes/v1/clients/joinaunion/visit_info/manage/POST.coverage.test.ts
 * @summary Edge-case and branch tests for POST /v1/clients/joinaunion/visit_info/manage
 * (companion to POST.test.ts, sharing the same db mock setup).
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';

const { mockSelect, mockFrom } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('@services/dbService', async () => {
  const { createDbServiceMock } =
    await import('../../../../../../helpers/dbMock');
  mockSelect.mockReturnValue({ from: mockFrom });
  return createDbServiceMock({
    select: mockSelect,
  });
});

import {
  isStreamRequest,
  parseOutputShape,
  filterRecord,
  processManageRecords,
  defaultManageQueryRepository,
  makePostManageHandler,
  JourneyQueryCache,
  journeyQueryCache,
  sliceAndFormatJourneys,
  getOrReconstructJourneys,
  normalizeFilters,
  isJourneyColumnName,
  isJourneyQuery,
  filterJourney,
  processJourneyRecords,
  type RawVisitRecord,
  type ManageQueryParams,
} from '@routes/v1/clients/joinaunion/visit_info/manage/POST';
import type { JourneyRecord } from '@routes/v1/clients/joinaunion/visit_info/manage/journeys';

type ResMock = Response & {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  writtenChunks: string[];
  ended: boolean;
};

function createReq(
  body: Record<string, unknown> | undefined = {},
  options: {
    headers?: Record<string, string>;
    query?: Record<string, unknown>;
  } = {},
): Request {
  return {
    body,
    headers: options.headers || {},
    query: options.query || {},
  } as unknown as Request;
}

function createRes(): ResMock {
  const res: Partial<ResMock> = {
    statusCode: 200,
    body: undefined,
    headers: {},
    writtenChunks: [],
    ended: false,
  };
  res.status = vi.fn().mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn().mockImplementation((data: unknown) => {
    res.body = data;
    return res;
  });
  res.setHeader = vi.fn().mockImplementation((name: string, value: string) => {
    if (res.headers) {
      res.headers[name.toLowerCase()] = value;
    }
    return res;
  });
  res.write = vi.fn().mockImplementation((chunk: string) => {
    res.writtenChunks?.push(chunk);
    return true;
  });
  res.end = vi.fn().mockImplementation(() => {
    res.ended = true;
    return res;
  });
  return res as ResMock;
}

function makeJourney(overrides: Record<string, unknown> = {}): JourneyRecord {
  return {
    city: 'Toronto',
    country: 'CA',
    region: 'Ontario',
    latitude: 43.65,
    longitude: -79.38,
    locationSource: 'gps',
    device_id: 'd1',
    userId: 'u1',
    journey_average_time_per_page: '30s',
    journey_average_time_per_page_seconds: 30,
    journey_duration: '1m 0s',
    journey_duration_seconds: 60,
    journey_id: 'journey-1',
    journey_num_pages: 2,
    journey_start_time: '2026-09-10T10:00:00.000Z',
    longest_page: 'Home',
    pages_viewed_percent: 100,
    pages: [
      { page_number: 1, page_name: 'Home', time_on_page_seconds: 30, time_on_page: '30s', notes: '' },
      { page_number: 2, page_name: 'About Us', time_on_page_seconds: 30, time_on_page: '30s', notes: 'Healthcare' },
    ],
    ...overrides,
  } as JourneyRecord;
}

const baseParams = (overrides: Partial<ManageQueryParams> = {}): ManageQueryParams => ({
  columns: [],
  ...overrides,
});

// Two devices: d1 has a 2-page journey (u1), d2 has a 2-page journey with no userId.
const JOURNEY_VISITS: RawVisitRecord[] = [
  {
    id: 'j1',
    deviceId: 'd1',
    userId: 'u1',
    touchTime: new Date('2026-09-10T10:00:00.000Z'),
    city: 'Toronto',
    region: 'Ontario',
    country: 'CA',
    locationSource: 'gps',
    note: 'visit: Home',
  },
  {
    id: 'j2',
    deviceId: 'd1',
    userId: 'u1',
    touchTime: new Date('2026-09-10T10:01:00.000Z'),
    city: 'Toronto',
    region: 'Ontario',
    country: 'CA',
    locationSource: 'gps',
    note: 'visit: About Us#Healthcare',
  },
  {
    id: 'j3',
    deviceId: 'd2',
    userId: null,
    touchTime: new Date('2026-09-11T11:00:00.000Z'),
    city: 'Calgary',
    region: 'Alberta',
    country: 'CA',
    locationSource: 'ip_centroid',
    note: 'visit: Home',
  },
  {
    id: 'j4',
    deviceId: 'd2',
    userId: null,
    touchTime: new Date('2026-09-11T11:03:00.000Z'),
    city: 'Calgary',
    region: 'Alberta',
    country: 'CA',
    locationSource: 'ip_centroid',
    note: 'visit: Services',
  },
];

// Adds d3 (no userId, null/null sort ties) and a later-starting d4 (userId u4) so the
// comparator sees nulls on both sides.
const JOURNEY_VISITS_WITH_TIES: RawVisitRecord[] = [
  ...JOURNEY_VISITS,
  {
    id: 'j5',
    deviceId: 'd3',
    userId: null,
    touchTime: new Date('2026-09-12T09:00:00.000Z'),
    city: 'Edmonton',
    region: 'Alberta',
    country: 'CA',
    locationSource: 'gps',
    note: 'visit: Home',
  },
  {
    id: 'j6',
    deviceId: 'd3',
    userId: null,
    touchTime: new Date('2026-09-12T09:00:30.000Z'),
    city: 'Edmonton',
    region: 'Alberta',
    country: 'CA',
    locationSource: 'gps',
    note: 'visit: FAQs',
  },
  {
    id: 'j7',
    deviceId: 'd4',
    userId: 'u4',
    touchTime: new Date('2026-09-13T09:00:00.000Z'),
    city: 'Regina',
    region: 'Saskatchewan',
    country: 'CA',
    locationSource: 'gps',
    note: 'visit: Home',
  },
  {
    id: 'j8',
    deviceId: 'd4',
    userId: 'u4',
    touchTime: new Date('2026-09-13T09:00:20.000Z'),
    city: 'Regina',
    region: 'Saskatchewan',
    country: 'CA',
    locationSource: 'gps',
    note: 'visit: Services',
  },
];

describe('POST /v1/clients/joinaunion/visit_info/manage (edge cases)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    journeyQueryCache.clear();
  });

  describe('isJourneyColumnName & isJourneyQuery', () => {
    it('rejects empty and non-string column names', () => {
      expect(isJourneyColumnName('')).toBe(false);
      expect(isJourneyColumnName(42 as unknown as string)).toBe(false);
      expect(isJourneyColumnName(null as unknown as string)).toBe(false);
    });

    it('recognizes camelCase and padded journey aliases but not visit columns', () => {
      expect(isJourneyColumnName(' journeyDurationSeconds ')).toBe(true);
      expect(isJourneyColumnName('PAGES')).toBe(true);
      expect(isJourneyColumnName('city')).toBe(false);
      expect(isJourneyColumnName('touch_time')).toBe(false);
    });

    it('detects journey queries by sort column or output key', () => {
      expect(isJourneyQuery(baseParams({ sortColumn: 'journey_start_time' }))).toBe(true);
      expect(
        isJourneyQuery(baseParams({ columns: [{ outputKey: 'pages', columnKey: 'city' }] })),
      ).toBe(true);
      expect(
        isJourneyQuery(baseParams({ sortColumn: 'city', columns: [{ outputKey: 'city', columnKey: 'city' }] })),
      ).toBe(false);
    });
  });

  describe('parseOutputShape edge cases', () => {
    it('treats numeric placeholders as columns for known columns and as counts for unknown keys', () => {
      const parsed = parseOutputShape({ city: 0, visits: 0 });
      expect(parsed.columns).toEqual([{ outputKey: 'city', columnKey: 'city' }]);
      expect(parsed.functions).toEqual([
        expect.objectContaining({ outputKey: 'visits', functionName: 'count', targetColumn: null }),
      ]);
      expect(parsed.countFields).toEqual([{ outputKey: 'visits', functionType: 'count' }]);
    });

    it('rejects a column descriptor whose value is neither a string nor an array', () => {
      expect(() => parseOutputShape({ column: true })).toThrow(
        /Invalid column or function name: 'column'/,
      );
    });

    it('rejects unknown names in a comma-separated column descriptor', () => {
      expect(() => parseOutputShape({ column: 'city, bogus_col' })).toThrow(
        /Invalid column name: 'bogus_col'/,
      );
    });

    it('rejects non-string, blank or unknown items in a column descriptor array', () => {
      expect(() => parseOutputShape({ columns: ['city', 5] })).toThrow(
        'Column items must be non-empty strings',
      );
      expect(() => parseOutputShape({ columns: ['  '] })).toThrow(
        'Column items must be non-empty strings',
      );
      expect(() => parseOutputShape({ columns: ['city', 'nope'] })).toThrow(
        /Invalid column name: 'nope'/,
      );
    });

    it('trims items in a column descriptor array', () => {
      const parsed = parseOutputShape({ cols: [' city ', 'lat'] });
      expect(parsed.columns).toEqual([
        { outputKey: 'city', columnKey: 'city' },
        { outputKey: 'lat', columnKey: 'latitude' },
      ]);
    });

    it('rejects blank strings and non-string/non-object items in array shapes', () => {
      expect(() => parseOutputShape(['city', '   '])).toThrow(
        'output_shape array items must be non-empty strings',
      );
      expect(() => parseOutputShape(['city', 7])).toThrow(
        'output_shape array items must be non-empty strings or objects',
      );
      expect(() => parseOutputShape([['city']])).toThrow(
        'output_shape array items must be non-empty strings or objects',
      );
    });

    it('treats records/record keys mapped to "records" as the journey records column, not a count', () => {
      const parsed = parseOutputShape({ records: 'Record', record: 'records' });
      expect(parsed.functions).toEqual([]);
      expect(parsed.countFields).toEqual([]);
      expect(parsed.columns).toEqual([
        { outputKey: 'records', columnKey: 'records' },
        { outputKey: 'record', columnKey: 'records' },
      ]);
    });

    it('treats records key with a function object or other string as a count function', () => {
      const parsed = parseOutputShape({ records: { fn: 'count' }, city: 'city' });
      expect(parsed.functions).toEqual([
        expect.objectContaining({ outputKey: 'records', functionName: 'count' }),
      ]);
      expect(parsed.countFields).toEqual([{ outputKey: 'records', functionType: 'count' }]);
      expect(parsed.columns).toEqual([{ outputKey: 'city', columnKey: 'city' }]);
    });
  });

  describe('filterRecord edge cases', () => {
    const rec: RawVisitRecord = {
      id: '1',
      deviceId: 'd1',
      touchTime: new Date('2026-09-10T12:00:00.000Z'),
      city: 'Calgary',
      region: 'Alberta',
      locationSource: 'gps',
      note: 'visit: Automotive sector',
    };

    it('applies a full ISO endDate as an exact upper bound', () => {
      expect(filterRecord(rec, baseParams({ endDate: '2026-09-10T11:59:59.000Z' }))).toBe(false);
      expect(filterRecord(rec, baseParams({ endDate: '2026-09-10T12:00:00.000Z' }))).toBe(true);
    });

    it('skips date filtering for records without a touch time', () => {
      expect(
        filterRecord({ ...rec, touchTime: null }, baseParams({ startDate: '2099-01-01', endDate: '2000-01-01' })),
      ).toBe(true);
    });

    it('ignores blank, non-string or unparseable date bounds', () => {
      expect(filterRecord(rec, baseParams({ startDate: '   ' }))).toBe(true);
      expect(filterRecord(rec, baseParams({ startDate: 20260911 as unknown as string }))).toBe(true);
      expect(filterRecord(rec, baseParams({ endDate: 'not-a-date' }))).toBe(true);
    });

    it('parses string touch times and skips date filtering for invalid ones', () => {
      const strRec = { ...rec, touchTime: '2026-09-10T12:00:00.000Z' };
      expect(filterRecord(strRec, baseParams({ startDate: '2026-09-11' }))).toBe(false);
      expect(filterRecord(strRec, baseParams({ startDate: '2026-09-09' }))).toBe(true);

      const badRec = { ...rec, touchTime: 'garbage' };
      expect(filterRecord(badRec, baseParams({ startDate: '2099-01-01' }))).toBe(true);
    });

    it('treats missing locationSource, note and region as empty strings', () => {
      const bare: RawVisitRecord = { id: '2', touchTime: rec.touchTime };
      expect(filterRecord(bare, baseParams({ dataset: 'default' }))).toBe(true);
      expect(filterRecord(bare, baseParams({ dataset: 'gps' }))).toBe(false);
      expect(filterRecord(bare, baseParams({ sector: 'Automotive' }))).toBe(false);
      expect(filterRecord(bare, baseParams({ region: 'Alberta' }))).toBe(false);
      expect(filterRecord(bare, baseParams({ region: 'all', sector: 'Any sector' }))).toBe(true);
    });

    it('filters by filters.sector array, honouring "Any sector" and blank entries', () => {
      expect(filterRecord(rec, baseParams({ filters: { sector: ['retail', 'AUTOMOTIVE'] } }))).toBe(true);
      expect(filterRecord(rec, baseParams({ filters: { sector: ['retail'] } }))).toBe(false);
      expect(filterRecord(rec, baseParams({ filters: { sector: ['Any sector'] } }))).toBe(true);
      expect(filterRecord(rec, baseParams({ filters: { sector: [''] } }))).toBe(true);
      expect(
        filterRecord({ ...rec, note: null }, baseParams({ filters: { sector: ['automotive'] } })),
      ).toBe(false);
    });

    it('matches Date columns by ISO string, null columns as empty, and ignores unknown filter columns', () => {
      expect(
        filterRecord(rec, baseParams({ filters: { touch_time: ['2026-09-10T12:00:00.000Z'] } })),
      ).toBe(true);
      expect(
        filterRecord(rec, baseParams({ filters: { touch_time: ['2026-09-10'] } })),
      ).toBe(false);
      expect(filterRecord({ ...rec, city: null }, baseParams({ filters: { city: [''] } }))).toBe(true);
      expect(filterRecord({ ...rec, city: null }, baseParams({ filters: { city: ['Calgary'] } }))).toBe(false);
      expect(filterRecord(rec, baseParams({ filters: { unknown_col: ['x'], city: [] } }))).toBe(true);
    });
  });

  describe('processManageRecords edge cases', () => {
    const records: RawVisitRecord[] = [
      { id: '1', city: 'Calgary', touchTime: new Date('2026-09-10T12:00:00.000Z'), latitude: 51 },
      { id: '2', city: 'Calgary', touchTime: new Date('2026-09-10T12:00:00.000Z'), latitude: 51 },
      { id: '3', city: 'Toronto', touchTime: new Date('2026-09-11T12:00:00.000Z'), latitude: 43 },
      { id: '4', touchTime: new Date('2026-09-12T12:00:00.000Z'), latitude: 53 },
    ];

    it('groups by Date columns as ISO strings and drops groups whose key column is missing', () => {
      const result = processManageRecords(records, {
        columns: [
          { outputKey: 'time', columnKey: 'touchTime' },
          { outputKey: 'city', columnKey: 'city' },
        ],
        countFields: [{ outputKey: 'hits', functionType: 'count' }],
      });
      expect(result).toEqual([
        { time: '2026-09-10T12:00:00.000Z', city: 'Calgary', hits: 2 },
        { time: '2026-09-11T12:00:00.000Z', city: 'Toronto', hits: 1 },
      ]);
    });

    it('drops tabular rows with missing (undefined) columns', () => {
      const result = processManageRecords(records, {
        columns: [
          { outputKey: 'id', columnKey: 'id' },
          { outputKey: 'city', columnKey: 'city' },
        ],
      });
      expect(result.map((r) => r.id)).toEqual(['1', '2', '3']);
    });

    it('sorts numeric columns ascending', () => {
      const byLat = processManageRecords(records, {
        columns: [
          { outputKey: 'id', columnKey: 'id' },
          { outputKey: 'lat', columnKey: 'latitude' },
        ],
        sortColumn: 'lat',
      });
      expect(byLat.map((r) => r.lat)).toEqual([43, 51, 51, 53]);
    });

    it('sorts numeric and string columns descending', () => {
      const byLat = processManageRecords(records, {
        columns: [
          { outputKey: 'id', columnKey: 'id' },
          { outputKey: 'lat', columnKey: 'latitude' },
        ],
        sortColumn: 'lat',
        sortDirection: 'desc',
      });
      expect(byLat.map((r) => r.lat)).toEqual([53, 51, 51, 43]);

      const byId = processManageRecords(records, {
        columns: [{ outputKey: 'id', columnKey: 'id' }],
        sortColumn: 'id',
        sortDirection: 'desc',
      });
      expect(byId.map((r) => r.id)).toEqual(['4', '3', '2', '1']);
    });
  });

  describe('filterJourney', () => {
    it('resolves dataset from locationSource fallbacks', () => {
      const viaSnake = makeJourney({ locationSource: null, location_source: 'GPS' });
      expect(filterJourney(viaSnake, baseParams({ dataset: 'gps' }))).toBe(true);

      const viaRecordSnake = makeJourney({ locationSource: null, records: [{ location_source: 'wifi' }] });
      expect(filterJourney(viaRecordSnake, baseParams({ dataset: 'wifi' }))).toBe(true);

      const viaRecordCamel = makeJourney({ locationSource: null, records: [{ locationSource: 'cell' }] });
      expect(filterJourney(viaRecordCamel, baseParams({ dataset: 'cell' }))).toBe(true);
      expect(filterJourney(viaRecordCamel, baseParams({ dataset: 'gps' }))).toBe(false);

      const none = makeJourney({ locationSource: null });
      expect(filterJourney(none, baseParams({ dataset: 'default' }))).toBe(true);
      expect(filterJourney(none, baseParams({ dataset: 'gps' }))).toBe(false);
      expect(filterJourney(makeJourney(), baseParams({ dataset: 'default' }))).toBe(false);
    });

    it('filters by start date and by date-only or ISO end date', () => {
      const j = makeJourney({ journey_start_time: '2026-09-10T10:00:00.000Z' });
      expect(filterJourney(j, baseParams({ startDate: '2026-09-11' }))).toBe(false);
      expect(filterJourney(j, baseParams({ startDate: '2026-09-10' }))).toBe(true);
      expect(filterJourney(j, baseParams({ endDate: '2026-09-09' }))).toBe(false);
      expect(filterJourney(j, baseParams({ endDate: '2026-09-10' }))).toBe(true);
      expect(filterJourney(j, baseParams({ endDate: '2026-09-10T09:59:59.000Z' }))).toBe(false);
      expect(filterJourney(j, baseParams({ endDate: '2026-09-10T10:00:00.000Z' }))).toBe(true);
      expect(filterJourney(j, baseParams({ endDate: 'garbage' }))).toBe(true);
    });

    it('skips date filtering for a journey without a start time', () => {
      const j = makeJourney({ journey_start_time: '' });
      expect(filterJourney(j, baseParams({ startDate: '2099-01-01' }))).toBe(true);
    });

    it('ignores empty or non-array per-column filter values', () => {
      const j = makeJourney();
      expect(
        filterJourney(j, baseParams({ filters: { city: [], region: 'Alberta' as unknown as string[] } })),
      ).toBe(true);
    });

    it('skips date filtering for an unparseable journey start time', () => {
      const j = makeJourney({ journey_start_time: 'not-a-date' });
      expect(filterJourney(j, baseParams({ startDate: '2099-01-01', endDate: '2000-01-01' }))).toBe(true);
    });

    it('filters by region, treating a missing region as empty', () => {
      expect(filterJourney(makeJourney(), baseParams({ region: 'ontario' }))).toBe(true);
      expect(filterJourney(makeJourney(), baseParams({ region: 'Alberta' }))).toBe(false);
      expect(filterJourney(makeJourney({ region: null }), baseParams({ region: 'Ontario' }))).toBe(false);
    });

    it('filters by sector against page notes, page names, then raw record notes', () => {
      const j = makeJourney();
      expect(filterJourney(j, baseParams({ sector: 'healthcare' }))).toBe(true);
      expect(filterJourney(j, baseParams({ sector: 'about' }))).toBe(true);
      expect(filterJourney(j, baseParams({ sector: 'mining' }))).toBe(false);

      const withRecords = makeJourney({
        pages: [{ page_number: 1, page_name: null, notes: null, time_on_page_seconds: 1, time_on_page: '1s' }],
        records: [{ note: null }, { note: 'visit: Mining corp' }],
      });
      expect(filterJourney(withRecords, baseParams({ sector: 'mining' }))).toBe(true);
      expect(filterJourney(withRecords, baseParams({ sector: 'retail' }))).toBe(false);
    });

    it('filters by filters.sector array', () => {
      const j = makeJourney({ records: [{ note: 'visit: Mining' }] });
      expect(filterJourney(j, baseParams({ filters: { sector: ['Any sector'] } }))).toBe(true);
      expect(filterJourney(j, baseParams({ filters: { sector: [''] } }))).toBe(true);
      expect(filterJourney(j, baseParams({ filters: { sector: ['retail', 'healthcare'] } }))).toBe(true);
      expect(filterJourney(j, baseParams({ filters: { sector: ['mining'] } }))).toBe(true);
      expect(filterJourney(j, baseParams({ filters: { sector: ['retail'] } }))).toBe(false);

      const noRecords = makeJourney({
        pages: [{ page_number: 1, page_name: null, notes: null, time_on_page_seconds: 1, time_on_page: '1s' }],
        records: [{ note: null }],
      });
      expect(filterJourney(noRecords, baseParams({ filters: { sector: ['retail'] } }))).toBe(false);
    });

    it('resolves device, user and location source filter values from alternate keys', () => {
      const j = makeJourney();
      expect(filterJourney(j, baseParams({ filters: { device_id: ['D1'] } }))).toBe(true);
      expect(filterJourney(j, baseParams({ filters: { device_id: ['d2'] } }))).toBe(false);

      const noDevice = makeJourney({ device_id: undefined, records: [{ deviceId: 'd5' }] });
      expect(filterJourney(noDevice, baseParams({ filters: { device_id: ['d5'] } }))).toBe(true);
      expect(filterJourney(noDevice, baseParams({ filters: { device_id: ['d1'] } }))).toBe(false);

      const snakeUser = makeJourney({ userId: undefined, user_id: 'u9' });
      expect(filterJourney(snakeUser, baseParams({ filters: { user_id: ['u9'] } }))).toBe(true);
      expect(filterJourney(snakeUser, baseParams({ filters: { user_id: ['u1'] } }))).toBe(false);

      const snakeSource = makeJourney({ locationSource: undefined, location_source: 'wifi' });
      expect(filterJourney(snakeSource, baseParams({ filters: { location_source: ['WIFI'] } }))).toBe(true);
      expect(filterJourney(snakeSource, baseParams({ filters: { location_source: ['gps'] } }))).toBe(false);
    });

    it('matches note filters against reconstructed page notes, page names or page notes', () => {
      const j = makeJourney();
      expect(filterJourney(j, baseParams({ filters: { note: ['visit: About Us#Healthcare'] } }))).toBe(true);
      expect(filterJourney(j, baseParams({ filters: { note: ['visit: Home'] } }))).toBe(true);
      expect(filterJourney(j, baseParams({ filters: { note: ['about us'] } }))).toBe(true);
      expect(filterJourney(j, baseParams({ filters: { note: ['healthcare'] } }))).toBe(true);
      expect(filterJourney(j, baseParams({ filters: { note: ['contact'] } }))).toBe(false);
    });

    it('matches other filter columns against raw records when present, else ignores them', () => {
      const j = makeJourney({
        records: [{ requestMethod: null }, { requestMethod: 'POST', custom_tag: 'Promo' }],
      });
      expect(filterJourney(j, baseParams({ filters: { request_method: ['post'] } }))).toBe(true);
      expect(filterJourney(j, baseParams({ filters: { request_method: ['get'] } }))).toBe(false);
      expect(filterJourney(j, baseParams({ filters: { custom_tag: ['promo'] } }))).toBe(true);
      expect(filterJourney(j, baseParams({ filters: { custom_tag: ['other'] } }))).toBe(false);

      // Without raw records, a filter on a non-journey column cannot be evaluated and is ignored.
      expect(filterJourney(makeJourney(), baseParams({ filters: { request_method: ['get'] } }))).toBe(true);
    });
  });

  describe('normalizeFilters', () => {
    it('wraps scalar values, lowercases them and drops null/undefined entries', () => {
      expect(
        normalizeFilters({ city: ' Toronto ', count: 5, gone: null, missing: undefined }),
      ).toEqual({ city: ['toronto'], count: ['5'] });
      expect(normalizeFilters(undefined)).toEqual({});
    });
  });

  describe('JourneyQueryCache edge cases', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('evicts an expired entry on get()', () => {
      const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000);
      const cache = new JourneyQueryCache(5, 100);
      cache.set('k', [makeJourney()]);
      nowSpy.mockReturnValue(1_101);
      expect(cache.get('k')).toBeUndefined();
      nowSpy.mockReturnValue(1_000);
      expect(cache.has('k')).toBe(false);
    });

    it('overwrites an existing key without evicting other entries', () => {
      const cache = new JourneyQueryCache(2, 60_000);
      cache.set('a', [makeJourney({ journey_id: 'a1' })]);
      cache.set('b', [makeJourney({ journey_id: 'b1' })]);
      cache.set('a', [makeJourney({ journey_id: 'a2' })]);
      expect(cache.size()).toBe(2);
      expect(cache.get('a')?.[0].journey_id).toBe('a2');
      expect(cache.get('b')?.[0].journey_id).toBe('b1');
    });

    it('still stores one entry when constructed with a capacity of zero', () => {
      const cache = new JourneyQueryCache(0, 60_000);
      cache.set('first', [makeJourney({ journey_id: 'f' })]);
      expect(cache.get('first')?.[0].journey_id).toBe('f');
      cache.set('second', [makeJourney({ journey_id: 's' })]);
      expect(cache.has('first')).toBe(false);
      expect(cache.size()).toBe(1);
    });

    it('purges only expired entries when computing size()', () => {
      const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000);
      const cache = new JourneyQueryCache(5, 60_000);
      cache.set('short', [makeJourney()], 10);
      cache.set('long', [makeJourney()]);
      nowSpy.mockReturnValue(1_011);
      expect(cache.size()).toBe(1);
      expect(cache.has('long')).toBe(true);
      expect(cache.has('short')).toBe(false);
    });
  });

  describe('sliceAndFormatJourneys edge cases', () => {
    it('returns paged raw journey objects when no columns or counts are requested', () => {
      const journeys = [makeJourney({ journey_id: 'a' }), makeJourney({ journey_id: 'b' }), makeJourney({ journey_id: 'c' })];
      const result = sliceAndFormatJourneys(journeys, baseParams({ pageStartRecord: 1, pageEndRecord: 1 }));
      expect(result).toEqual([journeys[1]]);
    });

    it('resolves column keys through snake_case / camelCase fallbacks and nulls unknown ones', () => {
      const journey = {
        deviceId: 'dev-camel',
        user_id: 'user-snake',
        location_source: 'wifi',
        journey_start_time: '2026-09-10T10:00:00.000Z',
        journey_duration_seconds: 60,
        journey_duration: '1m 0s',
        journey_num_pages: 2,
        journey_average_time_per_page_seconds: 30,
        journey_average_time_per_page: '30s',
        pages_viewed_percent: 50,
        longest_page: 'Home',
      } as unknown as JourneyRecord;

      const keys = [
        'deviceId',
        'device_id',
        'userId',
        'user_id',
        'locationSource',
        'location_source',
        'journeyStartTime',
        'journeyDurationSeconds',
        'journeyDuration',
        'journeyNumPages',
        'journeyAverageTimePerPageSeconds',
        'journeyAverageTimePerPage',
        'pagesViewedPercent',
        'longestPage',
        'note',
      ];
      const columns = keys.map((k) => ({ outputKey: `out_${k}`, columnKey: k })) as ManageQueryParams['columns'];

      const [row] = sliceAndFormatJourneys([journey], baseParams({ columns }));
      expect(row).toEqual({
        out_deviceId: 'dev-camel',
        out_device_id: 'dev-camel',
        out_userId: 'user-snake',
        out_user_id: 'user-snake',
        out_locationSource: 'wifi',
        out_location_source: 'wifi',
        out_journeyStartTime: '2026-09-10T10:00:00.000Z',
        out_journeyDurationSeconds: 60,
        out_journeyDuration: '1m 0s',
        out_journeyNumPages: 2,
        out_journeyAverageTimePerPageSeconds: 30,
        out_journeyAverageTimePerPage: '30s',
        out_pagesViewedPercent: 50,
        out_longestPage: 'Home',
        out_note: null,
      });
    });

    it('falls back from snake_case user/location columns to camelCase keys, and nulls missing device ids', () => {
      const journey = { userId: 'camel-user', locationSource: 'camel-src' } as unknown as JourneyRecord;
      const columns = [
        { outputKey: 'u', columnKey: 'user_id' },
        { outputKey: 'l', columnKey: 'location_source' },
        { outputKey: 'd', columnKey: 'deviceId' },
      ] as ManageQueryParams['columns'];
      const empty = {} as unknown as JourneyRecord;
      expect(sliceAndFormatJourneys([journey, empty], baseParams({ columns }))).toEqual([
        { u: 'camel-user', l: 'camel-src', d: null },
        { u: null, l: null, d: null },
      ]);
    });

    it('prefers snake_case device_id when present for the deviceId column', () => {
      const [row] = sliceAndFormatJourneys(
        [makeJourney({ device_id: 'snake' })],
        baseParams({ columns: [{ outputKey: 'dev', columnKey: 'deviceId' }] }),
      );
      expect(row).toEqual({ dev: 'snake' });
    });
  });

  describe('getOrReconstructJourneys & processJourneyRecords sorting/caching', () => {
    it('sorts journeys by a nullable column, placing nulls last ascending and first descending', async () => {
      const asc = await getOrReconstructJourneys(
        async () => JOURNEY_VISITS,
        baseParams({ sortColumn: 'userId', sortDirection: 'asc' }),
        false,
      );
      expect(asc.map((j) => j.userId)).toEqual(['u1', null]);

      const desc = await getOrReconstructJourneys(
        async () => JOURNEY_VISITS,
        baseParams({ sortColumn: 'userId', sortDirection: 'desc' }),
        false,
      );
      expect(desc.map((j) => j.userId)).toEqual([null, 'u1']);
    });

    it('sorts null userIds last ascending and first descending, with ties preserved', async () => {
      for (const direction of ['asc', 'desc'] as const) {
        const params = baseParams({ sortColumn: 'userId', sortDirection: direction });
        const fromJourneys = await getOrReconstructJourneys(
          async () => JOURNEY_VISITS_WITH_TIES,
          params,
          false,
        );
        const fromRecords = processJourneyRecords(JOURNEY_VISITS_WITH_TIES, params);
        const expected = direction === 'asc' ? ['u1', 'u4', null, null] : [null, null, 'u4', 'u1'];
        expect(fromJourneys.map((j) => j.userId)).toEqual(expected);
        expect(fromRecords.map((j) => j.userId)).toEqual(expected);
      }
    });

    it('sorts journeys numerically and by string in both directions', async () => {
      const numAsc = await getOrReconstructJourneys(
        async () => JOURNEY_VISITS,
        baseParams({ sortColumn: 'journey_duration_seconds' }),
        false,
      );
      expect(numAsc.map((j) => j.device_id)).toEqual(['d1', 'd2']);

      const numDesc = await getOrReconstructJourneys(
        async () => JOURNEY_VISITS,
        baseParams({ sortColumn: 'journey_duration_seconds', sortDirection: 'desc' }),
        false,
      );
      expect(numDesc.map((j) => j.device_id)).toEqual(['d2', 'd1']);

      const strDesc = await getOrReconstructJourneys(
        async () => JOURNEY_VISITS,
        baseParams({ sortColumn: 'city', sortDirection: 'desc' }),
        false,
      );
      expect(strDesc.map((j) => j.city)).toEqual(['Toronto', 'Calgary']);
    });

    it('does not fetch or cache when useCache is false', async () => {
      const fetchRows = vi.fn().mockResolvedValue(JOURNEY_VISITS);
      await getOrReconstructJourneys(fetchRows, baseParams(), false);
      await getOrReconstructJourneys(fetchRows, baseParams(), false);
      expect(fetchRows).toHaveBeenCalledTimes(2);
      expect(journeyQueryCache.size()).toBe(0);
    });

    it('processJourneyRecords sorts with nulls, numbers and strings', () => {
      const byUserDesc = processJourneyRecords(
        JOURNEY_VISITS,
        baseParams({ sortColumn: 'userId', sortDirection: 'desc' }),
      );
      expect(byUserDesc.map((j) => j.userId)).toEqual([null, 'u1']);

      const byUserAsc = processJourneyRecords(JOURNEY_VISITS, baseParams({ sortColumn: 'userId' }));
      expect(byUserAsc.map((j) => j.userId)).toEqual(['u1', null]);

      const byDurationDesc = processJourneyRecords(
        JOURNEY_VISITS,
        baseParams({ sortColumn: 'journey_duration_seconds', sortDirection: 'desc' }),
      );
      expect(byDurationDesc.map((j) => j.device_id)).toEqual(['d2', 'd1']);

      const byDurationAsc = processJourneyRecords(
        JOURNEY_VISITS,
        baseParams({ sortColumn: 'journey_duration_seconds' }),
      );
      expect(byDurationAsc.map((j) => j.device_id)).toEqual(['d1', 'd2']);

      const byCityDesc = processJourneyRecords(
        JOURNEY_VISITS,
        baseParams({ sortColumn: 'city', sortDirection: 'desc' }),
      );
      expect(byCityDesc.map((j) => j.city)).toEqual(['Toronto', 'Calgary']);
    });

    it('processJourneyRecords reuses cached journeys when useCache is true', () => {
      const params = baseParams({ countFields: [{ outputKey: 'n', functionType: 'count' }] });
      expect(processJourneyRecords(JOURNEY_VISITS, params, true)).toEqual([{ n: 2 }]);
      expect(journeyQueryCache.size()).toBe(1);

      // Different input records are ignored because the cached journeys are returned.
      expect(processJourneyRecords([], params, true)).toEqual([{ n: 2 }]);
      // Without the cache the new (empty) input is processed.
      expect(processJourneyRecords([], params, false)).toEqual([{ n: 0 }]);
    });
  });

  describe('defaultManageQueryRepository journey paths', () => {
    it('reconstructs journeys from visitInfo for count-only queries and caches them', async () => {
      mockFrom.mockResolvedValueOnce(JOURNEY_VISITS);
      const params = baseParams({ countFields: [{ outputKey: 'num_journeys', functionType: 'count' }] });

      const result = await defaultManageQueryRepository.getManageData(params);
      expect(result).toEqual([{ num_journeys: 2 }]);
      expect(mockSelect).toHaveBeenCalledTimes(1);
      expect(mockSelect.mock.calls[0][0]).toEqual(
        expect.objectContaining({ id: expect.anything(), deviceId: expect.anything(), note: expect.anything() }),
      );
      expect(mockFrom).toHaveBeenCalledTimes(1);

      // Second call is served from the journey cache.
      const again = await defaultManageQueryRepository.getManageData(params);
      expect(again).toEqual([{ num_journeys: 2 }]);
      expect(mockSelect).toHaveBeenCalledTimes(1);
    });

    it('formats journey columns for journey-column queries', async () => {
      mockFrom.mockResolvedValueOnce(JOURNEY_VISITS);
      const result = await defaultManageQueryRepository.getManageData(
        baseParams({
          columns: [
            { outputKey: 'journey_id', columnKey: 'journey_id' },
            { outputKey: 'city', columnKey: 'city' },
          ],
          region: 'Alberta',
        }),
      );
      expect(result).toEqual([{ journey_id: 'journey-2', city: 'Calgary' }]);
    });

    it('getRawRecords returns raw visitInfo rows', async () => {
      mockFrom.mockResolvedValueOnce(JOURNEY_VISITS);
      const rows = await defaultManageQueryRepository.getRawRecords!();
      expect(rows).toBe(JOURNEY_VISITS);
      expect(mockSelect).toHaveBeenCalledTimes(1);
      expect(Object.keys(mockSelect.mock.calls[0][0]).sort()).toEqual([
        'city',
        'country',
        'deviceId',
        'id',
        'latitude',
        'locationSource',
        'longitude',
        'note',
        'region',
        'requestMethod',
        'touchTime',
        'userId',
      ]);
    });
  });

  describe('isStreamRequest edge cases', () => {
    it('handles missing body and query objects', () => {
      const req = { headers: {} } as unknown as Request;
      expect(isStreamRequest(req)).toBe(false);
      const reqWithQuery = { headers: {}, query: { stream: true } } as unknown as Request;
      expect(isStreamRequest(reqWithQuery)).toBe(true);
    });
  });

  describe('makePostManageHandler edge cases', () => {
    const tabularRepo = () => ({
      getManageData: vi.fn().mockResolvedValue([{ city: 'Calgary' }]),
    });

    it('returns 400 when the request has no body', async () => {
      const repo = tabularRepo();
      const res = createRes();
      await makePostManageHandler(repo)(createReq(null as unknown as Record<string, unknown>), res);
      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({
        error: 'INVALID_REQUEST',
        message: 'A valid output_shape object is required',
      });
      expect(repo.getManageData).not.toHaveBeenCalled();
    });

    it('returns 400 when output_shape is a non-object primitive', async () => {
      const repo = tabularRepo();
      const res = createRes();
      await makePostManageHandler(repo)(createReq({ output_shape: 'city' }), res);
      expect(res.statusCode).toBe(400);
      expect((res.body as { error: string }).error).toBe('INVALID_REQUEST');
      expect(repo.getManageData).not.toHaveBeenCalled();
    });

    it('returns 400 with the parser message for an empty output_shape array', async () => {
      const res = createRes();
      await makePostManageHandler(tabularRepo())(createReq({ outputFields: [] }), res);
      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({
        error: 'INVALID_REQUEST',
        message: 'output_shape cannot be an empty array',
      });
    });

    it('maps snake_case and alternate body params into query params', async () => {
      const repo = tabularRepo();
      const res = createRes();
      await makePostManageHandler(repo)(
        createReq({
          outputShape: { city: 'city' },
          location_source: 'gps',
          start_date: '2026-09-01',
          end_date: '2026-09-30',
          where: 'city = x',
          sort_column: 'city',
          sort_direction: 'desc',
          page_start_record: 5,
          page_end_record: 9,
        }),
        res,
      );
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([{ city: 'Calgary' }]);
      expect(repo.getManageData).toHaveBeenCalledWith(
        expect.objectContaining({
          columns: [{ outputKey: 'city', columnKey: 'city' }],
          dataset: 'gps',
          startDate: '2026-09-01',
          endDate: '2026-09-30',
          query: 'city = x',
          sortColumn: 'city',
          sortDirection: 'desc',
          pageStartRecord: 5,
          pageEndRecord: 9,
          sector: undefined,
          region: undefined,
          filters: undefined,
        }),
      );
    });

    it('passes a string query through unchanged', async () => {
      const repo = tabularRepo();
      await makePostManageHandler(repo)(
        createReq({ output_fields: ['city'], query: 'Calgary', locationSource: 'wifi' }),
        createRes(),
      );
      expect(repo.getManageData).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'Calgary', dataset: 'wifi', sortDirection: 'asc', pageStartRecord: 0 }),
      );
    });

    it.each([
      ['pageSize', { pageSize: 10 }, 0, 9],
      ['page_size', { page_size: 10, pageStartRecord: 20 }, 20, 29],
      ['max_records', { max_records: 5, page_start_record: 3 }, 3, 7],
      ['maxRecords', { maxRecords: 2 }, 0, 1],
    ])('derives pageEndRecord from %s', async (_name, extra, expectedStart, expectedEnd) => {
      const repo = tabularRepo();
      await makePostManageHandler(repo)(
        createReq({ output_shape: { city: 'city' }, ...extra }),
        createRes(),
      );
      expect(repo.getManageData).toHaveBeenCalledWith(
        expect.objectContaining({ pageStartRecord: expectedStart, pageEndRecord: expectedEnd }),
      );
    });

    it('leaves pageEndRecord undefined when the limit is not numeric', async () => {
      const repo = tabularRepo();
      await makePostManageHandler(repo)(
        createReq({ output_shape: { city: 'city' }, limit: 'lots' }),
        createRes(),
      );
      expect(repo.getManageData.mock.calls[0][0].pageEndRecord).toBeUndefined();
    });

    it('falls back to getManageData for journey queries when the repository has no getRawRecords', async () => {
      const repo = {
        getManageData: vi.fn().mockResolvedValue([{ journey_id: 'journey-1' }]),
      };
      const res = createRes();
      await makePostManageHandler(repo)(
        createReq({ output_shape: { journey_id: 'journey_id' } }),
        res,
      );
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([{ journey_id: 'journey-1' }]);
      expect(repo.getManageData).toHaveBeenCalledWith(
        expect.objectContaining({ columns: [{ outputKey: 'journey_id', columnKey: 'journey_id' }] }),
      );
    });

    it('applies journey filters (device_id, note) through the handler', async () => {
      const repo = {
        getManageData: vi.fn(),
        getRawRecords: vi.fn().mockResolvedValue(JOURNEY_VISITS),
      };
      const res = createRes();
      await makePostManageHandler(repo)(
        createReq({
          output_shape: { journey_id: 'journey_id', device_id: 'device_id' },
          filters: { device_id: ['d1'], note: ['healthcare'] },
        }),
        res,
      );
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([{ journey_id: 'journey-1', device_id: 'd1' }]);
      expect(repo.getManageData).not.toHaveBeenCalled();
    });

    it('streams nothing but still ends the response when the repository returns a non-array', async () => {
      const repo = { getManageData: vi.fn().mockResolvedValue({ unexpected: true }) };
      const res = createRes();
      await makePostManageHandler(repo as any)(
        createReq({ output_shape: { city: 'city' }, stream: 'true' }),
        res,
      );
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('application/x-ndjson; charset=utf-8');
      expect(res.write).not.toHaveBeenCalled();
      expect(res.ended).toBe(true);
    });

    it('streams one record per line when chunk mode is requested without a chunk size', async () => {
      const repo = {
        getManageData: vi.fn().mockResolvedValue([{ city: 'A' }, { city: 'B' }]),
      };
      const res = createRes();
      await makePostManageHandler(repo)(
        createReq({ output_shape: { city: 'city' }, format: 'ndjson', as_chunks: true }),
        res,
      );
      expect(res.writtenChunks).toEqual(['{"city":"A"}\n', '{"city":"B"}\n']);
    });

    it('streams arrays of batch_size records when chunk_arrays is set', async () => {
      const repo = {
        getManageData: vi.fn().mockResolvedValue([{ city: 'A' }, { city: 'B' }, { city: 'C' }]),
      };
      const res = createRes();
      await makePostManageHandler(repo)(
        createReq({ output_shape: { city: 'city' }, ndjson: true, chunk_arrays: true, batch_size: 2 }),
        res,
      );
      expect(res.writtenChunks).toEqual([
        '[{"city":"A"},{"city":"B"}]\n',
        '[{"city":"C"}]\n',
      ]);
    });
  });
});
