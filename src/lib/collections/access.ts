import {createHmac,timingSafeEqual,createHash} from 'node:crypto';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function signingKey(secret:string){if(!/^[a-f0-9]{64}$/i.test(secret))throw Error('COLLECTION_KEY');return createHmac('sha256',Buffer.from(secret,'hex')).update('samasama.collection-owner-form.v2').digest();}
export type CollectionAccess={id:string;version:number;ready:string;emailHash:string;expires:number};
export function collectionToken(o:{id:string;collection_access_version?:number;ready_at:string;customer_email:string},secret:string,now=Date.now()){
 const data:CollectionAccess={id:o.id,version:o.collection_access_version||1,ready:o.ready_at,emailHash:createHash('sha256').update(o.customer_email.toLowerCase()).digest('hex'),expires:Math.floor(now/1000)+86400};
 const body=Buffer.from(JSON.stringify(data)).toString('base64url');return `${body}.${createHmac('sha256',signingKey(secret)).update(body).digest('base64url')}`;
}
export function parseCollectionToken(token:string,secret:string,now=Date.now()):CollectionAccess|null {
 try{
 if(token.length>1000)return null;const [body,sig,extra]=token.split('.');if(extra||!body||!sig)return null;
 const expected=createHmac('sha256',signingKey(secret)).update(body).digest(),given=Buffer.from(sig,'base64url');if(given.length!==expected.length||!timingSafeEqual(given,expected))return null;
 const p=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));
 if(!uuid.test(p.id)||!Number.isSafeInteger(p.version)||p.version<1||typeof p.ready!=='string'||!Number.isFinite(Date.parse(p.ready))||!/^[a-f0-9]{64}$/.test(p.emailHash)||!Number.isSafeInteger(p.expires)||p.expires<=now/1000||p.expires>now/1000+86401)return null;return p;
 }catch{return null;}
}
export function accessMatches(p:CollectionAccess,o:{collection_access_version:number;ready_at:string|null;customer_email:string|null;payment_status:string;fulfilment_method:string;fulfilled_at:string|null}){
 return p.version===o.collection_access_version&&p.ready===o.ready_at&&!!o.customer_email&&p.emailHash===createHash('sha256').update(o.customer_email.toLowerCase()).digest('hex')&&o.payment_status==='VERIFIED'&&o.fulfilment_method==='collection'&&!o.fulfilled_at;
}

export function collectorActive(c:{expires_at:string;revoked_at:string|null;used_at:string|null}|null|undefined,now=Date.now()){return !!c&&!c.revoked_at&&!c.used_at&&Date.parse(c.expires_at)>now;}
