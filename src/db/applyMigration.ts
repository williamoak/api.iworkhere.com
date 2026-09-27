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

    // 5. Create/Update JoinAUnion visit_info only in the tenant schema
    const createTableQuery = (schema: string) => `
        CREATE TABLE IF NOT EXISTS ${schema}.visit_info (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            device_id UUID NOT NULL,
            user_id UUID,
            request_method TEXT NOT NULL DEFAULT 'GET',
            touch_time TIMESTAMP WITH TIME ZONE NOT NULL,
            latitude DOUBLE PRECISION,
            longitude DOUBLE PRECISION,
            location_source VARCHAR(32),
            city VARCHAR(128),
            country VARCHAR(128),
            region VARCHAR(128),
            note TEXT
        );

        -- Add columns if they don't exist (for existing tables)
        ALTER TABLE IF EXISTS ${schema}.visit_info ADD COLUMN IF NOT EXISTS user_id UUID;
        ALTER TABLE IF EXISTS ${schema}.visit_info ADD COLUMN IF NOT EXISTS request_method TEXT NOT NULL DEFAULT 'GET';
        ALTER TABLE IF EXISTS ${schema}.visit_info ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
        ALTER TABLE IF EXISTS ${schema}.visit_info ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
        ALTER TABLE IF EXISTS ${schema}.visit_info ADD COLUMN IF NOT EXISTS location_source VARCHAR(32);
        ALTER TABLE IF EXISTS ${schema}.visit_info ADD COLUMN IF NOT EXISTS city VARCHAR(128);
        ALTER TABLE IF EXISTS ${schema}.visit_info ADD COLUMN IF NOT EXISTS country VARCHAR(128);
        ALTER TABLE IF EXISTS ${schema}.visit_info ADD COLUMN IF NOT EXISTS region VARCHAR(128);

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

    // 6. Add city, country, region columns to joinaunion.visit_info
    await pool.query(`ALTER TABLE IF EXISTS joinaunion.visit_info ADD COLUMN IF NOT EXISTS city VARCHAR(128);`);
    await pool.query(`ALTER TABLE IF EXISTS joinaunion.visit_info ADD COLUMN IF NOT EXISTS country VARCHAR(128);`);
    await pool.query(`ALTER TABLE IF EXISTS joinaunion.visit_info ADD COLUMN IF NOT EXISTS region VARCHAR(128);`);

    // 7. Backfill country, region, and city for existing visit_info records
    await pool.query(`
      UPDATE joinaunion.visit_info
      SET country = 'CA', region = 'British Columbia'
      WHERE city = 'Vancouver' AND (country IS NULL OR region IS NULL);
    `);
    await pool.query(`
      UPDATE joinaunion.visit_info
      SET country = 'CA', region = 'Alberta'
      WHERE city = 'Edmonton' AND (country IS NULL OR region IS NULL);
    `);
    await pool.query(`
      UPDATE joinaunion.visit_info
      SET city = 'Edmonton', country = 'CA', region = 'Alberta'
      WHERE latitude > 53 AND latitude < 54 AND longitude > -114 AND longitude < -113 AND (city IS NULL OR country IS NULL OR region IS NULL);
    `);
    await pool.query(`
      UPDATE joinaunion.visit_info
      SET city = 'Vancouver', country = 'CA', region = 'British Columbia'
      WHERE latitude > 49 AND latitude < 50 AND longitude > -124 AND longitude < -123 AND (city IS NULL OR country IS NULL OR region IS NULL);
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS joinaunion.user_devices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        device_id UUID NOT NULL,
        first_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        linked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        revoked_at TIMESTAMP WITH TIME ZONE,
        linkage_source TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS user_devices_account_id_device_id_idx ON joinaunion.user_devices (account_id, device_id);
      CREATE INDEX IF NOT EXISTS user_devices_account_id_active_idx ON joinaunion.user_devices (account_id, revoked_at);
      CREATE INDEX IF NOT EXISTS user_devices_device_id_idx ON joinaunion.user_devices (device_id);
      CREATE UNIQUE INDEX IF NOT EXISTS user_devices_active_device_unique ON joinaunion.user_devices (device_id) WHERE revoked_at IS NULL;
      CREATE INDEX IF NOT EXISTS location_source_device_touch_idx ON joinaunion.visit_info (location_source, device_id, touch_time);

      CREATE TABLE IF NOT EXISTS joinaunion.widget_answers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        recipient VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        province VARCHAR(128) NOT NULL,
        industry VARCHAR(128) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS widget_answers_recipient_created_at_idx ON joinaunion.widget_answers (recipient, created_at);
      CREATE INDEX IF NOT EXISTS widget_answers_email_idx ON joinaunion.widget_answers (email);
      CREATE INDEX IF NOT EXISTS widget_answers_province_industry_idx ON joinaunion.widget_answers (province, industry);
      CREATE INDEX IF NOT EXISTS widget_answers_created_at_idx ON joinaunion.widget_answers (created_at);
    `);

    logger.log("Migration applied successfully!");
  } catch (error) {
    logger.error("Error applying migration:", error);
  }
}

applyMigration().catch(logger.error);
