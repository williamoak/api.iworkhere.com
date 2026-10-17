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

import crypto from 'crypto';
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
import {
  buildJourneys,
  type VisitInfoRow,
  type JourneyRecord,
} from './journeys';

export const authRequired = true;

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

export type AllowedJourneyField =
  | 'journey_id'
  | 'journey_duration_seconds'
  | 'journey_duration'
  | 'journey_num_pages'
  | 'device_id'
  | 'journey_start_time'
  | 'journey_average_time_per_page_seconds'
  | 'journey_average_time_per_page'
  | 'city'
  | 'region'
  | 'country'
  | 'pages_viewed_percent'
  | 'longest_page'
  | 'pages'
  | 'records';

export type AllowedManageColumn = AllowedVisitInfoColumn | AllowedJourneyField;

export const COLUMN_MAP: Record<string, AllowedManageColumn> = {
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
  // Journey schema fields
  journey_id: 'journey_id',
  journeyid: 'journey_id',
  journeyId: 'journey_id',
  journey_duration_seconds: 'journey_duration_seconds',
  journeydurationseconds: 'journey_duration_seconds',
  journeyDurationSeconds: 'journey_duration_seconds',
  journey_duration: 'journey_duration',
  journeyduration: 'journey_duration',
  journeyDuration: 'journey_duration',
  journey_num_pages: 'journey_num_pages',
  journeynumpages: 'journey_num_pages',
  journeyNumPages: 'journey_num_pages',
  journey_start_time: 'journey_start_time',
  journeystarttime: 'journey_start_time',
  journeyStartTime: 'journey_start_time',
  journey_average_time_per_page_seconds: 'journey_average_time_per_page_seconds',
  journeyaveragetimeperpageseconds: 'journey_average_time_per_page_seconds',
  journeyAverageTimePerPageSeconds: 'journey_average_time_per_page_seconds',
  journey_average_time_per_page: 'journey_average_time_per_page',
  journeyaveragetimeperpage: 'journey_average_time_per_page',
  journeyAverageTimePerPage: 'journey_average_time_per_page',
  pages_viewed_percent: 'pages_viewed_percent',
  pagesviewedpercent: 'pages_viewed_percent',
  pagesViewedPercent: 'pages_viewed_percent',
  longest_page: 'longest_page',
  longestpage: 'longest_page',
  longestPage: 'longest_page',
  pages: 'pages',
  records: 'records',
};

export const ALLOWED_COLUMN_NAMES = [
  'city',
  'country',
  'device_id',
  'id',
  'journey_average_time_per_page',
  'journey_average_time_per_page_seconds',
  'journey_duration',
  'journey_duration_seconds',
  'journey_id',
  'journey_num_pages',
  'journey_start_time',
  'latitude',
  'location_source',
  'locationSource',
  'longitude',
  'longest_page',
  'note',
  'pages',
  'pages_viewed_percent',
  'records',
  'region',
  'request_method',
  'touch_time',
  'user_id',
  'userId',
] as const;

export const JOURNEY_SPECIFIC_COLUMNS = new Set([
  'journey_id',
  'journey_duration_seconds',
  'journey_duration',
  'journey_num_pages',
  'journey_start_time',
  'journey_average_time_per_page_seconds',
  'journey_average_time_per_page',
  'pages_viewed_percent',
  'longest_page',
  'pages',
  'records',
]);

export function isJourneyColumnName(col: string): boolean {
  if (!col || typeof col !== 'string') return false;
  const normalized = col.trim().toLowerCase();
  const mapped = COLUMN_MAP[normalized] ?? COLUMN_MAP[col.trim()] ?? normalized;
  return JOURNEY_SPECIFIC_COLUMNS.has(String(mapped)) || JOURNEY_SPECIFIC_COLUMNS.has(normalized);
}

