/**
 * @myDocBlock
 * @file POST.ts
 * @external
 * @module clients-joinaunion-visit-info-manage
 * @tag clients, joinaunion, visit_info, manage
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path /v1/clients/joinaunion/visit_info/manage
 * @summary Query and aggregate joinaunion.visit_info records with dynamic output shape.
 *
 * @description
 * Queries joinaunion.visit_info table, filtering by dataset/location_source, date range,
 * sector, region, and custom column filters. Dynamically formats output based on the
 * requested output_shape object/fields, supporting column selection and a curated list of
 * aggregate functions (such as record count per group for heatmaps).
 *
 * @auth
 * Authentication is required.
 *
 * @body
 * {
 *   "output_shape": {
 *     "type": "object",
 *     "required": true,
 *     "description": "Definition of returned fields, including columns and aggregate functions (e.g. { city: 'xxx', num_hits: 0 } or { city: 'city', hits: 'count' })"
 *   },
 *   "dataset": {
 *     "type": "string",
 *     "required": false,
 *     "description": "Dataset / location_source filter (e.g. 'all', 'default', 'ip_centroid')"
 *   },
 *   "startDate": {
 *     "type": "string",
 *     "required": false,
 *     "description": "Start date (ISO or YYYY-MM-DD)"
 *   },
 *   "endDate": {
 *     "type": "string",
 *     "required": false,
 *     "description": "End date (ISO or YYYY-MM-DD)"
 *   },
 *   "sector": {
 *     "type": "string",
 *     "required": false,
 *     "description": "Sector note substring filter"
 *   },
 *   "region": {
 *     "type": "string",
 *     "required": false,
 *     "description": "Geographic region filter"
 *   },
 *   "filters": {
 *     "type": "object",
 *     "required": false,
 *     "description": "Column value filters (e.g. { city: ['Toronto'], note: [...] })"
 *   },
 *   "sortColumn": {
 *     "type": "string",
 *     "required": false,
 *     "description": "Column to sort by"
 *   },
 *   "sortDirection": {
 *     "type": "string",
 *     "required": false,
 *     "description": "'asc' or 'desc'"
 *   },
 *   "pageStartRecord": {
 *     "type": "number",
 *     "required": false,
 *     "description": "Starting record index (0-based offset)"
 *   },
 *   "pageEndRecord": {
 *     "type": "number",
 *     "required": false,
 *     "description": "Ending record index (inclusive)"
 *   },
 *   "stream": {
 *     "type": "boolean",
 *     "required": false,
 *     "description": "When true (or Accept: application/x-ndjson), responses are streamed as newline-delimited JSON (NDJSON) chunks"
 *   }
 * }
 *
 * @response
 * [
 *   {
 *     "city": "Calgary",
 *     "num_hits": 42
 *   }
 * ]
 *
 * @requires
 * {
 *   "helpers": [
 *     "@helpers/logger",
 *     "@helpers/reportFunctions"
 *   ],
 *   "services": [
 *     "@services/dbService"
 *   ],
 *   "schemas": [
 *     "@db/schema/visit_info"
 *   ]
 * }
 */

import type { Request, Response } from 'express';
import { db } from '@services/dbService';
import { visitInfo } from '@db/schema/visit_info';
import { logger } from '@helpers/logger';
import {
  isCuratedFunction,
  parseFunctionInvocation,
  evaluateFunctions,
  type FunctionInvocation,
} from '@helpers/reportFunctions';

/* SET THIS back to true for production */
export const authRequired = false;

export const MAX_REPORT_RECORDS = 300;

export type AllowedVisitInfoColumn =
  | 'id'
  | 'deviceId'
  | 'userId'
  | 'requestMethod'
  | 'touchTime'
  | 'latitude'
  | 'longitude'
  | 'locationSource'
  | 'city'
  | 'country'
  | 'region'
  | 'note';

