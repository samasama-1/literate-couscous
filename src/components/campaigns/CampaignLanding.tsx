import AnalyticsPixels from "@/components/AnalyticsPixels";
import { campaignIsOpen } from "@/lib/campaigns/utils";
import type { Campaign, CampaignProduct } from "@/lib/campaigns/types";
import CampaignIntentForm from "@/app/campaign/[slug]/CampaignIntentForm";
export default function CampaignLanding({campaign,products,preview=false}:{campaign:Campaign;products:CampaignProduct[];preview?:boolean}) {
  const isOpen = preview || campaignIsOpen(campaign);
  return (
    <>
      {!preview && !campaign.is_test && <AnalyticsPixels />}
      <style>{`
        .campaign-page { padding: 2rem 0 4rem; }
        .campaign-hero { padding: 2rem 0 1.5rem; display: grid; gap: 1.5rem; }
        .campaign-hero h1 { max-width: 850px; font-size: clamp(2.15rem, 8vw, 4.25rem); letter-spacing: 0; }
        .campaign-hero p { max-width: 720px; font-size: var(--text-md); color: var(--color-text-muted); }
        .campaign-trust-row { display: flex; flex-wrap: wrap; gap: 0.65rem; margin-top: 0.5rem; }
        .campaign-trust-row span { border: 1px solid var(--color-border); background: white; border-radius: var(--radius-md); padding: 0.45rem 0.7rem; font-size: var(--text-xs); color: var(--color-text-muted); font-weight: 700; }
        .campaign-options { display: grid; grid-template-columns: 1fr; gap: 1rem; margin: 1rem 0 2rem; }
        .campaign-product { background: white; border: 1px solid var(--color-border); border-radius: var(--radius-lg); overflow: hidden; box-shadow: var(--shadow-sm); }
        .campaign-product.selected { border-color: var(--color-primary); box-shadow: 0 0 0 3px rgba(74,83,60,0.12); }
        .campaign-product-media { background: var(--color-surface); aspect-ratio: 16 / 10; display: flex; align-items: center; justify-content: center; position: relative; }
        .campaign-product-media img { width: 100%; height: 100%; object-fit: contain; }
        .campaign-product-placeholder { color: var(--color-primary-muted); font-weight: 800; font-size: var(--text-lg); }
        .campaign-product-body { padding: 1.25rem; display: grid; gap: 1rem; }
        .campaign-product-label { font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0; font-weight: 800; color: var(--color-primary-muted); }
        .campaign-product h2 { font-size: 1.6rem; letter-spacing: 0; }
        .campaign-product-price { color: var(--color-text); font-size: var(--text-xl); font-weight: 800; }
        .campaign-product-text { color: var(--color-text-muted); }
        .campaign-product-detail { display: grid; gap: 0.15rem; font-size: var(--text-sm); }
        .campaign-product-detail strong { color: var(--color-text); }
        .campaign-product-detail span { color: var(--color-text-muted); }
        .campaign-specs { margin: 0; padding-left: 1.15rem; color: var(--color-text-muted); font-size: var(--text-sm); }
        .campaign-specs li + li { margin-top: 0.35rem; }
        .campaign-tradeoff, .campaign-note { background: var(--color-warning-bg); color: var(--color-warning); border: 1px solid #FDE68A; border-radius: var(--radius-md); padding: 0.8rem; font-size: var(--text-sm); }
        .campaign-shell { background: white; border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 1.25rem; box-shadow: var(--shadow-sm); }
        .campaign-intent { display: grid; gap: 1.25rem; scroll-margin-top: 6rem; }
        .campaign-intent h2 { font-size: clamp(1.5rem, 5vw, 2.2rem); letter-spacing: 0; }
        .campaign-intent-grid { display: grid; gap: 0.75rem; }
        .campaign-intent-option { display: flex; gap: 0.75rem; align-items: center; border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 1rem; cursor: pointer; background: var(--color-bg); min-height: 56px; }
        .campaign-intent-option.selected { border-color: var(--color-primary); background: var(--color-success-bg); }
        .campaign-intent-option span { color: var(--color-text); font-weight: 700; }
        .campaign-contact-grid { display: grid; gap: 1rem; }
        .campaign-contact-grid label { display: grid; gap: 0.45rem; font-weight: 700; color: var(--color-text); }
        .campaign-contact-grid input { width: 100%; padding: 0.85rem; border: 1px solid var(--color-border); border-radius: var(--radius-md); font-size: 1rem; background: white; color: var(--color-text); }
        .campaign-consent { display: flex; gap: 0.75rem; align-items: flex-start; color: var(--color-text-muted); font-size: var(--text-sm); line-height: 1.5; }
        .campaign-consent a { color: var(--color-primary); text-decoration: underline; text-underline-offset: 2px; }
        .campaign-honeypot { position: absolute; left: -9999px; opacity: 0; height: 0; }
        .campaign-submit { width: 100%; min-height: 56px; }
        .campaign-submit:disabled { opacity: 0.65; cursor: not-allowed; }
        .campaign-error { background: var(--color-error-bg); color: var(--color-error); border: 1px solid var(--color-error); border-radius: var(--radius-md); padding: 1rem; font-weight: 700; }
        .campaign-success { display: grid; gap: 1rem; margin: 2rem auto; max-width: 720px; }
        .campaign-paused { max-width: 720px; margin: 2rem auto; display: grid; gap: 1rem; }

        @media (min-width: 840px) {
          .campaign-page { padding-top: 3rem; }
          .campaign-options { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: stretch; }
          .campaign-product { display: flex; flex-direction: column; }
          .campaign-product-body { flex: 1; }
          .campaign-contact-grid { grid-template-columns: 1.2fr 0.9fr 0.9fr; }
          .campaign-shell { padding: 2rem; }
        }
      `}</style>

      <div className="campaign-page">
        <div className="container-site">
          {(preview || campaign.is_test) && <p className="campaign-note" role="status">Test page · {preview ? "Preview interactions stay in this browser; no details are saved or emailed." : "Responses are stored separately as test campaign data. No emails are sent."}</p>}
          <section className="campaign-hero">
            <p className="section-label">{campaign.name}</p>
            <h1>{campaign.headline || "We went to the factories. We narrowed it down. You choose what we bring in."}</h1>
            <p>
              {campaign.subheadline || "SamaSama visited manufacturers, shortlisted products we would actually consider bringing to Singapore, and now we want to know what you genuinely want."}
            </p>
            <div className="campaign-trust-row" aria-label="Campaign notes">
              <span>No commitment</span>
              <span>You choose the next drop</span>
              <span>First access if it launches</span>
            </div>
          </section>

          {!isOpen ? (
            <section className="campaign-shell campaign-paused">
              <p className="section-label">Not open</p>
              <h2>This campaign is not accepting registrations right now.</h2>
              <p>It may be paused, completed, or not launched yet. Check back later for the next SamaSama shortlist.</p>
            </section>
          ) : products.length === 0 ? (
            <section className="campaign-shell campaign-paused">
              <p className="section-label">No options yet</p>
              <h2>This campaign needs product options before it can launch.</h2>
            </section>
          ) : (
            <CampaignIntentForm
              campaign={campaign}
              products={products}
              metaPixelEnabled={!preview && !campaign.is_test && Boolean(process.env.NEXT_PUBLIC_META_PIXEL_ID)}
              tiktokPixelEnabled={!preview && !campaign.is_test && Boolean(process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID)}
              preview={preview}
            />
          )}
        </div>
      </div>
    </>
  );
}