export function isJourneyQuery(params: ManageQueryParams): boolean {
  if (params.sortColumn && isJourneyColumnName(params.sortColumn)) {
    return true;
  }
  if (
    params.columns &&
    params.columns.some(
      (c) => isJourneyColumnName(String(c.columnKey)) || isJourneyColumnName(c.outputKey),
    )
  ) {
    return true;
  }
  return false;
}

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
  columnKey: AllowedManageColumn;
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

  const resolveCol = (colName: string): AllowedManageColumn | undefined => {
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
      if (
        !(
          (lowerKey === 'records' || lowerKey === 'record') &&
          typeof val === 'string' &&
          (val.trim().toLowerCase() === 'records' || val.trim().toLowerCase() === 'record')
        )
      ) {
        const parsedFn = parseFunctionInvocation(key, val, resolveCol);
        if (parsedFn) {
          functions.push(parsedFn);
          if (parsedFn.functionName === 'count') {
            countFields.push({ outputKey: key, functionType: 'count' });
          }
          return;
        }
      }
    }

    let colKey: AllowedManageColumn | undefined = resolveCol(trimmedKey);

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
    if (Array.isArray(filters.sector) && filters.sector.length > 0) {
      const note = (record.note ?? '').toLowerCase();
      const matchSector = filters.sector.some(
        (s) => !s || s === 'Any sector' || note.includes(String(s).toLowerCase()),
      );
      if (!matchSector) return false;
    }

    for (const [filterCol, allowedValues] of Object.entries(filters)) {
      if (filterCol.toLowerCase() === 'sector') continue;
      if (Array.isArray(allowedValues) && allowedValues.length > 0) {
        const colKey =
          COLUMN_MAP[filterCol.toLowerCase()] ?? COLUMN_MAP[filterCol];
        if (colKey) {
          const recordVal = (record as Record<string, unknown>)[colKey];
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
          let rawVal = (rec as Record<string, unknown>)[col.columnKey];
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
        let rawVal = (rec as Record<string, unknown>)[col.columnKey];
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

export function filterJourney(
  journey: JourneyRecord,
  params: ManageQueryParams,
): boolean {
  const { dataset, startDate, endDate, sector, region, filters } = params;

  // Dataset / Location Source
  if (dataset && dataset !== 'all') {
    const locSource =
      journey.locationSource ??
      (journey as unknown as Record<string, unknown>).location_source ??
      journey.records?.[0]?.location_source ??
      journey.records?.[0]?.locationSource ??
      '';
    if (dataset === 'default') {
      if (String(locSource).length > 0) return false;
    } else {
      if (String(locSource).toLowerCase() !== dataset.toLowerCase()) return false;
    }
  }

  // Touch Time / Date Range filtering
  if (journey.journey_start_time) {
    const journeyStart = new Date(journey.journey_start_time);
    if (!isNaN(journeyStart.getTime())) {
      if (startDate) {
        const parsedStart = parseDateValue(startDate);
        if (parsedStart && journeyStart < parsedStart) return false;
      }
      if (endDate) {
        const parsedEnd = parseDateValue(endDate);
        if (parsedEnd) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(endDate.trim())) {
            const endOfDay = new Date(
              parsedEnd.getTime() + 24 * 60 * 60 * 1000,
            );
            if (journeyStart >= endOfDay) return false;
          } else if (journeyStart > parsedEnd) {
            return false;
          }
        }
      }
    }
  }

  // Region filtering
  if (region && region !== 'Canada' && region !== 'all') {
    const journeyRegion = (journey.region ?? '').toLowerCase();
    if (journeyRegion !== region.toLowerCase()) return false;
  }

  // Sector filtering
  if (sector && sector !== 'Any sector') {
    const sectorLower = sector.toLowerCase();
    const hasSector =
      journey.pages.some(
        (p) =>
          (p.notes ?? '').toLowerCase().includes(sectorLower) ||
          (p.page_name ?? '').toLowerCase().includes(sectorLower),
      ) ||
      Boolean(
        journey.records &&
          journey.records.some((r) =>
            (r.note ?? '').toLowerCase().includes(sectorLower),
          ),
      );
    if (!hasSector) return false;
  }

  // Custom filters
  if (filters && typeof filters === 'object') {
    if (Array.isArray(filters.sector) && filters.sector.length > 0) {
      const matchSector = filters.sector.some((s) => {
        if (!s || s === 'Any sector') return true;
        const sLower = String(s).toLowerCase();
        return (
          journey.pages.some(
            (p) =>
              (p.notes ?? '').toLowerCase().includes(sLower) ||
              (p.page_name ?? '').toLowerCase().includes(sLower),
          ) ||
          Boolean(
            journey.records &&
              journey.records.some((r) =>
                (r.note ?? '').toLowerCase().includes(sLower),
              ),
          )
        );
      });
      if (!matchSector) return false;
    }

    for (const [filterCol, allowedValues] of Object.entries(filters)) {
      if (filterCol.toLowerCase() === 'sector') continue;
      if (Array.isArray(allowedValues) && allowedValues.length > 0) {
        const colKey =
          COLUMN_MAP[filterCol.toLowerCase()] ??
          COLUMN_MAP[filterCol] ??
          filterCol;
        const journeyObj = journey as unknown as Record<string, unknown>;
        let journeyVal = journeyObj[colKey];
        if (journeyVal === undefined) {
          if (colKey === 'deviceId') journeyVal = journeyObj['device_id'] ?? journeyObj['deviceId'];
          else if (colKey === 'userId') journeyVal = journeyObj['userId'] ?? journeyObj['user_id'];
          else if (colKey === 'locationSource') journeyVal = journeyObj['locationSource'] ?? journeyObj['location_source'];
        }
        const allowedLower = allowedValues.map((v) => String(v).toLowerCase());

        if (journeyVal !== undefined && journeyVal !== null) {
          const journeyValStr = String(journeyVal).toLowerCase();
          if (!allowedLower.includes(journeyValStr)) return false;
        } else if (colKey === 'note') {
          const matchesAnyPage = journey.pages.some((p) => {
            const reconstructedNote = p.notes ? `visit: ${p.page_name}#${p.notes}` : `visit: ${p.page_name}`;
            return (
              allowedLower.includes(reconstructedNote.toLowerCase()) ||
              allowedLower.includes(p.page_name.toLowerCase()) ||
              allowedLower.includes((p.notes || '').toLowerCase())
            );
          });
          if (!matchesAnyPage) return false;
        } else if (journey.records) {
          const matchesAnyRecord = journey.records.some((r) => {
            const rVal = (r as unknown as Record<string, unknown>)[colKey];
            return (
              rVal !== undefined &&
              rVal !== null &&
              allowedLower.includes(String(rVal).toLowerCase())
            );
          });
          if (!matchesAnyRecord) return false;
        }
      }
    }
  }

  return true;
}

export function normalizeFilters(
  filters: Record<string, unknown> | undefined,
): Record<string, string[]> {
  if (!filters || typeof filters !== 'object') return {};
  const sortedKeys = Object.keys(filters).sort();
  const normalized: Record<string, string[]> = {};
  for (const k of sortedKeys) {
    const val = (filters as Record<string, unknown>)[k];
    if (Array.isArray(val)) {
      normalized[k] = [...val].map((v) => String(v).trim().toLowerCase()).sort();
    } else if (val !== undefined && val !== null) {
      normalized[k] = [String(val).trim().toLowerCase()];
    }
  }
  return normalized;
}

export function generateJourneyQueryKey(
  params: Partial<ManageQueryParams>,
): string {
  const normalized = {
    dataset: (params.dataset ?? 'all').toLowerCase(),
    startDate: (params.startDate ?? '').trim(),
    endDate: (params.endDate ?? '').trim(),
    region: (params.region ?? 'all').toLowerCase(),
    sector: (params.sector ?? 'all').toLowerCase(),
    filters: normalizeFilters(params.filters),
    sortColumn: (params.sortColumn ?? '').trim().toLowerCase(),
    sortDirection: (params.sortDirection ?? 'asc').trim().toLowerCase(),
  };
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('hex');
}

export interface JourneyCacheEntry {
  journeys: JourneyRecord[];
  expiresAt: number;
}

export class JourneyQueryCache {
  private cache = new Map<string, JourneyCacheEntry>();
  private readonly maxEntries: number;
  private readonly defaultTtlMs: number;

  constructor(maxEntries = 50, defaultTtlMs = 60_000) {
    this.maxEntries = maxEntries;
    this.defaultTtlMs = defaultTtlMs;
  }

  get(key: string): JourneyRecord[] | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    // Refresh LRU order
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.journeys;
  }

  set(key: string, journeys: JourneyRecord[], ttlMs?: number): void {
    const effectiveTtl = ttlMs !== undefined ? ttlMs : this.defaultTtlMs;
    const expiresAt = Date.now() + effectiveTtl;

    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, { journeys, expiresAt });
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
    return this.cache.size;
  }
}

