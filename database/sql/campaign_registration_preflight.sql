-- READ ONLY. Run as postgres in the intended project before campaign_registration_safety.sql.
-- This checks schema/ACL metadata, not Vercel settings, provider limits, function bodies or inbox delivery.
BEGIN READ ONLY;
SET LOCAL statement_timeout='10s';
SELECT current_user AS database_role, current_database() AS database_name;

WITH required(signature) AS (VALUES
 ('public.register_campaign_intent(jsonb)'),
 ('public.register_campaign_intent_discount(jsonb,jsonb)'),
 ('public.campaign_discount_mail(uuid)'),
 ('public.campaign_discount_offer()'),
 ('public.claim_campaign_crm(uuid)'),
 ('public.begin_campaign_mail_send(uuid,timestamp with time zone)'),
 ('public.claim_order_jobs_v2(text,integer)'),
 ('public.order_runtime_report()')
), resolved AS (SELECT signature,to_regprocedure(signature)::oid AS oid FROM required)
SELECT r.signature, r.oid IS NOT NULL AS installed,
 pg_get_userbyid(p.proowner) AS owner,p.prosecdef AS security_definer,p.proconfig AS settings,
 CASE WHEN r.oid IS NOT NULL THEN has_function_privilege('anon',r.oid,'EXECUTE') END AS anon_can_execute,
 CASE WHEN r.oid IS NOT NULL THEN has_function_privilege('authenticated',r.oid,'EXECUTE') END AS authenticated_can_execute,
 CASE WHEN r.oid IS NOT NULL THEN has_function_privilege('service_role',r.oid,'EXECUTE') END AS service_can_execute
FROM resolved r LEFT JOIN pg_catalog.pg_proc p ON p.oid=r.oid ORDER BY r.signature;

SELECT to_regclass('public.campaign_owner_requests') IS NULL
 AND to_regprocedure('public.register_campaign_intent_v2(jsonb,jsonb,jsonb)') IS NULL
 AS no_superseded_owner_flow;
-- Missing prerequisites, unexpected public EXECUTE or an old owner schema => stop and review.
-- Never select Vault, credentials, private URLs or customer rows to diagnose installation.
ROLLBACK;
