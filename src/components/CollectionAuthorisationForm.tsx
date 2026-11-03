'use client';
import {useActionState} from 'react';
import {authoriseCollector,type CollectionResult} from '@/app/actions/collections';
import styles from './admin/workspace.module.css';
export default function CollectionAuthorisationForm({token}:{token:string}){
 const [result,action,pending]=useActionState<CollectionResult,FormData>(authoriseCollector,{});
 return <form action={action} className={styles.handover}>
 <input type="hidden" name="token" value={token}/>
 <label>Collector’s full name as shown on photo ID<input name="name" maxLength={150} autoComplete="off"/></label>
 <label className={styles.confirmation}><input type="checkbox" name="consent"/>I authorise this person to collect all items in this order and confirm I have permission to provide their contact details for collection.</label>
 <p>Your collector must bring the order code and their original photo ID. Staff visually check the ID; do not upload an ID or enter its number. This owner-only form link expires after 24 hours and can be used once.</p>
 <button className={styles.primaryButton} name="intent" value="save" disabled={pending||!!result.success}>Save / replace authorisation</button>{' '}
 <button className={styles.secondaryButton} name="intent" value="revoke" disabled={pending||!!result.success}>Revoke current authorisation</button>
 {result.error&&<p role="alert">{result.error}</p>}{result.success&&<p role="status">{result.success}</p>}

 </form>;
}
