-- Apply after harden_campaign_lead_system.sql.
BEGIN;
CREATE OR REPLACE FUNCTION save_campaign_content(p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cid uuid; item jsonb; pid uuid; test_mode boolean; existing campaigns;
BEGIN
  cid:=coalesce((p->>'id')::uuid,gen_random_uuid());
  SELECT * INTO existing FROM campaigns WHERE id=cid FOR UPDATE;
  -- A test campaign stays a test campaign: use a new live campaign for launch.
  test_mode:=coalesce(existing.is_test,(p->>'is_test')::boolean,false);
  INSERT INTO campaigns(id,name,slug,description,headline,subheadline,cta_text,confirmation_text,status,starts_at,ends_at,is_test)
  VALUES(cid,p->>'name',p->>'slug',p->>'description',p->>'headline',p->>'subheadline',p->>'cta_text',p->>'confirmation_text',
    p->>'status',(p->>'starts_at')::timestamptz,(p->>'ends_at')::timestamptz,test_mode)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name,slug=excluded.slug,description=excluded.description,
    headline=excluded.headline,subheadline=excluded.subheadline,cta_text=excluded.cta_text,confirmation_text=excluded.confirmation_text,
    status=excluded.status,starts_at=excluded.starts_at,ends_at=excluded.ends_at;
  FOR item IN SELECT * FROM jsonb_array_elements(p->'products') LOOP
    pid:=coalesce((item->>'id')::uuid,gen_random_uuid());
    IF EXISTS(SELECT 1 FROM campaign_products WHERE id=pid AND campaign_id<>cid) THEN RAISE EXCEPTION 'INVALID_PRODUCT'; END IF;
    INSERT INTO campaign_products(id,campaign_id,public_name,public_label,short_description,key_benefit,key_differentiator,specifications,
      tradeoff,estimated_price_cents,currency,display_order,image_url,active)
    VALUES(pid,cid,item->>'public_name',item->>'public_label',item->>'short_description',item->>'key_benefit',item->>'key_differentiator',
      item->'specifications',item->>'tradeoff',(item->>'estimated_price_cents')::integer,'SGD',(item->>'display_order')::integer,
      item->>'image_url',(item->>'active')::boolean)
    ON CONFLICT(id) DO UPDATE SET public_name=excluded.public_name,public_label=excluded.public_label,short_description=excluded.short_description,
      key_benefit=excluded.key_benefit,key_differentiator=excluded.key_differentiator,specifications=excluded.specifications,
      tradeoff=excluded.tradeoff,estimated_price_cents=excluded.estimated_price_cents,display_order=excluded.display_order,image_url=excluded.image_url,active=excluded.active;
  END LOOP;
  -- Omitted options are retained, never deleted; existing lead references survive.
  RETURN cid;
END $$;
REVOKE ALL ON FUNCTION save_campaign_content(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION save_campaign_content(jsonb) TO service_role;
COMMIT;
