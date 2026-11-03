'use client';
import {useActionState, useState} from 'react';
import {operateOrder,type OperationResult} from '@/app/actions/order-operations';
import styles from './admin/workspace.module.css';
export default function CollectionCheckoff({id,customerName,collector,requireAuthorisation=false}:{id:string;customerName:string;collector?:{id:string;name:string}|null;requireAuthorisation?:boolean}){
 const [result,action,pending]=useActionState<OperationResult,FormData>(operateOrder,{});
 const [recipient,setRecipient]=useState(customerName);
 const [thirdParty,setThirdParty]=useState(false);
 const [checked,setChecked]=useState(false);
 const [identityChecked,setIdentityChecked]=useState(false);
 return <form action={action}>
  <input type="hidden" name="id" value={id}/><input type="hidden" name="operation" value="fulfil"/>
  {collector&&<label><input type="checkbox" checked={thirdParty} onChange={e=>setThirdParty(e.target.checked)}/> Authorised collector: {collector.name}</label>}
  {thirdParty&&collector&&<><input type="hidden" name="authorisation" value={collector.id}/></>}
  <label>Person collecting<input name="reference" type="text" value={thirdParty&&collector?collector.name:recipient} readOnly={requireAuthorisation||thirdParty} onChange={e=>setRecipient(e.target.value)} maxLength={200} required disabled={pending || !!result.success}/></label>
  {requireAuthorisation&&<label className={styles.confirmation}><input name="identity_checked" type="checkbox" required checked={identityChecked} onChange={e=>setIdentityChecked(e.target.checked)} disabled={pending||!!result.success}/>I checked the original photo ID: the person and full name match the selected owner or authorised collector. No ID number or copy recorded.</label>}
  <label className={styles.confirmation}><input type="checkbox" required checked={checked} onChange={e=>setChecked(e.target.checked)} disabled={pending || !!result.success}/>I checked the order code and all items are ready to hand over. Release them after collection is successfully recorded.</label>
  <button className={styles.primaryButton} disabled={pending || !checked || (requireAuthorisation&&!identityChecked) || !!result.success}>{pending?'Saving…':result.success?'Collection recorded':'Confirm collection'}</button>
  {result.error&&<p className={styles.formMessage} role="alert">{result.error}</p>}{result.success&&<p className={styles.formMessage} role="status">{result.success}</p>}
 </form>;
}
