import {fail,fingerprint,textId,isTokenCipher,validateAccessToken,dataSnapshot,stringArraySnapshot} from './token-cipher.mjs';
const tickets=new WeakMap();
const REQUIRED_SCOPES=Object.freeze(['openid','profile','w_member_social']);
const stateHash=value=>fingerprint(value);
const revision=value=>Number.isSafeInteger(value)&&value>=0;
const owner=value=>{if(!textId(value))fail('IDENTITY_REQUIRED',401);return value;};
const canonicalScopes=value=>{const scopes=stringArraySnapshot(value,REQUIRED_SCOPES.length,'GRANT_SCOPES_INVALID').sort();if(scopes.join(' ')!==REQUIRED_SCOPES.join(' '))fail('GRANT_SCOPES_INVALID');return scopes;};
function grantSnapshot(source,now){
  const grant=dataSnapshot(source,['accessToken','tokenType','subject','scopes','expiresAtMs'],'GRANT_INVALID');
  if(grant.tokenType!=='Bearer'||!textId(grant.subject)||!Number.isSafeInteger(grant.expiresAtMs)||grant.expiresAtMs<=now)fail('GRANT_INVALID');
  return{accessToken:validateAccessToken(grant.accessToken),tokenType:'Bearer',subject:grant.subject,scopes:canonicalScopes(grant.scopes),expiresAtMs:grant.expiresAtMs};
}
/** Server-only store. A grant parameter must be a complete, independently
 * verified result of the closed OAuth transport, never JSON accepted from HTTP.
 * No refresh token is accepted or stored. No provider capability is activated. */
