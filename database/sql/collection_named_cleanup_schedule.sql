-- REVIEW ONLY. Creates a PAUSED job; no customer data is deleted by installation.
-- Apply/activate separately as postgres, only after retention and production rollout approval.
BEGIN;
DO $$DECLARE existing bigint;BEGIN
 IF current_user<>'postgres'OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_extension WHERE extname='pg_cron')THEN RAISE EXCEPTION 'Requires postgres and Cron';END IF;
 SELECT jobid INTO existing FROM cron.job WHERE jobname='samasama-named-collector-cleanup';
 IF existing IS NULL THEN
 SELECT cron.schedule('samasama-named-collector-cleanup','*/15 * * * *',$job$SET lock_timeout='2s';SET statement_timeout='10s';SELECT public.cleanup_named_collectors(500);$job$)INTO existing;
 PERFORM cron.alter_job(existing,active:=false);
 END IF;
END$$;
COMMIT;
