-- Create tenant schemas
CREATE SCHEMA IF NOT EXISTS bill;
CREATE SCHEMA IF NOT EXISTS joinaunion;
CREATE SCHEMA IF NOT EXISTS michael;

-- Move tables to michael schema (assuming they are in public)
-- Use IF EXISTS to be safe during development/retry
ALTER TABLE IF EXISTS public.warframes SET SCHEMA michael;
ALTER TABLE IF EXISTS public.warframe_weapons SET SCHEMA michael;

-- Move modules first, then rename it within the target schema
ALTER TABLE IF EXISTS public.modules SET SCHEMA michael;
ALTER TABLE IF EXISTS michael.modules RENAME TO warframe_modules;
