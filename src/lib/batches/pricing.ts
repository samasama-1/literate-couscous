export type BatchPricing = {
  target_capacity: number;
  tier_1_price: number;
  tier_2_price: number | null;
  tier_3_price: number | null;
  tier_2_start?: number | null;
  tier_3_start?: number | null;
  minimum_verified_units?: number | null;
};
export function pricingConfigured(b: BatchPricing) {
  const whole = (n: unknown): n is number => Number.isSafeInteger(n) && Number(n) > 0;
  return whole(b.target_capacity) && whole(b.minimum_verified_units) && b.minimum_verified_units <= b.target_capacity
    && Number.isFinite(Number(b.tier_1_price)) && Number(b.tier_1_price) > 0
    && (b.tier_2_price == null ? b.tier_2_start == null : whole(b.tier_2_start) && b.tier_2_start >= 2 && b.tier_2_start <= b.target_capacity && Number(b.tier_2_price) > 0 && Number(b.tier_2_price) <= Number(b.tier_1_price))
    && (b.tier_3_price == null ? b.tier_3_start == null : b.tier_2_price != null && whole(b.tier_3_start) && b.tier_3_start > Number(b.tier_2_start) && b.tier_3_start <= b.target_capacity && Number(b.tier_3_price) > 0 && Number(b.tier_3_price) <= Number(b.tier_2_price));
}
export function batchPricing(b: BatchPricing, verified: number) {
  if (!pricingConfigured(b) || !Number.isSafeInteger(verified) || verified < 0) return null;
  const tiers = [{tier: 1, start: 1, end: (b.tier_2_start ?? b.target_capacity + 1) - 1, price: Number(b.tier_1_price)}];
  if (b.tier_2_price != null) tiers.push({tier: 2, start: b.tier_2_start!, end: (b.tier_3_start ?? b.target_capacity + 1) - 1, price: Number(b.tier_2_price)});
  if (b.tier_3_price != null) tiers.push({tier: 3, start: b.tier_3_start!, end: b.target_capacity, price: Number(b.tier_3_price)});
  const current = [...tiers].reverse().find(t => verified >= t.start) ?? tiers[0];
  const next = tiers.find(t => t.start > verified && t.tier > 1);
  return {tiers, current, next, minimumMet: verified >= b.minimum_verified_units!, unitsToMinimum: Math.max(0, b.minimum_verified_units! - verified)};
}

// Approved settings only; applying a preset does not create a batch or publish claims.
export const launchBatchPresets = {
  studio: {name: 'Studio-Air', target_capacity: '1000', minimum_verified_units: '423', tier_2_start: '424', tier_3_start: '713', deposit_amount: '59.50', tier_1_price: '119.00', tier_2_price: '109.00', tier_3_price: '99.00'},
  everyday: {name: 'Everyday Air', target_capacity: '1000', minimum_verified_units: '448', tier_2_start: '449', tier_3_start: '725', deposit_amount: '54.50', tier_1_price: '109.00', tier_2_price: '99.00', tier_3_price: '89.00'},
  single: {name: 'Single Stack Steamer/Airfryer', target_capacity: '1103', minimum_verified_units: '461', tier_2_start: '462', tier_3_start: '783', deposit_amount: '109.50', tier_1_price: '219.00', tier_2_price: '209.00', tier_3_price: '199.00'},
  double: {name: 'Double Stack Steamer/Airfryer', target_capacity: '1109', minimum_verified_units: '490', tier_2_start: '491', tier_3_start: '801', deposit_amount: '114.50', tier_1_price: '229.00', tier_2_price: '219.00', tier_3_price: '209.00'},
};
