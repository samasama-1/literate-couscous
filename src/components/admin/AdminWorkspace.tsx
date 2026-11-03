import type {ReactNode} from 'react';
import Link from 'next/link';
import {signOut} from '@/app/actions/auth';
import styles from './workspace.module.css';

export default function AdminWorkspace({children, collection = false, section = 'orders'}: {children: ReactNode; collection?: boolean; section?: 'orders' | 'batches' | 'delivery' | 'safety' | 'operations'}) {
  return <div className={styles.workspace}>
    <aside className={styles.sidebar}>
      <Link href="/admin" className={styles.brand}>SamaSama<span className={styles.brandSmall}>OPERATIONS</span></Link>
      <span className={styles.navLabel}>YOUR WORKSPACE</span>
      <nav aria-label="Operations navigation" className={styles.navigation}>
        <Link href="/admin" className={!collection && section === 'orders' ? styles.activeNav : undefined} aria-current={!collection && section === 'orders' ? 'page' : undefined}><span aria-hidden="true">▤</span> Orders</Link>
        <Link href="/admin?mode=collection" className={collection ? styles.activeNav : undefined} aria-current={collection ? 'page' : undefined}><span aria-hidden="true">✓</span> Collection desk</Link>
        <Link href="/admin/batches" className={section === 'batches' ? styles.activeNav : undefined} aria-current={section === 'batches' ? 'page' : undefined}><span aria-hidden="true">▦</span> Batches</Link>
        <Link href="/admin/delivery-payments" className={section==='delivery'?styles.activeNav:undefined} aria-current={section==='delivery'?'page':undefined}><span aria-hidden="true">✉</span> Delivery balance emails</Link>
        <Link href="/admin/storage-safety" className={section==='safety'?styles.activeNav:undefined} aria-current={section==='safety'?'page':undefined}><span aria-hidden="true">◇</span> Storage safety</Link>
        <Link href="/admin/operations" className={section==='operations'?styles.activeNav:undefined} aria-current={section==='operations'?'page':undefined}><span aria-hidden="true">◷</span> Operations health</Link>
        <Link href="/admin/campaigns"><span aria-hidden="true">◉</span> Campaign leads</Link>
        <Link href="/admin/batches?compose=1#new-batch"><span aria-hidden="true">＋</span> Create a batch</Link>
      </nav>
      <div className={styles.sidebarBottom}>
        <div className={styles.sidebarNote}><strong>A clear record, every time.</strong><p>Verify payments here. Record each handover once.</p></div>
        <Link href="/">View public website ↗</Link>
        <form action={signOut}><button type="submit" className={styles.signOut}>Sign out</button></form>
      </div>
    </aside>
    <div className={styles.main}>
      <div className={styles.topbar}><span>Workspace <span aria-hidden="true">/</span> <strong>{section === 'safety' ? 'Storage safety' : section === 'operations' ? 'Operations health' : section === 'delivery' ? 'Delivery balance emails' : section === 'batches' ? 'Batches' : collection ? 'Collection desk' : 'Orders'}</strong></span><span className={styles.adminIndicator}><i aria-hidden="true"/>Admin workspace</span></div>
      <div className={styles.content}>{children}</div>
    </div>
  </div>;
}
