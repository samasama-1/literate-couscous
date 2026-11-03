export const COLLECTION_POLICY_VERSION='collection-2026-10-v1';
export const COLLECTION_POLICY_TEXT='For self-collection: collect within 7 days of the ready-for-collection notice. From day 8, storage costs S$10 per order for each commenced seven-day period, without a cap. After 21 days, uncollected orders may enter cancellation or resale review. Rescheduling does not reset the free period. Any extension, reduction or waiver requires written approval. SamaSama-caused delays are not chargeable. Cancellation is reviewed individually; payments are not automatically forfeited.';
export const DELIVERY_NOTICE='Delivery — subject to availability and confirmation; additional charges apply.';
export function storageFee(notice:number,at:number,exemptSeconds=0,extensionDays=0){
 const overdue=at-notice-(7+extensionDays)*86400000-exemptSeconds*1000;
 return Math.max(0,Math.ceil(overdue/604800000))*1000;
}
export function productImage(value:unknown,origin:string):string|null {
 if(typeof value!=='string'||!value.trim()||value.length>2048||/[\s\\]/.test(value))return null;
 try{const u=new URL(value,origin);if(u.protocol!=='https:'||u.username||u.password)return null;return u.href;}catch{return null;}
}
