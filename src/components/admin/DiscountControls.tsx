'use client';
import {useActionState} from 'react';
import {manageDiscount,type DiscountResult} from '@/app/actions/discounts';
import styles from './workspace.module.css';
export default function DiscountControls({id,enabled}:{id?:string;enabled?:boolean}){
 const[result,action,pending]=useActionState<DiscountResult,FormData>(manageDiscount,{});
 return <form action={action} className={styles.operationForm}>
 {id?<><input type="hidden" name="id" value={id}/><label>Code action<select name="action"><option value="revoke">Revoke / remove unsettled discount</option><option value="reinstate">Approve reinstatement</option></select></label><label>Approval reason<input name="reason" required maxLength={300}/></label><p>Reinstatement cancels the linked unpaid order, or requires a refunded, unfulfilled order. Check cancellation/refund settlement first. The original six-month expiry never extends. Removing a discount can increase the unsettled total; agree changes with the customer.</p></>:<><input type="hidden" name="action" value="issuance"/><input type="hidden" name="enabled" value={enabled?'false':'true'}/><p>Enable issuance only after reviewing the reward terms and confirmation email. Applies to new interested registrations in live campaigns. No retroactive awards or extra codes for repeat sign-ups.</p></>}
 <label className={styles.confirmation}><input type="checkbox" name="confirmed" required/>I reviewed and approve this action.</label>
 <button disabled={pending||!!result.success} className={styles.primaryButton}>{pending?'Saving…':id?'Apply approved action':enabled?'Pause new code issuance':'Enable new code issuance'}</button>
 {result.error&&<p role="alert">{result.error}</p>}{result.success&&<p role="status">{result.success}</p>}
 </form>;
}
