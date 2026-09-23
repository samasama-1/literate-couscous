import type { Campaign, CampaignProduct, PurchaseIntent } from "./types";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string) {
  return emailPattern.test(email) && email.length <= 254;
}

export function cleanOptionalText(value: unknown, maxLength = 300) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

export function cleanTelegram(value: unknown) {
  const text = cleanOptionalText(value, 64);
  if (!text) return null;
  return text.replace(/^@+/, "").replace(/[^\w.]/g, "").slice(0, 64) || null;
}

export function isValidPurchaseIntent(value: unknown): value is PurchaseIntent {
  return value === "yes" || value === "maybe" || value === "no";
}

export function formatMoney(cents: number, currency = "SGD") {
  const amount = cents / 100;
  if (currency === "SGD") return `S$${amount.toLocaleString("en-SG", { maximumFractionDigits: amount % 1 ? 2 : 0 })}`;
  return `${currency} ${amount.toLocaleString("en-SG", { maximumFractionDigits: 2 })}`;
}

export function campaignIsOpen(campaign: Campaign) {
  if (campaign.status !== "active") return false;
  const now = Date.now();
  if (campaign.starts_at && new Date(campaign.starts_at).getTime() > now) return false;
  if (campaign.ends_at && new Date(campaign.ends_at).getTime() < now) return false;
  return true;
}

export function getSpecs(product: CampaignProduct) {
  return Array.isArray(product.specifications)
    ? product.specifications.filter((item): item is string => typeof item === "string").slice(0, 5)
    : [];
}

export function csvEscape(value: unknown) {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  const text = /^[\s]*[=+@-]/.test(raw) || /^[\t\r\n]/.test(raw) ? `'${raw}` : raw;
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ];
  return `${lines.join("\n")}\n`;
}
