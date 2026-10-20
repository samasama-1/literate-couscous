import {createCipheriv,createDecipheriv,randomBytes,createHash} from 'node:crypto';
function key(value:string) {if(!/^[a-f0-9]{64}$/i.test(value))throw Error('ORDER_EMAIL_LINK_KEY');return Buffer.from(value,'hex');}
export function sealLink(token:string,orderId:string,secret:string) {
 if(!/^[a-f0-9]{64}$/.test(token))throw Error('INVALID_LINK');
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(secret),iv);cipher.setAAD(Buffer.from(orderId));
 const body=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);
 return Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64url');
}
export function openLink(envelope:string,orderId:string,hash:string,secret:string) {
 const raw=Buffer.from(envelope,'base64url');if(raw.length!==92)throw Error('INVALID_LINK');
 const cipher=createDecipheriv('aes-256-gcm',key(secret),raw.subarray(0,12));cipher.setAAD(Buffer.from(orderId));cipher.setAuthTag(raw.subarray(12,28));
 const token=Buffer.concat([cipher.update(raw.subarray(28)),cipher.final()]).toString('utf8');
 if(!/^[a-f0-9]{64}$/.test(token)||createHash('sha256').update(token).digest('hex')!==hash)throw Error('INVALID_LINK');return token;
}
