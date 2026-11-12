import 'server-only';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {sealLink,openLink} from '../order-integrations/links';
export function normalizeDiscountCode(value:unknown){
 if(typeof value!=='string'||value.length>100)throw Error('INVALID_DISCOUNT_CODE');
 const compact=value.toUpperCase().replace(/[\s-]/g,'');
 if(!/^SAMA10[A-F0-9]{32}$/.test(compact))throw Error('INVALID_DISCOUNT_CODE');
 return `SAMA10-${compact.slice(6)}`;
}
export function discountCodeHash(value:unknown){return createHash('sha256').update(normalizeDiscountCode(value)).digest('hex');}
export function prepareDiscountCode(secret:string){
 const id=randomUUID(),token=randomBytes(32).toString('hex'),code=`SAMA10-${token.slice(0,32).toUpperCase()}`;
 return{id,hash:discountCodeHash(code),token_hash:createHash('sha256').update(token).digest('hex'),envelope:sealLink(token,`campaign-discount:${id}`,secret)};
}
export function revealDiscountCode(c:{id:string;hash:string;token_hash:string;envelope:string},secret:string){
 const token=openLink(c.envelope,`campaign-discount:${c.id}`,c.token_hash,secret),code=`SAMA10-${token.slice(0,32).toUpperCase()}`;
 if(discountCodeHash(code)!==c.hash)throw Error('INVALID_DISCOUNT_CODE');return code;
}
