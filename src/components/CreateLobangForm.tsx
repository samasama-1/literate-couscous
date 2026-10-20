import BatchForm from './admin/BatchForm';
import {batchPageTime} from '@/lib/batches/server';
import {publicBatchUrl} from '@/lib/batches/validation';
export default function CreateLobangForm() {
  const date = batchPageTime().defaultClosing;
  const origin = new URL(publicBatchUrl('00000000-0000-4000-8000-000000000000', process.env.NEXT_PUBLIC_SITE_URL || 'https://www.samasama.sg')).origin;
  return <BatchForm publicOrigin={origin} initial={{name: '', description: '', image_url: '', features: '', retail_price: '', target_capacity: 50, deposit_amount: '', tier_1_price: '', tier_2_price: '', tier_3_price: '', closes_at: date, status: 'OPEN'}}/>;
}
