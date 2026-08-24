CREATE TABLE IF NOT EXISTS "localizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"lang" text NOT NULL,
	"language_name" text,
	"text" text NOT NULL,
	"codepage" text DEFAULT 'UTF-8',
	"direction" text DEFAULT 'ltr',
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "localizations_slug_lang_unique" ON "localizations" USING btree ("slug","lang");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "localizations_slug_idx" ON "localizations" USING btree ("slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "localizations_lang_idx" ON "localizations" USING btree ("lang");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "localizations_lang_slug_idx" ON "localizations" USING btree ("lang","slug");
