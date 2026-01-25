CREATE TABLE "auth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"token_type" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"replaced_by_token_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_replaced_by_token_id_auth_tokens_id_fk" FOREIGN KEY ("replaced_by_token_id") REFERENCES "public"."auth_tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_tokens_token_hash_idx" ON "auth_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "auth_tokens_user_app_idx" ON "auth_tokens" USING btree ("user_id","application_id");