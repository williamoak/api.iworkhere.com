CREATE TABLE "user_auth_local" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_auth_local" ADD CONSTRAINT "user_auth_local_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_auth_local_user_idx" ON "user_auth_local" USING btree ("user_id");