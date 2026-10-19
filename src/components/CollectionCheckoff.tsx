'use client';
import {useActionState, useState} from 'react';
import {operateOrder,type OperationResult} from '@/app/actions/order-operations';
import styles from './admin/workspace.module.css';
export default function CollectionCheckoff({id,customerName}:{id:string;customerName:string}){
 const [result,action,pending]=useActionState<OperationResult,FormData>(operateOrder,{});
 const [checked,setChecked]=useState(false);
 return <form action={action}>
  <input type="hidden" name="id" value={id}/><input type="hidden" name="operation" value="fulfil"/>
  <label>Person collecting<input name="reference" type="text" defaultValue={customerName} maxLength={200} required disabled={pending || !!result.success}/></label>
  <label className={styles.confirmation}><input type="checkbox" required checked={checked} onChange={e=>setChecked(e.target.checked)} disabled={pending || !!result.success}/>I checked the order and handed over all items.</label>
  <button className={styles.primaryButton} disabled={pending || !checked || !!result.success}>{pending?'Saving…':result.success?'Collection recorded':'Confirm collection'}</button>
  {result.error&&<p className={styles.formMessage} role="alert">{result.error}</p>}{result.success&&<p className={styles.formMessage} role="status">{result.success}</p>}
 </form>;
}
