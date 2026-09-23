'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { submitCampaignIntent, startCampaignSession } from "@/app/actions/campaigns";
import { formatMoney, getSpecs } from "@/lib/campaigns/utils";
import { purchaseIntentLabels, type AttributionInput, type Campaign, type CampaignProduct, type PurchaseIntent } from "@/lib/campaigns/types";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    ttq?: { track?: (...args: unknown[]) => void; page?: () => void };
  }
}

type Props = {
  preview?: boolean;
  campaign: Campaign;
  products: CampaignProduct[];
  metaPixelEnabled: boolean;
  tiktokPixelEnabled: boolean;
};

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; productName: string; intent: PurchaseIntent; alreadyRegistered: boolean; emailStatus: string }
  | { status: "error"; message: string };

const attributionKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "landing_variant"] as const;

function readAttribution(): AttributionInput {
  const params = new URLSearchParams(window.location.search);
  const stored: AttributionInput = {};
  try { const parsed = JSON.parse(window.localStorage.getItem("samasama_first_touch") || "{}"); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) { for (const key of [...attributionKeys,"referrer","first_touch_source"] as const) if (typeof parsed[key] === "string") stored[key] = parsed[key].slice(0,500); } } catch { /* Storage is optional. */ }
  const current: AttributionInput = {};
  attributionKeys.forEach(key => { const value = params.get(key); if (value) current[key] = value.slice(0,160); });
  const source = current.utm_source || (document.referrer ? "referral" : "direct");
  const first = Object.keys(stored).length ? stored : {...current,referrer:document.referrer || null,first_touch_source:source};
  try { window.localStorage.setItem("samasama_first_touch",JSON.stringify(first)); } catch { /* Keep in memory. */ }
  return {...first,...current,referrer:document.referrer || first.referrer || null,first_touch_source:first.first_touch_source || source,latest_touch_source:source};
}

function trackPixel(eventName: string, enabled: { meta: boolean; tiktok: boolean }, payload: Record<string, unknown> = {}) {
  if (enabled.meta && window.fbq) {
    window.fbq("trackCustom", eventName, payload);
  }
  if (enabled.tiktok && window.ttq?.track) {
    window.ttq.track(eventName, payload);
  }
}

async function recordEvent(eventType: string, campaignId: string, anonymousSessionId: string | null, campaignProductId?: string, metadata: Record<string, unknown> = {}) {
  await fetch("/api/campaign-events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventType, campaignId, campaignProductId, anonymousSessionId, metadata }),
    keepalive: true,
  }).catch(() => undefined);
}

