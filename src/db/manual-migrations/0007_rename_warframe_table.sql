-- 0007_rename_warframe_table.sql
-- Purpose: Rename warframes table to warframes for naming consistency

ALTER TABLE IF EXISTS warframe
    RENAME TO warframes;
