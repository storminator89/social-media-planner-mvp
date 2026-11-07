import {fail,fingerprint,textId,integer,channelId,snapshot,sha256,opaque,isYouTubeCipher} from '../providers/youtube-cipher.mjs';
export const YOUTUBE_STATE_TTL_MS=300000;
export class YouTubeOAuthStateRepository{
 #db;#c;#cipher;#clock;
 constructor(db,{siteId,provider,redirectUri,scopeFingerprint,configFingerprint,contextFingerprint,flowVersion,expectedChannelId,cipher,clock=Date.now}={}){
  let url;try{url=new URL(redirectUri);}catch{fail('STATE_CONFIG_INVALID');}
  if(!db?.prepare||!db?.batch||!textId(siteId)||provider!=='youtube'||!channelId(expectedChannelId)||url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.href!==redirectUri||![scopeFingerprint,configFingerprint,contextFingerprint].every(fingerprint)||flowVersion!=='youtube-web-pkce-v1'||!isYouTubeCipher(cipher)||typeof clock!=='function')fail('STATE_CONFIG_INVALID');
  this.#db=db;this.#c={siteId,provider,redirectUri,scopeFingerprint,configFingerprint,contextFingerprint,flowVersion,expectedChannelId};this.#cipher=cipher;this.#clock=clock;
 }
 #now(){let n;try{n=this.#clock();}catch{fail('STATE_CLOCK_INVALID',503);}if(!integer(n,0,Number.MAX_SAFE_INTEGER-600000))fail('STATE_CLOCK_INVALID',503);return n;}
 #stmt(sql,...values){try{return this.#db.prepare(sql).bind(...values);}catch{fail('STATE_STORAGE_UNCERTAIN',503);}}
 async #batch(stmts){try{return await this.#db.batch(stmts);}catch{fail('STATE_STORAGE_UNCERTAIN',503);}}
 #context(ownerId){const c=this.#c;return{siteId:c.siteId,ownerId,provider:'youtube',configFingerprint:c.configFingerprint,contextFingerprint:c.contextFingerprint,expectedChannelId:c.expectedChannelId};}
 #binding(stateHash,browserBindingHash,nonceFingerprint,createdAtMs,expiresAtMs){const c=this.#c;return{stateHash,browserBindingHash,nonceFingerprint,createdAtMs,expiresAtMs,flowVersion:c.flowVersion,redirectUri:c.redirectUri,scopeFingerprint:c.scopeFingerprint};}
 async begin(owner,browser,input){
  if(!textId(owner))fail('IDENTITY_REQUIRED',401);if(typeof browser!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(browser))fail('STATE_INPUT_INVALID');const v=snapshot(input,['nonceFingerprint','pkceVerifier'],'STATE_INPUT_INVALID');if(!fingerprint(v.nonceFingerprint)||typeof v.pkceVerifier!=='string'||!/^[A-Za-z0-9._~-]{43,128}$/.test(v.pkceVerifier))fail('STATE_INPUT_INVALID');
  const now=this.#now(),expires=now+YOUTUBE_STATE_TTL_MS,state=opaque(),c=this.#c;const [sh,bh]=await Promise.all([sha256(state),sha256(browser)]);const e=await this.#cipher.seal('pkce',this.#context(owner),this.#binding(sh,bh,v.nonceFingerprint,now,expires),v.pkceVerifier);if(this.#now()>=expires)fail('STATE_EXPIRED',409);
  const r=await this.#batch([
   this.#stmt('DELETE FROM planner_youtube_oauth_states WHERE site_id=? AND owner_id=? AND expires_at_ms<=?',c.siteId,owner,now),
   this.#stmt('INSERT INTO planner_youtube_oauth_states(site_id,owner_id,state_hash,browser_binding_hash,provider,redirect_uri,scope_fingerprint,config_fingerprint,flow_version,context_fingerprint,nonce_fingerprint,expected_channel_id,key_id,iv,ciphertext,created_at_ms,expires_at_ms) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM planner_youtube_oauth_states WHERE site_id=? AND owner_id=? AND expires_at_ms>?)<5',c.siteId,owner,sh,bh,'youtube',c.redirectUri,c.scopeFingerprint,c.configFingerprint,c.flowVersion,c.contextFingerprint,v.nonceFingerprint,c.expectedChannelId,e.keyId,e.iv,e.ciphertext,now,expires,c.siteId,owner,now)
  ]);if(Number(r[1]?.meta?.changes)!==1)fail('STATE_LIMIT_REACHED',429);return Object.freeze({state,expiresAtMs:expires});
 }
 async claim(owner,state,browser){
  if(!textId(owner))fail('IDENTITY_REQUIRED',401);if(typeof state!=='string'||typeof browser!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(state)||!/^[A-Za-z0-9_-]{43}$/.test(browser))return false;
  const now=this.#now(),receipt=opaque(),c=this.#c,[sh,bh]=await Promise.all([sha256(state),sha256(browser)]);
  const r=await this.#batch([
   this.#stmt('UPDATE planner_youtube_oauth_states SET consumed_at_ms=?,claim_receipt_id=? WHERE site_id=? AND owner_id=? AND state_hash=? AND browser_binding_hash=? AND provider=? AND redirect_uri=? AND scope_fingerprint=? AND config_fingerprint=? AND context_fingerprint=? AND flow_version=? AND expected_channel_id=? AND consumed_at_ms IS NULL AND created_at_ms<=? AND expires_at_ms>? AND expires_at_ms<=created_at_ms+600000',now,receipt,c.siteId,owner,sh,bh,'youtube',c.redirectUri,c.scopeFingerprint,c.configFingerprint,c.contextFingerprint,c.flowVersion,c.expectedChannelId,now,now),
   this.#stmt('SELECT nonce_fingerprint,key_id,iv,ciphertext,created_at_ms,expires_at_ms FROM planner_youtube_oauth_states WHERE site_id=? AND owner_id=? AND state_hash=? AND claim_receipt_id=?',c.siteId,owner,sh,receipt)
  ]);if(Number(r[0]?.meta?.changes)!==1)return false;const row=r[1]?.results?.[0];if(!row)fail('STATE_STORAGE_UNCERTAIN',503);
  const verifier=await this.#cipher.open('pkce',this.#context(owner),this.#binding(sh,bh,row.nonce_fingerprint,row.created_at_ms,row.expires_at_ms),{version:1,algorithm:'A256GCM',keyId:row.key_id,iv:row.iv,ciphertext:row.ciphertext});if(this.#now()>=row.expires_at_ms)fail('STATE_EXPIRED',409);
  const result={claimed:true,nonceFingerprint:row.nonce_fingerprint};Object.defineProperty(result,'pkceVerifier',{value:verifier,enumerable:false});return Object.freeze(result);
 }
}
