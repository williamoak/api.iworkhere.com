import { logger } from '@helpers/logger';

/**
 * @myDocBlock
 * @file applyMigration.ts
 * @internal
 * @module Database
 * @tag db, migration
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path src/db/applyMigration.ts
 * @summary Manual SQL migration script for multi-tenant schema setup.
 * @description
 *   Executes necessary SQL to setup tenant schemas (bill, joinaunion, michael),
 *   moves tables, and adds audit logging infrastructure.
 * @query {}
 * @requestExample none
 * @response none
 * @requires {
 *   "database": "CockroachDB/PostgreSQL"
 * }
 */
import "tsconfig-paths/register";
import { pool } from "@services/dbService";
;

async function applyMigration() {
  try {
    // 1. Create tenant schemas
    await pool.query(`CREATE SCHEMA IF NOT EXISTS bill;`);
    await pool.query(`CREATE SCHEMA IF NOT EXISTS joinaunion;`);
    await pool.query(`CREATE SCHEMA IF NOT EXISTS michael;`);

    // 2. Move warframes and weapons
    await pool.query(`ALTER TABLE IF EXISTS public.warframes SET SCHEMA michael;`);
    await pool.query(`ALTER TABLE IF EXISTS public.warframe_weapons SET SCHEMA michael;`);

    // 3. Rename modules if it exists
    await pool.query(`ALTER TABLE IF EXISTS public.modules RENAME TO warframe_modules;`);
    
    // 4. Move renamed table
    await pool.query(`ALTER TABLE IF EXISTS public.warframe_modules SET SCHEMA michael;`);

    // 5. Create/Update visit_info table in joinaunion and public (as fallback)
    const createTableQuery = (schema: string) => `
        CREATE TABLE IF NOT EXISTS ${schema}.visit_info (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            device_id UUID NOT NULL,
            user_id UUID,
            request_method TEXT NOT NULL DEFAULT 'GET',
            touch_time TIMESTAMP WITH TIME ZONE NOT NULL,
            note TEXT
        );

        -- Add columns if they don't exist (for existing tables)
        ALTER TABLE IF EXISTS ${schema}.visit_info ADD COLUMN IF NOT EXISTS user_id UUID;
        ALTER TABLE IF EXISTS ${schema}.visit_info ADD COLUMN IF NOT EXISTS request_method TEXT NOT NULL DEFAULT 'GET';

        -- Create indexes
        CREATE INDEX IF NOT EXISTS visit_info_${schema}_id_idx ON ${schema}.visit_info (id);
        CREATE INDEX IF NOT EXISTS visit_info_${schema}_device_id_idx ON ${schema}.visit_info (device_id);
        CREATE INDEX IF NOT EXISTS visit_info_${schema}_touch_time_idx ON ${schema}.visit_info (touch_time);
        CREATE INDEX IF NOT EXISTS visit_info_${schema}_note_idx ON ${schema}.visit_info (note);
        CREATE INDEX IF NOT EXISTS visit_info_${schema}_device_id_note_idx ON ${schema}.visit_info (device_id, note);
        CREATE INDEX IF NOT EXISTS visit_info_${schema}_device_id_touch_time_idx ON ${schema}.visit_info (device_id, touch_time);
        CREATE INDEX IF NOT EXISTS visit_info_${schema}_user_id_idx ON ${schema}.visit_info (user_id);
        CREATE INDEX IF NOT EXISTS visit_info_${schema}_user_id_request_method_idx ON ${schema}.visit_info (user_id, request_method);
    `;

    await pool.query(createTableQuery('joinaunion'));
    await pool.query(createTableQuery('public'));

    logger.log("Migration applied successfully!");
  } catch (error) {
    logger.error("Error applying migration:", error);
  }
}

applyMigration().catch(logger.error);
