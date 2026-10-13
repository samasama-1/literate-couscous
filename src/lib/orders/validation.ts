export function moneyCents(value: unknown): number {
  const text=String(value ?? '').trim();
  if(!/^\d{1,7}(\.\d{1,2})?$/.test(text)) throw new Error('Enter a valid amount in dollars, with up to two decimal places.');
  const [whole,decimal='']=text.split('.');
  const cents=Number(whole)*100+Number(decimal.padEnd(2,'0'));
  if(cents>100000000) throw new Error('Amount is too large.');
  return cents;
}
export function addressInput(value: {addressLine1?:unknown;addressLine2?:unknown;postalCode?:unknown;fulfilmentMethod?:unknown}) {
  const line1=String(value.addressLine1??'').trim(),line2=String(value.addressLine2??'').trim(),postal=String(value.postalCode??'').trim();
  if(!line1 || line1.length>200 || line2.length>100 || !/^\d{6}$/.test(postal)) throw new Error('Enter your Singapore address and six-digit postal code.');
  if(value.fulfilmentMethod!=='collection' && value.fulfilmentMethod!=='delivery') throw new Error('Choose collection or delivery.');
  return {address_line1:line1,address_line2:line2||null,postal_code:postal,fulfilment_method:value.fulfilmentMethod as 'collection'|'delivery'};
}
