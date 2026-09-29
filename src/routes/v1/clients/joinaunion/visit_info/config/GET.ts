/**
 * @myDocBlock
 * @file GET.ts
 * @external
 * @module clients-joinaunion-visit-info-config
 * @tag clients, joinaunion, visit_info, config
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path /v1/clients/joinaunion/visit_info/config
 * @summary Retrieve unique column values from joinaunion.visit_info table.
 *
 * @description
 * Queries the joinaunion.visit_info table for distinct, non-null values of a specified column.
 * Requires authentication and returns the requested column name, unique values list, and query timestamp.
 *
 * @auth
 * Authentication is required.
 *
 * @query
 * {
 *   "column": {
 *     "type": "string",
 *     "required": true,
 *     "description": "Column name from joinaunion.visit_info (e.g., city, country, region, location_source, device_id, user_id, request_method, note)"
 *   }
 * }
 *
 * @response
 * {
 *   "column": "city",
 *   "unique_list": [
 *     "Calgary",
 *     "Edmonton",
 *     "Toronto",
 *     "Vancouver"
 *   ],
 *   "query_date": "2026-09-28T12:33:00.000Z"
 * }
 *
 * @requires
 * {
 *   "helpers": [
 *     "@helpers/logger"
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
import { asc, isNotNull } from 'drizzle-orm';
import { db } from '@services/dbService';
import { visitInfo } from '@db/schema/visit_info';
import { logger } from '@helpers/logger';

export const authRequired = true;

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
    longitude: 'longitude',
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

export interface ColumnQueryRepository {
    getUniqueValues(columnKey: AllowedVisitInfoColumn): Promise<(string | number | Date)[]>;
}

export const defaultColumnQueryRepository: ColumnQueryRepository = {
    getUniqueValues: async (columnKey: AllowedVisitInfoColumn) => {
        const col = visitInfo[columnKey];
        if (!col) {
            throw new Error(`Invalid column key: ${String(columnKey)}`);
        }

        const rows = await db
            .selectDistinct({ value: col })
            .from(visitInfo)
            .where(isNotNull(col))
            .orderBy(asc(col));

        return rows
            .map((r) => r.value)
            .filter((v): v is string | number | Date => v !== null && v !== undefined)
            .map((v) => (v instanceof Date ? v.toISOString() : v));
    },
};

export function makeGetConfigHandler(repo: ColumnQueryRepository = defaultColumnQueryRepository) {
    return async function GET(req: Request, res: Response): Promise<Response> {
        try {
            const rawColumn = Array.isArray(req.query.column)
                ? req.query.column[0]
                : (req.query.column ?? req.query.name ?? req.query.col);

            if (typeof rawColumn !== 'string' || rawColumn.trim().length === 0) {
                return res.status(400).json({
                    error: 'INVALID_REQUEST',
                    message: 'A valid column parameter is required',
                });
            }

            const trimmedColumn = rawColumn.trim();
            const normalizedKey = trimmedColumn.toLowerCase();
            const mappedColumnKey = COLUMN_MAP[normalizedKey] ?? COLUMN_MAP[trimmedColumn];

            if (!mappedColumnKey) {
                return res.status(400).json({
                    error: 'INVALID_REQUEST',
                    message: `Invalid column name: '${trimmedColumn}'. Allowed columns: ${ALLOWED_COLUMN_NAMES.join(', ')}`,
                });
            }

            const uniqueList = await repo.getUniqueValues(mappedColumnKey);

            return res.status(200).json({
                column: trimmedColumn,
                unique_list: uniqueList,
                query_date: new Date().toISOString(),
            });
        } catch (err) {
            logger.error('GET /v1/clients/joinaunion/visit_info/config error:', err);
            return res.status(500).json({
                error: 'INTERNAL_ERROR',
                message: 'Failed to retrieve unique column values',
            });
        }
    };
}

const GET = makeGetConfigHandler(defaultColumnQueryRepository);
export default GET;

export const __test__ = {
    COLUMN_MAP,
    ALLOWED_COLUMN_NAMES,
    defaultColumnQueryRepository,
    makeGetConfigHandler,
};
