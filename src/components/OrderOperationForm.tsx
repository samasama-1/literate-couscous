'use client';
import {useActionState} from 'react';
import {operateOrder,type OperationResult} from '@/app/actions/order-operations';
import styles from './admin/workspace.module.css';
export default function OrderOperationForm({id,operation,label,amount,referenceLabel,revision}:{id:string;operation:string;label:string;amount?:number|null;referenceLabel?:string;revision?:number}){
 const [result,action,pending]=useActionState<OperationResult,FormData>(operateOrder,{});
 return <form action={action} className={styles.operationForm}>
 <input type="hidden" name="id" value={id}/><input type="hidden" name="operation" value={operation}/>{revision!==undefined&&<input type="hidden" name="revision" value={revision}/>}
 <h3>{label}</h3>
 {amount!==undefined&&<label>{(operation==='balance_request'||operation==='final_total')?'Final total for the whole order (S$, including any agreed charges)':'Amount verified against your bank record (S$)'}<input name="amount" type="number" min="0" step="0.01" required defaultValue={amount==null?undefined:(amount/100).toFixed(2)}/></label>}
 {referenceLabel&&<label>{referenceLabel}<input name="reference" required maxLength={200}/></label>}
 {operation==='collection_payment'&&<><label className={styles.confirmation}><input name="funds_checked" type="checkbox" required/>I checked the actual bank credit, amount and reference. A customer screenshot alone is not verification.</label><p>Product balance only. Any storage charges are recorded separately.</p></>}
 <button disabled={pending||!!result.success} className={styles.primaryButton}>{pending?'Saving…':label}</button>
 {result.error&&<p role="alert">{result.error}</p>}{result.success&&<p role="status">{result.success}</p>}
 {result.link&&<p><a href={result.link} target="_blank" rel="noreferrer">Open balance link</a><input aria-label="Private balance link to copy" readOnly value={result.link} onFocus={e=>e.target.select()}/></p>}
 </form>;
}
