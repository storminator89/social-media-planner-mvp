import {PlannerError,LIMITS,validateState} from './domain.mjs';
const now=()=>new Date().toISOString();
const capabilities=hasBucket=>({durableStorage:'d1',mediaStorage:hasBucket?'r2':null,uploads:hasBucket,automaticPublishing:false,externalAccountsConnected:false,limits:LIMITS});
function mediaDTO(m){return{id:m.id,filename:m.filename,mimeType:m.mime_type,size:m.byte_size,altText:m.alt_text,createdAt:m.created_at,url:`/api/planner/media/${encodeURIComponent(m.id)}`};}
function resultRows(result){return result.results??[];}
/** D1 binding only. All identifiers are static SQL; all user input is bound. */
export class PlannerRepository {
  constructor(db,{hasBucket=false}={}){if(!db?.prepare||!db?.batch)throw new PlannerError(503,'STORAGE_UNAVAILABLE','Dauerhafter Speicher ist noch nicht verfügbar.');this.db=db;this.hasBucket=hasBucket;}
  stmt(sql,...values){return this.db.prepare(sql).bind(...values);}
  async load(owner){
    // D1 batch gives these reads one transactional snapshot.
    const results=await this.db.batch([
      this.stmt('SELECT revision,timezone,locale,updated_at FROM planner_profiles WHERE owner_id = ?',owner),
      this.stmt('SELECT * FROM planner_channels WHERE owner_id = ? ORDER BY name,id',owner),
      this.stmt('SELECT * FROM planner_posts WHERE owner_id = ? ORDER BY created_at DESC,id',owner),
      this.stmt('SELECT * FROM planner_variants WHERE owner_id = ? ORDER BY id',owner),
      this.stmt('SELECT * FROM planner_media WHERE owner_id = ? ORDER BY created_at DESC,id',owner)
    ]);
    const [profiles,cs,ps,vs,ms]=results.map(resultRows);const profile=profiles[0];
    const byPost=new Map();
    for(const v of vs){const list=byPost.get(v.post_id)??[];list.push({id:v.id,channelId:v.channel_id,body:v.body,format:v.format,status:v.status,scheduledAt:v.scheduled_at,timezone:v.timezone,publishedAt:v.published_at,publishedUrl:v.published_url,statusNote:v.status_note,mediaIds:JSON.parse(v.media_ids_json)});byPost.set(v.post_id,list);}
    return {schemaVersion:1,revision:profile?.revision??0,settings:{timezone:profile?.timezone??'UTC',locale:profile?.locale??'de-DE'},channels:cs.map(c=>({id:c.id,platform:c.platform,name:c.name,handle:c.handle,color:c.color,enabled:!!c.enabled,connectionStatus:c.connection_status})),posts:ps.map(p=>({id:p.id,title:p.title,body:p.body,stage:p.stage,tags:JSON.parse(p.tags_json),cover:p.cover,scheduledAt:p.scheduled_at,timezone:p.timezone,createdAt:p.created_at,updatedAt:p.updated_at,variants:byPost.get(p.id)??[]})),media:ms.map(mediaDTO),capabilities:capabilities(this.hasBucket),updatedAt:profile?.updated_at??null};
  }
  async save(owner,input){
    const updatedAt=now();const state=validateState(input,updatedAt);
    const ownedMedia=resultRows(await this.stmt('SELECT id FROM planner_media WHERE owner_id = ?',owner).all());const mediaIds=new Set(ownedMedia.map(m=>m.id));
    for(const p of state.posts)for(const v of p.variants)for(const id of v.mediaIds)if(!mediaIds.has(id))throw new PlannerError(400,'UNKNOWN_MEDIA','Mindestens ein Medium gehört nicht zu deinem Planer.');
    const token=crypto.randomUUID();
    const statements=[
      this.stmt("INSERT INTO planner_profiles (owner_id,revision,timezone,locale,updated_at) VALUES (?,0,'UTC','de-DE',?) ON CONFLICT(owner_id) DO NOTHING",owner,updatedAt),
      this.stmt('UPDATE planner_profiles SET revision=revision+1,timezone=?,locale=?,write_token=?,updated_at=? WHERE owner_id=? AND revision=?',state.settings.timezone,state.settings.locale,token,updatedAt,owner,state.revision),
      this.stmt('DELETE FROM planner_posts WHERE owner_id=? AND EXISTS (SELECT 1 FROM planner_profiles WHERE owner_id=? AND write_token=?)',owner,owner,token),
      this.stmt('DELETE FROM planner_channels WHERE owner_id=? AND EXISTS (SELECT 1 FROM planner_profiles WHERE owner_id=? AND write_token=?)',owner,owner,token)
    ];
    const insert=(table,columns,values)=>statements.push(this.stmt(`INSERT INTO ${table} (${columns.join(',')}) SELECT ${columns.map(()=>'?').join(',')} WHERE EXISTS (SELECT 1 FROM planner_profiles WHERE owner_id=? AND write_token=?)`,...values,owner,token));
    for(const c of state.channels)insert('planner_channels',['owner_id','id','platform','name','handle','color','enabled','connection_status'],[owner,c.id,c.platform,c.name,c.handle,c.color,c.enabled?1:0,'manual']);
    for(const p of state.posts){
      insert('planner_posts',['owner_id','id','title','body','stage','tags_json','cover','scheduled_at','timezone','created_at','updated_at'],[owner,p.id,p.title,p.body,p.stage,JSON.stringify(p.tags),p.cover,p.scheduledAt,p.timezone,p.createdAt,p.updatedAt]);
      for(const v of p.variants)insert('planner_variants',['owner_id','id','post_id','channel_id','body','format','status','scheduled_at','timezone','published_at','published_url','status_note','media_ids_json'],[owner,v.id,p.id,v.channelId,v.body,v.format,v.status,v.scheduledAt,v.timezone,v.publishedAt,v.publishedUrl,v.statusNote,JSON.stringify(v.mediaIds)]);
    }
    // D1 batch is transactional. A random write token guards EVERY later statement;
    // a stale revision can never erase/insert data, even with concurrent writers.
    const result=await this.db.batch(statements);
    if(Number(result[1]?.meta?.changes)!==1)throw new PlannerError(409,'REVISION_CONFLICT','Der Planer wurde inzwischen geändert. Bitte neu laden, bevor du erneut speicherst.');
    return this.load(owner);
  }
  async addMedia(owner,file){
    const {id,key,filename,mimeType,size,altText}=file;
    const result=await this.stmt('INSERT INTO planner_media (owner_id,id,object_key,filename,mime_type,byte_size,alt_text,created_at) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM planner_media WHERE owner_id=?) < ? AND (SELECT COALESCE(SUM(byte_size),0) FROM planner_media WHERE owner_id=?) + ? <= ?',owner,id,key,filename,mimeType,size,altText,now(),owner,LIMITS.mediaCount,owner,size,LIMITS.mediaTotalBytes).run();
    if(Number(result.meta?.changes)!==1)throw new PlannerError(413,'MEDIA_LIMIT','Das Medienlimit dieses Planers ist erreicht.');
    return mediaDTO(await this.getMedia(owner,id));
  }
  async getMedia(owner,id){return this.stmt('SELECT * FROM planner_media WHERE owner_id=? AND id=?',owner,id).first();}
}
