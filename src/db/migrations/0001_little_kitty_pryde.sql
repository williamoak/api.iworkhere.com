CREATE TYPE "public"."module_slot_type" AS ENUM('Aura', 'Exilus', 'General', 'Arcane');--> statement-breakpoint
CREATE TABLE "modules" (
	"mod_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"polarity" text,
	"capacity" integer,
	"type" text NOT NULL,
	"slot_type" "module_slot_type" NOT NULL,
	"description" text,
	"max_rank" integer,
	"current_rank" integer,
	"rank_upgrades" jsonb,
	"locked" jsonb,
	"modify" jsonb
);