export const journeyQueryCache = new JourneyQueryCache(50, 60_000);

export function sliceAndFormatJourneys(
  journeys: JourneyRecord[],
  params: ManageQueryParams,
): Record<string, unknown>[] {
  const {
    columns = [],
    countFields = [],
    pageStartRecord = 0,
    pageEndRecord,
  } = params;

  if (countFields.length > 0 && columns.length === 0) {
    const entry: Record<string, unknown> = {};
    for (const cf of countFields) {
      entry[cf.outputKey] = journeys.length;
    }
    return [entry];
  }

  const start = Math.max(0, pageStartRecord);
  let end: number | undefined;
  if (pageEndRecord !== undefined && Number.isFinite(pageEndRecord)) {
    end = Math.max(start, pageEndRecord + 1);
  }
  const paged = end !== undefined ? journeys.slice(start, end) : journeys.slice(start);

  if (columns.length === 0) {
    return paged as unknown as Record<string, unknown>[];
  }

  return paged.map((journey) => {
    const journeyObj = journey as unknown as Record<string, unknown>;
    const row: Record<string, unknown> = {};
    for (const col of columns) {
      const colKey = String(col.columnKey);
      let val = journeyObj[colKey];
      if (val === undefined) {
        if (colKey === 'deviceId') val = journeyObj['device_id'] ?? journeyObj['deviceId'];
        else if (colKey === 'device_id') val = journeyObj['device_id'] ?? journeyObj['deviceId'];
        else if (colKey === 'userId') val = journeyObj['userId'] ?? journeyObj['user_id'];
        else if (colKey === 'user_id') val = journeyObj['userId'] ?? journeyObj['user_id'];
        else if (colKey === 'locationSource') val = journeyObj['locationSource'] ?? journeyObj['location_source'];
        else if (colKey === 'location_source') val = journeyObj['locationSource'] ?? journeyObj['location_source'];
        else if (colKey === 'journeyStartTime') val = journeyObj['journey_start_time'];
        else if (colKey === 'journeyDurationSeconds') val = journeyObj['journey_duration_seconds'];
        else if (colKey === 'journeyDuration') val = journeyObj['journey_duration'];
        else if (colKey === 'journeyNumPages') val = journeyObj['journey_num_pages'];
        else if (colKey === 'journeyAverageTimePerPageSeconds') val = journeyObj['journey_average_time_per_page_seconds'];
        else if (colKey === 'journeyAverageTimePerPage') val = journeyObj['journey_average_time_per_page'];
        else if (colKey === 'pagesViewedPercent') val = journeyObj['pages_viewed_percent'];
        else if (colKey === 'longestPage') val = journeyObj['longest_page'];
      }
      row[col.outputKey] = val !== undefined ? val : null;
    }
    return row;
  });
}

