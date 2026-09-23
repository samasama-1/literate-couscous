import { notFound } from 'next/navigation';
import { verifyAdminAccess } from '@/lib/adminAuth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import CampaignEditor from '../CampaignEditor';
export default async function Page({params}:{params:Promise<{id:string}>}) {
  await verifyAdminAccess();
  const {id} = await params;
  if (id==='new') return <CampaignEditor />;
  const [{data:campaign,error},{data:products,error:productError}] = await Promise.all([
    supabaseAdmin.from('campaigns').select('*').eq('id',id).maybeSingle(),
    supabaseAdmin.from('campaign_products').select('*').eq('campaign_id',id).order('display_order'),
  ]);
  if (error || productError) throw new Error('Unable to load the campaign editor. Check the campaign database setup.');
  if (!campaign) notFound();
  return <CampaignEditor key={campaign.updated_at} campaign={campaign} products={products || []} />;
}
