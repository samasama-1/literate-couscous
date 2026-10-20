export type CrmConfig={clientId:string;clientSecret:string;refreshToken:string;accountsUrl:string;apiUrl:string;module:string};
export function validateCrm(c:CrmConfig) {
 const domains:Record<string,string>={'https://accounts.zoho.com':'https://www.zohoapis.com','https://accounts.zoho.sg':'https://www.zohoapis.sg','https://accounts.zoho.com.au':'https://www.zohoapis.com.au','https://accounts.zoho.eu':'https://www.zohoapis.eu','https://accounts.zoho.in':'https://www.zohoapis.in','https://accounts.zoho.com.cn':'https://www.zohoapis.com.cn','https://accounts.zoho.jp':'https://www.zohoapis.jp','https://accounts.zohocloud.ca':'https://www.zohoapis.ca'};
 if(!c.clientId||!c.clientSecret||!c.refreshToken||domains[c.accountsUrl]!==c.apiUrl||!/^SamaSama_Orders$/.test(c.module))throw Error('CRM_CONFIGURATION');
}
// Screenshot-confirmed writable field names only. Created_By/Modified_By are audit fields.
export const orderFieldTypes:Record<string,readonly string[]>={
 Name:['text'],Customer_Name:['text'],Email:['email'],Customer_Phone:['phone'],Quantity:['integer'],
 Payment_Status:['text'],Deposit_Cents:['bigint'],Final_Total_Cents:['bigint'],Balance_Cents:['bigint'],
 Registered_At:['datetime'],Fulfilment_Status:['text'],Status_Changed_At:['datetime'],
};
export function validateOrderFields(value:unknown) {
 const fields=(value as {fields?:unknown})?.fields;
 if(!Array.isArray(fields))throw Error('CRM_FIELD_CONFIGURATION');
 for(const [name,types] of Object.entries(orderFieldTypes)){
  const f=fields.find(f=>f?.api_name===name);
  if(!f || !types.includes(f.data_type) || f.field_read_only===true || f.read_only===true
   || f.operation_type?.api_create!==true || f.operation_type?.api_update!==true
   || (name!=='Name' && (f.unique===true || (f.unique && Object.keys(f.unique).length>0))))throw Error('CRM_FIELD_CONFIGURATION');
 }
}
function date(value:unknown):string|null {
 if(value==null)return null;
 if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))throw Error('CRM_SOURCE_DATE');
 return new Date(value).toISOString().replace(/\.\d{3}Z$/,'+00:00');
}
export function orderSummary(o:Record<string,unknown>) {
 const full=o.payment_status==='VERIFIED'&&[o.final_total_cents,o.deposit_due_cents,o.balance_due_cents].every(v=>Number.isSafeInteger(v)&&Number(v)>=0)
  && o.final_total_cents===Number(o.deposit_due_cents)+Number(o.balance_due_cents) && (o.balance_due_cents===0||!!o.balance_paid_at);
 const payment=o.payment_status==='REFUNDED'?'Refunded':o.payment_status==='PENDING_PAYNOW'?'Awaiting deposit':o.payment_status!=='VERIFIED'?'Needs review':full?'Fully paid':o.balance_requested_at&&Number(o.balance_due_cents)>0?'Awaiting balance':'Deposit verified';
 const fulfilment=o.payment_status==='REFUNDED'?'Cancelled':o.fulfilled_at?full?(o.fulfilment_method==='delivery'?'Delivered':'Collected'):'Needs review':o.ready_at?full?'Ready':'Needs review':o.payment_status==='VERIFIED'?'Preparing':'Pending';
 // The persisted timestamp tracks fulfilment changes, not sync attempts or payment-only changes.
 // Existing pre-migration rows use known milestones; unknown cancellation time stays null.
 const changed=o.fulfilment_status_changed_at??(o.payment_status==='REFUNDED'?null:o.fulfilled_at??o.ready_at??(o.payment_status==='VERIFIED'?o.deposit_verified_at??null:o.created_at));
 return {payment,fulfilment,changed:date(changed)};
}
export function crmRecord(o:Record<string,unknown>) {
 const state=orderSummary(o);
 if(typeof o.order_code!=='string'||!/^SAMA-[A-F0-9]{16}$/.test(o.order_code))throw Error('CRM_ORDER_CODE');
 return {Name:o.order_code,Customer_Name:o.customer_name,Email:o.customer_email,Customer_Phone:o.customer_phone,
 Quantity:o.quantity,Payment_Status:state.payment,Deposit_Cents:o.deposit_due_cents,Final_Total_Cents:o.final_total_cents,
 Balance_Cents:o.balance_due_cents,Registered_At:date(o.created_at),Fulfilment_Status:state.fulfilment,Status_Changed_At:state.changed};
}
export async function prepareCrm(c:CrmConfig,request:typeof fetch=fetch) {
 validateCrm(c);
 const response=await request(`${c.accountsUrl}/oauth/v2/token`,{method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:c.clientId,client_secret:c.clientSecret,refresh_token:c.refreshToken})});
 const auth=await response.json();if(!response.ok||typeof auth.access_token!=='string'||!auth.access_token||/[\r\n]/.test(auth.access_token))throw Error('CRM_AUTHORIZATION');
 const schema=await request(`${c.apiUrl}/crm/v8/settings/fields?module=${encodeURIComponent(c.module)}`,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:`Zoho-oauthtoken ${auth.access_token}`}});
 if(!schema.ok)throw Error('CRM_FIELD_CONFIGURATION');validateOrderFields(await schema.json());
 return async (record:Record<string,unknown>)=>{
 const result=await request(`${c.apiUrl}/crm/v8/${c.module}/upsert`,{method:'POST',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:`Zoho-oauthtoken ${auth.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({data:[record],duplicate_check_fields:['Name'],trigger:[],skip_feature_execution:[{name:'cadences',action:'insert'},{name:'cadences',action:'update'}]})});
 const data=await result.json();const row=data?.data?.[0];if(!result.ok||row?.status!=='success'||typeof row?.details?.id!=='string'||!/^\d{1,30}$/.test(row.details.id))throw Error('CRM_WRITE_UNCONFIRMED');return row.details.id as string;
 };
}
