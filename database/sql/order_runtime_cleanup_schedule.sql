-- REVIEW/APPLY SEPARATELY as postgres. Creates a PAUSED bounded cleanup job; no customer/financial rows deleted.
BEGIN;
DO $$DECLARE existing bigint;BEGIN
 IF current_user<>'postgres' OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_extension WHERE extname='pg_cron')THEN RAISE EXCEPTION 'Requires postgres and Cron';END IF;
 SELECT jobid INTO existing FROM cron.job WHERE jobname='samasama-runtime-cleanup';
 IF existing IS NULL THEN
 SELECT cron.schedule('samasama-runtime-cleanup','*/15 * * * *',
 $job$SET lock_timeout='2s';SET statement_timeout='10s';SELECT public.cleanup_order_runtime(500);$job$)INTO existing;
 PERFORM cron.alter_job(existing,active:=false);
 END IF;
END$$;
COMMIT;
