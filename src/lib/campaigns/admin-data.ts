import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { funnelStatusLabels, type CampaignLead, type CampaignProduct, type Campaign, type Contact, type PurchaseIntent, type FunnelStatus } from './types';
export type LeadRow = CampaignLead & {contacts:Contact|null;campaign_products:Pick<CampaignProduct,'id'|'public_name'>|null;campaigns:Pick<Campaign,'id'|'name'|'slug'|'status'|'is_test'>|null};
export type Filters = {campaign:string;product:string;intent:string;status:string;source:string;search:string;from:string;to:string;utm_campaign:string;creative:string;mode:string};
export function normalizeFilters(params:Record<string,string|string[]|undefined>):Filters {
  const get = (key:string) => { const v=params[key];return (Array.isArray(v) ? v[0] : v)?.trim().slice(0,254) || ''; };
  const values = Object.fromEntries(['campaign','product','intent','status','source','search','utm_campaign','creative'].map(k=>[k,get(k)]));
  const date = (key:string) => /^\d{4}-\d{2}-\d{2}$/.test(get(key)) ? get(key) : '';
  return {...values,from:date('from'),to:date('to'),mode:get('mode')==='test' ? 'test' : get('mode')==='all' ? 'all' : 'live'} as Filters;
}
export function dateStart(value:string) {return `${value}T00:00:00+08:00`;}
export function dateEnd(value:string) {return `${value}T23:59:59.999+08:00`;}
// Fetch every page: counts, search and export must never silently use a capped subset.
// Keep chunks below the usual PostgREST maximum. Move aggregation into SQL if scale demands it.
export async function getLeads(filters:Filters) {
  const all:LeadRow[]=[];
  for (let offset=0;;offset+=500) {
    let query=supabaseAdmin.from('campaign_leads').select('*,contacts(*),campaigns!inner(id,name,slug,status,is_test),campaign_products(id,public_name)').order('created_at',{ascending:false}).order('id').range(offset,offset+499);
    if (filters.mode!=='all') query=query.eq('campaigns.is_test',filters.mode==='test');
    if (filters.campaign) query=query.eq('campaign_id',filters.campaign);
    if (filters.product) query=query.eq('selected_campaign_product_id',filters.product);
    if (['yes','maybe','no'].includes(filters.intent)) query=query.eq('purchase_intent',filters.intent as PurchaseIntent);
    if (Object.hasOwn(funnelStatusLabels,filters.status)) query=query.eq('funnel_status',filters.status as FunnelStatus);
    if (filters.source) query=query.eq('utm_source',filters.source);
    if (filters.utm_campaign) query=query.eq('utm_campaign',filters.utm_campaign);
    if (filters.creative) query=query.eq('utm_content',filters.creative);
    if (filters.from) query=query.gte('created_at',dateStart(filters.from));
    if (filters.to) query=query.lte('created_at',dateEnd(filters.to));
    const {data,error}=await query;
    if (error) throw new Error('Could not load leads. Check database setup.');
    all.push(...(data as unknown as LeadRow[] || []));
    if (!data?.length) break;
  }
  const search=filters.search.toLowerCase();
  return all.filter(l=>!search || l.contacts?.email_normalized.includes(search) || l.contacts?.phone?.toLowerCase().includes(search));
}
export async function getVisitorCount(filters:Filters, campaignIds:string[]) {
  if (!campaignIds.length) return 0;
  const visitors=new Set<string>();
  for (let offset=0;;offset+=500) {
    let query=supabaseAdmin.from('funnel_events').select('id,campaign_id,anonymous_session_id').eq('event_type','campaign_view').in('campaign_id',campaignIds).order('id').range(offset,offset+499);
    if (filters.from) query=query.gte('created_at',dateStart(filters.from));
    if (filters.to) query=query.lte('created_at',dateEnd(filters.to));
    if (filters.source) query=query.eq('metadata->>utm_source',filters.source);
    if (filters.utm_campaign) query=query.eq('metadata->>utm_campaign',filters.utm_campaign);
    if (filters.creative) query=query.eq('metadata->>utm_content',filters.creative);
    const {data,error}=await query;
    if (error) throw new Error('Could not load visitor counts.');
    for (const e of data || []) if(e.anonymous_session_id) visitors.add(`${e.campaign_id}:${e.anonymous_session_id}`);
    if (!data?.length) break;
  }
  return visitors.size;
}
