-- READ ONLY. Metadata checks after campaign_registration_safety.sql; no sends or claims.
BEGIN READ ONLY;
SET LOCAL statement_timeout='10s';
WITH expected(signature) AS (VALUES
 ('public.register_campaign_intent(jsonb)'),
 ('public.register_campaign_intent_v2(jsonb,jsonb)'),
 ('public.claim_campaign_confirmations(integer)'),
 ('public.finish_campaign_confirmation_claim(uuid,uuid)'),
 ('public.cleanup_campaign_registration(integer)'),
 ('public.campaign_rate_limit(text,integer,integer)'),
 ('public.record_campaign_confirmation_run(jsonb)'),
 ('public.campaign_confirmation_report()')
), resolved AS (SELECT signature,to_regprocedure(signature)::oid AS oid FROM expected)
SELECT r.signature,r.oid IS NOT NULL AS installed,pg_get_userbyid(p.proowner) AS owner,
 p.prosecdef AS security_definer,p.proconfig AS settings,
 CASE WHEN r.oid IS NOT NULL THEN has_function_privilege('anon',r.oid,'EXECUTE') END AS anon_can_execute,
 CASE WHEN r.oid IS NOT NULL THEN has_function_privilege('authenticated',r.oid,'EXECUTE') END AS authenticated_can_execute,
 CASE WHEN r.oid IS NOT NULL THEN has_function_privilege('service_role',r.oid,'EXECUTE') END AS service_can_execute
FROM resolved r LEFT JOIN pg_catalog.pg_proc p ON p.oid=r.oid ORDER BY r.signature;

SELECT c.relname,c.relrowsecurity AS rls_enabled,
 has_table_privilege('anon',c.oid,'SELECT') AS anon_can_select,
 has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated_can_select,
 has_table_privilege('service_role',c.oid,'SELECT') AS service_can_select
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public'AND c.relname='campaign_confirmation_run';

SELECT indexname FROM pg_catalog.pg_indexes WHERE schemaname='public' AND indexname IN
 ('campaign_contact_confirmation','campaign_safe_retry_due','campaign_unlinked_session_events','campaign_limit_expiry','campaign_confirmation_recent')
ORDER BY indexname;
SELECT to_regclass('public.campaign_owner_requests') IS NULL
 AND to_regprocedure('public.register_campaign_intent_v2(jsonb,jsonb,jsonb)') IS NULL
 AS no_superseded_owner_flow;
ROLLBACK;
