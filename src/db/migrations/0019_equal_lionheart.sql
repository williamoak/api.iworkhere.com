CREATE TABLE "user_auth_oauth" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"email" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_auth_oauth" ADD CONSTRAINT "user_auth_oauth_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_auth_oauth_provider_account_idx" ON "user_auth_oauth" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_auth_oauth_user_provider_idx" ON "user_auth_oauth" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "user_auth_oauth_user_idx" ON "user_auth_oauth" USING btree ("user_id");