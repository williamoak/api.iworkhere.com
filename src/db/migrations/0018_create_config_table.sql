CREATE TABLE "config" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"value" jsonb NOT NULL,
	"version" numeric(5, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "config_name_version_unique" ON "config" USING btree ("name","version");--> statement-breakpoint
CREATE INDEX "config_name_idx" ON "config" USING btree ("name");--> statement-breakpoint
CREATE INDEX "config_name_version_idx" ON "config" USING btree ("name","version");