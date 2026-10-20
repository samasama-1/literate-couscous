'use client';
import {useState} from 'react';
import styles from './workspace.module.css';
export default function BatchShareLinks({url}: {url: string}) {
  const [message, setMessage] = useState('');
  return <div className={styles.shareBox}><label>Public batch link<input readOnly value={url} onFocus={e => e.target.select()}/></label><button type="button" className={styles.button} onClick={async () => {try {await navigator.clipboard.writeText(url); setMessage('Link copied.');} catch {setMessage('Select the link above and copy it manually.');}}}>Copy link</button><p role="status">{message}</p></div>;
}