export const COLUMN_MAP: Record<string, AllowedVisitInfoColumn> = {
  id: 'id',
  device_id: 'deviceId',
  deviceid: 'deviceId',
  deviceId: 'deviceId',
  user_id: 'userId',
  userid: 'userId',
  userId: 'userId',
  request_method: 'requestMethod',
  requestmethod: 'requestMethod',
  requestMethod: 'requestMethod',
  touch_time: 'touchTime',
  touchtime: 'touchTime',
  touchTime: 'touchTime',
  latitude: 'latitude',
  lat: 'latitude',
  longitude: 'longitude',
  long: 'longitude',
  lng: 'longitude',
  location_source: 'locationSource',
  locationsource: 'locationSource',
  locationSource: 'locationSource',
  city: 'city',
  country: 'country',
  region: 'region',
  note: 'note',
};

export const ALLOWED_COLUMN_NAMES = [
  'city',
  'country',
  'device_id',
  'id',
  'latitude',
  'location_source',
  'longitude',
  'note',
  'region',
  'request_method',
  'touch_time',
  'user_id',
] as const;

export const COUNT_FIELD_NAMES = new Set([
  'count',
  'hits',
  'num_hits',
  'numhits',
  'numHits',
  'record_count',
  'recordcount',
  'records',
  'total',
  'hit_count',
  'hitcount',
  'hitCount',
  'num_records',
  'numrecords',
  'numRecords',
]);

export const COLUMN_DESCRIPTOR_KEYS = new Set([
  'column',
  'columns',
  'col',
  'cols',
  'groupby',
  'group_by',
  'dimension',
  'dimensions',
]);

export interface ColumnOutputMapping {
  outputKey: string;
  columnKey: AllowedVisitInfoColumn;
}

export interface CountOutputMapping {
  outputKey: string;
  functionType: 'count';
}

export interface ParsedOutputShape {
  columns: ColumnOutputMapping[];
  functions: FunctionInvocation[];
  countFields: CountOutputMapping[];
}

export interface ManageQueryParams {
  columns: ColumnOutputMapping[];
  functions?: FunctionInvocation[];
  countFields?: CountOutputMapping[];
  dataset?: string;
  startDate?: string;
  endDate?: string;
  sector?: string;
  region?: string;
  filters?: Record<string, string[]>;
  query?: string;
  sortColumn?: string | null;
  sortDirection?: 'asc' | 'desc';
  pageStartRecord?: number;
  pageEndRecord?: number;
}

export interface RawVisitRecord {
  id?: string | null;
  deviceId?: string | null;
  userId?: string | null;
  requestMethod?: string | null;
  touchTime?: Date | string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationSource?: string | null;
  city?: string | null;
  country?: string | null;
  region?: string | null;
  note?: string | null;
}

export function isNullLike(val: unknown): boolean {
  if (val === null || val === undefined) return true;
  if (typeof val === 'string') {
    const trimmed = val.trim().toLowerCase();
    if (
      trimmed === '' ||
      trimmed === 'null' ||
      trimmed === '<null>' ||
      trimmed === 'undefined' ||
      trimmed === 'none' ||
      trimmed === 'nil'
    ) {
      return true;
    }
  }
  return false;
}

export function isCountFunction(key: string, value: unknown): boolean {
  return isCuratedFunction(key, value, (k) => Boolean(COLUMN_MAP[k.toLowerCase()] ?? COLUMN_MAP[k]));
}

