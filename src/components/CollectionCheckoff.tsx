'use client';
import {useActionState} from 'react';
import {operateOrder,type OperationResult} from '@/app/actions/order-operations';
export default function CollectionCheckoff({id,customerName}:{id:string;customerName:string}){
 const [result,action,pending]=useActionState<OperationResult,FormData>(operateOrder,{});
 return <form action={action} style={{minWidth:230}}>
  <input type="hidden" name="id" value={id}/><input type="hidden" name="operation" value="fulfil"/>
  <label style={{display:'block',marginBottom:8}}>Collected by<input name="reference" defaultValue={customerName} maxLength={200} required style={{display:'block',padding:8,width:'100%'}}/></label>
  <label style={{display:'flex',gap:8,alignItems:'flex-start',marginBottom:10}}><input type="checkbox" required aria-label="Order checked and all items handed over"/>Order checked and all items handed over</label>
  <button className="btn btn-primary btn-sm" disabled={pending}>{pending?'Saving…':'Mark collected'}</button>
  {result.error&&<p role="alert">{result.error}</p>}{result.success&&<p role="status">{result.success}</p>}
 </form>;
}
