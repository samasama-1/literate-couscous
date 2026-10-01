'use server';
import { revalidatePath } from 'next/cache';
import { verifyAdminAccess } from '@/lib/adminAuth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { record, text, uuid, safeImageUrl } from '@/lib/campaigns/validation';
import { deliverConfirmation } from '@/lib/campaigns/email';
import { demoCampaign, demoProducts } from '@/lib/campaigns/demo';
export async function saveCampaignContent(value: unknown) {
  await verifyAdminAccess();
  try {
    const raw = record(value);
    const id = raw.id ? uuid(raw.id) : null;
    const slug = text(raw.slug,100,true)!;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('Use lowercase words separated by hyphens for the page address.');
    const status = text(raw.status,20,true)!;
    if (!['draft','active','paused','completed','archived'].includes(status)) throw new Error('Invalid campaign status.');
    const date = (value: unknown) => { if (!value) return null; const d = new Date(String(value)); if (!Number.isFinite(d.getTime())) throw new Error('Invalid date.'); return d.toISOString(); };
    const starts = date(raw.starts_at), ends = date(raw.ends_at);
    if (starts && ends && starts>=ends) throw new Error('Closing time must be after opening time.');
    if (!Array.isArray(raw.products) || raw.products.length>20) throw new Error('Use up to 20 product options.');
    const products = raw.products.map((value,i)=>{
      const p = record(value);
      const price = Number(p.price);
      if (!/^\d+(\.\d{1,2})?$/.test(String(p.price)) || !Number.isFinite(price) || price<0 || price>100000) throw new Error('Enter a valid price in SGD with up to two decimal places.');
      const specs = text(p.specifications,1500)?.split('\n').map(s=>s.trim()).filter(Boolean) || [];
      if (specs.length>5) throw new Error('Use no more than five specifications per product.');
      return {id:p.id ? uuid(p.id) : null,public_name:text(p.public_name,100,true),public_label:text(p.public_label,80),
        short_description:text(p.short_description,700),key_benefit:text(p.key_benefit,300),key_differentiator:text(p.key_differentiator,500),
        specifications:specs,tradeoff:text(p.tradeoff,300),estimated_price_cents:Math.round(price*100),display_order:i+1,
        image_url:safeImageUrl(p.image_url),active:p.active===true};
    });
    const names = products.map(p=>p.public_name);
    if (new Set(names).size!==names.length) throw new Error('Give each product a unique public name.');
    if (status==='active' && products.filter(p=>p.active).length<2) throw new Error('Activate at least two options before opening the campaign.');
    const {data,error} = await supabaseAdmin.rpc('save_campaign_content',{p:{id,slug,status,name:text(raw.name,120,true),
      description:text(raw.description,500),headline:text(raw.headline,200,true),subheadline:text(raw.subheadline,1000),
      cta_text:text(raw.cta_text,60,true),confirmation_text:text(raw.confirmation_text,1000),starts_at:starts,ends_at:ends,
      is_test:raw.is_test===true,products}});
    if (error) { console.error('Campaign editor save failed',error.code); return {error:error.code==='23505' ? 'This page address or product name is already in use.' : 'Could not save. Check that all three campaign migrations have been applied.'}; }
    revalidatePath('/campaign','layout');
    revalidatePath('/admin/campaigns','layout');
    return {id:String(data)};
  } catch(e) { return {error:e instanceof Error ? e.message : 'Please check the campaign fields.'}; }
}
export async function createTestCampaign() {
  await verifyAdminAccess();
  // Create a unique draft; never overwrite a campaign the owner already customised.
  return saveCampaignContent({...demoCampaign,id:null,status:'draft',slug:`home-shortlist-test-${Date.now().toString(36)}`,
    products:demoProducts.map(p=>({...p,id:null,price:(p.estimated_price_cents/100).toFixed(2),specifications:(p.specifications as string[]).join('\n')}))});
}
export async function retryConfirmation(formData: FormData) {
  await verifyAdminAccess();
  const id = uuid(formData.get('delivery_id'));
  await deliverConfirmation(id);
  revalidatePath('/admin/campaigns','layout');
}

export async function retryZohoSync(formData: FormData) {
  await verifyAdminAccess();
  const id=uuid(formData.get('lead_id'));
  const {data:lead}=await supabaseAdmin.from('campaign_leads').select('contact_id,campaigns(is_test)').eq('id',id).single();
  if(!lead || lead.campaigns?.is_test) return;
  const {crmDatabase,syncCampaignContact}=await import('@/lib/campaigns/zoho-sync');
  const db=crmDatabase();
  const {error}=await db.rpc('queue_campaign_crm',{p_contact_id:lead.contact_id});
  if(!error) await syncCampaignContact(lead.contact_id);
  revalidatePath(`/admin/campaigns/leads/${id}`);
}