export class CredentialStore{
  #db;#site;#provider;#config;#context;#cipher;#clock;#brand=Object.freeze({});
  constructor(db,{siteId,provider,configFingerprint,contextFingerprint,cipher,clock=Date.now}={}){
    if(!db?.prepare||!db?.batch||!textId(siteId)||provider!=='linkedin'||!fingerprint(configFingerprint)||!fingerprint(contextFingerprint)||!isTokenCipher(cipher)||typeof clock!=='function')fail('STORE_CONFIG_INVALID');
    this.#db=db;this.#site=siteId;this.#provider=provider;this.#config=configFingerprint;this.#context=contextFingerprint;this.#cipher=cipher;this.#clock=clock;
  }
  #now(){let now;try{now=this.#clock();}catch{fail('STORE_CLOCK_INVALID',503);}if(!Number.isSafeInteger(now)||now<0||now>Number.MAX_SAFE_INTEGER-600000)fail('STORE_CLOCK_INVALID',503);return now;}
  #stmt(sql,...values){try{return this.#db.prepare(sql).bind(...values);}catch{fail('STORE_UNAVAILABLE',503);}}
  async #run(stmt){try{return await stmt.run();}catch{fail('STORE_OUTCOME_UNCERTAIN',503);}}
  async #batch(stmts){try{return await this.#db.batch(stmts);}catch{fail('STORE_OUTCOME_UNCERTAIN',503);}}
  async #row(who,connectionId){try{return await this.#stmt('SELECT * FROM planner_provider_credentials WHERE site_id=? AND owner_id=? AND provider=? AND connection_id=?',this.#site,who,this.#provider,connectionId).first();}catch{fail('STORE_UNAVAILABLE',503);}}
  #ctx(who,connectionId){return{siteId:this.#site,ownerId:who,provider:this.#provider,connectionId,configFingerprint:this.#config,contextFingerprint:this.#context};}
  #meta(row){let scopes;try{scopes=JSON.parse(row.scopes_json);}catch{fail('STORE_RECORD_INVALID',503);}return{revision:row.revision,epoch:row.auth_epoch,subject:row.subject,scopes,expiresAtMs:row.expires_at_ms};}
  #envelope(row){return{version:row.cipher_version,algorithm:'A256GCM',keyId:row.key_id,iv:row.iv,ciphertext:row.ciphertext};}
  async createInstallTicket(who,input){
    owner(who);const hash=input?.stateHash,expiry=input?.expiresAtMs;const now=this.#now();if(!stateHash(hash)||!Number.isSafeInteger(expiry)||expiry<=now||expiry>now+600000)fail('INSTALL_INPUT_INVALID');
    const conn=crypto.randomUUID();const s=this.#site,p=this.#provider,c=this.#config,x=this.#context;
    const validState='SELECT 1 FROM planner_oauth_states WHERE site_id=? AND owner_id=? AND state_hash=? AND provider=? AND config_fingerprint=? AND context_fingerprint=? AND expires_at_ms=? AND created_at_ms<=? AND expires_at_ms>? AND consumed_at_ms IS NULL';
    const values=[s,who,hash,p,c,x,expiry,now,now];
    const result=await this.#batch([
      this.#stmt('DELETE FROM planner_oauth_install_tickets WHERE site_id=? AND owner_id=? AND expires_at_ms<=?',s,who,now),
      this.#stmt(`INSERT INTO planner_provider_credentials (site_id,owner_id,provider,connection_id,config_fingerprint,context_fingerprint,created_at_ms,updated_at_ms) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (${validState}) ON CONFLICT(site_id,owner_id,provider) DO NOTHING`,s,who,p,conn,c,x,now,now,...values),
      this.#stmt(`INSERT INTO planner_oauth_install_tickets (site_id,owner_id,state_hash,provider,config_fingerprint,context_fingerprint,connection_id,expected_revision,expected_epoch,created_at_ms,expires_at_ms) SELECT site_id,owner_id,?,provider,config_fingerprint,context_fingerprint,connection_id,revision,auth_epoch,?,? FROM planner_provider_credentials WHERE site_id=? AND owner_id=? AND provider=? AND config_fingerprint=? AND context_fingerprint=? AND lifecycle='empty' AND EXISTS (${validState}) AND (SELECT COUNT(*) FROM planner_oauth_install_tickets WHERE site_id=? AND owner_id=? AND expires_at_ms>?) < 5 ON CONFLICT(site_id,owner_id,state_hash) DO NOTHING`,hash,now,expiry,s,who,p,c,x,...values,s,who,now),
      this.#stmt(`SELECT t.connection_id,t.expected_revision,t.expected_epoch,t.expires_at_ms FROM planner_oauth_install_tickets t JOIN planner_provider_credentials c ON c.site_id=t.site_id AND c.owner_id=t.owner_id AND c.provider=t.provider AND c.connection_id=t.connection_id WHERE t.site_id=? AND t.owner_id=? AND t.state_hash=? AND t.config_fingerprint=? AND t.context_fingerprint=? AND t.status='pending' AND c.lifecycle='empty' AND c.revision=t.expected_revision AND c.auth_epoch=t.expected_epoch AND EXISTS (${validState})`,s,who,hash,c,x,...values)
    ]);
    const row=result[3]?.results?.[0];if(!row)fail('INSTALL_NOT_AVAILABLE',409);
    return{connectionId:row.connection_id,expectedRevision:row.expected_revision,epoch:row.expected_epoch,expiresAtMs:row.expires_at_ms};
  }
  async getInstallTicket(who,hash){
    owner(who);if(!stateHash(hash))fail('INSTALL_NOT_AVAILABLE',409);const now=this.#now(),receipt=crypto.randomUUID();const s=this.#site,p=this.#provider,c=this.#config,x=this.#context;
    const result=await this.#batch([
      this.#stmt("UPDATE planner_oauth_install_tickets SET status='checked_out',checkout_receipt=? WHERE site_id=? AND owner_id=? AND state_hash=? AND provider=? AND config_fingerprint=? AND context_fingerprint=? AND status='pending' AND created_at_ms<=? AND expires_at_ms>? AND EXISTS (SELECT 1 FROM planner_provider_credentials c WHERE c.site_id=planner_oauth_install_tickets.site_id AND c.owner_id=planner_oauth_install_tickets.owner_id AND c.provider=planner_oauth_install_tickets.provider AND c.connection_id=planner_oauth_install_tickets.connection_id AND c.config_fingerprint=? AND c.context_fingerprint=? AND c.lifecycle='empty' AND c.revision=planner_oauth_install_tickets.expected_revision AND c.auth_epoch=planner_oauth_install_tickets.expected_epoch) AND EXISTS (SELECT 1 FROM planner_oauth_states s WHERE s.site_id=planner_oauth_install_tickets.site_id AND s.owner_id=planner_oauth_install_tickets.owner_id AND s.state_hash=planner_oauth_install_tickets.state_hash AND s.provider=? AND s.config_fingerprint=? AND s.context_fingerprint=? AND s.consumed_at_ms IS NOT NULL AND s.consumed_at_ms<=? AND s.expires_at_ms=planner_oauth_install_tickets.expires_at_ms AND s.expires_at_ms>?)",receipt,s,who,hash,p,c,x,now,now,c,x,p,c,x,now,now),
      this.#stmt('SELECT connection_id,expected_revision,expected_epoch,expires_at_ms FROM planner_oauth_install_tickets WHERE site_id=? AND owner_id=? AND state_hash=? AND checkout_receipt=? AND status=?',s,who,hash,receipt,'checked_out')
    ]);
    if(Number(result[0]?.meta?.changes)!==1)fail('INSTALL_NOT_AVAILABLE',409);const row=result[1]?.results?.[0];if(!row)fail('STORE_OUTCOME_UNCERTAIN',503);
    const handle=Object.freeze({type:'OAuthInstallTicket'});tickets.set(handle,{brand:this.#brand,owner:who,stateHash:hash,receipt,connectionId:row.connection_id,version:row.expected_revision,epoch:row.expected_epoch,expiresAtMs:row.expires_at_ms,used:false});return handle;
  }
  async commitGrant(who,input){
    const {ticket,grant,attemptBinding}=dataSnapshot(input,['ticket','grant','attemptBinding'],'INSTALL_BINDING_INVALID');
    owner(who);const record=tickets.get(ticket);if(!record||record.brand!==this.#brand||record.owner!==who||record.used)fail('INSTALL_TICKET_INVALID',409);
    // Mark the internal handle spent BEFORE async work. Failure/unknown outcome
    // must not turn into a second token install or an automatic exchange retry.
    record.used=true;
    const binding=dataSnapshot(attemptBinding,['ownerId','siteId','configFingerprint','contextFingerprint','stateHash'],'INSTALL_BINDING_INVALID');
    if(binding.ownerId!==who||binding.siteId!==this.#site||binding.configFingerprint!==this.#config||binding.contextFingerprint!==this.#context||binding.stateHash!==record.stateHash)fail('INSTALL_BINDING_INVALID',409);
    const now=this.#now();if(now>=record.expiresAtMs)fail('INSTALL_EXPIRED',409);
    const value=grantSnapshot(grant,now);const meta={revision:record.version+1,epoch:record.epoch+1,subject:value.subject,scopes:value.scopes,expiresAtMs:value.expiresAtMs};
    const envelope=await this.#cipher.seal(this.#ctx(who,record.connectionId),meta,value.accessToken);
    const time=this.#now();if(time>=record.expiresAtMs||time>=value.expiresAtMs)fail('INSTALL_EXPIRED',409);const receipt=crypto.randomUUID();const s=this.#site,p=this.#provider,c=this.#config,x=this.#context;
    const result=await this.#batch([
      this.#stmt("UPDATE planner_provider_credentials SET lifecycle='active',revision=?,auth_epoch=?,subject=?,scopes_json=?,expires_at_ms=?,key_id=?,iv=?,ciphertext=?,last_write_receipt=?,updated_at_ms=? WHERE site_id=? AND owner_id=? AND provider=? AND connection_id=? AND config_fingerprint=? AND context_fingerprint=? AND lifecycle='empty' AND revision=? AND auth_epoch=? AND EXISTS (SELECT 1 FROM planner_oauth_install_tickets t JOIN planner_oauth_states a ON a.site_id=t.site_id AND a.owner_id=t.owner_id AND a.state_hash=t.state_hash WHERE t.site_id=? AND t.owner_id=? AND t.state_hash=? AND t.checkout_receipt=? AND t.status='checked_out' AND t.provider=? AND t.config_fingerprint=? AND t.context_fingerprint=? AND t.connection_id=? AND t.expected_revision=? AND t.expected_epoch=? AND t.expires_at_ms>? AND a.provider=? AND a.config_fingerprint=? AND a.context_fingerprint=? AND a.expires_at_ms=t.expires_at_ms AND a.consumed_at_ms IS NOT NULL AND a.consumed_at_ms<=? AND a.expires_at_ms>?)",meta.revision,meta.epoch,value.subject,JSON.stringify(value.scopes),value.expiresAtMs,envelope.keyId,envelope.iv,envelope.ciphertext,receipt,time,s,who,p,record.connectionId,c,x,record.version,record.epoch,s,who,record.stateHash,record.receipt,p,c,x,record.connectionId,record.version,record.epoch,time,p,c,x,time,time),
      this.#stmt("UPDATE planner_oauth_install_tickets SET status='committed',completed_at_ms=? WHERE site_id=? AND owner_id=? AND state_hash=? AND checkout_receipt=? AND status='checked_out' AND EXISTS (SELECT 1 FROM planner_provider_credentials c WHERE c.site_id=? AND c.owner_id=? AND c.provider=? AND c.connection_id=? AND c.last_write_receipt=?)",time,s,who,record.stateHash,record.receipt,s,who,p,record.connectionId,receipt)
    ]);
    if(Number(result[0]?.meta?.changes)!==1||Number(result[1]?.meta?.changes)!==1)fail('INSTALL_FENCE_CHANGED',409);
    return this.getMetadata(who);
  }
  async getMetadata(who){
    owner(who);let row;try{row=await this.#stmt('SELECT * FROM planner_provider_credentials WHERE site_id=? AND owner_id=? AND provider=?',this.#site,who,this.#provider).first();}catch{fail('STORE_UNAVAILABLE',503);}
    if(!row)return{provider:this.#provider,state:'not_connected',connectionId:null,revision:0,authEpoch:0,expiresAtMs:null,canPublish:false,canRefresh:false};
    // A visible verified identity requires an authentic envelope under a currently
    // available key. The decrypted string is never returned by this repository.
    if(row.lifecycle==='active'&&row.config_fingerprint===this.#config&&row.context_fingerprint===this.#context)await this.#cipher.open(this.#ctx(who,row.connection_id),this.#meta(row),this.#envelope(row));
    const state=(row.config_fingerprint!==this.#config||row.context_fingerprint!==this.#context)?'configuration_changed':row.lifecycle==='active'?(row.expires_at_ms<=this.#now()?'expired':'identity_verified'):row.lifecycle==='empty'?'not_connected':'disconnected';
    return{provider:this.#provider,state,connectionId:row.connection_id,revision:row.revision,authEpoch:row.auth_epoch,expiresAtMs:row.expires_at_ms,canPublish:false,canRefresh:false};
  }
  async disconnect(who,connectionId,expectedRevision){
    owner(who);if(!textId(connectionId)||!revision(expectedRevision))fail('DISCONNECT_INPUT_INVALID');const time=this.#now(),receipt=crypto.randomUUID();const s=this.#site,p=this.#provider;
    const result=await this.#batch([
      this.#stmt("UPDATE planner_provider_credentials SET lifecycle='disconnected',revision=revision+1,auth_epoch=auth_epoch+1,subject=NULL,scopes_json='[]',expires_at_ms=NULL,key_id=NULL,iv=NULL,ciphertext=NULL,last_write_receipt=?,updated_at_ms=? WHERE site_id=? AND owner_id=? AND provider=? AND connection_id=? AND revision=?",receipt,time,s,who,p,connectionId,expectedRevision),
      this.#stmt("UPDATE planner_oauth_install_tickets SET status='cancelled',completed_at_ms=? WHERE site_id=? AND owner_id=? AND provider=? AND connection_id=? AND status IN ('pending','checked_out') AND EXISTS (SELECT 1 FROM planner_provider_credentials c WHERE c.site_id=? AND c.owner_id=? AND c.provider=? AND c.connection_id=? AND c.last_write_receipt=?)",time,s,who,p,connectionId,s,who,p,connectionId,receipt)
    ]);
    if(Number(result[0]?.meta?.changes)!==1)fail('CREDENTIAL_REVISION_CONFLICT',409);return this.getMetadata(who);
  }
  async rewrap(who,connectionId,expectedRevision){
    owner(who);if(!textId(connectionId)||!revision(expectedRevision))fail('ROTATION_INPUT_INVALID');const row=await this.#row(who,connectionId);if(!row||row.lifecycle!=='active'||row.config_fingerprint!==this.#config||row.context_fingerprint!==this.#context||row.revision!==expectedRevision)fail('CREDENTIAL_REVISION_CONFLICT',409);
    const ctx=this.#ctx(who,connectionId),meta=this.#meta(row);const accessToken=await this.#cipher.open(ctx,meta,this.#envelope(row));const next={...meta,revision:meta.revision+1};const envelope=await this.#cipher.seal(ctx,next,accessToken);const now=this.#now();
    const result=await this.#run(this.#stmt("UPDATE planner_provider_credentials SET revision=?,key_id=?,iv=?,ciphertext=?,updated_at_ms=? WHERE site_id=? AND owner_id=? AND provider=? AND connection_id=? AND config_fingerprint=? AND context_fingerprint=? AND lifecycle='active' AND revision=? AND auth_epoch=?",next.revision,envelope.keyId,envelope.iv,envelope.ciphertext,now,this.#site,who,this.#provider,connectionId,this.#config,this.#context,expectedRevision,row.auth_epoch));
    if(Number(result?.meta?.changes)!==1)fail('CREDENTIAL_REVISION_CONFLICT',409);return this.getMetadata(who);
  }
}
