import 'server-only';
import {orderDb} from '@/lib/orders/db';
import {parseCollectionToken,accessMatches} from './access';
import {limitRequest} from '@/lib/campaigns/security';
export async function loadCollectionAccess(token:string){
 if(process.env.COLLECTION_AUTH_INSTALLED!=='true')return null;
 const claims=parseCollectionToken(token,process.env.ORDER_EMAIL_LINK_KEY||'');
 if(!claims)return null;
 await limitRequest('collection-access',40,600,claims.id);
 const db=orderDb();
 const {data:order,error}=await db.from('orders').select('id,order_code,quantity,customer_email,collection_access_version,ready_at,payment_status,fulfilment_method,fulfilled_at').eq('id',claims.id).single();
 if(error||!order||!accessMatches(claims,order))return null;
 return {claims,order,db};
}