export async function getOrReconstructJourneys(
  fetchRows: () => Promise<RawVisitRecord[]>,
  params: ManageQueryParams,
  useCache = true,
): Promise<JourneyRecord[]> {
  const queryKey = generateJourneyQueryKey(params);
  if (useCache) {
    const cached = journeyQueryCache.get(queryKey);
    if (cached) {
      return cached;
    }
  }

  const rawRecords = await fetchRows();
  const journeys = buildJourneys(rawRecords as VisitInfoRow[]).filter((j) =>
    filterJourney(j, params),
  );

  const { sortColumn, sortDirection = 'asc' } = params;
  if (sortColumn && journeys.length > 0) {
    const isDesc = sortDirection.toLowerCase() === 'desc';
    journeys.sort((a, b) => {
      const valA = (a as unknown as Record<string, unknown>)[sortColumn];
      const valB = (b as unknown as Record<string, unknown>)[sortColumn];

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

  if (useCache) {
    journeyQueryCache.set(queryKey, journeys);
  }

  return journeys;
}

export function processJourneyRecords(
  records: RawVisitRecord[],
  params: ManageQueryParams,
  useCache = false,
): Record<string, unknown>[] {
  const queryKey = generateJourneyQueryKey(params);
  if (useCache) {
    const cached = journeyQueryCache.get(queryKey);
    if (cached) {
      return sliceAndFormatJourneys(cached, params);
    }
  }

  const journeys = buildJourneys(records as VisitInfoRow[]).filter((j) =>
    filterJourney(j, params),
  );
  const {
    sortColumn,
    sortDirection = 'asc',
  } = params;

  if (sortColumn && journeys.length > 0) {
    const isDesc = sortDirection.toLowerCase() === 'desc';
    journeys.sort((a, b) => {
      const valA = (a as unknown as Record<string, unknown>)[sortColumn];
      const valB = (b as unknown as Record<string, unknown>)[sortColumn];

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

  if (useCache) {
    journeyQueryCache.set(queryKey, journeys);
  }

  return sliceAndFormatJourneys(journeys, params);
}

export interface ManageQueryRepository {
  getManageData(params: ManageQueryParams): Promise<Record<string, unknown>[]>;
  getRawRecords?(): Promise<RawVisitRecord[]>;
}

export const defaultManageQueryRepository: ManageQueryRepository = {
  getManageData: async (
    params: ManageQueryParams,
  ): Promise<Record<string, unknown>[]> => {
    const isJourney =
      isJourneyQuery(params) ||
      (params.countFields &&
        params.countFields.length > 0 &&
        params.columns.length === 0);

    if (isJourney) {
      const journeys = await getOrReconstructJourneys(
        async () => {
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
          return rows as RawVisitRecord[];
        },
        params,
        true,
      );
      return sliceAndFormatJourneys(journeys, params);
    }

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
  getRawRecords: async (): Promise<RawVisitRecord[]> => {
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

    return rows as RawVisitRecord[];
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

      let data: Record<string, unknown>[];

      const isJourney =
        parsedShape.countFields.length > 0 && parsedShape.columns.length === 0
          ? true
          : isJourneyQuery(queryParams);

      if (isJourney) {
        if (repo.getRawRecords) {
          const journeys = await getOrReconstructJourneys(
            () => repo.getRawRecords!(),
            queryParams,
            true,
          );
          data = sliceAndFormatJourneys(journeys, queryParams);
        } else {
          data = await repo.getManageData(queryParams);
        }
      } else {
        data = await repo.getManageData(queryParams);
      }

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
  isJourneyQuery,
  isJourneyColumnName,
  parseOutputShape,
  filterRecord,
  filterJourney,
  normalizeFilters,
  generateJourneyQueryKey,
  JourneyQueryCache,
  journeyQueryCache,
  sliceAndFormatJourneys,
  getOrReconstructJourneys,
  processManageRecords,
  processJourneyRecords,
  defaultManageQueryRepository,
  makePostManageHandler,
};
