import {createHTTP,createDeadline} from '../oauth/x/http.mjs';
import {createKanoaSitesTransport} from './sites-transport.mjs';
const origin='https://kanoa.de';
// Fixed destination and minimal outgoing headers. Never retries a write.
export function createPublishingProvider({token,subject,fetchImpl=r=>globalThis.fetch(r)}) {
 if(!/^[A-Za-z0-9._~+/-]{1,4096}$/.test(token)||!/^\d{1,40}$/.test(subject))throw Error('GRANT_INVALID');
 const transport=async request=>{
  if(request.url!==origin+'/api/v1/statuses'||request.method!=='POST')throw Error('ENDPOINT_REJECTED');
  return fetchImpl(new Request(request.url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json','Idempotency-Key':request.headers.get('Idempotency-Key'),'Cache-Control':'no-store'},body:await request.text(),redirect:'manual',credentials:'omit',signal:request.signal,referrerPolicy:'no-referrer'}));
 };
 return {async verify(){const d=createDeadline(15000);try{const r=await createHTTP(createKanoaSitesTransport({fetchImpl}),{requestCache:false,requestRedirect:'manual'})(origin+'/api/v1/accounts/verify_credentials',{method:'GET',headers:{Authorization:'Bearer '+token}},d);if(r.status!==200||r.body.id!==subject)throw Error('ACCOUNT_MISMATCH');}finally{d.close();}},async publish(value){
  if(value.subject!==subject||value.media_ids?.length||!/^[a-f0-9]{64}$/.test(value.idempotencyKey))throw Error('TEXT_ONLY_REQUIRED');
  const d=createDeadline(15000);try{const r=await createHTTP(transport,{requestCache:false,requestRedirect:'manual'})(origin+'/api/v1/statuses',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':value.idempotencyKey},body:new URLSearchParams({status:value.status,visibility:value.visibility,sensitive:String(value.sensitive),spoiler_text:value.spoiler_text})},d);
   if(r.status<200||r.status>=300||r.body?.account?.id!==subject||r.body.visibility!==value.visibility)throw Error('PUBLICATION_UNCONFIRMED');return {id:r.body.id};
  }finally{d.close();}
 }};
}
