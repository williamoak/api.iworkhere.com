-- Recreate missing foreign key after successful renames
ALTER TABLE "users"
    ADD CONSTRAINT "users_status_code_fkey"
        FOREIGN KEY ("status_code")
            REFERENCES "public"."user_statuses"("status_code")
            ON DELETE NO ACTION
            ON UPDATE NO ACTION;