export function parseOutputShape(rawShape: unknown): ParsedOutputShape {
  if (!rawShape || typeof rawShape !== 'object') {
    throw new Error('A valid output_shape object is required');
  }

  const columns: ColumnOutputMapping[] = [];
  const functions: FunctionInvocation[] = [];
  const countFields: CountOutputMapping[] = [];

  const resolveCol = (colName: string): AllowedVisitInfoColumn | undefined => {
    return COLUMN_MAP[colName.toLowerCase()] ?? COLUMN_MAP[colName];
  };

  const isKnownCol = (colName: string): boolean => {
    return Boolean(resolveCol(colName));
  };

  const processShapeEntry = (key: string, val: unknown) => {
    const trimmedKey = key.trim();
    const lowerKey = trimmedKey.toLowerCase();

    // Check if key is a column descriptor (e.g. "column": "city" or "columns": ["city", "country"])
    if (COLUMN_DESCRIPTOR_KEYS.has(lowerKey)) {
      if (typeof val === 'string') {
        const parts = val.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
        for (const part of parts) {
          const colKey = resolveCol(part);
          if (!colKey) {
            throw new Error(
              `Invalid column name: '${part}'. Allowed columns: ${ALLOWED_COLUMN_NAMES.join(', ')}`,
            );
          }
          columns.push({ outputKey: part, columnKey: colKey });
        }
        return;
      } else if (Array.isArray(val)) {
        for (const item of val) {
          if (typeof item !== 'string' || item.trim().length === 0) {
            throw new Error('Column items must be non-empty strings');
          }
          const part = item.trim();
          const colKey = resolveCol(part);
          if (!colKey) {
            throw new Error(
              `Invalid column name: '${part}'. Allowed columns: ${ALLOWED_COLUMN_NAMES.join(', ')}`,
            );
          }
          columns.push({ outputKey: part, columnKey: colKey });
        }
        return;
      }
    }

    if (isCuratedFunction(key, val, isKnownCol)) {
      const parsedFn = parseFunctionInvocation(key, val, resolveCol);
      if (parsedFn) {
        functions.push(parsedFn);
        if (parsedFn.functionName === 'count') {
          countFields.push({ outputKey: key, functionType: 'count' });
        }
        return;
      }
    }

    let colKey: AllowedVisitInfoColumn | undefined = resolveCol(trimmedKey);

    if (!colKey && typeof val === 'string' && val.trim().length > 0) {
      colKey = resolveCol(val.trim());
    }

    if (!colKey) {
      throw new Error(
        `Invalid column or function name: '${key}'. Allowed columns: ${ALLOWED_COLUMN_NAMES.join(', ')}`,
      );
    }

    columns.push({ outputKey: key, columnKey: colKey });
  };

  if (Array.isArray(rawShape)) {
    if (rawShape.length === 0) {
      throw new Error('output_shape cannot be an empty array');
    }

    for (const item of rawShape) {
      if (typeof item === 'string') {
        const trimmed = item.trim();
        if (trimmed.length === 0) {
          throw new Error('output_shape array items must be non-empty strings');
        }
        const kvMatch = trimmed.match(/^([^:]+)\s*:\s*(.+)$/);
        if (kvMatch) {
          processShapeEntry(kvMatch[1].trim(), kvMatch[2].trim());
          continue;
        }
        processShapeEntry(trimmed, trimmed);
      } else if (item && typeof item === 'object' && !Array.isArray(item)) {
        for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
          processShapeEntry(k, v);
        }
      } else {
        throw new Error('output_shape array items must be non-empty strings or objects');
      }
    }
  } else {
    const shapeObj = rawShape as Record<string, unknown>;
    const keys = Object.keys(shapeObj);

    if (keys.length === 0) {
      throw new Error('output_shape cannot be an empty object');
    }

    for (const key of keys) {
      processShapeEntry(key, shapeObj[key]);
    }
  }

  return { columns, functions, countFields };
}

function parseDateValue(val: unknown): Date | null {
  if (!val || typeof val !== 'string') return null;
  const str = val.trim();
  if (str.length === 0) return null;
  const date = new Date(str);
  return isNaN(date.getTime()) ? null : date;
}

