-- @myDocBlock v2.1
-- file: 000X_add_entity_uniqueness.sql
-- summary: Add uniqueness constraints for PUT idempotency
-- description:
-- Enforces database-level uniqueness to guarantee idempotent PUT semantics
-- for warframes, weapons, and modules.

-- =========================
-- WARFRAMES
-- =========================
CREATE UNIQUE INDEX IF NOT EXISTS warframes_name_class_uidx
    ON warframes (name, class);

-- =========================
-- WEAPONS
-- =========================
CREATE UNIQUE INDEX IF NOT EXISTS weapons_name_class_uidx
    ON weapons (name, class);

-- =========================
-- MODULES
-- =========================
CREATE UNIQUE INDEX IF NOT EXISTS modules_name_uidx
    ON modules (name);
