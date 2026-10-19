-- REVIEW/APPLY SEPARATELY, after operations_export.sql, as postgres.
-- Enable Supabase Cron (pg_cron) via the dashboard first. No HTTP/keys involved.
BEGIN;
DO $$ BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Run as postgres administrator'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_extension WHERE extname='pg_cron') THEN
    RAISE EXCEPTION 'Enable Supabase Cron (pg_cron) first';
  END IF;
END $$;
-- Same job name updates this owner's job rather than duplicating it.
SELECT cron.schedule('operations-export-expiry-cleanup','*/15 * * * *',
  $$SET lock_timeout='2s'; SET statement_timeout='45s'; SELECT public.cleanup_operations_exports();$$);
COMMIT;
