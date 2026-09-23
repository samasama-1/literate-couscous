import { notFound } from 'next/navigation';
import { verifyAdminAccess } from '@/lib/adminAuth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import CampaignLanding from '@/components/campaigns/CampaignLanding';
export default async function Page({params}:{params:Promise<{id:string}>}) {
  await verifyAdminAccess();
  const {id}=await params;
  const [{data:campaign},{data:products}]=await Promise.all([
    supabaseAdmin.from('campaigns').select('*').eq('id',id).maybeSingle(),
    supabaseAdmin.from('campaign_products').select('*').eq('campaign_id',id).eq('active',true).order('display_order'),
  ]);
  if (!campaign) notFound();
  return <CampaignLanding campaign={campaign} products={products || []} preview />;
}
