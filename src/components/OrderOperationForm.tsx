'use client';
import {useActionState} from 'react';
import {operateOrder,type OperationResult} from '@/app/actions/order-operations';
export default function OrderOperationForm({id,operation,label,amount,referenceLabel}:{id:string;operation:string;label:string;amount?:number;referenceLabel?:string}){
 const [result,action,pending]=useActionState<OperationResult,FormData>(operateOrder,{});
 return <form action={action} style={{margin:'1.5rem 0',padding:'1rem',border:'1px solid var(--color-border)',borderRadius:12}}>
 <input type="hidden" name="id" value={id}/><input type="hidden" name="operation" value={operation}/>
 <h3>{label}</h3>
 {amount!==undefined&&<label style={{display:'block',marginBottom:12}}>{operation==='balance_request'?'Final total for the whole order (S$, including any agreed charges)':'Amount verified against your bank record (S$)'}<input name="amount" type="number" min="0" step="0.01" required defaultValue={(amount/100).toFixed(2)} style={{display:'block',padding:10}}/></label>}
 {referenceLabel&&<label style={{display:'block',marginBottom:12}}>{referenceLabel}<input name="reference" required maxLength={200} style={{display:'block',padding:10}}/></label>}
 <button disabled={pending} className="btn btn-primary">{pending?'Saving…':label}</button>
 {result.error&&<p role="alert">{result.error}</p>}{result.success&&<p role="status">{result.success}</p>}
 {result.link&&<p><a href={result.link} target="_blank" rel="noreferrer">Open balance link</a><input aria-label="Private balance link to copy" readOnly value={result.link} onFocus={e=>e.target.select()} style={{display:'block',width:'100%',padding:10}}/></p>}
 </form>;
}
