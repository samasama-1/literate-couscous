import Link from 'next/link';
import { verifyAdminAccess } from '@/lib/adminAuth';
export default async function Page() {
  await verifyAdminAccess();
  return <article className="container-site" style={{maxWidth:820,padding:'3rem 1rem',lineHeight:1.8}}>
    <Link href="/admin/campaigns/manage">← Campaign pages</Link><h1>Campaign owner guide</h1>
    <h2 style={{marginTop:'2rem'}}>1. Try the four-product page</h2><p><Link href="/campaign-preview">Open the visual preview</Link> to explore two hairdryers and two air fryers. Nothing is saved or emailed. To store practice votes, go to Campaign pages and create a four-product test campaign. It starts as a draft; edit and activate it when ready.</p>
    <h2 style={{marginTop:'2rem'}}>2. Customise your content</h2><p>Choose Edit content. Change the headline, introduction, button and success message. For each product, edit its public name, category, SGD price, benefits, trade-off and up to five specifications. Paste a public HTTPS image URL or local site path; image upload is not included. The supplied shortlist photos are at /campaign-products/hairdryer-a.webp, hairdryer-b.webp, air-fryer-a.webp and air-fryer-b.webp. Use Move up/down to reorder cards, or uncheck Show this option to hide one. Save before previewing.</p>
    <h2 style={{marginTop:'2rem'}}>3. Open or close the page</h2><p>Draft and archived pages are hidden publicly. Active campaigns accept votes within the optional opening/closing times (Singapore time). Paused and completed campaigns show a closed message. Keep the page address unchanged after sharing it. For launch, create a separate live campaign; test campaigns remain test campaigns.</p>
    <h2 style={{marginTop:'2rem'}}>4. Find your leads</h2><p>In the lead dashboard, choose Live or Test data, then filter by campaign, product, intent, source, creative or date. Click an email to see its timeline. Re-votes update one campaign response and retain history. Visitor counts represent browser sessions, not verified people.</p>
    <h2 style={{marginTop:'2rem'}}>5. Export and email</h2><p>Export CSV uses all matching leads. Marketing requires consent and no unsubscribe; exporting does not send email. Live confirmation emails need a configured sender. Queued/failed confirmations can be retried from the lead detail. Old ambiguous attempts require a provider-log check. Test campaigns never send confirmation emails.</p>
    <h2 style={{marginTop:'2rem'}}>Setup note</h2><p>The three campaign SQL migrations must be applied before stored voting/editor features work. Your developer has the full setup and troubleshooting manual at <code>docs/campaign-owner-manual.md</code>. Live inbox testing and payments are separate next steps.</p>
  </article>;
}