export default function CampaignIntentForm({ campaign, products, metaPixelEnabled, tiktokPixelEnabled, preview = false }: Props) {
  const [selectedProductId, setSelectedProductId] = useState("");
  const [intent, setIntent] = useState<PurchaseIntent | "">("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [telegram, setTelegram] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [company, setCompany] = useState("");
  const [state, setState] = useState<SubmitState>({ status: "idle" });
  const attributionRef = useRef<AttributionInput>({});
  const sessionReady = useRef<Promise<string> | null>(null);
  const requestId = useRef<string | null>(null);
  const intentRef = useRef<HTMLDivElement>(null);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedProductId),
    [products, selectedProductId],
  );

  useEffect(() => {
    if (preview) return;
    const nextAttribution = readAttribution();
    attributionRef.current = nextAttribution;
    sessionReady.current ||= startCampaignSession();
    sessionReady.current.then(id => {
      attributionRef.current.anonymous_session_id = id;
      return recordEvent("campaign_view", campaign.id, id, undefined, {...nextAttribution});
    }).catch(() => { sessionReady.current = null; });
    trackPixel("CampaignViewed", { meta: metaPixelEnabled, tiktok: tiktokPixelEnabled }, { campaign_slug: campaign.slug });
  }, [campaign.id, campaign.slug, metaPixelEnabled, tiktokPixelEnabled, preview]);

  async function trackEvent(type: string, productId: string) {
    if (preview) return;
    try {
      sessionReady.current ||= startCampaignSession();
      const id = await sessionReady.current;
      await recordEvent(type,campaign.id,id,productId,{...attributionRef.current});
    } catch { sessionReady.current = null; }
  }

  function selectProduct(product: CampaignProduct) {
    setSelectedProductId(product.id);
    setIntent("");
    requestId.current = null;
    void trackEvent("product_selected",product.id);
    if (!preview) trackPixel("ProductSelected", { meta: metaPixelEnabled, tiktok: tiktokPixelEnabled }, { campaign_slug: campaign.slug, product_id: product.id });
    window.setTimeout(() => intentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProduct || !intent) {
      setState({ status: "error", message: "Please choose a product and tell us whether you’re interested." });
      return;
    }

    if (preview) {
      setState({status:"success",productName:selectedProduct.public_name,intent,alreadyRegistered:false,emailStatus:"test"});
      return;
    }
    setState({ status: "submitting" });
    try {
    sessionReady.current ||= startCampaignSession();
    await sessionReady.current;
    requestId.current ||= crypto.randomUUID();
    const result = await submitCampaignIntent({
      requestId: requestId.current,
      priceShownCents: selectedProduct.estimated_price_cents,
      currency: selectedProduct.currency,
      campaignSlug: campaign.slug,
      campaignProductId: selectedProduct.id,
      purchaseIntent: intent,
      email,
      phone,
      telegramHandle: telegram,
      marketingConsent,
      attribution: attributionRef.current,
      company,
    });

    if ("error" in result) {
      requestId.current = null;
      setState({ status: "error", message: result.error || "Could not save your pick." });
      return;
    }

    trackPixel("IntentSubmitted", { meta: metaPixelEnabled, tiktok: tiktokPixelEnabled }, {
      campaign_slug: campaign.slug,
      purchase_intent: intent,
      product_id: selectedProduct.id,
    });

    setState({
      status: "success",
      productName: result.productName,
      intent: result.purchaseIntent,
      alreadyRegistered: result.alreadyRegistered,
      emailStatus: result.emailStatus,
    });
    } catch {
      sessionReady.current = null;
      setState({status:"error",message:"Connection interrupted. Please try again; a saved pick will not be counted twice."});
    }
  }

  if (state.status === "success") {
    return (
      <section className="campaign-shell campaign-success" aria-live="polite">
        <p className="section-label">{state.alreadyRegistered ? "Updated" : "Recorded"}</p>
        <h2>Got it - you picked {state.productName}.</h2>
        <p>
          {campaign.confirmation_text || "We'll let you know how the vote develops. If this product moves forward, you'll get first access to the Founding Buyer offer."}
        </p>
        {state.emailStatus === "test" ? <p className="campaign-note">{preview ? "Preview complete. Nothing was saved and no email was sent." : "This is a test registration. No confirmation email was sent."}</p> : state.emailStatus !== "sent" && <p className="campaign-note">Your pick is saved. Your confirmation email has not been sent yet.</p>}
        {!preview && <p>Product and launch updates are sent only if you opted in.</p>}
        <Link className="btn btn-secondary" href="/">
          Back to SamaSama
        </Link>
      </section>
    );
  }

  return (
    <form onSubmit={handleSubmit} onChange={() => { requestId.current = null; }} className="campaign-form">
      <fieldset disabled={state.status === "submitting"} style={{border:0,padding:0,margin:0,minWidth:0}}>
      <section className="campaign-options" aria-label="Product options">
        {products.map((product) => {
          const selected = product.id === selectedProduct?.id;
          const specs = getSpecs(product);
          return (
            <article key={product.id} className={`campaign-product ${selected ? "selected" : ""}`}>
              <div className="campaign-product-media">
                {product.image_url ? (
                  <Image src={product.image_url} alt={product.public_name} fill sizes="(min-width: 840px) 50vw, 100vw" unoptimized={!product.image_url.startsWith("/")} />
                ) : (
                  <div className="campaign-product-placeholder" aria-hidden="true">
                    {product.public_name}
                  </div>
                )}
              </div>
              <div className="campaign-product-body">
                <div>
                  <p className="campaign-product-label">{product.public_label || "Shortlisted option"}</p>
                  <h2>{product.public_name}</h2>
                </div>
                <p className="campaign-product-price">{formatMoney(product.estimated_price_cents, product.currency)}</p>
                <p className="campaign-product-text">{product.short_description}</p>
                <div className="campaign-product-detail">
                  <strong>Best for:</strong>
                  <span>{product.key_benefit || "Everyday home use"}</span>
                </div>
                <div className="campaign-product-detail">
                  <strong>Why shortlisted:</strong>
                  <span>{product.key_differentiator || "A practical fit for the SamaSama shortlist."}</span>
                </div>
                {specs.length > 0 && (
                  <ul className="campaign-specs">
                    {specs.map((spec) => <li key={spec}>{spec}</li>)}
                  </ul>
                )}
                {product.tradeoff && <p className="campaign-tradeoff">Trade-off: {product.tradeoff}</p>}
                <button type="button" className={selected ? "btn btn-primary" : "btn btn-secondary"} aria-pressed={selected} disabled={state.status === "submitting"} onClick={() => selectProduct(product)}>
                  {selected ? `Selected ${product.public_name}` : `Choose ${product.public_name}`}
                </button>
              </div>
            </article>
          );
        })}
      </section>

      {selectedProduct && (
        <section ref={intentRef} className="campaign-shell campaign-intent">
          <p className="section-label">Product interest</p>
          <h2>Are you interested in {selectedProduct.public_name}?</h2>
          <p>Your interest helps us decide what to bring in next. No purchase or payment is required.</p>
          <div className="campaign-intent-grid" role="radiogroup" aria-label="Product interest">
            {(["yes", "no"] as PurchaseIntent[]).map((value) => (
              <label key={value} className={`campaign-intent-option ${intent === value ? "selected" : ""}`}>
                <input
                  type="radio"
                  name="purchaseIntent"
                  value={value}
                  checked={intent === value}
                  onChange={() => {
                    setIntent(value);
                    void trackEvent("intent_started", selectedProduct.id);
                  }}
                  required
                />
                <span>{purchaseIntentLabels[value]}</span>
              </label>
            ))}
          </div>

          <div className="campaign-contact-grid">
            <label>
              <span>Email *</span>
              <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
            </label>
            <label>
              <span>Phone (optional)</span>
              <input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+65 8123 4567" />
            </label>
            <label>
              <span>Telegram (optional)</span>
              <input type="text" value={telegram} onChange={(event) => setTelegram(event.target.value)} placeholder="@username" />
            </label>
          </div>

          <label className="campaign-consent">
            <input type="checkbox" checked={marketingConsent} onChange={(event) => setMarketingConsent(event.target.checked)} />
            <span>
              I&apos;d like to receive updates about this product and future SamaSama launches. I can unsubscribe anytime. See our{" "}
              <Link href="/privacy">Privacy Policy</Link>.
            </span>
          </label>

          <input className="campaign-honeypot" tabIndex={-1} autoComplete="off" value={company} onChange={(event) => setCompany(event.target.value)} name="company" />

          {state.status === "error" && <div className="campaign-error">{state.message}</div>}

          <button type="submit" className="btn btn-primary btn-lg campaign-submit" disabled={state.status === "submitting"}>
            {state.status === "submitting" ? "Recording..." : campaign.cta_text || "Register my pick"}
          </button>
        </section>
      )}
      </fieldset>
    </form>
  );
}
