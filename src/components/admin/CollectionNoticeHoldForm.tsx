'use client';
import {useActionState} from 'react';
import {manageCollection,type CollectionResult} from '@/app/actions/collections';
import styles from './workspace.module.css';
export default function CollectionNoticeHoldForm({id}:{id:string}){
 const [result,action,pending]=useActionState<CollectionResult,FormData>(manageCollection,{});
 return <form action={action} className={styles.operationForm}>
 <input type="hidden" name="id" value={id}/><input type="hidden" name="intent" value="notice_hold"/>
 <label>Notification issue<select name="reference" required disabled={pending}><option value="confirmed_bounce">Confirmed bounce</option><option value="reported_non_delivery">Customer reports non-delivery</option><option value="collection_unavailable">Collection unavailable</option></select></label>
 <input type="hidden" name="note" value="Collection notification issue recorded by admin"/>
 <p>Record verified operational facts only. This does not send an email, clear existing charges, change payment verification or authorise collection.</p>
 <button className={styles.primaryButton} disabled={pending}>{pending?'Saving…':'Record notification hold'}</button>
 {result.error&&<p role="alert">{result.error}</p>}{result.success&&<p role="status">{result.success}</p>}
 </form>;
}
