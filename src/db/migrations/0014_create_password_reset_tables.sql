CREATE TABLE "password_reset_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"challenge" text NOT NULL,
	"response_hash" text NOT NULL,
	"verified_at" timestamp with time zone,
	"email_token_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_password_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "password_reset_requests" ADD CONSTRAINT "password_reset_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_password_history" ADD CONSTRAINT "user_password_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "password_reset_requests_user_idx" ON "password_reset_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "password_reset_requests_email_token_idx" ON "password_reset_requests" USING btree ("email_token_hash");--> statement-breakpoint
CREATE INDEX "user_password_history_user_idx" ON "user_password_history" USING btree ("user_id");