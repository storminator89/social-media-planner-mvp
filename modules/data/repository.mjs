import {validateScheduleChanges,scheduleRestoreDigest} from '../workflows/posting-schedules.mjs';
import {PlannerError,LIMITS,DATA_SCHEMA_VERSION,validateState} from './domain.mjs';
const now=()=>new Date().toISOString();
const capabilities=hasBucket=>({durableStorage:'d1',mediaStorage:hasBucket?'r2':null,uploads:hasBucket,automaticPublishing:false,externalAccountsConnected:false,limits:LIMITS});
function mediaDTO(m){return{id:m.id,filename:m.filename,mimeType:m.mime_type,size:m.byte_size,altText:m.alt_text,createdAt:m.created_at,url:`/api/planner/media/${encodeURIComponent(m.id)}`};}
function resultRows(result){return result.results??[];}
/** D1 binding only. All identifiers are static SQL; all user input is bound. */
export class PlannerRepository {
  constructor(db,{hasBucket=false}={}){if(!db?.prepare||!db?.batch)throw new PlannerError(503,'STORAGE_UNAVAILABLE','Dauerhafter Speicher ist noch nicht verfügbar.');this.db=db;this.hasBucket=hasBucket;}
  stmt(sql,...values){return this.db.prepare(sql).bind(...values);}
  readStatements(owner){return [
      this.stmt('SELECT revision,timezone,locale,updated_at FROM planner_profiles WHERE owner_id = ?',owner),
      this.stmt('SELECT * FROM planner_channels WHERE owner_id = ? ORDER BY name,id',owner),
      this.stmt('SELECT * FROM planner_posts WHERE owner_id = ? ORDER BY created_at DESC,id',owner),
      this.stmt('SELECT *, inherits_body AS inheritance_verified FROM planner_variants WHERE owner_id = ? ORDER BY id',owner),
      this.stmt('SELECT * FROM planner_media WHERE owner_id = ? ORDER BY created_at DESC,id',owner),
      this.stmt("SELECT post_id,payload_digest,expires_at FROM planner_schedule_undo WHERE owner_id=? AND expires_at>CAST(strftime('%s','now') AS INTEGER) ORDER BY post_id",owner)
    ];}
  async load(owner){return this.decodeSnapshot(await this.db.batch(this.readStatements(owner)));}
  decodeSnapshot(results){
    const [profiles,cs,ps,vs,ms,proofs]=results.map(resultRows);const profile=profiles[0];
    const byPost=new Map();const postBodies=new Map(ps.map(p=>[p.id,p.body]));
    for(const v of vs){const list=byPost.get(v.post_id)??[];list.push({id:v.id,channelId:v.channel_id,body:v.inherits_body?postBodies.get(v.post_id):v.body,inheritsBody:!!v.inherits_body,format:v.format,status:v.status,scheduledAt:v.scheduled_at,timezone:v.timezone,publishedAt:v.published_at,publishedUrl:v.published_url,statusNote:v.status_note,mediaIds:JSON.parse(v.media_ids_json)});byPost.set(v.post_id,list);}
    return {schemaVersion:DATA_SCHEMA_VERSION,revision:profile?.revision??0,settings:{timezone:profile?.timezone??'UTC',locale:profile?.locale??'de-DE'},channels:cs.map(c=>({id:c.id,platform:c.platform,name:c.name,handle:c.handle,color:c.color,enabled:!!c.enabled,connectionStatus:c.connection_status,postingSchedule:c.posting_schedule_json===null?null:JSON.parse(c.posting_schedule_json)})),posts:ps.map(p=>({id:p.id,scheduleBinding:p.schedule_binding_json===null?null:JSON.parse(p.schedule_binding_json),title:p.title,body:p.body,stage:p.stage,tags:JSON.parse(p.tags_json),cover:p.cover,scheduledAt:p.scheduled_at,timezone:p.timezone,createdAt:p.created_at,updatedAt:p.updated_at,variants:byPost.get(p.id)??[]})),media:ms.map(mediaDTO),restoreProofs:proofs.map(proof=>({postId:proof.post_id,payloadDigest:proof.payload_digest,expiresAt:proof.expires_at})),capabilities:capabilities(this.hasBucket),updatedAt:profile?.updated_at??null};
  }
  async save(owner,input){
    const updatedAt=now();const state=validateState(input,updatedAt);
    const previous=await this.load(owner);
    if(previous.revision!==state.revision)throw new PlannerError(409,'REVISION_CONFLICT','Der Planer wurde inzwischen geändert. Bitte neu laden.');
    const seconds=Math.floor(Date.parse(updatedAt)/1000);
    const proofs=resultRows(await this.stmt('SELECT post_id,payload_digest,expires_at FROM planner_schedule_undo WHERE owner_id=? AND expires_at>?',owner,seconds).all());
    const verifiedRestores=[];
    for(const post of state.posts){if(!post.scheduleBinding||previous.posts.some(old=>old.id===post.id))continue;const proof=proofs.find(item=>item.post_id===post.id);if(proof&&proof.payload_digest===await scheduleRestoreDigest(post))verifiedRestores.push(proof);}
    try{validateScheduleChanges(state,previous,updatedAt,{verifiedRestoreIds:verifiedRestores.map(proof=>proof.post_id)});}catch(error){throw new PlannerError(error.code==='REVISION_CONFLICT'?409:400,error.code??'INVALID_SCHEDULE',error.message,error.detail);}
    const mediaIds=new Set(previous.media.map(m=>m.id));
    for(const p of state.posts)for(const v of p.variants)for(const id of v.mediaIds)if(!mediaIds.has(id))throw new PlannerError(400,'UNKNOWN_MEDIA','Mindestens ein Medium gehört nicht zu deinem Planer.');
    const token=crypto.randomUUID();
    const guard='EXISTS (SELECT 1 FROM planner_profiles WHERE owner_id=? AND write_token=?)';
    // One JSON argument keeps bulk Undo below D1's per-statement binding limit.
    const restoreGuards=verifiedRestores.length?" AND NOT EXISTS (SELECT 1 FROM json_each(?) AS restore WHERE NOT EXISTS (SELECT 1 FROM planner_schedule_undo AS proof WHERE proof.owner_id=? AND proof.post_id=json_extract(restore.value,'$.postId') AND proof.payload_digest=json_extract(restore.value,'$.digest') AND proof.expires_at>CAST(strftime('%s','now') AS INTEGER)))":'';
    const restoreArgs=verifiedRestores.length?[JSON.stringify(verifiedRestores.map(proof=>({postId:proof.post_id,digest:proof.payload_digest}))),owner]:[];
    const statements=[
      this.stmt("INSERT INTO planner_profiles (owner_id,revision,timezone,locale,updated_at) VALUES (?,0,'UTC','de-DE',?) ON CONFLICT(owner_id) DO NOTHING",owner,updatedAt),
      this.stmt('UPDATE planner_profiles SET revision=revision+1,timezone=?,locale=?,write_token=?,updated_at=? WHERE owner_id=? AND revision=?'+restoreGuards,state.settings.timezone,state.settings.locale,token,updatedAt,owner,state.revision,...restoreArgs),
      this.stmt('DELETE FROM planner_schedule_undo WHERE owner_id=? AND expires_at<=? AND '+guard,owner,seconds,owner,token)
    ];
    const presentIds=new Set(state.posts.map(post=>post.id));
    for(const old of previous.posts){if(old.scheduleBinding&&!presentIds.has(old.id)){const digest=await scheduleRestoreDigest(old);statements.push(this.stmt('INSERT INTO planner_schedule_undo (owner_id,post_id,payload_digest,deleted_at,expires_at) SELECT ?,?,?,?,? WHERE '+guard+' ON CONFLICT(owner_id,post_id) DO UPDATE SET payload_digest=excluded.payload_digest,deleted_at=excluded.deleted_at,expires_at=excluded.expires_at',owner,old.id,digest,seconds,seconds+60,owner,token));}}
    for(const post of state.posts)statements.push(this.stmt('DELETE FROM planner_schedule_undo WHERE owner_id=? AND post_id=? AND '+guard,owner,post.id,owner,token));
    statements.push(this.stmt('DELETE FROM planner_schedule_undo WHERE owner_id=? AND post_id IN (SELECT post_id FROM planner_schedule_undo WHERE owner_id=? ORDER BY deleted_at DESC,post_id DESC LIMIT -1 OFFSET 100) AND '+guard,owner,owner,owner,token));
    statements.push(this.stmt('DELETE FROM planner_posts WHERE owner_id=? AND '+guard,owner,owner,token));
    statements.push(this.stmt('DELETE FROM planner_channels WHERE owner_id=? AND '+guard,owner,owner,token));
    const insert=(table,columns,values)=>statements.push(this.stmt(`INSERT INTO ${table} (${columns.join(',')}) SELECT ${columns.map(()=>'?').join(',')} WHERE EXISTS (SELECT 1 FROM planner_profiles WHERE owner_id=? AND write_token=?)`,...values,owner,token));
    for(const c of state.channels)insert('planner_channels',['owner_id','id','platform','name','handle','color','enabled','connection_status','posting_schedule_json'],[owner,c.id,c.platform,c.name,c.handle,c.color,c.enabled?1:0,'manual',c.postingSchedule===null?null:JSON.stringify(c.postingSchedule)]);
    for(const p of state.posts){
      insert('planner_posts',['owner_id','id','title','body','stage','tags_json','cover','scheduled_at','timezone','created_at','updated_at','schedule_binding_json'],[owner,p.id,p.title,p.body,p.stage,JSON.stringify(p.tags),p.cover,p.scheduledAt,p.timezone,p.createdAt,p.updatedAt,p.scheduleBinding===null?null:JSON.stringify(p.scheduleBinding)]);
      for(const v of p.variants)insert('planner_variants',['owner_id','id','post_id','channel_id','body','inherits_body','format','status','scheduled_at','timezone','published_at','published_url','status_note','media_ids_json'],[owner,v.id,p.id,v.channelId,v.body,v.inheritsBody?1:0,v.format,v.status,v.scheduledAt,v.timezone,v.publishedAt,v.publishedUrl,v.statusNote,JSON.stringify(v.mediaIds)]);
    }
    // D1 batch is transactional. A random write token guards EVERY later statement;
    // a stale revision can never erase/insert data, even with concurrent writers.
    const readOffset=statements.length;statements.push(...this.readStatements(owner));
    const result=await this.db.batch(statements);
    if(Number(result[1]?.meta?.changes)!==1){const revision=resultRows(result[readOffset])[0]?.revision;if(verifiedRestores.length&&revision===state.revision)throw new PlannerError(409,'RESTORE_EXPIRED','Das kurze Rückgängig-Fenster ist abgelaufen.');throw new PlannerError(409,'REVISION_CONFLICT','Der Planer wurde inzwischen geändert. Bitte neu laden, bevor du erneut speicherst.');}
    return this.decodeSnapshot(result.slice(readOffset));
  }
  async addMedia(owner,file){
    const {id,key,filename,mimeType,size,altText}=file;const createdAt=now();
    const result=await this.stmt('INSERT INTO planner_media (owner_id,id,object_key,filename,mime_type,byte_size,alt_text,created_at) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM planner_media WHERE owner_id=?) < ? AND (SELECT COALESCE(SUM(byte_size),0) FROM planner_media WHERE owner_id=?) + ? <= ?',owner,id,key,filename,mimeType,size,altText,createdAt,owner,LIMITS.mediaCount,owner,size,LIMITS.mediaTotalBytes).run();
    // Only an explicit successful zero-change receipt proves non-insertion.
    if(result?.success!==false&&result?.meta?.changes===0)throw new PlannerError(413,'MEDIA_LIMIT','Das Medienlimit dieses Planers ist erreicht.');
    if(result?.success===false||result?.meta?.changes!==1)throw new PlannerError(503,'MEDIA_STORAGE_UNCERTAIN','Der Uploadstatus ist unklar. Bitte neu laden und prüfen, bevor du erneut hochlädst.');
    // No fallible read after the confirmed insert: it cannot undo the commit.
    return mediaDTO({id,filename,mime_type:mimeType,byte_size:size,alt_text:altText,created_at:createdAt});
  }
  async getMedia(owner,id){return this.stmt('SELECT * FROM planner_media WHERE owner_id=? AND id=?',owner,id).first();}
}
