// Pure runtime validation, shared by server entry points and tests.
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function text(value: unknown, max: number, required = false): string | null {
  if (value == null && !required) return null;
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw new Error('Please check the form fields.');
  return value.trim() || null;
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid submission.');
  return value as Record<string, unknown>;
}
export function uuid(value: unknown): string {
  if (typeof value !== 'string' || !uuidPattern.test(value)) throw new Error('Invalid reference. Please refresh the page.');
  return value;
}
export function attribution(value: unknown) {
  const raw = value == null ? {} : record(value);
  const out: Record<string, string | null> = {};
  for (const key of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','landing_variant','first_touch_source','latest_touch_source']) out[key] = text(raw[key],160);
  // Referrer query strings may contain personal information. Store only origin/path.
  const referrer = text(raw.referrer,2000);
  try { const u = new URL(referrer || ''); out.referrer = `${u.origin}${u.pathname}`.slice(0,500); } catch { out.referrer = null; }
  return out;
}
export function parseIntent(value: unknown) {
  const raw = record(value);
  const email = text(raw.email,254,true)!.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Please enter a valid email address.');
  if (!['yes','no'].includes(String(raw.purchaseIntent))) throw new Error('Please tell us whether you’re interested.');
  if (typeof raw.marketingConsent !== 'boolean') throw new Error('Invalid consent value.');
  if (raw.company) throw new Error('We could not process this submission.');
  if (!Number.isSafeInteger(raw.priceShownCents) || Number(raw.priceShownCents)<0) throw new Error('Please refresh the price.');
  return {
    email, campaign_slug:text(raw.campaignSlug,120,true), product_id:uuid(raw.campaignProductId), request_id:uuid(raw.requestId),
    purchase_intent:raw.purchaseIntent as 'yes'|'no', marketing_consent:raw.marketingConsent,
    phone:text(raw.phone,40), telegram_handle:text(raw.telegramHandle,64),
    price_shown_cents:Number(raw.priceShownCents), currency:text(raw.currency,3,true), attribution:attribution(raw.attribution),
  };
}
export function safeImageUrl(value: unknown) {
  const url = text(value,1000);
  if (!url) return null;
  if (/^\/(?!\/)[^\\]*$/.test(url)) return url;
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('Image must use an HTTPS URL or a local /path.');
  return parsed.href;
}
