// Non-secret admin cursor. Authentication is enforced before any query; cursor never grants access.
export function orderCursor(order:{id:string;created_at:string}){return Buffer.from(JSON.stringify([order.created_at,order.id])).toString('base64url');}
export function parseOrderCursor(value:unknown):{created:string;id:string}|null{
 try{if(typeof value!=='string'||value.length>180)return null;const [created,id]=JSON.parse(Buffer.from(value,'base64url').toString('utf8'));if(typeof created!=='string'||!/^\d{4}-\d{2}-\d{2}T[0-9:.+-]+Z?$/.test(created)||!Number.isFinite(Date.parse(created))||typeof id!=='string'||!/^[a-f0-9-]{36}$/i.test(id))return null;return {created,id};}catch{return null;}
}
