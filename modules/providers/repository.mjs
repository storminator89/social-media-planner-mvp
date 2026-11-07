/** Preparation-only D1 module. It has no fetch, OAuth, credential, dispatch or
 * scheduler implementation. No method can mark a provider connected or publish. */
export const PROVIDERS=Object.freeze(['instagram','linkedin','youtube']);
export const PUBLIC_BLOCKER_CODES=Object.freeze(['OAUTH_NOT_CONFIGURED','ACCOUNT_NOT_VERIFIED','PLATFORM_APPROVAL_REQUIRED','USER_AUTHORIZATION_REQUIRED','PUBLISHING_DISABLED','CONNECTION_ERROR','STATUS_UNAVAILABLE']);
export const PROVIDER_CAPABILITIES=Object.freeze({oauth:false,publishing:false});
export class ProviderDataError extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code;}}
function reject(status,code,message){throw new ProviderDataError(status,code,message);}
function ownerId(owner){if(typeof owner!=='string'||!owner.trim()||owner.length>256)reject(401,'SIGN_IN_REQUIRED','Eine authentifizierte Besucheridentität ist erforderlich.');return owner;}
function id(value,label='ID'){if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(value))reject(400,'INVALID_INPUT',`${label} ist ungültig.`);return value;}
function providerId(provider){if(!PROVIDERS.includes(provider))reject(400,'UNSUPPORTED_PROVIDER','Dieser Provider ist noch nicht vorgesehen.');return provider;}
function rows(result){return result.results??[];}
function publicConnection(provider,row){
  if(!row)return{provider,status:'not_connected',accountLabel:null,canPublish:false,blockerCodes:['OAUTH_NOT_CONFIGURED','PUBLISHING_DISABLED']};
  const states=['not_connected','setup_required','approval_required','error'];
  let status=row.status==='disabled'?'not_connected':states.includes(row.status)?row.status:'error';
  let code=PUBLIC_BLOCKER_CODES.includes(row.reason_code)?row.reason_code:'STATUS_UNAVAILABLE';
  if(status==='approval_required'&&!['PLATFORM_APPROVAL_REQUIRED','USER_AUTHORIZATION_REQUIRED'].includes(code)){status='error';code='STATUS_UNAVAILABLE';}
  // No account identity or capability is inferred from a placeholder or database row.
  return{provider,status,accountLabel:null,canPublish:false,blockerCodes:[...new Set([code,'PUBLISHING_DISABLED'])]};
}
function publicJob(row){return{id:row.id,provider:row.provider,postId:row.post_id,variantId:row.variant_id,channelId:row.channel_id,scheduledAt:row.scheduled_at,timezone:row.timezone,state:row.state,canPublish:false,blockerCodes:row.state==='cancelled'?['CANCELLED_BY_USER']:['PUBLISHING_DISABLED'],version:row.version,createdAt:row.created_at,updatedAt:row.updated_at};}
async function digest(text){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(b=>b.toString(16).padStart(2,'0')).join('');}
/** owner MUST come from Sites Dispatch in the caller, never a JSON/userId field.
 * This repository is not a router. Mutation methods are internal preparation
 * primitives and are deliberately not wired to public HTTP routes in this stage. */
