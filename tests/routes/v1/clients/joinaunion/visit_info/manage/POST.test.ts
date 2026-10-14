/**
 * @myDocBlock
 * @file POST.test.ts
 * @test
 * @module tests/routes/v1/clients/joinaunion/visit_info/manage
 * @tag clients, joinaunion, visit_info, manage, tests
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path tests/routes/v1/clients/joinaunion/visit_info/manage/POST.test.ts
 * @summary Unit and integration tests for POST /v1/clients/joinaunion/visit_info/manage
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
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

import POST, {
  authRequired,
  ALLOWED_COLUMN_NAMES,
  COLUMN_MAP,
  COUNT_FIELD_NAMES,
  MAX_REPORT_RECORDS,
  isNullLike,
  isCountFunction,
  isStreamRequest,
  parseOutputShape,
  filterRecord,
  processManageRecords,
  defaultManageQueryRepository,
  makePostManageHandler,
  generateJourneyQueryKey,
  JourneyQueryCache,
  journeyQueryCache,
  sliceAndFormatJourneys,
  getOrReconstructJourneys,
  normalizeFilters,
  __test__,
} from '@routes/v1/clients/joinaunion/visit_info/manage/POST';

type ResMock = Response & {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  writtenChunks: string[];
  ended: boolean;
};

function createReq(
  body: Record<string, unknown> = {},
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

const SAMPLE_RECORDS = [
  {
    id: '1',
    deviceId: 'd1',
    userId: 'u1',
    requestMethod: 'GET',
    touchTime: new Date('2026-09-10T12:00:00.000Z'),
    latitude: 51.0447,
    longitude: -114.0719,
    city: 'Calgary',
    country: 'CA',
    region: 'Alberta',
    locationSource: 'ip_centroid',
    note: 'visit: Automotive sector',
  },
  {
    id: '2',
    deviceId: 'd2',
    userId: 'u2',
    requestMethod: 'GET',
    touchTime: new Date('2026-09-11T12:00:00.000Z'),
    latitude: 51.0447,
    longitude: -114.0719,
    city: 'Calgary',
    country: 'CA',
    region: 'Alberta',
    locationSource: 'ip_centroid',
    note: 'visit: Retail sector',
  },
  {
    id: '3',
    deviceId: 'd3',
    userId: 'u3',
    requestMethod: 'POST',
    touchTime: new Date('2026-09-12T12:00:00.000Z'),
    latitude: 43.6532,
    longitude: -79.3832,
    city: 'Toronto',
    country: 'CA',
    region: 'Ontario',
    locationSource: 'gps',
    note: 'visit: Tech sector',
  },
  {
    id: '4',
    deviceId: 'd4',
    userId: 'u4',
    requestMethod: 'GET',
    touchTime: new Date('2026-09-13T12:00:00.000Z'),
    latitude: 53.5461,
    longitude: -113.4938,
    city: 'Edmonton',
    country: 'CA',
    region: 'Alberta',
    locationSource: '',
    note: 'visit: Healthcare sector',
  },
];

describe('POST /v1/clients/joinaunion/visit_info/manage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    journeyQueryCache.clear();
  });

  it('exports authRequired as boolean', () => {
    expect(typeof authRequired).toBe('boolean');
  });

  describe('isNullLike', () => {
    it('identifies null, undefined, empty strings, and null strings', () => {
      expect(isNullLike(null)).toBe(true);
      expect(isNullLike(undefined)).toBe(true);
      expect(isNullLike('')).toBe(true);
      expect(isNullLike('   ')).toBe(true);
      expect(isNullLike('null')).toBe(true);
      expect(isNullLike('NULL')).toBe(true);
      expect(isNullLike('<null>')).toBe(true);
      expect(isNullLike('undefined')).toBe(true);
      expect(isNullLike('none')).toBe(true);
      expect(isNullLike('nil')).toBe(true);

      expect(isNullLike('Calgary')).toBe(false);
      expect(isNullLike(0)).toBe(false);
      expect(isNullLike(false)).toBe(false);
    });
  });

  describe('isCountFunction', () => {
    it('detects count function strings', () => {
      expect(isCountFunction('num_hits', 'count')).toBe(true);
      expect(isCountFunction('my_count', 'count()')).toBe(true);
      expect(isCountFunction('total_records', 'count(*)')).toBe(true);
      expect(isCountFunction('score', ':count')).toBe(true);
      expect(isCountFunction('summary', 'sum')).toBe(true);
      expect(isCountFunction('summary', 'total')).toBe(true);
    });

    it('detects count field names when value is not a function string', () => {
      expect(isCountFunction('hits', 0)).toBe(true);
      expect(isCountFunction('num_hits', 'xxx')).toBe(true);
      expect(isCountFunction('count', '')).toBe(true);
      expect(isCountFunction('records', null)).toBe(true);
      expect(isCountFunction('hit_count', 123)).toBe(true);
    });

    it('detects numeric dummy values for custom field names', () => {
      expect(isCountFunction('custom_metric', 0)).toBe(true);
    });

    it('returns false for actual column names', () => {
      expect(isCountFunction('city', 'xxx')).toBe(false);
      expect(isCountFunction('note', 'note')).toBe(false);
      expect(isCountFunction('touch_time', 'touchTime')).toBe(false);
    });
  });

  describe('parseOutputShape', () => {
    it('throws when output_shape is missing or not an object', () => {
      expect(() => parseOutputShape(null)).toThrow(
        'A valid output_shape object is required',
      );
      expect(() => parseOutputShape('invalid')).toThrow(
        'A valid output_shape object is required',
      );
      expect(() => parseOutputShape({})).toThrow(
        'output_shape cannot be an empty object',
      );
      expect(() => parseOutputShape([])).toThrow(
        'output_shape cannot be an empty array',
      );
    });

    it('parses object format with column projections and count aggregations', () => {
      const parsed = parseOutputShape({
        city: 'xxx',
        num_hits: 0,
      });

      expect(parsed.columns).toEqual([
        { outputKey: 'city', columnKey: 'city' },
      ]);
      expect(parsed.countFields).toEqual([
        { outputKey: 'num_hits', functionType: 'count' },
      ]);
    });

    it('parses explicit function mapping e.g. { city: "city", hits: "count" }', () => {
      const parsed = parseOutputShape({
        city: 'city',
        hits: 'count',
      });

      expect(parsed.columns).toEqual([
        { outputKey: 'city', columnKey: 'city' },
      ]);
      expect(parsed.countFields).toEqual([
        { outputKey: 'hits', functionType: 'count' },
      ]);
    });

    it('parses column descriptor format e.g. { column: "city", num_hits: "count" }', () => {
      const parsed = parseOutputShape({
        column: 'city',
        num_hits: 'count',
      });

      expect(parsed.columns).toEqual([
        { outputKey: 'city', columnKey: 'city' },
      ]);
      expect(parsed.countFields).toEqual([
        { outputKey: 'num_hits', functionType: 'count' },
      ]);
    });

    it('parses multiple columns via column/columns descriptor', () => {
      const parsed = parseOutputShape({
        columns: ['city', 'region'],
        num_hits: 'count',
      });

      expect(parsed.columns).toEqual([
        { outputKey: 'city', columnKey: 'city' },
        { outputKey: 'region', columnKey: 'region' },
      ]);
      expect(parsed.countFields).toEqual([
        { outputKey: 'num_hits', functionType: 'count' },
      ]);

      const parsedComma = parseOutputShape({
        column: 'city, country',
        hits: 'count',
      });

      expect(parsedComma.columns).toEqual([
        { outputKey: 'city', columnKey: 'city' },
        { outputKey: 'country', columnKey: 'country' },
      ]);
    });

    it('parses array format with column descriptors and objects', () => {
      const parsed = parseOutputShape([
        { column: 'city' },
        { num_hits: 'count' },
      ]);

      expect(parsed.columns).toEqual([
        { outputKey: 'city', columnKey: 'city' },
      ]);
      expect(parsed.countFields).toEqual([
        { outputKey: 'num_hits', functionType: 'count' },
      ]);

      const parsedStrings = parseOutputShape(['column: city', 'num_hits: count']);
      expect(parsedStrings.columns).toEqual([
        { outputKey: 'city', columnKey: 'city' },
      ]);
      expect(parsedStrings.countFields).toEqual([
        { outputKey: 'num_hits', functionType: 'count' },
      ]);
    });

    it('parses curated function expressions like count_distinct', () => {
      const parsed = parseOutputShape({
        city: 'city',
        devices: 'count_distinct(device_id)',
      });

      expect(parsed.columns).toEqual([
        { outputKey: 'city', columnKey: 'city' },
      ]);
      expect(parsed.functions).toEqual([
        {
          outputKey: 'devices',
          functionName: 'count_distinct',
          targetColumn: 'deviceId',
          rawExpression: 'count_distinct(device_id)',
        },
      ]);
    });

    it('parses array format with columns and count functions', () => {
      const parsed = parseOutputShape(['city', 'region', 'num_hits']);

      expect(parsed.columns).toEqual([
        { outputKey: 'city', columnKey: 'city' },
        { outputKey: 'region', columnKey: 'region' },
      ]);
      expect(parsed.countFields).toEqual([
        { outputKey: 'num_hits', functionType: 'count' },
      ]);
    });

    it('throws error on invalid column name', () => {
      expect(() => parseOutputShape({ unknown_column: 'value' })).toThrow(
        /Invalid column or function name: 'unknown_column'/,
      );
    });
  });

  describe('filterRecord', () => {
    it('filters by dataset (default vs all vs specific)', () => {
      const defaultRec = { ...SAMPLE_RECORDS[3] }; // locationSource: ''
      const centroidRec = { ...SAMPLE_RECORDS[0] }; // locationSource: 'ip_centroid'

      expect(
        filterRecord(defaultRec, {
          columns: [],
          countFields: [],
          dataset: 'default',
        }),
      ).toBe(true);
      expect(
        filterRecord(centroidRec, {
          columns: [],
          countFields: [],
          dataset: 'default',
        }),
      ).toBe(false);

      expect(
        filterRecord(centroidRec, {
          columns: [],
          countFields: [],
          dataset: 'ip_centroid',
        }),
      ).toBe(true);
      expect(
        filterRecord(defaultRec, {
          columns: [],
          countFields: [],
          dataset: 'ip_centroid',
        }),
      ).toBe(false);

      expect(
        filterRecord(centroidRec, {
          columns: [],
          countFields: [],
          dataset: 'all',
        }),
      ).toBe(true);
    });

    it('filters by date range', () => {
      const rec = { ...SAMPLE_RECORDS[1] }; // 2026-09-11

      expect(
        filterRecord(rec, {
          columns: [],
          countFields: [],
          startDate: '2026-09-10',
          endDate: '2026-09-12',
        }),
      ).toBe(true);
      expect(
        filterRecord(rec, {
          columns: [],
          countFields: [],
          startDate: '2026-09-12',
        }),
      ).toBe(false);
      expect(
        filterRecord(rec, {
          columns: [],
          countFields: [],
          endDate: '2026-09-10',
        }),
      ).toBe(false);
    });

    it('filters by sector substring in note', () => {
      const rec = { ...SAMPLE_RECORDS[0] }; // visit: Automotive sector

      expect(
        filterRecord(rec, {
          columns: [],
          countFields: [],
          sector: 'Automotive',
        }),
      ).toBe(true);
      expect(
        filterRecord(rec, {
          columns: [],
          countFields: [],
          sector: 'Healthcare',
        }),
      ).toBe(false);
      expect(
        filterRecord(rec, {
          columns: [],
          countFields: [],
          sector: 'Any sector',
        }),
      ).toBe(true);
    });

    it('filters by region', () => {
      const rec = { ...SAMPLE_RECORDS[0] }; // Alberta

      expect(
        filterRecord(rec, { columns: [], countFields: [], region: 'Alberta' }),
      ).toBe(true);
      expect(
        filterRecord(rec, { columns: [], countFields: [], region: 'Ontario' }),
      ).toBe(false);
      expect(
        filterRecord(rec, { columns: [], countFields: [], region: 'Canada' }),
      ).toBe(true);
    });

    it('filters by custom column filter map', () => {
      const rec = { ...SAMPLE_RECORDS[0] }; // Calgary, Alberta

      expect(
        filterRecord(rec, {
          columns: [],
          countFields: [],
          filters: { city: ['Calgary', 'Edmonton'] },
        }),
      ).toBe(true);
      expect(
        filterRecord(rec, {
          columns: [],
          countFields: [],
          filters: { city: ['Toronto'] },
        }),
      ).toBe(false);
    });
  });

  describe('processManageRecords', () => {
    it('aggregates count grouped by city for heatmap output shape', () => {
      const result = processManageRecords(SAMPLE_RECORDS, {
        columns: [{ outputKey: 'city', columnKey: 'city' }],
        countFields: [{ outputKey: 'num_hits', functionType: 'count' }],
        sortColumn: 'num_hits',
        sortDirection: 'desc',
      });

      expect(result).toEqual([
        { city: 'Calgary', num_hits: 2 },
        { city: 'Toronto', num_hits: 1 },
        { city: 'Edmonton', num_hits: 1 },
      ]);
    });

    it('evaluates curated functions like count and distinct count in grouped results', () => {
      const result = processManageRecords(SAMPLE_RECORDS, {
        columns: [{ outputKey: 'city', columnKey: 'city' }],
        functions: [
          { outputKey: 'num_hits', functionName: 'count', targetColumn: null },
          { outputKey: 'unique_devices', functionName: 'count_distinct', targetColumn: 'deviceId' },
        ],
        sortColumn: 'num_hits',
        sortDirection: 'desc',
      });

      expect(result).toEqual([
        { city: 'Calgary', num_hits: 2, unique_devices: 2 },
        { city: 'Toronto', num_hits: 1, unique_devices: 1 },
        { city: 'Edmonton', num_hits: 1, unique_devices: 1 },
      ]);
    });

    it('groups by coordinates and city for heatmap queries', () => {
      const result = processManageRecords(SAMPLE_RECORDS, {
        columns: [
          { outputKey: 'city', columnKey: 'city' },
          { outputKey: 'latitude', columnKey: 'latitude' },
          { outputKey: 'longitude', columnKey: 'longitude' },
        ],
        countFields: [{ outputKey: 'num_hits', functionType: 'count' }],
        sortColumn: 'num_hits',
        sortDirection: 'desc',
      });

      expect(result).toEqual([
        { city: 'Calgary', latitude: 51.0447, longitude: -114.0719, num_hits: 2 },
        { city: 'Toronto', latitude: 43.6532, longitude: -79.3832, num_hits: 1 },
        { city: 'Edmonton', latitude: 53.5461, longitude: -113.4938, num_hits: 1 },
      ]);
    });

    it('returns tabular rows when no count function is specified', () => {
      const result = processManageRecords(SAMPLE_RECORDS, {
        columns: [
          { outputKey: 'city', columnKey: 'city' },
          { outputKey: 'touch_time', columnKey: 'touchTime' },
        ],
        countFields: [],
        sortColumn: 'city',
        sortDirection: 'asc',
      });

      expect(result.length).toBe(4);
      expect(result[0].city).toBe('Calgary');
      expect(result[1].city).toBe('Calgary');
      expect(result[2].city).toBe('Edmonton');
      expect(result[3].city).toBe('Toronto');
    });

    it('paginates results according to pageStartRecord and pageEndRecord', () => {
      const result = processManageRecords(SAMPLE_RECORDS, {
        columns: [{ outputKey: 'city', columnKey: 'city' }],
        countFields: [],
        pageStartRecord: 1,
        pageEndRecord: 2,
      });

      expect(result.length).toBe(2);
      expect(result[0].city).toBe('Calgary');
      expect(result[1].city).toBe('Toronto');
    });

    it('returns all records when pageEndRecord is omitted or undefined', () => {
      const result = processManageRecords(SAMPLE_RECORDS, {
        columns: [{ outputKey: 'city', columnKey: 'city' }],
        countFields: [],
        pageStartRecord: 0,
      });

      expect(result.length).toBe(4);
    });

    it('does not artificially clamp large pageEndRecord to 300 records', () => {
      const largeRecordSet = Array.from({ length: 500 }, (_, i) => ({
        ...SAMPLE_RECORDS[0],
        id: `rec-${i}`,
        city: `City-${i}`,
      }));

      const result = processManageRecords(largeRecordSet, {
        columns: [{ outputKey: 'city', columnKey: 'city' }],
        countFields: [],
        pageStartRecord: 0,
        pageEndRecord: 499,
      });

      expect(result.length).toBe(500);
    });

    it('calculates aggregate total count if countFields is provided without group columns', () => {
      const result = processManageRecords(SAMPLE_RECORDS, {
        columns: [],
        countFields: [{ outputKey: 'total', functionType: 'count' }],
      });

      expect(result).toEqual([{ total: 4 }]);
    });

    it('filters out any output entry containing null field values', () => {
      const recordsWithNulls = [
        ...SAMPLE_RECORDS,
        {
          id: '5',
          deviceId: 'd5',
          userId: null,
          requestMethod: 'GET',
          touchTime: new Date('2026-09-12T12:00:00.000Z'),
          city: null,
          country: 'CA',
          region: 'Alberta',
          locationSource: 'ip_centroid',
          note: null,
        },
        {
          id: '6',
          deviceId: 'd6',
          userId: null,
          requestMethod: 'GET',
          touchTime: new Date('2026-09-12T12:00:00.000Z'),
          city: 'null',
          country: 'CA',
          region: 'Alberta',
          locationSource: 'ip_centroid',
          note: null,
        },
        {
          id: '7',
          deviceId: 'd7',
          userId: null,
          requestMethod: 'GET',
          touchTime: new Date('2026-09-12T12:00:00.000Z'),
          city: '   ',
          country: 'CA',
          region: 'Alberta',
          locationSource: 'ip_centroid',
          note: null,
        },
      ];

      // Grouped by city
      const groupedResult = processManageRecords(recordsWithNulls, {
        columns: [{ outputKey: 'city', columnKey: 'city' }],
        countFields: [{ outputKey: 'num_hits', functionType: 'count' }],
      });

      expect(groupedResult.find((row) => row.city === null || row.city === 'null' || row.city === '   ')).toBeUndefined();
      expect(groupedResult).toEqual([
        { city: 'Calgary', num_hits: 2 },
        { city: 'Toronto', num_hits: 1 },
        { city: 'Edmonton', num_hits: 1 },
      ]);

      // Tabular projection with null fields
      const tabularResult = processManageRecords(recordsWithNulls, {
        columns: [
          { outputKey: 'city', columnKey: 'city' },
          { outputKey: 'device_id', columnKey: 'deviceId' },
        ],
      });

      expect(tabularResult.every((row) => !isNullLike(row.city) && !isNullLike(row.device_id))).toBe(true);
      expect(tabularResult.length).toBe(4);
    });
  });

  describe('makePostManageHandler (HTTP integration)', () => {
    it('returns 400 when body does not have output_shape', async () => {
      const handler = makePostManageHandler({
        getManageData: vi.fn(),
      });
      const req = createReq({});
      const res = createRes();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({
        error: 'INVALID_REQUEST',
        message: 'A valid output_shape object is required',
      });
    });

    it('returns 400 when output_shape contains unknown columns', async () => {
      const handler = makePostManageHandler({
        getManageData: vi.fn(),
      });
      const req = createReq({
        output_shape: { invalid_column_xyz: 'value' },
      });
      const res = createRes();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect((res.body as { error: string; message: string }).error).toBe(
        'INVALID_REQUEST',
      );
      expect(
        (res.body as { error: string; message: string }).message,
      ).toContain('Invalid column or function name');
    });

    it('processes valid request and returns 200 with result array', async () => {
      const mockRepo = {
        getManageData: vi.fn().mockResolvedValue([
          { city: 'Calgary', num_hits: 15 },
          { city: 'Toronto', num_hits: 8 },
        ]),
      };

      const handler = makePostManageHandler(mockRepo);
      const req = createReq({
        output_shape: { city: 'xxx', num_hits: 0 },
        dataset: 'all',
        startDate: '2026-09-01',
        endDate: '2026-09-28',
        sector: 'Any sector',
        region: 'Canada',
        sortColumn: 'num_hits',
        sortDirection: 'desc',
        pageStartRecord: 0,
        pageEndRecord: 299,
      });
      const res = createRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([
        { city: 'Calgary', num_hits: 15 },
        { city: 'Toronto', num_hits: 8 },
      ]);
      expect(mockRepo.getManageData).toHaveBeenCalledWith(
        expect.objectContaining({
          columns: [{ outputKey: 'city', columnKey: 'city' }],
          countFields: [{ outputKey: 'num_hits', functionType: 'count' }],
          dataset: 'all',
          startDate: '2026-09-01',
          endDate: '2026-09-28',
          sortColumn: 'num_hits',
          sortDirection: 'desc',
          pageStartRecord: 0,
          pageEndRecord: 299,
        }),
      );
    });

    it('processes request with column descriptor { column: "city", num_hits: "count" }', async () => {
      const mockRepo = {
        getManageData: vi.fn().mockResolvedValue([
          { city: 'Calgary', num_hits: 2 },
          { city: 'Toronto', num_hits: 1 },
        ]),
      };

      const handler = makePostManageHandler(mockRepo);
      const req = createReq({
        output_shape: { column: 'city', num_hits: 'count' },
      });
      const res = createRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([
        { city: 'Calgary', num_hits: 2 },
        { city: 'Toronto', num_hits: 1 },
      ]);
      expect(mockRepo.getManageData).toHaveBeenCalledWith(
        expect.objectContaining({
          columns: [{ outputKey: 'city', columnKey: 'city' }],
          countFields: [{ outputKey: 'num_hits', functionType: 'count' }],
        }),
      );
    });

    it('processes request with columns array { columns: ["city", "latitude", "longitude"], num_hits: "count" }', async () => {
      const mockRepo = {
        getManageData: vi.fn().mockResolvedValue([
          { city: 'Calgary', latitude: 51.0447, longitude: -114.0719, num_hits: 289 },
          { city: 'Edmonton', latitude: 53.5461, longitude: -113.4938, num_hits: 24 },
        ]),
      };

      const handler = makePostManageHandler(mockRepo);
      const req = createReq({
        output_shape: {
          columns: ['city', 'latitude', 'longitude'],
          num_hits: 'count',
        },
        dataset: 'all',
        startDate: '2025-09-01',
        endDate: '2026-09-28',
        region: 'Canada',
        sortColumn: 'num_hits',
        sortDirection: 'desc',
        pageStartRecord: 0,
        pageEndRecord: 299,
      });
      const res = createRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([
        { city: 'Calgary', latitude: 51.0447, longitude: -114.0719, num_hits: 289 },
        { city: 'Edmonton', latitude: 53.5461, longitude: -113.4938, num_hits: 24 },
      ]);
      expect(mockRepo.getManageData).toHaveBeenCalledWith(
        expect.objectContaining({
          columns: [
            { outputKey: 'city', columnKey: 'city' },
            { outputKey: 'latitude', columnKey: 'latitude' },
            { outputKey: 'longitude', columnKey: 'longitude' },
          ],
          countFields: [{ outputKey: 'num_hits', functionType: 'count' }],
          dataset: 'all',
          startDate: '2025-09-01',
          endDate: '2026-09-28',
          region: 'Canada',
          sortColumn: 'num_hits',
          sortDirection: 'desc',
          pageStartRecord: 0,
          pageEndRecord: 299,
        }),
      );
    });

    it('processes request with limit/pageSize converting to pageEndRecord', async () => {
      const mockRepo = {
        getManageData: vi.fn().mockResolvedValue([{ city: 'Calgary', num_hits: 10 }]),
      };

      const handler = makePostManageHandler(mockRepo);
      const req = createReq({
        output_shape: { city: 'city', num_hits: 'count' },
        pageStartRecord: 10,
        pageSize: 50,
      });
      const res = createRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(mockRepo.getManageData).toHaveBeenCalledWith(
        expect.objectContaining({
          pageStartRecord: 10,
          pageEndRecord: 59,
        }),
      );
    });

    it('returns 500 when repository throws an error', async () => {
      const mockRepo = {
        getManageData: vi.fn().mockRejectedValue(new Error('Database offline')),
      };

      const handler = makePostManageHandler(mockRepo);
      const req = createReq({
        output_shape: { city: 'city' },
      });
      const res = createRes();

      await handler(req, res);

      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({
        error: 'INTERNAL_ERROR',
        message: 'Failed to retrieve report data',
      });
    });

    it('streams response as NDJSON chunks when stream: true in request body', async () => {
      const mockRepo = {
        getManageData: vi.fn().mockResolvedValue([
          { city: 'Calgary', num_hits: 289 },
          { city: 'Edmonton', num_hits: 24 },
          { city: 'Vancouver', num_hits: 15 },
        ]),
      };

      const handler = makePostManageHandler(mockRepo);
      const req = createReq({
        output_shape: { city: 'city', num_hits: 'count' },
        stream: true,
      });
      const res = createRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('application/x-ndjson; charset=utf-8');
      expect(res.headers['transfer-encoding']).toBe('chunked');
      expect(res.headers['cache-control']).toBe('no-cache, no-transform');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.ended).toBe(true);
      expect(res.writtenChunks).toEqual([
        '{"city":"Calgary","num_hits":289}\n',
        '{"city":"Edmonton","num_hits":24}\n',
        '{"city":"Vancouver","num_hits":15}\n',
      ]);
    });

    it('streams response when Accept: application/x-ndjson header is provided', async () => {
      const mockRepo = {
        getManageData: vi.fn().mockResolvedValue([
          { city: 'Toronto', num_hits: 100 },
        ]),
      };

      const handler = makePostManageHandler(mockRepo);
      const req = createReq(
        { output_shape: { city: 'city', num_hits: 'count' } },
        { headers: { accept: 'application/x-ndjson' } },
      );
      const res = createRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('application/x-ndjson; charset=utf-8');
      expect(res.writtenChunks).toEqual(['{"city":"Toronto","num_hits":100}\n']);
      expect(res.ended).toBe(true);
    });

    it('streams response in chunked batches when chunk_batches and chunk_size are specified', async () => {
      const mockRepo = {
        getManageData: vi.fn().mockResolvedValue([
          { city: 'Calgary', num_hits: 1 },
          { city: 'Edmonton', num_hits: 2 },
          { city: 'Toronto', num_hits: 3 },
        ]),
      };

      const handler = makePostManageHandler(mockRepo);
      const req = createReq({
        output_shape: { city: 'city', num_hits: 'count' },
        stream: true,
        chunk_batches: true,
        chunk_size: 2,
      });
      const res = createRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.writtenChunks).toEqual([
        '[{"city":"Calgary","num_hits":1},{"city":"Edmonton","num_hits":2}]\n',
        '[{"city":"Toronto","num_hits":3}]\n',
      ]);
      expect(res.ended).toBe(true);
    });
  });

  describe('isStreamRequest', () => {
    it('detects stream flags in request body', () => {
      expect(isStreamRequest(createReq({ stream: true }))).toBe(true);
      expect(isStreamRequest(createReq({ stream: 'true' }))).toBe(true);
      expect(isStreamRequest(createReq({ format: 'ndjson' }))).toBe(true);
      expect(isStreamRequest(createReq({ ndjson: true }))).toBe(true);
    });

    it('detects stream Accept headers', () => {
      expect(
        isStreamRequest(createReq({}, { headers: { accept: 'application/x-ndjson' } })),
      ).toBe(true);
      expect(
        isStreamRequest(createReq({}, { headers: { accept: 'application/ndjson' } })),
      ).toBe(true);
    });

    it('detects stream query parameters', () => {
      expect(
        isStreamRequest(createReq({}, { query: { stream: 'true' } })),
      ).toBe(true);
      expect(
        isStreamRequest(createReq({}, { query: { format: 'ndjson' } })),
      ).toBe(true);
    });

    it('returns false for standard JSON requests', () => {
      expect(isStreamRequest(createReq({}))).toBe(false);
      expect(
        isStreamRequest(createReq({}, { headers: { accept: 'application/json' } })),
      ).toBe(false);
    });
  });

  describe('Journey Dataset and Count processing via POST', () => {
    const journeySampleVisits = [
      // Device 1: 2 journeys
      {
        id: '1',
        deviceId: 'd1',
        touchTime: new Date('2026-09-10T10:00:00.000Z'),
        city: 'Toronto',
        region: 'Ontario',
        country: 'CA',
        locationSource: 'all',
        note: 'visit: Home',
      },
      {
        id: '2',
        deviceId: 'd1',
        touchTime: new Date('2026-09-10T10:01:10.000Z'),
        city: 'Toronto',
        region: 'Ontario',
        country: 'CA',
        locationSource: 'all',
        note: 'visit: About Us#Healthcare',
      },
      {
        id: '3',
        deviceId: 'd1',
        touchTime: new Date('2026-09-10T10:10:00.000Z'),
        city: 'Toronto',
        region: 'Ontario',
        country: 'CA',
        locationSource: 'all',
        note: 'visit: Home',
      },
      {
        id: '4',
        deviceId: 'd1',
        touchTime: new Date('2026-09-10T10:11:00.000Z'),
        city: 'Toronto',
        region: 'Ontario',
        country: 'CA',
        locationSource: 'all',
        note: 'visit: Contact#Healthcare',
      },
      // Device 2: 1 journey
      {
        id: '5',
        deviceId: 'd2',
        touchTime: new Date('2026-09-10T11:00:00.000Z'),
        city: 'Calgary',
        region: 'Alberta',
        country: 'CA',
        locationSource: 'all',
        note: 'visit: Home',
      },
      {
        id: '6',
        deviceId: 'd2',
        touchTime: new Date('2026-09-10T11:02:00.000Z'),
        city: 'Calgary',
        region: 'Alberta',
        country: 'CA',
        locationSource: 'all',
        note: 'visit: Services',
      },
    ];

    it('returns exact journey cardinality for countOnly POST request with output_shape: { num_recs: "count" }', async () => {
      const mockRepo = {
        getManageData: vi.fn(),
        getRawRecords: vi.fn().mockResolvedValue(journeySampleVisits),
      };

      const handler = makePostManageHandler(mockRepo);
      const req = createReq({
        dataset: 'all',
        startDate: '2026-09-01T00:00:00.000Z',
        endDate: '2026-09-30T23:59:59.999Z',
        region: 'Canada',
        filters: {
          city: ['Toronto', 'Calgary'],
        },
        output_shape: {
          num_recs: 'count',
        },
      });
      const res = createRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([{ num_recs: 3 }]);
    });

    it('streams NDJSON journey records with full journey output shape', async () => {
      const mockRepo = {
        getManageData: vi.fn(),
        getRawRecords: vi.fn().mockResolvedValue(journeySampleVisits),
      };

      const handler = makePostManageHandler(mockRepo);
      const req = createReq({
        dataset: 'all',
        startDate: '2026-09-01T00:00:00.000Z',
        endDate: '2026-09-30T23:59:59.999Z',
        region: 'Canada',
        filters: {
          sector: ['Healthcare'],
        },
        stream: true,
        sortColumn: 'journey_start_time',
        sortDirection: 'asc',
        pageStartRecord: 0,
        pageEndRecord: 100,
        output_shape: {
          city: 'city',
          country: 'country',
          region: 'region',
          latitude: 'latitude',
          longitude: 'longitude',
          locationSource: 'locationSource',
          device_id: 'device_id',
          userId: 'userId',
          journey_average_time_per_page: 'journey_average_time_per_page',
          journey_average_time_per_page_seconds: 'journey_average_time_per_page_seconds',
          journey_duration: 'journey_duration',
          journey_duration_seconds: 'journey_duration_seconds',
          journey_id: 'journey_id',
          journey_num_pages: 'journey_num_pages',
          journey_start_time: 'journey_start_time',
          longest_page: 'longest_page',
          pages_viewed_percent: 'pages_viewed_percent',
          pages: 'pages',
        },
      });
      const res = createRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('application/x-ndjson; charset=utf-8');
      expect(res.writtenChunks.length).toBe(2);

      const journey1 = JSON.parse(res.writtenChunks[0]);
      expect(journey1.journey_id).toBe('journey-1');
      expect(journey1.device_id).toBe('d1');
      expect(journey1.city).toBe('Toronto');
      expect(journey1.country).toBe('CA');
      expect(journey1.region).toBe('Ontario');
      expect(journey1.journey_num_pages).toBe(2);
      expect(journey1.pages).toHaveLength(2);
      expect(journey1.pages[0].page_name).toBe('Home');
      expect(journey1.records).toBeUndefined();

      const journey2 = JSON.parse(res.writtenChunks[1]);
      expect(journey2.journey_id).toBe('journey-2');
      expect(journey2.device_id).toBe('d1');
    });

    it('filters out system event notes containing /v1/ when streaming journey records', async () => {
      const visitsWithSystemEvents = [
        {
          id: '1',
          deviceId: 'd-sys',
          touchTime: new Date('2026-10-13T23:43:28.043Z'),
          city: 'Vancouver',
          country: 'CA',
          region: 'British Columbia',
          note: 'visit: Home',
        },
        {
          id: '2',
          deviceId: 'd-sys',
          touchTime: new Date('2026-10-13T23:43:28.148Z'),
          city: null,
          country: null,
          region: null,
          note: 'visit: /v1/auth/refresh',
        },
        {
          id: '3',
          deviceId: 'd-sys',
          touchTime: new Date('2026-10-13T23:43:28.191Z'),
          city: null,
          country: null,
          region: null,
          note: 'visit: /v1/auth/me',
        },
        {
          id: '4',
          deviceId: 'd-sys',
          touchTime: new Date('2026-10-13T23:44:28.043Z'),
          city: 'Vancouver',
          country: 'CA',
          region: 'British Columbia',
          note: 'visit: Pricing',
        },
      ];

      const mockRepo = {
        getManageData: vi.fn(),
        getRawRecords: vi.fn().mockResolvedValue(visitsWithSystemEvents),
      };

      const handler = makePostManageHandler(mockRepo);
      const req = createReq({
        dataset: 'all',
        stream: true,
        sortColumn: 'journey_start_time',
        output_shape: {
          journey_id: 'journey_id',
          journey_num_pages: 'journey_num_pages',
          pages: 'pages',
        },
      });
      const res = createRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.writtenChunks.length).toBe(1);

      const journey = JSON.parse(res.writtenChunks[0]);
      expect(journey.journey_num_pages).toBe(2);
      expect(journey.pages).toHaveLength(2);
      expect(journey.pages.map((p: { page_name: string }) => p.page_name)).toEqual(['Home', 'Pricing']);
      expect(journey.records).toBeUndefined();
    });

    it('recognizes all journey fields in parseOutputShape without throwing error', () => {
      const shape = {
        city: 'city',
        country: 'country',
        region: 'region',
        latitude: 'latitude',
        longitude: 'longitude',
        locationSource: 'locationSource',
        device_id: 'device_id',
        userId: 'userId',
        journey_average_time_per_page: 'journey_average_time_per_page',
        journey_average_time_per_page_seconds: 'journey_average_time_per_page_seconds',
        journey_duration: 'journey_duration',
        journey_duration_seconds: 'journey_duration_seconds',
        journey_id: 'journey_id',
        journey_num_pages: 'journey_num_pages',
        journey_start_time: 'journey_start_time',
        longest_page: 'longest_page',
        pages_viewed_percent: 'pages_viewed_percent',
        pages: 'pages',
      };

      const parsed = parseOutputShape(shape);
      expect(parsed.columns).toHaveLength(18);
      expect(parsed.columns.map((c) => c.outputKey)).toContain('journey_average_time_per_page');
      expect(parsed.columns.map((c) => c.outputKey)).toContain('locationSource');
      expect(parsed.columns.map((c) => c.outputKey)).toContain('userId');
    });
  });

  describe('defaultManageQueryRepository', () => {
    it('queries visitInfo and returns processed records', async () => {
      mockFrom.mockResolvedValueOnce(SAMPLE_RECORDS);

      const result = await defaultManageQueryRepository.getManageData({
        columns: [{ outputKey: 'city', columnKey: 'city' }],
        countFields: [{ outputKey: 'num_hits', functionType: 'count' }],
      });

      expect(mockSelect).toHaveBeenCalled();
      expect(mockFrom).toHaveBeenCalled();
      expect(result.length).toBe(3);
      expect(result).toEqual([
        { city: 'Calgary', num_hits: 2 },
        { city: 'Toronto', num_hits: 1 },
        { city: 'Edmonton', num_hits: 1 },
      ]);
    });
  });

  describe('normalizeFilters & generateJourneyQueryKey', () => {
    it('normalizes filters with consistent ordering and casing', () => {
      const filtersA = {
        city: ['Toronto', 'Vancouver'],
        sector: ['Healthcare'],
      };
      const filtersB = {
        sector: ['healthcare'],
        city: ['vancouver', 'toronto'],
      };
      expect(normalizeFilters(filtersA)).toEqual(normalizeFilters(filtersB));
    });

    it('generates deterministic query keys regardless of filter key order', () => {
      const key1 = generateJourneyQueryKey({
        dataset: 'all',
        region: 'Canada',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        filters: { sector: ['Healthcare'], city: ['Calgary', 'Toronto'] },
        sortColumn: 'journey_start_time',
        sortDirection: 'asc',
      });

      const key2 = generateJourneyQueryKey({
        dataset: 'ALL',
        region: 'canada',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        filters: { city: ['toronto', 'calgary'], sector: ['healthcare'] },
        sortColumn: 'journey_start_time',
        sortDirection: 'ASC',
      });

      expect(key1).toBe(key2);
    });

    it('generates distinct query keys for different filter parameters', () => {
      const baseKey = generateJourneyQueryKey({ region: 'Ontario' });
      const diffRegionKey = generateJourneyQueryKey({ region: 'Quebec' });
      const diffDateKey = generateJourneyQueryKey({ region: 'Ontario', startDate: '2026-05-01' });
      const diffSortKey = generateJourneyQueryKey({ region: 'Ontario', sortDirection: 'desc' });

      expect(baseKey).not.toBe(diffRegionKey);
      expect(baseKey).not.toBe(diffDateKey);
      expect(baseKey).not.toBe(diffSortKey);
    });
  });

  describe('JourneyQueryCache', () => {
    it('stores and retrieves cached journey records', () => {
      const cache = new JourneyQueryCache(10, 60_000);
      const mockJourneys = [
        {
          city: 'Vancouver',
          country: 'CA',
          region: 'British Columbia',
          latitude: 49.2827,
          longitude: -123.1207,
          locationSource: 'ip_centroid',
          device_id: 'd1',
          userId: 'u1',
          journey_average_time_per_page: '10s',
          journey_average_time_per_page_seconds: 10,
          journey_duration: '20s',
          journey_duration_seconds: 20,
          journey_id: 'journey-1',
          journey_num_pages: 2,
          journey_start_time: '2026-10-13T23:43:28.043Z',
          longest_page: 'Home',
          pages_viewed_percent: 50,
          pages: [],
        },
      ];

      cache.set('test-key', mockJourneys as any);
      expect(cache.has('test-key')).toBe(true);
      expect(cache.get('test-key')).toEqual(mockJourneys);
      expect(cache.size()).toBe(1);

      cache.delete('test-key');
      expect(cache.has('test-key')).toBe(false);
      expect(cache.get('test-key')).toBeUndefined();
    });

    it('expires cached entries after TTL', () => {
      const cache = new JourneyQueryCache(10, 50);
      cache.set('short-lived', [{ journey_id: 'j1' }] as any, 10);

      expect(cache.has('short-lived')).toBe(true);

      const entry = (cache as any).cache.get('short-lived');
      entry.expiresAt = Date.now() - 1000;

      expect(cache.has('short-lived')).toBe(false);
      expect(cache.get('short-lived')).toBeUndefined();
      expect(cache.size()).toBe(0);
    });

    it('evicts oldest entries when exceeding max capacity (LRU)', () => {
      const cache = new JourneyQueryCache(3, 60_000);

      cache.set('k1', [{ journey_id: 'j1' }] as any);
      cache.set('k2', [{ journey_id: 'j2' }] as any);
      cache.set('k3', [{ journey_id: 'j3' }] as any);

      // Access k1 to make it recently used: k2 is now oldest
      cache.get('k1');

      // Insert k4, should evict k2
      cache.set('k4', [{ journey_id: 'j4' }] as any);

      expect(cache.has('k1')).toBe(true);
      expect(cache.has('k2')).toBe(false);
      expect(cache.has('k3')).toBe(true);
      expect(cache.has('k4')).toBe(true);
      expect(cache.size()).toBe(3);
    });
  });

  describe('Journey Query Caching & Sequential Fetch Optimization', () => {
    const visitsForCacheTest = [
      {
        id: '1',
        deviceId: 'd-cache-1',
        userId: 'u1',
        requestMethod: 'GET',
        touchTime: new Date('2026-10-13T20:00:00.000Z'),
        city: 'Vancouver',
        country: 'CA',
        region: 'British Columbia',
        locationSource: 'ip_centroid',
        latitude: 49.2827,
        longitude: -123.1207,
        note: 'visit: Home',
      },
      {
        id: '2',
        deviceId: 'd-cache-1',
        userId: 'u1',
        requestMethod: 'GET',
        touchTime: new Date('2026-10-13T20:01:00.000Z'),
        city: 'Vancouver',
        country: 'CA',
        region: 'British Columbia',
        locationSource: 'ip_centroid',
        latitude: 49.2827,
        longitude: -123.1207,
        note: 'visit: Union Guide',
      },
      {
        id: '3',
        deviceId: 'd-cache-2',
        userId: 'u2',
        requestMethod: 'GET',
        touchTime: new Date('2026-10-13T21:00:00.000Z'),
        city: 'Vancouver',
        country: 'CA',
        region: 'British Columbia',
        locationSource: 'ip_centroid',
        latitude: 49.2827,
        longitude: -123.1207,
        note: 'visit: Home',
      },
      {
        id: '4',
        deviceId: 'd-cache-2',
        userId: 'u2',
        requestMethod: 'GET',
        touchTime: new Date('2026-10-13T21:01:00.000Z'),
        city: 'Vancouver',
        country: 'CA',
        region: 'British Columbia',
        locationSource: 'ip_centroid',
        latitude: 49.2827,
        longitude: -123.1207,
        note: 'visit: FAQs',
      },
    ];

    it('reuses cached journey datasets on consecutive count and page-fetch requests', async () => {
      const getRawRecordsMock = vi.fn().mockResolvedValue(visitsForCacheTest);
      const mockRepo = {
        getManageData: vi.fn(),
        getRawRecords: getRawRecordsMock,
      };

      const handler = makePostManageHandler(mockRepo);

      // 1. First request: Count query (output_shape: { num_recs: "count" })
      const countReq = createReq({
        region: 'British Columbia',
        dataset: 'all',
        output_shape: { num_recs: 'count' },
      });
      const countRes = createRes();
      await handler(countReq, countRes);

      expect(countRes.statusCode).toBe(200);
      expect(countRes.body).toEqual([{ num_recs: 2 }]);
      expect(getRawRecordsMock).toHaveBeenCalledTimes(1);

      // 2. Second request: Page 0 fetch with identical filter parameters
      const page0Req = createReq({
        region: 'British Columbia',
        dataset: 'all',
        pageStartRecord: 0,
        pageEndRecord: 0,
        output_shape: {
          journey_id: 'journey_id',
          device_id: 'device_id',
          city: 'city',
        },
      });
      const page0Res = createRes();
      await handler(page0Req, page0Res);

      expect(page0Res.statusCode).toBe(200);
      expect(page0Res.body).toEqual([
        {
          journey_id: 'journey-1',
          device_id: 'd-cache-1',
          city: 'Vancouver',
        },
      ]);
      // Should NOT have called getRawRecords again (cache hit)
      expect(getRawRecordsMock).toHaveBeenCalledTimes(1);

      // 3. Third request: Page 1 fetch (pagination advance)
      const page1Req = createReq({
        region: 'British Columbia',
        dataset: 'all',
        pageStartRecord: 1,
        pageEndRecord: 1,
        output_shape: {
          journey_id: 'journey_id',
          device_id: 'device_id',
          city: 'city',
        },
      });
      const page1Res = createRes();
      await handler(page1Req, page1Res);

      expect(page1Res.statusCode).toBe(200);
      expect(page1Res.body).toEqual([
        {
          journey_id: 'journey-2',
          device_id: 'd-cache-2',
          city: 'Vancouver',
        },
      ]);
      // Still 1 repository call!
      expect(getRawRecordsMock).toHaveBeenCalledTimes(1);
    });

    it('queries repository afresh when filter parameters change (cache isolation)', async () => {
      const getRawRecordsMock = vi.fn().mockResolvedValue(visitsForCacheTest);
      const mockRepo = {
        getManageData: vi.fn(),
        getRawRecords: getRawRecordsMock,
      };

      const handler = makePostManageHandler(mockRepo);

      // Request with region 'British Columbia'
      const req1 = createReq({
        region: 'British Columbia',
        output_shape: { num_recs: 'count' },
      });
      const res1 = createRes();
      await handler(req1, res1);
      expect(getRawRecordsMock).toHaveBeenCalledTimes(1);

      // Request with different region 'Ontario'
      const req2 = createReq({
        region: 'Ontario',
        output_shape: { num_recs: 'count' },
      });
      const res2 = createRes();
      await handler(req2, res2);

      // Should dispatch a fresh repository query
      expect(getRawRecordsMock).toHaveBeenCalledTimes(2);
      expect(res2.body).toEqual([{ num_recs: 0 }]);
    });

    it('queries repository after manual cache clearance', async () => {
      const getRawRecordsMock = vi.fn().mockResolvedValue(visitsForCacheTest);
      const mockRepo = {
        getManageData: vi.fn(),
        getRawRecords: getRawRecordsMock,
      };

      const handler = makePostManageHandler(mockRepo);

      const req = createReq({
        region: 'British Columbia',
        output_shape: { num_recs: 'count' },
      });
      const res1 = createRes();
      await handler(req, res1);
      expect(getRawRecordsMock).toHaveBeenCalledTimes(1);

      // Manually invalidate cache (e.g. upon new visit logging)
      journeyQueryCache.clear();

      const res2 = createRes();
      await handler(req, res2);
      expect(getRawRecordsMock).toHaveBeenCalledTimes(2);
    });
  });
});
