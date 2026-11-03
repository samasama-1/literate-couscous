'use client';
import {useActionState,useState} from 'react';
import {manageCollection,type CollectionResult} from '@/app/actions/collections';
import styles from './admin/workspace.module.css';
export default function CollectionManagement({id,eligible,feesHeld=false,noticeControls=false}:{id:string;eligible:boolean;feesHeld?:boolean;noticeControls?:boolean}){
 const [intent,setIntent]=useState('revoke_access');
 const [result,action,pending]=useActionState<CollectionResult,FormData>(manageCollection,{});
 return <form action={action} className={styles.handover}>
 <input type="hidden" name="id" value={id}/>
 <label>Collection action<select name="intent" value={intent} onChange={e=>setIntent(e.target.value)}>
 <option value="send_access">Email a fresh form link to the order owner</option>
 <option value="revoke_access">Revoke collection form links and authorisations</option>
 {noticeControls&&<option value="notice_hold">Record a failed / unavailable collection notice</option>}
 {eligible&&<>{!feesHeld&&<><option value="pause">Pause clock — SamaSama delay / approved hold</option><option value="resume">Resume clock</option><option value="extend">Approve additional free days</option></>}<option value="reduce">Reduce / waive current outstanding storage</option><option value="payment">Verify storage payment against bank record</option><option value="review">Record cancellation / resale review</option><option value="stop">Stop future storage after agreed cancellation</option></>}
 </select></label>
 {['extend','reduce','payment'].includes(intent)&&<label>{intent==='extend'?'Additional free days':'Amount · SGD'}<input key={intent} name="amount" type="number" min={intent==='extend'?1:0.01} max={intent==='extend'?365:1000000} step={intent==='extend'?1:0.01} required/></label>}
 {intent==='notice_hold'&&<label>Notice issue<select name="reference"><option value="confirmed_bounce">Confirmed bounce</option><option value="reported_non_delivery">Customer reports non-delivery</option><option value="collection_unavailable">Collection unavailable</option></select></label>}
 {feesHeld&&<p>Fee accrual is held. Clock resumption requires a separately approved release; existing debts and audit records are preserved.</p>}
 {intent==='payment'&&<label>Bank transaction reference<input name="reference" required maxLength={200}/></label>}
 <label>Reason / agreed arrangement<input name="note" required maxLength={300}/></label>
 <p>Do not enter medical evidence or identity numbers. Reductions apply to current fees. {feesHeld?'New accrual remains held.':'Future weeks continue to accrue unless an approved pause applies.'} Review does not cancel, refund, resell or stop fees. Stopping storage does not issue a refund or cancel the order.</p>
 <button className={styles.primaryButton} disabled={pending}>{pending?'Saving…':'Save collection action'}</button>
 {result.error&&<p role="alert">{result.error}</p>}{result.success&&<p role="status">{result.success}</p>}
 </form>;
}