export function filterRecord(
  record: RawVisitRecord,
  params: ManageQueryParams,
): boolean {
  const { dataset, startDate, endDate, sector, region, filters } = params;

  // Dataset / Location Source
  if (dataset && dataset !== 'all') {
    const locSource = record.locationSource ?? '';
    if (dataset === 'default') {
      if (locSource.length > 0) return false;
    } else {
      if (locSource.toLowerCase() !== dataset.toLowerCase()) return false;
    }
  }

  // Touch Time filtering
  if (record.touchTime) {
    const recordDate =
      record.touchTime instanceof Date
        ? record.touchTime
        : new Date(record.touchTime);
    if (!isNaN(recordDate.getTime())) {
      if (startDate) {
        const parsedStart = parseDateValue(startDate);
        if (parsedStart && recordDate < parsedStart) return false;
      }
      if (endDate) {
        const parsedEnd = parseDateValue(endDate);
        if (parsedEnd) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(endDate.trim())) {
            const endOfDay = new Date(
              parsedEnd.getTime() + 24 * 60 * 60 * 1000,
            );
            if (recordDate >= endOfDay) return false;
          } else if (recordDate > parsedEnd) {
            return false;
          }
        }
      }
    }
  }

  // Sector filtering (substring match on note)
  if (sector && sector !== 'Any sector') {
    const note = (record.note ?? '').toLowerCase();
    if (!note.includes(sector.toLowerCase())) return false;
  }

  // Region filtering
  if (region && region !== 'Canada' && region !== 'all') {
    const recRegion = (record.region ?? '').toLowerCase();
    if (recRegion !== region.toLowerCase()) return false;
  }

  // Custom column filters
  if (filters && typeof filters === 'object') {
    for (const [filterCol, allowedValues] of Object.entries(filters)) {
      if (Array.isArray(allowedValues) && allowedValues.length > 0) {
        const colKey =
          COLUMN_MAP[filterCol.toLowerCase()] ?? COLUMN_MAP[filterCol];
        if (colKey) {
          const recordVal = record[colKey];
          const recordStr =
            recordVal instanceof Date
              ? recordVal.toISOString()
              : recordVal !== null && recordVal !== undefined
                ? String(recordVal)
                : '';
          const match = allowedValues.some(
            (v) => String(v).toLowerCase() === recordStr.toLowerCase(),
          );
          if (!match) return false;
        }
      }
    }
  }

  return true;
}

export function processManageRecords(
  records: RawVisitRecord[],
  params: ManageQueryParams,
): Record<string, unknown>[] {
  const filtered = records.filter((r) => filterRecord(r, params));
  const {
    columns,
    functions = [],
    countFields = [],
    sortColumn,
    sortDirection = 'asc',
    pageStartRecord = 0,
    pageEndRecord,
  } = params;

  const activeFunctions: FunctionInvocation[] = [...functions];
  if (activeFunctions.length === 0 && countFields.length > 0) {
    for (const cf of countFields) {
      activeFunctions.push({
        outputKey: cf.outputKey,
        functionName: 'count',
        targetColumn: null,
      });
    }
  }

  let result: Record<string, unknown>[] = [];

  if (activeFunctions.length > 0) {
    // Grouping / Aggregate Mode
    if (columns.length === 0) {
      // Aggregate over all matching records
      const entry = evaluateFunctions(filtered as Record<string, unknown>[], activeFunctions);
      result.push(entry);
    } else {
      // Group by the specified columns
      const groups = new Map<
        string,
        { groupValues: Record<string, unknown>; groupRecords: RawVisitRecord[] }
      >();

      for (const rec of filtered) {
        const groupKeyParts: string[] = [];
        const groupValues: Record<string, unknown> = {};

        for (const col of columns) {
          let rawVal = rec[col.columnKey];
          if (rawVal instanceof Date) {
            rawVal = rawVal.toISOString();
          } else if (rawVal === undefined) {
            rawVal = null;
          }
          groupValues[col.outputKey] = rawVal;
          groupKeyParts.push(`${col.outputKey}:${String(rawVal)}`);
        }

        const groupKey = groupKeyParts.join('|');
        const existing = groups.get(groupKey);
        if (existing) {
          existing.groupRecords.push(rec);
        } else {
          groups.set(groupKey, { groupValues, groupRecords: [rec] });
        }
      }

      for (const group of groups.values()) {
        const computedFnValues = evaluateFunctions(
          group.groupRecords as Record<string, unknown>[],
          activeFunctions,
        );
        const row: Record<string, unknown> = {
          ...group.groupValues,
          ...computedFnValues,
        };
        result.push(row);
      }
    }
  } else {
    // Tabular / Record projection mode
    for (const rec of filtered) {
      const row: Record<string, unknown> = {};
      for (const col of columns) {
        let rawVal = rec[col.columnKey];
        if (rawVal instanceof Date) {
          rawVal = rawVal.toISOString();
        } else if (rawVal === undefined) {
          rawVal = null;
        }
        row[col.outputKey] = rawVal;
      }
      result.push(row);
    }
  }

  // Filter out any entries where any field has a null, undefined, empty, or string "null" value
  result = result.filter((row) =>
    Object.values(row).every((val) => !isNullLike(val)),
  );

  // Sorting
  if (sortColumn && result.length > 0) {
    const isDesc = sortDirection.toLowerCase() === 'desc';
    result.sort((a, b) => {
      const valA = a[sortColumn];
      const valB = b[sortColumn];

      if (valA === valB) return 0;
      if (valA === null || valA === undefined) return isDesc ? -1 : 1;
      if (valB === null || valB === undefined) return isDesc ? 1 : -1;

      if (typeof valA === 'number' && typeof valB === 'number') {
        return isDesc ? valB - valA : valA - valB;
      }

      const strA = String(valA);
      const strB = String(valB);
      return isDesc ? strB.localeCompare(strA) : strA.localeCompare(strB);
    });
  }

  // Pagination
  const start = Math.max(0, pageStartRecord);
  let end: number | undefined;

  if (pageEndRecord !== undefined && Number.isFinite(pageEndRecord)) {
    end = Math.max(start, pageEndRecord + 1);
  }

  return end !== undefined ? result.slice(start, end) : result.slice(start);
}

