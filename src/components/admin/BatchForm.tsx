'use client';
import {useActionState} from 'react';
import Link from 'next/link';
import BatchShareLinks from './BatchShareLinks';
import {saveBatch, deleteEmptyBatch, approveBatch, type BatchResult} from '@/app/actions/batches';
import styles from './workspace.module.css';
import {launchBatchPresets} from '@/lib/batches/pricing';
export type BatchFields = {id?: string; revision?: number; name: string; description: string; image_url: string; features: string; retail_price: string; target_capacity: number; minimum_verified_units: number | null; tier_2_start: number | null; tier_3_start: number | null; deposit_amount: string; tier_1_price: string; tier_2_price: string; tier_3_price: string; closes_at: string; status: 'OPEN' | 'CLOSED' | 'DELIVERED'};
export default function BatchForm({initial, pricesLocked = false, publicOrigin}: {initial: BatchFields; pricesLocked?: boolean; publicOrigin: string}) {
  const [result, action, pending] = useActionState<BatchResult, FormData>(saveBatch, {});
  if (!initial.id && result.id) return <div className={styles.notice} role="status"><h3>Batch created</h3><p>{result.success}</p><BatchShareLinks url={`${publicOrigin}/group-buys/${result.id}`}/><div className={styles.actions}><Link href={`/admin/batches/${result.id}`} className={styles.primaryButton}>Manage batch & copy link →</Link><Link href={`/group-buys/${result.id}`} className={styles.button} target="_blank" rel="noreferrer">Open public page ↗</Link></div></div>;
  return <form action={action} className={styles.batchForm}>
    {!initial.id && <label>Approved launch product pricing<select defaultValue="" onChange={e => {
      const preset=launchBatchPresets[e.target.value as keyof typeof launchBatchPresets];
      if(!preset)return;
      for(const [name,value] of Object.entries(preset)){
        const field=e.currentTarget.form?.elements.namedItem(name);
        if(field instanceof HTMLInputElement)field.value=value;
      }
    }}><option value="">Enter manually, or choose a preset</option>{Object.entries(launchBatchPresets).map(([key,p])=><option key={key} value={key}>{p.name}</option>)}</select><small>Fills approved prices, deposit, minimum and hard limit. Review before saving.</small></label>}
    {initial.id && <><input type="hidden" name="id" value={initial.id}/><input type="hidden" name="revision" value={initial.revision}/></>}
    <section><h2>Product details</h2><p>These details appear on the public batch page.</p><div className={styles.batchFields}>
      <label className={styles.fullField}>Product name<input name="name" required maxLength={150} defaultValue={initial.name}/></label>
      <label className={styles.fullField}>Description<textarea name="description" required rows={4} maxLength={10000} defaultValue={initial.description}/></label>
      <label>Retail price · SGD (optional)<input name="retail_price" type="number" min="0" max="1000000" step="0.01" defaultValue={initial.retail_price}/></label>
      <label>Image URL (optional)<input name="image_url" maxLength={2048} defaultValue={initial.image_url} placeholder="https://… or /campaign-products/…"/></label>
      <label className={styles.fullField}>Features · one per line, up to 20<textarea name="features" rows={4} maxLength={6020} defaultValue={initial.features}/></label>
    </div></section>
    <section><h2>Batch settings</h2><p>Prices are per unit. Closing times are in Singapore time.</p>{pricesLocked && <div className={styles.notice}>This batch has orders. Deposit, prices, tier starts and the minimum are locked. You can still update content, capacity, closing time and status.</div>}
    <div className={styles.batchFields}>
      <label>Target capacity · units<input name="target_capacity" type="number" min="1" max="100000" step="1" required defaultValue={initial.target_capacity}/></label>
      <label>Minimum verified units to proceed<input name="minimum_verified_units" type="number" min="1" max="100000" step="1" required={!initial.id || initial.minimum_verified_units!=null} readOnly={pricesLocked} defaultValue={initial.minimum_verified_units ?? ''}/></label>
      <label>Tier 2 starts at · verified units<input name="tier_2_start" type="number" min="2" max="100000" step="1" readOnly={pricesLocked} defaultValue={initial.tier_2_start ?? ''}/><small>Required when a Tier 2 price is set.</small></label>
      <label>Tier 3 starts at · verified units<input name="tier_3_start" type="number" min="3" max="100000" step="1" readOnly={pricesLocked} defaultValue={initial.tier_3_start ?? ''}/><small>Required when a Tier 3 price is set.</small></label>
      <label>Status<select name="status" defaultValue={initial.status}><option value="OPEN">Open · accepts orders until closing time</option><option value="CLOSED">Closed · no new orders</option><option value="DELIVERED">Delivered / completed</option></select></label>
      {([['deposit_amount', 'Deposit per unit'], ['tier_1_price', 'Tier 1 price'], ['tier_2_price', 'Tier 2 price (optional)'], ['tier_3_price', 'Tier 3 price (optional)']] as const).map(([name, label]) => <label key={name}>{label} · SGD<input name={name} type="number" min="0" max="1000000" step="0.01" required={name === 'deposit_amount' || name === 'tier_1_price'} readOnly={pricesLocked} defaultValue={initial[name]}/></label>)}
      <label className={styles.fullField}>Closes at · Singapore time (UTC+08:00)<input name="closes_at" type="datetime-local" required defaultValue={initial.closes_at}/></label>
    </div></section>
    {result.error && <p className={`${styles.notice} ${styles.error}`} role="alert">{result.error}</p>}
    {result.success && <p className={styles.notice} role="status">{result.success} Refresh this page before making another edit.</p>}
    <div className={styles.actions}><button disabled={pending || !!result.id} className={styles.primaryButton}>{pending ? 'Saving…' : initial.id ? 'Save batch changes' : 'Create batch & generate link'}</button>{result.id && <Link href={`/admin/batches/${result.id}`} className={styles.button}>Reload latest batch</Link>}</div>
  </form>;
}
export function DeleteBatchForm({id, revision}: {id: string; revision: number}) {
  const [result, action, pending] = useActionState<BatchResult, FormData>(deleteEmptyBatch, {});
  if (result.deleted) return <div className={styles.notice} role="status">{result.success} <Link href="/admin/batches">Back to batches →</Link></div>;
  return <details className={styles.deleteBatch}><summary>Delete empty batch</summary><p>This removes the batch and its public link. Catalog product details are retained. Deletion is blocked if any order exists, including refunded orders.</p><form action={action}><input type="hidden" name="id" value={id}/><input type="hidden" name="revision" value={revision}/><label>Type DELETE to confirm<input name="confirmation" required pattern="DELETE" autoComplete="off"/></label><button className={styles.button} disabled={pending}>{pending ? 'Deleting…' : 'Permanently delete empty batch'}</button>{result.error && <p role="alert">{result.error}</p>}</form></details>;
}

export function BatchApprovalForm({id,revision,eligible,approved}: {id:string;revision:number;eligible:boolean;approved:boolean}) {
 const [result,action,pending]=useActionState<BatchResult,FormData>(approveBatch,{});
 return <form action={action} className={styles.batchForm}>
  <input type="hidden" name="id" value={id}/><input type="hidden" name="revision" value={revision}/>
  <p>Approval checks the current verified minimum and records the admin decision. It does not close the batch, lock a final price, contact customers or place a supplier order.</p>
  {!approved && <><label><input type="checkbox" name="confirmed" required disabled={!eligible || pending}/> I have reviewed this batch and approve proceeding.</label><button className={styles.primaryButton} disabled={!eligible || pending || !!result.success}>{pending?'Checking…':'Approve batch to proceed'}</button></>}
  {result.error&&<p role="alert">{result.error}</p>}{result.success&&<p role="status">{result.success}</p>}
 </form>;
}
