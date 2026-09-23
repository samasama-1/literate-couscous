import CampaignLanding from '@/components/campaigns/CampaignLanding';
import { demoCampaign, demoProducts } from '@/lib/campaigns/demo';
export const metadata = {title:'Four-product campaign preview',robots:{index:false,follow:false}};
export default function Page() { return <CampaignLanding campaign={demoCampaign} products={demoProducts} preview />; }
