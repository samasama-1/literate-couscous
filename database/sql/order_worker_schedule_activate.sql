-- Activation sends queued operational messages/syncs. Owner approved worker scheduling.
-- Put the existing production ORDER_WORKER_SECRET into Vault as order_worker_secret first.
BEGIN;
DO $$ DECLARE worker text; target bigint; BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Run as postgres administrator'; END IF;
 IF NOT EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name='order_worker_secret' AND decrypted_secret~'^[a-fA-F0-9]{64}$') THEN RAISE EXCEPTION 'Save the production worker secret in Vault before activation'; END IF;
 FOR worker IN SELECT unnest(ARRAY['email','crm']) LOOP
  SELECT jobid INTO target FROM cron.job WHERE jobname='samasama-order-'||worker;
  IF target IS NULL THEN RAISE EXCEPTION 'Install worker schedules first'; END IF;
  PERFORM cron.alter_job(target,active:=true);
 END LOOP;
END $$;
COMMIT;