export interface ManageQueryRepository {
  getManageData(params: ManageQueryParams): Promise<Record<string, unknown>[]>;
}

export const defaultManageQueryRepository: ManageQueryRepository = {
  getManageData: async (
    params: ManageQueryParams,
  ): Promise<Record<string, unknown>[]> => {
    const rows = await db
      .select({
        id: visitInfo.id,
        deviceId: visitInfo.deviceId,
        userId: visitInfo.userId,
        requestMethod: visitInfo.requestMethod,
        touchTime: visitInfo.touchTime,
        latitude: visitInfo.latitude,
        longitude: visitInfo.longitude,
        locationSource: visitInfo.locationSource,
        city: visitInfo.city,
        country: visitInfo.country,
        region: visitInfo.region,
        note: visitInfo.note,
      })
      .from(visitInfo);

    return processManageRecords(rows as RawVisitRecord[], params);
  },
};

export function isStreamRequest(req: Request): boolean {
  const body = req.body || {};
  if (
    body.stream === true ||
    body.stream === 'true' ||
    body.format === 'ndjson' ||
    body.ndjson === true
  ) {
    return true;
  }

  const acceptHeader =
    req.headers?.accept || req.headers?.['content-type'] || '';
  if (
    typeof acceptHeader === 'string' &&
    (acceptHeader.includes('application/x-ndjson') ||
      acceptHeader.includes('application/ndjson'))
  ) {
    return true;
  }

  const query = (req.query as Record<string, unknown>) || {};
  if (
    query.stream === 'true' ||
    query.stream === true ||
    query.format === 'ndjson'
  ) {
    return true;
  }

  return false;
}

