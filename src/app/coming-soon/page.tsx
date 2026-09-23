import type { Metadata } from 'next';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Our next shortlist is coming soon',
  description: 'We’re putting the finishing touches on our next home appliance shortlist. Come back soon to explore the products and have your say.',
  alternates: { canonical: '/coming-soon' },
  openGraph: {
    title: 'Our next shortlist is coming soon | SamaSama',
    description: 'Useful additions to your home. Chosen together. Our next shortlist is on its way.',
    url: '/coming-soon',
  },
};

export default function ComingSoonPage() {
  return (
    <section className={styles.page} aria-labelledby="coming-soon-title">
      <div className={styles.card}>
        <p className={styles.eyebrow}><span aria-hidden="true" />Something useful is on its way</p>
        <p className={styles.label}>The next SamaSama shortlist</p>
        <h1 id="coming-soon-title">Good things for your home.<br /><em>Coming soon.</em></h1>
        <p className={styles.intro}>We’re putting the finishing touches on our next appliance shortlist. Soon, you’ll be able to explore the products and help choose what we bring in next.</p>
        <div className={styles.steps} aria-label="What’s coming">
          <p><span>01</span>Explore the shortlist</p>
          <p><span>02</span>Pick your favourite</p>
          <p><span>03</span>Help shape our next drop</p>
        </div>
        <p className={styles.note}>Voting hasn’t opened yet. Come back soon to have your say.</p>
      </div>
    </section>
  );
}
