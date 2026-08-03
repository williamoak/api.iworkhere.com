import "tsconfig-paths/register";
import { pool } from "@services/dbService";

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

    // 5. Create/Update joinaunion.visit_info table
    await pool.query(`
        CREATE TABLE IF NOT EXISTS joinaunion.visit_info (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            device_id UUID NOT NULL,
            user_id UUID,
            request_method TEXT NOT NULL DEFAULT 'GET',
            touch_time TIMESTAMP WITH TIME ZONE NOT NULL,
            note TEXT
        );

        -- Add columns if they don't exist (for existing tables)
        ALTER TABLE IF EXISTS joinaunion.visit_info ADD COLUMN IF NOT EXISTS user_id UUID;
        ALTER TABLE IF EXISTS joinaunion.visit_info ADD COLUMN IF NOT EXISTS request_method TEXT NOT NULL DEFAULT 'GET';

        -- Create indexes
        CREATE INDEX IF NOT EXISTS visit_info_id_idx ON joinaunion.visit_info (id);
        CREATE INDEX IF NOT EXISTS visit_info_device_id_idx ON joinaunion.visit_info (device_id);
        CREATE INDEX IF NOT EXISTS visit_info_touch_time_idx ON joinaunion.visit_info (touch_time);
        CREATE INDEX IF NOT EXISTS visit_info_note_idx ON joinaunion.visit_info (note);
        CREATE INDEX IF NOT EXISTS visit_info_device_id_note_idx ON joinaunion.visit_info (device_id, note);
        CREATE INDEX IF NOT EXISTS visit_info_device_id_touch_time_idx ON joinaunion.visit_info (device_id, touch_time);
        CREATE INDEX IF NOT EXISTS visit_info_user_id_idx ON joinaunion.visit_info (user_id);
        CREATE INDEX IF NOT EXISTS visit_info_user_id_request_method_idx ON joinaunion.visit_info (user_id, request_method);
    `);

    console.log("Migration applied successfully!");
  } catch (error) {
    console.error("Error applying migration:", error);
  }
}

applyMigration().catch(console.error);
