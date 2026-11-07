/** Offline quarantine vault; never imported by public routes. No usable token
 * accessor, expiry inference, refresh, reconnect, grant or publishing capability.
 * A consumed OAuth state is local correlation, NOT code-injection protection. */
import {fail,fingerprint,textId,accountId,isInstagramCipher,snapshot,sha256} from './token-cipher.mjs';
import {isVerifiedInstagramResult} from './oauth-transport.mjs';
export class InstagramCredentialStore {
 #db;#config;#cipher;#clock;
 constructor(db,{siteId,configFingerprint,contextFingerprint,expectedAccountId,cipher,clock=Date.now}={}){
  if(!db?.prepare||!db?.batch||!textId(siteId)||!fingerprint(configFingerprint)||!fingerprint(contextFingerprint)||!accountId(expectedAccountId)||!isInstagramCipher(cipher)||typeof clock!=='function')fail('STORE_CONFIG_INVALID');
  this.#db=db;this.#config={siteId,configFingerprint,contextFingerprint,expectedAccountId};this.#cipher=cipher;this.#clock=clock;
 }
 #now(){let now;try{now=this.#clock();}catch{fail('STORE_CLOCK_INVALID',503);}if(!Number.isSafeInteger(now)||now<0)fail('STORE_CLOCK_INVALID',503);return now;}
 #owner(owner){if(!textId(owner))fail('IDENTITY_REQUIRED',401);}
 #stmt(sql,...values){return this.#db.prepare(sql).bind(...values);}
 async #run(sql,...values){try{return await this.#stmt(sql,...values).run();}catch{fail('STORE_OUTCOME_UNCERTAIN',503);}}
 async #row(owner){try{return await this.#stmt('SELECT * FROM planner_instagram_vault WHERE site_id=? AND owner_id=?',this.#config.siteId,owner).first();}catch{fail('STORE_UNAVAILABLE',503);}}
 #ctx(owner){return {siteId:this.#config.siteId,ownerId:owner,provider:'instagram',configFingerprint:this.#config.configFingerprint,contextFingerprint:this.#config.contextFingerprint,expectedAccountId:this.#config.expectedAccountId};}
 #matches(r){return r.config_fingerprint===this.#config.configFingerprint&&r.context_fingerprint===this.#config.contextFingerprint&&r.expected_account_id===this.#config.expectedAccountId;}
 #binding(r){return {connectionId:r.connection_id,revision:r.revision,stateHash:r.state_hash,accountId:r.expected_account_id,verifiedAtMs:r.verified_at_ms};}
 async #open(owner,r){let e;try{e=JSON.parse(r.envelope);}catch{fail('ENVELOPE_INVALID');}return this.#cipher.open('token',this.#ctx(owner),this.#binding(r),e);}
 /** Reserve before consuming state. Input is server-held state, never HTTP JSON. */
 async reserve(owner,state){
  this.#owner(owner);if(typeof state!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(state))fail('INSTALL_INPUT_INVALID');
  const hash=await sha256(state),now=this.#now(),c=this.#config,id=crypto.randomUUID();
  const result=await this.#run(`INSERT INTO planner_instagram_vault (site_id,owner_id,connection_id,config_fingerprint,context_fingerprint,expected_account_id,state_hash,revision,lifecycle)
   SELECT ?,?,?,?,?,?,?,1,'pending' WHERE EXISTS (SELECT 1 FROM planner_oauth_states WHERE site_id=? AND owner_id=? AND state_hash=? AND provider='instagram' AND config_fingerprint=? AND context_fingerprint=? AND consumed_at_ms IS NULL AND created_at_ms<=? AND expires_at_ms>? AND expires_at_ms-created_at_ms BETWEEN 1 AND 600000)
   ON CONFLICT(site_id,owner_id) DO NOTHING`,c.siteId,owner,id,c.configFingerprint,c.contextFingerprint,c.expectedAccountId,hash,c.siteId,owner,hash,c.configFingerprint,c.contextFingerprint,now,now);
  if(Number(result?.meta?.changes)!==1)fail('INSTALL_NOT_AVAILABLE',409);
  return Object.freeze({connectionId:id,revision:1});
 }
 /** Only in-process verifier results accepted, never serialized provider/browser data.
  * Stored tokens remain quarantined because expiry and response protection are unverified. */
 async install(owner,input){
  this.#owner(owner);const {connectionId,expectedRevision,verification}=snapshot(input,['connectionId','expectedRevision','verification']);
  if(!isVerifiedInstagramResult(verification)||!textId(connectionId)||expectedRevision!==1||verification.accountId!==this.#config.expectedAccountId)fail('INSTALL_INPUT_INVALID');
  const row=await this.#row(owner),now=this.#now();
  if(!row||!this.#matches(row)||row.connection_id!==connectionId||row.revision!==expectedRevision||row.lifecycle!=='pending'||verification.verifiedAtMs>now)fail('INSTALL_NOT_AVAILABLE',409);
  const next={...row,revision:2,verified_at_ms:verification.verifiedAtMs};
  const envelope=await this.#cipher.seal('token',this.#ctx(owner),this.#binding(next),verification.accessToken);
  const time=this.#now(),c=this.#config;
  const result=await this.#run(`UPDATE planner_instagram_vault SET lifecycle='quarantined',revision=2,verified_at_ms=?,envelope=? WHERE site_id=? AND owner_id=? AND connection_id=? AND revision=1 AND lifecycle='pending' AND config_fingerprint=? AND context_fingerprint=? AND expected_account_id=? AND EXISTS (SELECT 1 FROM planner_oauth_states s WHERE s.site_id=planner_instagram_vault.site_id AND s.owner_id=planner_instagram_vault.owner_id AND s.state_hash=planner_instagram_vault.state_hash AND s.provider='instagram' AND s.config_fingerprint=? AND s.context_fingerprint=? AND s.consumed_at_ms IS NOT NULL AND s.consumed_at_ms<=? AND s.created_at_ms<=s.consumed_at_ms AND s.expires_at_ms>? AND s.expires_at_ms-s.created_at_ms BETWEEN 1 AND 600000)`,verification.verifiedAtMs,JSON.stringify(envelope),c.siteId,owner,connectionId,c.configFingerprint,c.contextFingerprint,c.expectedAccountId,c.configFingerprint,c.contextFingerprint,verification.verifiedAtMs,time);
  if(Number(result?.meta?.changes)!==1)fail('INSTALL_FENCE_CHANGED',409);
  return this.getMetadata(owner);
 }
 async getMetadata(owner){
  this.#owner(owner);const r=await this.#row(owner);let state='not_connected';
  if(r){state=!this.#matches(r)?'configuration_changed':r.lifecycle;if(state==='quarantined')await this.#open(owner,r);}
  return Object.freeze({provider:'instagram',state,connectionId:r?.connection_id??null,revision:r?.revision??0,connected:false,canPublish:false,canRefresh:false,expiresAtMs:null});
 }
 /** Local removal only. Tombstone prevents late install and reconnect. */
 async disconnect(owner,connectionId,expectedRevision){
  this.#owner(owner);if(!textId(connectionId)||!Number.isSafeInteger(expectedRevision)||expectedRevision<1)fail('DISCONNECT_INPUT_INVALID');
  const result=await this.#run("UPDATE planner_instagram_vault SET lifecycle='disconnected',revision=revision+1,envelope=NULL,verified_at_ms=NULL WHERE site_id=? AND owner_id=? AND connection_id=? AND revision=? AND lifecycle!='disconnected'",this.#config.siteId,owner,connectionId,expectedRevision);
  if(Number(result?.meta?.changes)!==1)fail('CREDENTIAL_REVISION_CONFLICT',409);return this.getMetadata(owner);
 }
 async rewrap(owner,connectionId,expectedRevision){
  this.#owner(owner);const r=await this.#row(owner);if(!r||!this.#matches(r)||r.connection_id!==connectionId||r.revision!==expectedRevision||r.lifecycle!=='quarantined')fail('CREDENTIAL_REVISION_CONFLICT',409);
  const token=await this.#open(owner,r),next={...r,revision:r.revision+1};const envelope=await this.#cipher.seal('token',this.#ctx(owner),this.#binding(next),token);
  const result=await this.#run("UPDATE planner_instagram_vault SET revision=revision+1,envelope=? WHERE site_id=? AND owner_id=? AND connection_id=? AND revision=? AND lifecycle='quarantined'",JSON.stringify(envelope),this.#config.siteId,owner,connectionId,expectedRevision);
  if(Number(result?.meta?.changes)!==1)fail('CREDENTIAL_REVISION_CONFLICT',409);return this.getMetadata(owner);
 }
}
