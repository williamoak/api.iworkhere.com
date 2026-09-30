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
});
