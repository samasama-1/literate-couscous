'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveCampaignContent } from '@/app/actions/campaign-admin';
import type { Campaign, CampaignProduct } from '@/lib/campaigns/types';
const blank = () => ({id:'',public_name:'',public_label:'',short_description:'',key_benefit:'',key_differentiator:'',specifications:'',tradeoff:'',price:'99.00',image_url:'',active:true});
function singaporeTime(value: string | null | undefined) { return value ? new Date(Date.parse(value)+8*60*60*1000).toISOString().slice(0,16) : ''; }
export default function CampaignEditor({campaign,products=[]}:{campaign?:Campaign;products?:CampaignProduct[]}) {
  const router = useRouter();
  const [options,setOptions] = useState<ReturnType<typeof blank>[]>(products.map(p=>({...blank(),...p,public_label:p.public_label || '',short_description:p.short_description || '',key_benefit:p.key_benefit || '',key_differentiator:p.key_differentiator || '',tradeoff:p.tradeoff || '',image_url:p.image_url || '',price:(p.estimated_price_cents/100).toFixed(2),specifications:Array.isArray(p.specifications) ? p.specifications.join('\n') : ''})));
  const [error,setError] = useState('');
  const [saved,setSaved] = useState(false);
  const [pending,setPending] = useState(false);
  async function save(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setPending(true); setError(''); setSaved(false);
    const form = new FormData(e.currentTarget);
    const values = Object.fromEntries(form);
    try {
      const result = await saveCampaignContent({...values,id:campaign?.id,is_test:campaign?.is_test || form.get('is_test')==='on',products:options,
        starts_at:values.starts_at ? `${values.starts_at}:00+08:00` : null,ends_at:values.ends_at ? `${values.ends_at}:00+08:00` : null});
      if ('error' in result) setError(result.error || 'Could not save.');
      else { setSaved(true); router.replace(`/admin/campaigns/manage/${result.id}`); router.refresh(); }
    } catch { setError('Connection interrupted. Please reload to check whether the save completed before creating another page.'); }
    finally { setPending(false); }
  }
  function move(index:number,delta:number) { setOptions(current=>{const next=[...current]; [next[index],next[index+delta]]=[next[index+delta],next[index]];return next;}); }
  return <div className="container-site campaign-editor" style={{maxWidth:1000,padding:'2rem 1rem 4rem'}}>
    <Link href="/admin/campaigns/manage">← Campaign pages</Link>
    <h1>{campaign ? 'Edit campaign page' : 'Create campaign page'}</h1>
    <p>Save as a draft while preparing. Choose Active when the page is ready for visitors. All times below are Singapore time.</p>
    {campaign && <p><Link href={`/admin/campaigns/preview/${campaign.id}`}>Preview saved page</Link> · <Link href={`/campaign/${campaign.slug}`}>Public page</Link></p>}
    <form onSubmit={save}><fieldset disabled={pending} style={{border:0,padding:0}}>
      <section><h2>Page content</h2>
        <label>Internal campaign name<input name="name" required maxLength={120} defaultValue={campaign?.name} /></label>
        <label>Page address: /campaign/<input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={100} defaultValue={campaign?.slug} placeholder="first-home-drop" /></label>
        <p>Keep this address unchanged after sharing links or starting ads.</p>
        <label>Headline<input name="headline" required maxLength={200} defaultValue={campaign?.headline || 'You choose what we bring in next.'} /></label>
        <label>Introduction<textarea name="subheadline" rows={3} maxLength={1000} defaultValue={campaign?.subheadline || ''} /></label>
        <label>Search/share description<textarea name="description" maxLength={500} defaultValue={campaign?.description || ''} /></label>
        <label>Submit button text<input name="cta_text" required maxLength={60} defaultValue={campaign?.cta_text || 'Register my pick'} /></label>
        <label>Success message<textarea name="confirmation_text" maxLength={1000} defaultValue={campaign?.confirmation_text || 'Thanks for helping us choose our next drop. Your pick has been recorded.'} /></label>
      </section>
      <section><h2>Availability</h2><label>Status<select name="status" defaultValue={campaign?.status || 'draft'}>{['draft','active','paused','completed','archived'].map(s=><option key={s}>{s}</option>)}</select></label>
        <label>Opens at (optional, Singapore)<input type="datetime-local" name="starts_at" defaultValue={singaporeTime(campaign?.starts_at)} /></label>
        <label>Closes at (optional, Singapore)<input type="datetime-local" name="ends_at" defaultValue={singaporeTime(campaign?.ends_at)} /></label>
        {!campaign ? <label><span><input type="checkbox" name="is_test" /> Test campaign — store test picks, send no emails</span></label> : <p>{campaign.is_test ? 'Test campaign: no emails. Create a separate live campaign when ready.' : 'Live campaign: registration confirmations use your email configuration.'}</p>}
      </section>
      <h2>Product options</h2><p>Use public names and verified specifications. Prices are estimates in SGD. Hide an option instead of deleting it to preserve lead history.</p>
      {options.map((p,i)=><section key={p.id || `new-${i}`}>
        <h3>Option {i+1}: {p.public_name || 'New product'}</h3>
        {(['public_name','public_label','short_description','key_benefit','key_differentiator','tradeoff','price','image_url'] as const).map(key=><label key={key}>{({public_name:'Public name',public_label:'Category / label',short_description:'Short description',key_benefit:'Best for',key_differentiator:'Why shortlisted',tradeoff:'Trade-off',price:'Estimated price (SGD)',image_url:'Image URL (HTTPS or /local-path)'})[key]}
          <input required={key==='public_name' || key==='price'} value={p[key]} type={key==='price' ? 'number' : 'text'} min={key==='price' ? 0 : undefined} step={key==='price' ? '.01' : undefined} onChange={e=>setOptions(current=>current.map((x,j)=>j===i ? {...x,[key]:e.target.value} : x))} />
        </label>)}
        <label>Specifications — one per line, maximum five<textarea rows={5} value={p.specifications} onChange={e=>setOptions(current=>current.map((x,j)=>j===i ? {...x,specifications:e.target.value} : x))} /></label>
        <label><span><input type="checkbox" checked={p.active} onChange={e=>setOptions(current=>current.map((x,j)=>j===i ? {...x,active:e.target.checked} : x))} /> Show this option</span></label>
        <div className="editor-buttons"><button type="button" className="btn btn-secondary" disabled={i===0} onClick={()=>move(i,-1)}>Move up</button><button type="button" className="btn btn-secondary" disabled={i===options.length-1} onClick={()=>move(i,1)}>Move down</button>{!p.id && <button type="button" className="btn btn-secondary" onClick={()=>setOptions(current=>current.filter((_,j)=>j!==i))}>Remove unsaved option</button>}</div>
      </section>)}
      <button type="button" className="btn btn-secondary" disabled={options.length>=20} onClick={()=>setOptions(current=>[...current,blank()])}>Add product option</button>
      <div className="editor-buttons"><button className="btn btn-primary" type="submit">{pending ? 'Saving…' : 'Save campaign'}</button></div>
    </fieldset></form>
    <div aria-live="polite">{error && <p role="alert" style={{color:'var(--color-error)'}}>{error}</p>}{saved && <p>Saved. Preview the page to check your content.</p>}</div>
    <style>{`.campaign-editor h1,.campaign-editor h2{margin:1rem 0}.campaign-editor section{background:white;border:1px solid var(--color-border);padding:1.5rem;border-radius:12px;margin:1rem 0}.campaign-editor label{display:grid;gap:.4rem;margin:1rem 0;font-weight:600}.campaign-editor input:not([type=checkbox]),.campaign-editor textarea,.campaign-editor select{width:100%;padding:.8rem;border:1px solid var(--color-border);border-radius:6px;font:inherit}.editor-buttons{display:flex;gap:.75rem;flex-wrap:wrap;margin-top:1rem}`}</style>
  </div>;
}
