ALTER TABLE public.password_reset_tokens
    ADD COLUMN IF NOT EXISTS application_id UUID;

ALTER TABLE public.password_reset_tokens
    ADD CONSTRAINT IF NOT EXISTS password_reset_tokens_application_id_fkey
    FOREIGN KEY (application_id)
    REFERENCES public.applications(id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS password_reset_tokens_application_id_idx
    ON public.password_reset_tokens (application_id);