export function makePostManageHandler(
  repo: ManageQueryRepository = defaultManageQueryRepository,
) {
  return async function POST(req: Request, res: Response): Promise<Response> {
    try {
      const body = req.body || {};
      const rawOutputShape =
        body.output_shape ??
        body.outputShape ??
        body.output_fields ??
        body.outputFields;

      if (
        !rawOutputShape ||
        (typeof rawOutputShape !== 'object' && !Array.isArray(rawOutputShape))
      ) {
        return res.status(400).json({
          error: 'INVALID_REQUEST',
          message: 'A valid output_shape object is required',
        });
      }

      let parsedShape: ParsedOutputShape;
      try {
        parsedShape = parseOutputShape(rawOutputShape);
      } catch (parseErr) {
        return res.status(400).json({
          error: 'INVALID_REQUEST',
          message:
            parseErr instanceof Error
              ? parseErr.message
              : 'Invalid output_shape',
        });
      }

      const queryParams: ManageQueryParams = {
        columns: parsedShape.columns,
        functions: parsedShape.functions,
        countFields: parsedShape.countFields,
        dataset:
          typeof body.dataset === 'string'
            ? body.dataset
            : (body.location_source ?? body.locationSource),
        startDate:
          typeof body.startDate === 'string' ? body.startDate : body.start_date,
        endDate:
          typeof body.endDate === 'string' ? body.endDate : body.end_date,
        sector: typeof body.sector === 'string' ? body.sector : undefined,
        region: typeof body.region === 'string' ? body.region : undefined,
        filters:
          body.filters && typeof body.filters === 'object'
            ? body.filters
            : undefined,
        query: typeof body.query === 'string' ? body.query : body.where,
        sortColumn:
          typeof body.sortColumn === 'string'
            ? body.sortColumn
            : body.sort_column,
        sortDirection:
          body.sortDirection === 'desc' || body.sort_direction === 'desc'
            ? 'desc'
            : 'asc',
        pageStartRecord: Number.isFinite(
          Number(body.pageStartRecord ?? body.page_start_record),
        )
          ? Number(body.pageStartRecord ?? body.page_start_record)
          : 0,
        pageEndRecord: Number.isFinite(
          Number(body.pageEndRecord ?? body.page_end_record),
        )
          ? Number(body.pageEndRecord ?? body.page_end_record)
          : (body.limit !== undefined && Number.isFinite(Number(body.limit))) ||
            (body.pageSize !== undefined && Number.isFinite(Number(body.pageSize))) ||
            (body.page_size !== undefined && Number.isFinite(Number(body.page_size))) ||
            (body.max_records !== undefined && Number.isFinite(Number(body.max_records))) ||
            (body.maxRecords !== undefined && Number.isFinite(Number(body.maxRecords)))
          ? (Number.isFinite(Number(body.pageStartRecord ?? body.page_start_record))
              ? Number(body.pageStartRecord ?? body.page_start_record)
              : 0) +
            Number(
              body.limit ??
                body.pageSize ??
                body.page_size ??
                body.max_records ??
                body.maxRecords,
            ) -
            1
          : undefined,
      };

      const data = await repo.getManageData(queryParams);

      if (isStreamRequest(req)) {
        res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.status(200);

        const chunkSize =
          Number(
            body.chunkSize ??
              body.chunk_size ??
              body.batchSize ??
              body.batch_size,
          ) || 0;
        const sendAsChunks =
          (body.chunk_batches === true ||
            body.chunk_arrays === true ||
            body.as_chunks === true) &&
          chunkSize > 0;

        if (Array.isArray(data)) {
          if (sendAsChunks) {
            for (let i = 0; i < data.length; i += chunkSize) {
              const chunk = data.slice(i, i + chunkSize);
              res.write(JSON.stringify(chunk) + '\n');
            }
          } else {
            for (const record of data) {
              res.write(JSON.stringify(record) + '\n');
            }
          }
        }

        res.end();
        return res;
      }

      return res.status(200).json(data);
    } catch (err) {
      logger.error('POST /v1/clients/joinaunion/visit_info/manage error:', err);
      return res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to retrieve report data',
      });
    }
  };
}

const POST = makePostManageHandler(defaultManageQueryRepository);
export default POST;

export const __test__ = {
  COLUMN_MAP,
  ALLOWED_COLUMN_NAMES,
  COUNT_FIELD_NAMES,
  COLUMN_DESCRIPTOR_KEYS,
  MAX_REPORT_RECORDS,
  isNullLike,
  isCountFunction,
  isStreamRequest,
  parseOutputShape,
  filterRecord,
  processManageRecords,
  defaultManageQueryRepository,
  makePostManageHandler,
};
