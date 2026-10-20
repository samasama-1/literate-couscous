export type BatchInput = {id: string | null; revision: number | null; name: string; description: string; image_url: string | null; features: string[]; retail_price_cents: number | null; target_capacity: number; deposit_cents: number; tier_1_cents: number; tier_2_cents: number | null; tier_3_cents: number | null; closes_at: string; status: 'OPEN' | 'CLOSED' | 'DELIVERED'};
export const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function amount(value: unknown, optional = false) {
  const text = String(value ?? '').trim();
  if (optional && !text) return null;
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(text)) throw new Error('Enter prices with no more than two decimal places.');
  const [whole, fraction = ''] = text.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (cents > 100000000) throw new Error('Price is too large.');
  return cents;
}
export function parseBatch(form: FormData): BatchInput {
  const text = (key: string) => String(form.get(key) ?? '').trim();
  const id = text('id') || null, revision = id ? Number(text('revision')) : null;
  if (id && (!uuid.test(id) || !Number.isSafeInteger(revision) || revision! < 1)) throw new Error('Invalid batch. Refresh and try again.');
  const name = text('name'), description = text('description'), image = text('image_url');
  if (!name || name.length > 150 || !description || description.length > 10000) throw new Error('Enter a product name and description within the stated limits.');
  if (image) {
    if (image.length > 2048 || /[\s\\]/.test(image)) throw new Error('Use a valid HTTPS image URL or a local /image path.');
    if (image.startsWith('/')) { if (image.startsWith('//')) throw new Error('Use a local /image path, not //host.'); }
    else { const url = new URL(image); if (!image.startsWith('https://') || url.protocol !== 'https:' || url.username || url.password) throw new Error('Use an HTTPS image URL without credentials.'); }
  }
  const features = text('features').split('\n').map(x => x.trim()).filter(Boolean);
  if (features.length > 20 || features.some(x => x.length > 300)) throw new Error('Use up to 20 features, each up to 300 characters.');
  const capacity = Number(text('target_capacity'));
  if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 100000) throw new Error('Capacity must be a whole number from 1 to 100,000.');
  const deposit = amount(form.get('deposit_amount'))!, tier1 = amount(form.get('tier_1_price'))!;
  const tier2 = amount(form.get('tier_2_price'), true), tier3 = amount(form.get('tier_3_price'), true);
  if (tier1 <= 0 || (tier2 != null && (tier2 <= 0 || tier2 > tier1)) || (tier3 != null && (tier2 == null || tier3 <= 0 || tier3 > tier2)) || deposit > (tier3 ?? tier2 ?? tier1)) throw new Error('Prices must decrease by tier, and the deposit cannot exceed the lowest price.');
  const status = text('status') || 'OPEN';
  if (!['OPEN', 'CLOSED', 'DELIVERED'].includes(status)) throw new Error('Invalid batch status.');
  // datetime-local is deliberately interpreted as Singapore time, not the browser/server timezone.
  const rawDate = text('closes_at');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(rawDate)) throw new Error('Choose a closing date and time in Singapore time.');
  const date = new Date(rawDate + ':00+08:00');
  if (!Number.isFinite(date.getTime()) || new Date(date.getTime() + 8 * 3600000).toISOString().slice(0,16) !== rawDate) throw new Error('Invalid closing date.');
  return {id, revision, name, description, image_url: image || null, features, retail_price_cents: amount(form.get('retail_price'), true), target_capacity: capacity, deposit_cents: deposit, tier_1_cents: tier1, tier_2_cents: tier2, tier_3_cents: tier3, closes_at: date.toISOString(), status: status as BatchInput['status']};
}
export function publicBatchUrl(id: string, origin: string) {
  if (!uuid.test(id)) throw new Error('Invalid batch ID.');
  const url = new URL(origin);
  if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw new Error('Invalid public site origin.');
  return new URL(`/group-buys/${id}`, url.origin).toString();
}
