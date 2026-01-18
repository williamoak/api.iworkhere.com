CREATE TYPE "public"."auth_provider" AS ENUM('local', 'certificate', 'oauth', 'sso');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'disabled', 'locked', 'pending');--> statement-breakpoint
CREATE TABLE "users" (
	"user_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text,
	"password_hash" text,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"auth_provider" "auth_provider" DEFAULT 'local' NOT NULL,
	"identity_claims" jsonb,
	"email_verified" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
