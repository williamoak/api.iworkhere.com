CREATE TABLE "warframe_weapons" (
	"weapon_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"class" text NOT NULL,
	"description" text,
	"weapon_mods" jsonb
);
