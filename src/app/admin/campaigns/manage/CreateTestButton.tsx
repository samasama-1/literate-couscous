'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createTestCampaign } from '@/app/actions/campaign-admin';
export default function CreateTestButton() {
  const router=useRouter(); const [pending,setPending]=useState(false);const [error,setError]=useState('');
  return <div><button className="btn btn-secondary" disabled={pending} onClick={async()=>{
    setPending(true); setError('');
    try { const result=await createTestCampaign(); if ('error' in result) setError(result.error || 'Could not create.'); else router.push(`/admin/campaigns/manage/${result.id}`); }
    catch { setError('Could not create the test campaign. Please check setup and try again.'); }
    finally {setPending(false);}
  }}>{pending ? 'Creating…' : 'Create four-product test campaign'}</button>{error && <p role="alert">{error}</p>}</div>;
}
