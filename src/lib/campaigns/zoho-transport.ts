// Pure transport with injected fetch for offline tests. Never log provider responses.
export type ZohoVote = {email:string;phone:string|null;telegram:string|null;consent:boolean;unsubscribed:boolean;product:string;campaign:string;interest:string;source?:string|null;medium?:string|null;utm_campaign?:string|null;creative?:string|null};
export type ZohoConfig = {clientId:string;clientSecret:string;refreshToken:string;accountsUrl:string;apiDomain:string};
export async function syncZohoVote(config:ZohoConfig, vote:ZohoVote, request:typeof fetch=fetch):Promise<string> {
  const apiHosts=['www.zohoapis.com','www.zohoapis.eu','www.zohoapis.in','www.zohoapis.com.au','www.zohoapis.jp','www.zohoapis.ca','www.zohoapis.com.cn','www.zohoapis.sa'];
  const accountsHosts=['accounts.zoho.com','accounts.zoho.eu','accounts.zoho.in','accounts.zoho.com.au','accounts.zoho.jp','accounts.zoho.ca','accounts.zoho.com.cn','accounts.zoho.sa'];
  for (const [value,hosts] of [[config.apiDomain,apiHosts],[config.accountsUrl,accountsHosts]] as const) {
    const url=new URL(value);
    if(url.protocol!=='https:' || !hosts.includes(url.hostname) || url.username || url.password || url.port || url.search || url.hash || url.pathname!=='/') throw new Error('Invalid Zoho server configuration.');
  }
  const call=async(url:string,init:RequestInit={})=>request(url,{...init,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
  const auth=await call(`${config.accountsUrl}/oauth/v2/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:config.clientId,client_secret:config.clientSecret,refresh_token:config.refreshToken})});
  const token=await auth.json();
  if(!auth.ok || typeof token.access_token!=='string') throw new Error('Zoho token refresh failed. Check credentials and reauthorize.');
  const headers:Record<string,string>={Authorization:`Zoho-oauthtoken ${token.access_token}`,'Content-Type':'application/json'};
  const found=await call(`${config.apiDomain}/crm/v8/Leads/search?email=${encodeURIComponent(vote.email)}`,{headers});
  const search=found.status===204 ? {data:[]} : await found.json();
  if(!found.ok) throw new Error(`Zoho lead lookup failed (${found.status}). Check Leads READ and search permissions.`);
  if (!Array.isArray(search.data)) throw new Error('Zoho lookup returned an unexpected response; no CRM write attempted.');
  const records=search.data as Array<{id:string;Email?:string;Last_Name?:string;Email_Opt_Out?:boolean;Modified_Time?:string;Description?:string}>;
  const matches=records.filter(r=>r.Email?.trim().toLowerCase()===vote.email.trim().toLowerCase());
  if(matches.length>1 || search.info?.more_records) throw new Error('Multiple CRM matches; resolve duplicate leads before retrying.');
  const existing=matches[0];
  const consent=vote.consent && !vote.unsubscribed && !existing?.Email_Opt_Out;
  const payload:Record<string,unknown>={Email:vote.email,SamaSama_Product:vote.product,SamaSama_Campaign:vote.campaign,
    SamaSama_Interest:vote.interest==='yes'?'Yes':vote.interest==='no'?'No':null,Marketing_Consent:consent};
  const note=JSON.stringify({SamaSama:{campaign:vote.campaign,product:vote.product,interest:vote.interest,source:vote.source||null,medium:vote.medium||null,utm_campaign:vote.utm_campaign||null,creative:vote.creative||null}});
  const description=existing?.Description || '';
  if(!description.includes(note)) {
    const appended=description ? `${description}\n${note}` : note;
    if(appended.length>30000) throw new Error('Zoho description is full. Archive its history before retrying.');
    payload.Description=appended;
  }
  if(vote.phone) payload.Mobile=vote.phone;
  if(vote.telegram) payload.Telegram_Handle=vote.telegram;
  // Never clear an opt-out set in CRM. Consent is separate and starts false.
  if(vote.unsubscribed) payload.Email_Opt_Out=true;
  if(existing) {
    payload.id=existing.id;
    if(!existing.Modified_Time) throw new Error('Zoho record is missing a modification timestamp; no CRM write attempted.');
    headers['If-Unmodified-Since']=existing.Modified_Time;
  } else {
    // The form has no name field. Use an explicit placeholder, never invent a person.
    payload.Last_Name='SamaSama voter';
  }
  const result=await call(`${config.apiDomain}/crm/v8/Leads${existing?'':'/upsert'}`,{method:existing?'PUT':'POST',headers,body:JSON.stringify({data:[payload],duplicate_check_fields:['Email'],trigger:[],skip_feature_execution:[{name:'cadences',action:'insert'},{name:'cadences',action:'update'}]})});
  const body=await result.json();
  const item=body.data?.[0];
  if(!result.ok || item?.status!=='success' || !item.details?.id) {
    const code=String(item?.code || body.code || 'UNKNOWN').replace(/[^A-Z_]/g,'').slice(0,60);
    throw new Error(`Zoho lead sync failed (${result.status}, ${code}). Check field names, required fields and permissions.`);
  }
  return String(item.details.id);
}