export class ProviderRepository {
  constructor(db,{now=()=>new Date().toISOString()}={}){if(!db?.prepare||!db?.batch)reject(503,'STORAGE_UNAVAILABLE','Dauerhafter Speicher ist nicht verfügbar.');this.db=db;this.now=now;}
  stmt(sql,...values){return this.db.prepare(sql).bind(...values);}
  async listConnectionSummaries(owner){
    ownerId(owner);
    // Explicit safe-column projection. This read never creates placeholder rows.
    const found=rows(await this.stmt('SELECT provider,status,reason_code FROM planner_provider_connections WHERE owner_id=?',owner).all());
    return PROVIDERS.map(provider=>publicConnection(provider,found.find(row=>row.provider===provider)));
  }
  async ensureUnconfiguredConnection(owner,provider){
    ownerId(owner);providerId(provider);const time=this.now();
    await this.stmt("INSERT INTO planner_provider_connections (owner_id,id,provider,created_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(owner_id,provider) DO NOTHING",owner,crypto.randomUUID(),provider,time,time).run();
    const row=await this.stmt('SELECT provider,status,reason_code FROM planner_provider_connections WHERE owner_id=? AND provider=?',owner,provider).first();
    return publicConnection(provider,row);
  }
  async listJobSummaries(owner,{limit=50}={}){
    ownerId(owner);if(!Number.isInteger(limit)||limit<1||limit>100)reject(400,'INVALID_INPUT','Ungültige Seitenlänge.');
    const found=rows(await this.stmt('SELECT id,provider,post_id,variant_id,channel_id,scheduled_at,timezone,state,version,created_at,updated_at FROM planner_publication_jobs WHERE owner_id=? ORDER BY created_at DESC,id LIMIT ?',owner,limit).all());
    return found.map(publicJob);
  }
  async prepareBlockedJob(owner,{postId,variantId,idempotencyKey,connectionId=null}={}){
    ownerId(owner);id(postId,'Beitrags-ID');id(variantId,'Varianten-ID');id(idempotencyKey,'Idempotenzschlüssel');if(connectionId!==null)id(connectionId,'Verbindungs-ID');
    const results=await this.db.batch([
      this.stmt('SELECT revision FROM planner_profiles WHERE owner_id=?',owner),
      this.stmt('SELECT p.stage,p.id AS post_id,v.id AS variant_id,v.channel_id,v.body,v.inherits_body,p.body AS parent_body,v.format,v.status,v.scheduled_at,v.timezone,v.media_ids_json,c.platform FROM planner_posts p JOIN planner_variants v ON v.owner_id=p.owner_id AND v.post_id=p.id JOIN planner_channels c ON c.owner_id=v.owner_id AND c.id=v.channel_id WHERE p.owner_id=? AND p.id=? AND v.id=?',owner,postId,variantId),
      this.stmt('SELECT id,mime_type,byte_size,alt_text FROM planner_media WHERE owner_id=?',owner),
      this.stmt('SELECT id,provider FROM planner_provider_connections WHERE owner_id=? AND id=?',owner,connectionId)
    ]);
    const profile=rows(results[0])[0], source=rows(results[1])[0], mediaRows=rows(results[2]), connection=rows(results[3])[0];
    if(!profile||!source)reject(404,'SOURCE_NOT_FOUND','Beitrag oder Kanalvariante nicht gefunden.');
    const provider=providerId(source.platform);
    if(connectionId!==null&&(!connection||connection.provider!==provider))reject(404,'CONNECTION_NOT_FOUND','Passender Verbindungsplatzhalter nicht gefunden.');
    if(source.stage!=='planned'||source.status!=='planned'||!source.scheduled_at)reject(409,'SOURCE_NOT_PLANNED','Nur ein ausdrücklich geplanter Beitrag kann als gesperrter Job vorbereitet werden.');
    let mediaIds;try{mediaIds=JSON.parse(source.media_ids_json);}catch{reject(409,'INVALID_SOURCE','Ungültige Medienreferenzen.');}
    if(!Array.isArray(mediaIds)||mediaIds.length>10||mediaIds.some(value=>typeof value!=='string'))reject(409,'INVALID_SOURCE','Ungültige Medienreferenzen.');
    const media=mediaIds.map(mediaId=>{const m=mediaRows.find(row=>row.id===mediaId);if(!m)reject(409,'MEDIA_UNAVAILABLE','Ein eigenes Medium ist nicht mehr verfügbar.');return{id:m.id,mimeType:m.mime_type,size:m.byte_size,altText:m.alt_text};});
    const body=source.inherits_body?source.parent_body:source.body;
    if(typeof body!=='string'||body.length>20000||!Number.isFinite(new Date(source.scheduled_at).getTime()))reject(409,'INVALID_SOURCE','Ungültiger Beitragsinhalt oder Zeitpunkt.');
    const payload={schemaVersion:1,provider,connectionId,postId:source.post_id,variantId:source.variant_id,channelId:source.channel_id,content:{body,format:source.format,media},schedule:{at:source.scheduled_at,timezone:source.timezone}};
    const payloadJSON=JSON.stringify(payload);if(new TextEncoder().encode(payloadJSON).length>128*1024)reject(413,'PAYLOAD_TOO_LARGE','Vorbereiteter Beitrag ist zu groß.');
    const hash=await digest(payloadJSON);const time=this.now();const jobId=crypto.randomUUID();
    // No FK to snapshot-owned posts/channels: planner saves replace those rows.
    // This revision guard prevents recording a mixture of old/new source data.
    await this.stmt('INSERT INTO planner_publication_jobs (owner_id,id,idempotency_key,provider,connection_id,post_id,variant_id,channel_id,source_revision,payload_json,payload_sha256,scheduled_at,timezone,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM planner_profiles WHERE owner_id=? AND revision=?) ON CONFLICT(owner_id,idempotency_key) DO NOTHING',owner,jobId,idempotencyKey,provider,connectionId,source.post_id,source.variant_id,source.channel_id,profile.revision,payloadJSON,hash,source.scheduled_at,source.timezone,time,time,owner,profile.revision).run();
    const existing=await this.stmt('SELECT * FROM planner_publication_jobs WHERE owner_id=? AND idempotency_key=?',owner,idempotencyKey).first();
    if(!existing)reject(409,'SOURCE_CHANGED','Der Beitrag wurde inzwischen geändert. Bitte erneut prüfen.');
    if(existing.payload_sha256!==hash)reject(409,'IDEMPOTENCY_CONFLICT','Dieser Idempotenzschlüssel gehört bereits zu einer anderen Beitragsfassung.');
    return publicJob(existing);
  }
  async cancelPreparedJob(owner,jobId,expectedVersion){
    ownerId(owner);id(jobId,'Job-ID');if(!Number.isSafeInteger(expectedVersion)||expectedVersion<0)reject(400,'INVALID_INPUT','Eine gültige Revision ist erforderlich.');
    const result=await this.stmt("UPDATE planner_publication_jobs SET state='cancelled',reason_code='CANCELLED_BY_USER',version=version+1,updated_at=? WHERE owner_id=? AND id=? AND version=? AND state='blocked'",this.now(),owner,jobId,expectedVersion).run();
    const row=await this.stmt('SELECT * FROM planner_publication_jobs WHERE owner_id=? AND id=?',owner,jobId).first();
    if(!row)reject(404,'JOB_NOT_FOUND','Vorbereiteter Job nicht gefunden.');
    if(Number(result.meta?.changes)!==1)reject(409,'REVISION_CONFLICT','Der vorbereitete Job wurde inzwischen geändert.');
    return publicJob(row);
  }
}
