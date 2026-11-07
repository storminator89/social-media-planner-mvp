/** Offline Instagram state lifecycle only. The legacy nonce_fingerprint SQL
 * column holds a local attempt correlation hash, NOT a Meta/OIDC nonce.
 * No PKCE or provider code binding is claimed.
 * Offline OAuth-state lifecycle only. No HTTP routes, fetch, authorization URL,
 * token exchange, grants, PKCE-verifier storage or provider connection mutations.
 * State creation/claim is NOT an OAuth connection or publication authorization. */
export const OAUTH_STATE_TTL_MS=300000;
export const OAUTH_STATE_MAX_TTL_MS=600000;
export const OAUTH_STATE_OWNER_LIMIT=5;
export class OAuthStateError extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code;}}
const ERROR_TEXT=Object.freeze({STATE_CONFIG_INVALID:'OAuth-State-Konfiguration ist ungültig.',STATE_INPUT_INVALID:'OAuth-State-Eingabe ist ungültig.',STATE_IDENTITY_REQUIRED:'Eine bestätigte Besucheridentität ist erforderlich.',STATE_LIMIT_REACHED:'Zu viele noch gültige Anmeldeversuche. Bitte später erneut starten.',STATE_STORAGE_UNCERTAIN:'Der OAuth-State konnte nicht sicher bestätigt werden. Kein Tokenaustausch zulässig.',STATE_CLOCK_INVALID:'Die Serverzeit ist ungültig.'});
function fail(code,status=400){throw new OAuthStateError(status,code,ERROR_TEXT[code]);}
function validOwner(owner){return typeof owner==='string'&&owner.trim().length>0&&owner.length<=256&&!/[\u0000-\u001f\u007f]/.test(owner);}
function validOpaque(value){return typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value);}
function configText(value){return typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=256&&!/[\u0000-\u001f\u007f]/.test(value);}
function hexFingerprint(value){return typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);}
function fixedRedirect(value){
  if(typeof value!=='string'||value.length>2048)return false;
  let url;try{url=new URL(value);}catch{return false;}
  return url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash&&url.href===value&&!['/callback','/signin-with-chatgpt','/signout-with-chatgpt'].includes(url.pathname);
}
function base64url(bytes){let binary='';for(const value of bytes)binary+=String.fromCharCode(value);return btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
async function sha256(value){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');}
/** Config is fixed server-owned configuration, never copied from a browser body.
 * siteId is the selected Site's exact verified ID. scopeFingerprint/configFingerprint
 * identify nonsecret server-allowlisted app/scopes/config. clock is server-owned.
 * browserBinding MUST come from a separately generated Secure/HttpOnly/SameSite=Lax
 * cookie or an independently verified equivalent session, not JSON or query input.
 * Cookie behavior on a real Sites OAuth callback has NOT been verified here. */
export class InstagramStateRepository {
  #db;#config;#clock;
  constructor(db,{siteId,provider,redirectUri,scopeFingerprint,configFingerprint,flowVersion,contextFingerprint,clock=Date.now}={}){
    if(!db?.prepare||!db?.batch||!configText(siteId)||provider!=='instagram'||!fixedRedirect(redirectUri)||!hexFingerprint(scopeFingerprint)||!hexFingerprint(configFingerprint)||!configText(flowVersion)||!hexFingerprint(contextFingerprint)||typeof clock!=='function')fail('STATE_CONFIG_INVALID');
    this.#db=db;this.#config=Object.freeze({siteId,provider,redirectUri,scopeFingerprint,configFingerprint,flowVersion,contextFingerprint});this.#clock=clock;
  }
  #now(){let value;try{value=this.#clock();}catch{fail('STATE_CLOCK_INVALID',503);}if(!Number.isSafeInteger(value)||value<0||value>Number.MAX_SAFE_INTEGER-OAUTH_STATE_MAX_TTL_MS)fail('STATE_CLOCK_INVALID',503);return value;}
  #stmt(sql,...values){return this.#db.prepare(sql).bind(...values);}
  async begin(owner,browserBinding,{attemptFingerprint}={}){
    if(!validOwner(owner))fail('STATE_IDENTITY_REQUIRED',401);if(!validOpaque(browserBinding)||!hexFingerprint(attemptFingerprint))fail('STATE_INPUT_INVALID');
    const time=this.#now();const {siteId,provider,redirectUri,scopeFingerprint,configFingerprint,flowVersion,contextFingerprint}=this.#config;
    // 256 random bits, fresh for every transaction. Never caller-supplied.
    const state=base64url(crypto.getRandomValues(new Uint8Array(32)));
    const [stateHash,browserHash]=await Promise.all([sha256(state),sha256(browserBinding)]);
    if(attemptFingerprint===browserHash)fail('STATE_INPUT_INVALID');
    let result;
    try{
      // Bounded owner-only cleanup; consumed entries remain until expiry so the
      // quota also limits repeated consumed attempts within the five-minute window.
      await this.#stmt('DELETE FROM planner_oauth_states WHERE site_id=? AND owner_id=? AND state_hash IN (SELECT state_hash FROM planner_oauth_states WHERE site_id=? AND owner_id=? AND expires_at_ms<=? ORDER BY expires_at_ms LIMIT 100)',siteId,owner,siteId,owner,time).run();
      result=await this.#stmt('INSERT INTO planner_oauth_states (site_id,owner_id,state_hash,browser_binding_hash,provider,redirect_uri,scope_fingerprint,config_fingerprint,flow_version,context_fingerprint,nonce_fingerprint,created_at_ms,expires_at_ms) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM planner_oauth_states WHERE site_id=? AND owner_id=? AND expires_at_ms>?) < ?',siteId,owner,stateHash,browserHash,provider,redirectUri,scopeFingerprint,configFingerprint,flowVersion,contextFingerprint,attemptFingerprint,time,time+OAUTH_STATE_TTL_MS,siteId,owner,time,OAUTH_STATE_OWNER_LIMIT).run();
    }catch{fail('STATE_STORAGE_UNCERTAIN',503);}
    if(Number(result?.meta?.changes)===0)fail('STATE_LIMIT_REACHED',429);
    if(Number(result?.meta?.changes)!==1)fail('STATE_STORAGE_UNCERTAIN',503);
    // This transient return is for a future trusted server initiator only. Do not
    // log it or store it in browser localStorage, telemetry, snapshots or traces.
    return{state,expiresAtMs:time+OAUTH_STATE_TTL_MS};
  }
  async claim(owner,state,browserBinding){
    // Wrong/missing owner, malformed state/session, expiry, mismatch and replay
    // have the same false result. A successful claim returns an internal local attempt-hash receipt. No owner lookup based on a state alone exists.
    if(!validOwner(owner)||!validOpaque(state)||!validOpaque(browserBinding))return false;
    const time=this.#now();const {siteId,provider,redirectUri,scopeFingerprint,configFingerprint,flowVersion,contextFingerprint}=this.#config;
    const [stateHash,browserHash]=await Promise.all([sha256(state),sha256(browserBinding)]);
    const receiptId=crypto.randomUUID();let result;
    try{
      result=await this.#db.batch([
        this.#stmt('UPDATE planner_oauth_states SET consumed_at_ms=?,claim_receipt_id=? WHERE site_id=? AND owner_id=? AND state_hash=? AND browser_binding_hash=? AND provider=? AND redirect_uri=? AND scope_fingerprint=? AND config_fingerprint=? AND flow_version=? AND context_fingerprint=? AND created_at_ms<=? AND expires_at_ms>? AND expires_at_ms-created_at_ms BETWEEN 1 AND ? AND consumed_at_ms IS NULL',time,receiptId,siteId,owner,stateHash,browserHash,provider,redirectUri,scopeFingerprint,configFingerprint,flowVersion,contextFingerprint,time,time,OAUTH_STATE_MAX_TTL_MS),
        this.#stmt('SELECT nonce_fingerprint FROM planner_oauth_states WHERE site_id=? AND owner_id=? AND state_hash=? AND claim_receipt_id=? AND consumed_at_ms=?',siteId,owner,stateHash,receiptId,time)
      ]);
    }catch{fail('STATE_STORAGE_UNCERTAIN',503);}
    const changes=Number(result?.[0]?.meta?.changes);if(changes===0)return false;
    const attemptFingerprint=result?.[1]?.results?.[0]?.nonce_fingerprint;
    if(changes!==1||!hexFingerprint(attemptFingerprint))fail('STATE_STORAGE_UNCERTAIN',503);
    // Internal receipt only, NOT authorization-code injection protection.
    // attemptFingerprint is a local correlation hash, not a provider nonce.
    // No provider token or usable connection is established by this receipt.
    return{claimed:true,attemptFingerprint};
  }
}
