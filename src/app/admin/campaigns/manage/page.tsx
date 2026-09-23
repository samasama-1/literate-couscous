import Link from 'next/link';
import { verifyAdminAccess } from '@/lib/adminAuth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import CreateTestButton from './CreateTestButton';
export default async function Page() {
  await verifyAdminAccess();
  const {data:campaigns,error}=await supabaseAdmin.from('campaigns').select('*').order('created_at',{ascending:false});
  return <div className="container-site" style={{padding:'3rem 1rem',maxWidth:1000}}>
    <Link href="/admin/campaigns">← Lead dashboard</Link><h1 style={{margin:'1rem 0'}}>Campaign pages</h1>
    <p>Create a draft, edit its product cards, preview it, then activate it when ready. <Link href="/admin/campaigns/guide">Read the owner guide</Link>.</p>
    <div style={{display:'flex',gap:'1rem',flexWrap:'wrap',margin:'1.5rem 0'}}><Link className="btn btn-primary" href="/admin/campaigns/manage/new">Create live campaign</Link><CreateTestButton /><Link className="btn btn-secondary" href="/campaign-preview">Open shortlist preview</Link></div>
    {error && <p role="alert">Could not load campaign pages. Apply the campaign migrations before using the editor.</p>}
    <div style={{display:'grid',gap:'1rem'}}>{campaigns?.map(c=><section key={c.id} style={{background:'white',border:'1px solid var(--color-border)',borderRadius:12,padding:'1.5rem'}}><h2>{c.name}</h2><p>{c.status} · {c.is_test ? 'Test — no emails' : 'Live'} · /campaign/{c.slug}</p><Link href={`/admin/campaigns/manage/${c.id}`}>Edit content</Link> · <Link href={`/admin/campaigns/preview/${c.id}`}>Preview saved page</Link></section>)}</div>
  </div>;
}
