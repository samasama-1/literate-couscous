import 'server-only';
export function paymentConfig(){
  const uen=process.env.PAYNOW_UEN?.trim();
  const payee=process.env.PAYNOW_PAYEE_NAME?.trim();
  const image=process.env.PAYNOW_QR_IMAGE?.trim();
  const qr=image && /^\/[a-zA-Z0-9/_ .-]+\.(png|jpg|jpeg|webp)$/.test(image) && !image.includes('..') && !image.startsWith('//') ? image : undefined;
  return {uen,payee,qr,configured:!!(uen&&payee)};
}
