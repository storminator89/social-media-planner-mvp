import {prepareDateShift} from '../workflows/date-shift.mjs';
import {normalizeMediaItems,normalizeChannelMediaItems,allReferencedMediaItems} from '../workflows/media-items.mjs';
import {prepareDraftReplace} from '../workflows/draft-replace.mjs';
import {prepareDraftLabels} from '../workflows/draft-labels.mjs';
import {prepareReturnDrafts} from '../workflows/return-drafts.mjs';
import {prepareQueueReflow} from '../workflows/queue-reflow.mjs';
import {validateState} from './domain.mjs';
import {prepareQueueSwap} from '../workflows/queue-swap.mjs';
import {prepareQueuePriority} from '../workflows/queue-priority.mjs';
import {prepareDraftBatch} from '../workflows/draft-batch.mjs';
import {normalizePostingSchedule,normalizeScheduleBinding,validatePostScheduleBinding,scheduleRestoreDigest,validateScheduleChanges} from '../workflows/posting-schedules.mjs';
import {createPlannerClient,PlannerClientError} from './client.mjs';
const DATA_SCHEMA_VERSION=3;
// Only known application rejections prove that this save did not commit.
// Transient/proxy statuses and unfamiliar responses retain a bounded candidate,
// never a retry or a restoration right without a matching private server proof.
const DEFINITIVE_SAVE_REJECTIONS=new Set(['409:REVISION_CONFLICT','409:STATE_SCHEMA_CHANGED','401:SIGN_IN_REQUIRED','403:CROSS_ORIGIN_REQUEST','400:INVALID_JSON','413:PAYLOAD_TOO_LARGE','415:JSON_REQUIRED']);
// Property order is not meaningful in the UI projection; list order is.
function sameData(a,b){
  if(a===b)return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
  const ak=Object.keys(a).sort(),bk=Object.keys(b).sort();
  return ak.length===bk.length&&ak.every((key,index)=>key===bk[index]&&sameData(a[key],b[key]));
}
// The repository orders records and updates bookkeeping timestamps on every save.
// Everything else in a split receipt must match the requested canonical state.
function splitReceipt(state){
  if(!state||!Array.isArray(state.channels)||!Array.isArray(state.media)||!Array.isArray(state.posts)||state.posts.some(post=>!post||!Array.isArray(post.variants)))return null;
  const byId=values=>values.map(value=>structuredClone(value)).sort((a,b)=>a.id.localeCompare(b.id));
  return {schemaVersion:state.schemaVersion,settings:state.settings,channels:byId(state.channels),media:byId(state.media),posts:byId(state.posts).map(post=>{delete post.updatedAt;post.variants=byId(post.variants);return post;})};
}
const canonicalUtc=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
function snapshotBookkeepingValid(state){return state.revision===0?state.updatedAt===null&&state.posts.length===0:canonicalUtc(state.updatedAt)&&state.posts.every(post=>post.updatedAt===state.updatedAt);}
const MEDIA_PATH=/^\/api\/planner\/media\/[A-Za-z0-9_-]{1,100}$/;
function error(message,code='UI_SCHEMA_UNSUPPORTED',status=400){throw new PlannerClientError(message,status,code);}
function scheduling(fn){try{return fn();}catch(e){error(e.message,e.code??'INVALID_SCHEDULE');}}
function wallTime(iso,zone){if(!iso)return null;return new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(iso)).replace(' ','T');}
function decodeMedia(media){
  const video=media.type==='video/mp4'||media.type==='video/webm',limit=(video?8:2)*1024*1024;
  // Bound the encoded input before allocating decoded bytes, then check actual size.
  const match=typeof media.dataUrl==='string'&&media.dataUrl.match(/^data:((?:image\/(?:png|jpeg|webp))|(?:video\/(?:mp4|webm)));base64,([A-Za-z0-9+/]*={0,2})$/);
  if(!match||match[2].length>Math.ceil(limit/3)*4)error(video?'Video größer als 8 MB oder ungültig.':'Bild größer als 2 MB oder ungültig.','INVALID_MEDIA');
  let binary;try{binary=atob(match[2]);}catch{error('Ungültige Mediendaten.','INVALID_MEDIA');}
  if(!binary.length||binary.length>limit)error('Ungültige Mediengröße.','INVALID_MEDIA');
  if(media.type!==match[1])error('Medientyp stimmt nicht mit dem Dateiinhalt überein.','INVALID_MEDIA');
  const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
  const at=(values,offset=0)=>values.every((value,index)=>bytes[offset+index]===value);
  const ascii=(value,offset=0)=>at([...value].map(c=>c.charCodeAt(0)),offset);
  const signature=(media.type==='image/png'&&at([137,80,78,71,13,10,26,10]))||
    (media.type==='image/jpeg'&&at([255,216,255]))||
    (media.type==='image/webp'&&ascii('RIFF')&&ascii('WEBP',8))||
    (media.type==='video/mp4'&&ascii('ftyp',4))||
    (media.type==='video/webm'&&at([0x1a,0x45,0xdf,0xa3]));
  if(!signature)error('Dateisignatur stimmt nicht mit dem Medientyp überein.','INVALID_MEDIA');
  return new File([bytes],media.name|| (video?'Video':'Bild'),{type:match[1]});
}
/** Optional bridge for the simple Takt UI. Its zone must be visible in the UI.
 * normalizeState must preserve media.id/url from this adapter, not require dataUrl.
 * Unsupported richer state is rejected rather than silently flattened on save.
 */
export function createTaktStore({client=createPlannerClient(),timezone,channels,onTimezone=()=>{}}){
  if(!timezone)error('Eine sichtbare IANA-Zeitzone ist erforderlich.','TIMEZONE_REQUIRED');
  new Intl.DateTimeFormat('de',{timeZone:timezone}).format();
  let archivePreview=null;let replaceNeedsReload=false;let replacePreview=null;let shiftNeedsReload=false;let shiftPreview=null;let labelsNeedsReload=false;let labelsPreview=null;let snapshot=null;let currentZone=timezone;let busy=false;let splitNeedsReload=false;let batchNeedsReload=false;let importNeedsReload=false;let swapNeedsReload=false;let swapPreview=null;let priorityNeedsReload=false;let reflowNeedsReload=false;let returnPreview=null;let returnNeedsReload=false;let reflowPreview=null;let priorityPreview=null;let batchPreview=null;let pendingDelete=null;const uploadedImages=new Map();
  // The UI's short Undo needs canonical metadata absent from its projection.
  // Session-local, bounded, expiring cache. Only confirmed deletes enter it.
  const deletedPosts=new Map();
  function pruneDeleted(){for(const [id,item] of deletedPosts)if(item.expiresAt<=Date.now())deletedPosts.delete(id);}
  function previousPost(id){return snapshot?.posts.find(post=>post.id===id)??deletedPosts.get(id)?.post;}
  function rememberDeleted(before,saved){
    const present=new Set(saved.posts.map(post=>post.id));
    for(const post of before.posts)if(!present.has(post.id))deletedPosts.set(post.id,{post:structuredClone(post),expiresAt:Date.now()+60000});
    for(const id of present)deletedPosts.delete(id);
    while(deletedPosts.size>100)deletedPosts.delete(deletedPosts.keys().next().value);
  }
  const definitions=channels.map(c=>({id:c.id,platform:c.platform??c.id,name:c.name,handle:c.handle??'',color:c.color??'#64748b',enabled:true,connectionStatus:'manual',postingSchedule:null}));
  function toUI(state){
    if(state.schemaVersion!==DATA_SCHEMA_VERSION)error('Das Datenformat des Servers passt nicht zu dieser Ansicht. Bitte neu laden.','STATE_SCHEMA_CHANGED');
    const channelIds=new Set(definitions.map(c=>c.id));const ms=new Map(state.media.map(m=>[m.id,m]));
    for(const c of state.channels)if(!channelIds.has(c.id))error('Der Planer enthält einen Kanal, den diese einfache Ansicht noch nicht unterstützt.');
    const posts=state.posts.map(p=>{
      if(!['idea','draft','planned','archived'].includes(p.stage))error('Der Planer enthält eine Phase, die diese Ansicht noch nicht unterstützt.');
      if(p.stage==='idea'&&(p.variants.length||p.scheduledAt))error('Diese Idee enthält bereits Kanalvarianten oder einen Termin. Sie wird nicht still vereinfacht.','IDEA_SCHEMA_UNSUPPORTED');
      let mediaIds=[];let firstMedia=true;const variantEntries=[];const mediaLists=[];
      for(const v of p.variants){
        if(typeof v.inheritsBody!=='boolean')error('Bei einer Kanalvariante fehlt die explizite Vererbungseinstellung.');
        if((v.inheritsBody&&v.body!==p.body)||(p.stage==='archived'?!['draft','planned'].includes(v.status):v.status!==(p.stage==='planned'?'planned':'draft'))||v.format!=='post'||!Array.isArray(v.mediaIds)||v.mediaIds.length>10||new Set(v.mediaIds).size!==v.mediaIds.length||v.scheduledAt!==p.scheduledAt||v.timezone!==p.timezone)error('Dieser Beitrag nutzt eigene Kanaltermine, Medien, Formate oder Status. Diese Ansicht unterstützt nur eigene Kanaltexte.');
        if(!v.inheritsBody)variantEntries.push([v.channelId,v.body]);
        mediaLists.push([v.channelId,[...v.mediaIds]]);
        if(firstMedia)mediaIds=[...v.mediaIds];firstMedia=false;
      }
      const mediaItems=mediaIds.map(id=>{const media=ms.get(id);if(!media)error('Ein gespeichertes Medium fehlt.');return {id:media.id,url:media.url,alt:media.altText,name:media.filename,type:media.mimeType};});
      scheduling(()=>normalizeMediaItems(mediaItems));
      const divergent=mediaLists.some(([,ids])=>!sameData(ids,mediaIds));
      const channelMedia=divergent?{channelMediaItems:Object.fromEntries(mediaLists.map(([id,ids])=>[id,ids.map(key=>{const m=ms.get(key);if(!m)error('Ein gespeichertes Medium fehlt.');return{id:m.id,url:m.url,alt:m.altText,name:m.filename,type:m.mimeType};})]))}:{};
      if(divergent)scheduling(()=>normalizeChannelMediaItems(channelMedia.channelMediaItems,p.variants.map(v=>v.channelId),mediaItems));
      if(!Object.hasOwn(p,'scheduleBinding'))error('Die Queue-Bindung fehlt.','STATE_SCHEMA_CHANGED');
      scheduling(()=>validatePostScheduleBinding(p));
      return{id:p.id,scheduleBinding:structuredClone(p.scheduleBinding),scheduledInstant:p.stage==='archived'?null:p.scheduledAt,title:p.title,tags:[...p.tags],text:p.body,variantTexts:Object.fromEntries(variantEntries),channels:p.variants.map(v=>v.channelId),status:p.stage==='planned'?'scheduled':p.stage,scheduledAt:p.stage==='archived'?null:wallTime(p.scheduledAt,p.timezone),timeZone:p.timezone,cover:p.cover??null,mediaItems,...channelMedia,createdAt:p.createdAt,updatedAt:p.updatedAt};
    });
    // Add only the newly supported planning target to this UI projection.
    // No write until the ordinary revision-checked save; retain all existing metadata.
    const loadedChannels=state.channels.length?[...state.channels,...definitions.filter(c=>c.id==='mastodon'&&!state.channels.some(existing=>existing.id===c.id))]:definitions;
    const uiChannels=loadedChannels.map(c=>{if(!Object.hasOwn(c,'postingSchedule'))error('Posting-Zeiten fehlen.','STATE_SCHEMA_CHANGED');return{...structuredClone(c),postingSchedule:scheduling(()=>normalizePostingSchedule(c.postingSchedule))};});
    return{schemaVersion:3,revision:state.revision,channels:uiChannels,settings:{timezone:currentZone},posts};
  }
  const requiresReload=()=>replaceNeedsReload||shiftNeedsReload||labelsNeedsReload||swapNeedsReload||returnNeedsReload||batchNeedsReload||splitNeedsReload||importNeedsReload||priorityNeedsReload||reflowNeedsReload;
  return{
    get timezone(){return currentZone;},
    get mutationRequiresReload(){return requiresReload();},
    get plannerRevision(){return snapshot?.revision??null;},
    async load(){if(busy)error('Speicherung läuft noch.','BUSY');busy=true;try{pruneDeleted();const loaded=await client.load();if(requiresReload()){const verified=scheduling(()=>validateState(loaded));if(!Number.isSafeInteger(loaded.revision)||loaded.revision<0||!snapshotBookkeepingValid(loaded)||!sameData(splitReceipt(loaded),splitReceipt({...verified,media:loaded.media})))error('Ladeantwort nicht bestätigt.','INVALID_RESPONSE');}currentZone=loaded.revision===0?timezone:loaded.settings.timezone;const state=toUI(loaded);
      const restoreCandidates=await Promise.all([...deletedPosts.values()].filter(item=>item.post.scheduleBinding&&item.expiresAt>Date.now()).map(async item=>({post:item.post,digest:await scheduleRestoreDigest(item.post),expiresAt:item.expiresAt})));
      if(pendingDelete&&pendingDelete.expiresAt>Date.now())restoreCandidates.push(...pendingDelete.candidates.map(candidate=>({...candidate,expiresAt:pendingDelete.expiresAt})));
      deletedPosts.clear();
      for(const candidate of restoreCandidates){const proof=loaded.restoreProofs?.find(item=>item.postId===candidate.post.id&&item.payloadDigest===candidate.digest&&item.expiresAt*1000>Date.now());if(proof&&!loaded.posts.some(post=>post.id===candidate.post.id))deletedPosts.set(candidate.post.id,{post:structuredClone(candidate.post),expiresAt:Math.min(candidate.expiresAt,proof.expiresAt*1000)});}
      archivePreview=null;replaceNeedsReload=false;replacePreview=null;shiftNeedsReload=false;shiftPreview=null;labelsNeedsReload=false;labelsPreview=null;pendingDelete=null;returnPreview=null;returnNeedsReload=false;snapshot=loaded;splitNeedsReload=false;batchNeedsReload=false;importNeedsReload=false;priorityNeedsReload=false;swapNeedsReload=false;swapPreview=null;reflowNeedsReload=false;reflowPreview=null;priorityPreview=null;batchPreview=null;onTimezone(currentZone);return state;}finally{busy=false;}},
    /** Change only canonical image IDs on an unchanged saved draft. */
    async changeChannelMedia(ui,{postId,channelMediaItems}={}){
      if(busy)error('Speicherung läuft noch.','BUSY');
      if(replaceNeedsReload||shiftNeedsReload||labelsNeedsReload||swapNeedsReload||returnNeedsReload||batchNeedsReload||splitNeedsReload||importNeedsReload||priorityNeedsReload||reflowNeedsReload)error('Neu laden und Planung prüfen.','RELOAD_REQUIRED');
      if(!snapshot)error('Planer zuerst laden.','NOT_LOADED');
      if(ui?.revision!==snapshot.revision)error('Planung geändert. Neu laden.','REVISION_CONFLICT',409);
      if(!sameData(ui,toUI(snapshot)))error('Änderungen zuerst speichern.','CHANNEL_MEDIA_STATE_CHANGED');
      const verified=scheduling(()=>validateState(snapshot));
      if(!sameData(splitReceipt(snapshot),splitReceipt({...verified,media:snapshot.media})))error('Planung zuerst neu laden.','CHANNEL_MEDIA_STATE_CHANGED');
      const source=snapshot.posts.find(p=>p.id===postId);
      if(!source||source.stage!=='draft'||source.scheduledAt!==null||source.scheduleBinding!==null||source.variants.length<2||source.variants.some(v=>v.status!=='draft'||v.scheduledAt!==null||v.publishedAt!==null||v.publishedUrl!==null))error('Nur gespeicherte Entwürfe mit mehreren Kanälen unterstützen eigene Bilder.','CHANNEL_MEDIA_NOT_ALLOWED');
      const selected=source.variants.map(v=>v.channelId);
      const map=scheduling(()=>normalizeChannelMediaItems(channelMediaItems,selected,channelMediaItems?.[selected[0]]));
      // Do not silently replace a video's attachment with an image mapping.
      const current=toUI(snapshot).posts.find(p=>p.id===postId);
      if(allReferencedMediaItems(current).some(item=>!item.type.startsWith('image/')))error('Nur gespeicherte Bilder werden unterstützt.','INVALID_MEDIA');
      const referenced=new Set(snapshot.posts.flatMap(p=>p.variants.flatMap(v=>v.mediaIds)));
      for(const item of Object.values(map).flat()){
        const m=snapshot.media.find(m=>m.id===item.id);
        if(!m||!referenced.has(item.id)||!item.alt.trim()||!sameData([item.url,item.alt,item.name,item.type],[m.url,m.altText,m.filename,m.mimeType]))error('Bildreferenz oder Metadaten nicht bestätigt.','INVALID_MEDIA');
      }
      const intended=structuredClone(snapshot);delete intended.media;delete intended.capabilities;delete intended.restoreProofs;delete intended.updatedAt;
      intended.posts.find(p=>p.id===postId).variants.forEach(v=>{v.mediaIds=map[v.channelId].map(item=>item.id);});
      const canonical=scheduling(()=>validateState(intended));
      if(new TextEncoder().encode(JSON.stringify(canonical)).byteLength>1024*1024)error('Speichergrenze erreicht.','CHANNEL_MEDIA_LIMIT',413);
      busy=true;
      try{
        let saved,received=false;
        try{
          saved=await client.save(canonical);received=true;
          let matches=false;try{matches=saved?.revision===snapshot.revision+1&&sameData(splitReceipt(saved),splitReceipt({...canonical,media:snapshot.media}));}catch{}
          if(!matches)error('Kanalbilder nicht bestätigt. Neu laden und prüfen.','INVALID_RESPONSE');
          toUI(saved);
        }catch(cause){if(received||!DEFINITIVE_SAVE_REJECTIONS.has(`${cause?.status}:${cause?.code}`))splitNeedsReload=true;throw cause;}
        snapshot=saved;currentZone=saved.settings.timezone;onTimezone(currentZone);return toUI(saved);
      }finally{busy=false;}
    },
    /** One-use, exact preview over canonical saved drafts. No projection-based writes. */
    previewArchiveDrafts(ui,{postIds}={}){
      if(busy)error('Speicherung läuft noch.','BUSY');
      if(requiresReload())error('Neu laden und Archiv prüfen.','RELOAD_REQUIRED');
      archivePreview=null;
      if(!snapshot)error('Planer zuerst laden.','NOT_LOADED');
      if(ui?.revision!==snapshot.revision)error('Planung geändert. Neu laden.','REVISION_CONFLICT',409);
      if(!sameData(ui,toUI(snapshot)))error('Änderungen zuerst speichern.','ARCHIVE_STATE_CHANGED');
      if(!Array.isArray(postIds)||!postIds.length||postIds.length>100||postIds.some(id=>typeof id!=='string')||new Set(postIds).size!==postIds.length)error('Wähle eindeutige gespeicherte Entwürfe.','ARCHIVE_SELECTION_REQUIRED');
      const verified=scheduling(()=>validateState(snapshot));
      if(!sameData(splitReceipt(snapshot),splitReceipt({...verified,media:snapshot.media})))error('Planung zuerst neu laden.','ARCHIVE_STATE_CHANGED');
      const intended=structuredClone(snapshot);delete intended.media;delete intended.capabilities;delete intended.restoreProofs;delete intended.updatedAt;
      const entries=postIds.map(postId=>{
        const post=intended.posts.find(p=>p.id===postId);
        if(!post||post.stage!=='draft'||post.scheduledAt!==null||post.scheduleBinding!==null||post.variants.some(v=>v.status!=='draft'||v.scheduledAt!==null||v.publishedAt!==null||v.publishedUrl!==null))error('Nur gespeicherte Entwürfe ohne Termin sind möglich.','ARCHIVE_DRAFT_REQUIRED');
        post.stage='archived';
        return {postId,title:post.title,text:post.body,tags:[...post.tags],channels:post.variants.map(v=>({channelId:v.channelId,text:v.body,inheritsBody:v.inheritsBody,mediaItems:v.mediaIds.map(id=>{const m=snapshot.media.find(m=>m.id===id);if(!m)error('Ein gespeichertes Medium fehlt.','ARCHIVE_STATE_CHANGED');return{id:m.id,url:m.url,alt:m.altText,name:m.filename,type:m.mimeType};})}))};
      });
      scheduling(()=>validateState(intended));
      if(new TextEncoder().encode(JSON.stringify(intended)).byteLength>1024*1024)error('Speichergrenze erreicht.','ARCHIVE_LIMIT',413);
      const preview={token:crypto.randomUUID(),revision:snapshot.revision,entries};
      archivePreview={preview:structuredClone(preview),intended,source:structuredClone(snapshot)};
      return preview;
    },
    cancelArchiveDrafts(preview){if(!busy&&archivePreview&&sameData(preview,archivePreview.preview))archivePreview=null;},
    async archiveDrafts(ui,preview){
      if(busy)error('Speicherung läuft noch.','BUSY');
      if(requiresReload())error('Neu laden und Archiv prüfen.','RELOAD_REQUIRED');
      const pending=archivePreview;archivePreview=null;
      if(!pending||!sameData(preview,pending.preview))error('Auswahl erneut prüfen.','ARCHIVE_PREVIEW_CHANGED');
      if(!snapshot||ui?.revision!==snapshot.revision||!sameData(snapshot,pending.source)||!sameData(ui,toUI(snapshot)))error('Planung geändert. Auswahl erneut prüfen.','ARCHIVE_STATE_CHANGED');
      const intended=pending.intended;
      busy=true;
      try{
        let saved,received=false;
        try{
          saved=await client.save(intended);received=true;
          let matches=false;
          try{
            const canonical=validateState(saved);
            matches=saved.revision===intended.revision+1&&snapshotBookkeepingValid(saved)&&sameData(splitReceipt(saved),splitReceipt({...canonical,media:saved.media}))&&sameData(splitReceipt(saved),splitReceipt({...intended,media:snapshot.media}));
          }catch{/* Missing or normalized hidden data is not an exact receipt. */}
          if(!matches)error('Archivierung nicht bestätigt. Neu laden und prüfen.','INVALID_RESPONSE');
          toUI(saved);
        }catch(cause){
          // This existing global planner fence covers all mutation entry points,
          // including imports/media, and requires canonical validation on reload.
          if(received||!DEFINITIVE_SAVE_REJECTIONS.has(`${cause?.status}:${cause?.code}`))splitNeedsReload=true;
          throw cause;
        }
        snapshot=saved;currentZone=saved.settings.timezone;onTimezone(currentZone);return toUI(saved);
      }finally{busy=false;}
    },
    /** Reuse one saved idea without consuming its identity or reconstructing history. */
    async reuseIdea(ui,{postId}={}){
      if(busy)error('Speicherung läuft noch.','BUSY');
      if(requiresReload())error('Neu laden und Entwürfe prüfen.','RELOAD_REQUIRED');
      if(!snapshot)error('Planer zuerst laden.','NOT_LOADED');
      if(ui?.revision!==snapshot.revision)error('Planung geändert. Neu laden.','REVISION_CONFLICT',409);
      if(!sameData(ui,toUI(snapshot)))error('Änderungen zuerst speichern.','IDEA_STATE_CHANGED');
      const verified=scheduling(()=>validateState(snapshot));
      if(!snapshotBookkeepingValid(snapshot)||!sameData(splitReceipt(snapshot),splitReceipt({...verified,media:snapshot.media})))error('Planung zuerst neu laden.','IDEA_STATE_CHANGED');
      const source=snapshot.posts.find(p=>p.id===postId);
      if(!source||source.stage!=='idea'||source.variants.length||source.scheduledAt!==null||source.scheduleBinding!==null||source.cover!==null||!source.title.trim()&&!source.body.trim())error('Nur eine gespeicherte Idee ohne Kanäle, Medien oder Termin ist möglich.','IDEA_REQUIRED');
      if(snapshot.posts.length>=100)error('Limit von 100 Beiträgen erreicht. Auch archivierte Beiträge zählen.','IDEA_LIMIT');
      const ids=new Set(snapshot.posts.flatMap(p=>[p.id,...p.variants.map(v=>v.id)])),copyId=crypto.randomUUID();
      if(ids.has(copyId))error('Neue ID nicht verfügbar.','IDEA_ID_COLLISION');
      const intended=structuredClone(snapshot);delete intended.media;delete intended.capabilities;delete intended.restoreProofs;delete intended.updatedAt;
      const now=new Date().toISOString();
      intended.posts.push({...structuredClone(source),id:copyId,stage:'draft',createdAt:now,updatedAt:now});
      // Validate without using its normalized copy: existing records stay exact.
      scheduling(()=>validateState(intended));
      if(new TextEncoder().encode(JSON.stringify(intended)).byteLength>1024*1024)error('Speichergrenze erreicht.','IDEA_LIMIT',413);
      busy=true;
      try{
        let saved,received=false;
        try{
          saved=await client.save(intended);received=true;
          let matches=false;
          try{
            const canonical=validateState(saved);
            matches=saved.revision===intended.revision+1&&snapshotBookkeepingValid(saved)&&sameData(splitReceipt(saved),splitReceipt({...canonical,media:saved.media}))&&sameData(splitReceipt(saved),splitReceipt({...intended,media:snapshot.media}));
          }catch{/* Missing, altered or normalized hidden data is not a receipt. */}
          if(!matches)error('Neuer Entwurf nicht bestätigt. Neu laden und prüfen.','INVALID_RESPONSE');
          toUI(saved);
        }catch(cause){
          // All planner writes, previews and media uploads use this shared fence.
          if(received||!DEFINITIVE_SAVE_REJECTIONS.has(`${cause?.status}:${cause?.code}`))splitNeedsReload=true;
          throw cause;
        }
        snapshot=saved;currentZone=saved.settings.timezone;onTimezone(currentZone);return {state:toUI(saved),copyId};
      }finally{busy=false;}
    },
    /** Canonical archive actions; the read-only UI never supplies variant history. */
    async archiveAction(ui,{postId,action}={}){
      if(busy)error('Speicherung läuft noch.','BUSY');
      if(replaceNeedsReload||shiftNeedsReload||labelsNeedsReload||swapNeedsReload||returnNeedsReload||batchNeedsReload||splitNeedsReload||importNeedsReload||priorityNeedsReload||reflowNeedsReload)error('Neu laden und Archiv prüfen.','RELOAD_REQUIRED');
      if(!snapshot)error('Planer zuerst laden.','NOT_LOADED');
      if(ui?.revision!==snapshot.revision)error('Planung geändert. Neu laden.','REVISION_CONFLICT',409);
      if(!sameData(ui,toUI(snapshot)))error('Änderungen zuerst speichern.','ARCHIVE_STATE_CHANGED');
      const verified=scheduling(()=>validateState(snapshot));
      if(!sameData(splitReceipt(snapshot),splitReceipt({...verified,media:snapshot.media})))error('Planung zuerst neu laden.','ARCHIVE_STATE_CHANGED');
      const source=snapshot.posts.find(p=>p.id===postId);
      if(!source||!['archive','copy'].includes(action)||(action==='archive'?!['draft','planned'].includes(source.stage):source.stage!=='archived'))error('Archivaktion nicht verfügbar.','ARCHIVE_NOT_ALLOWED');
      const intended=structuredClone(snapshot);delete intended.media;delete intended.capabilities;delete intended.restoreProofs;delete intended.updatedAt;
      let copyId=null;
      if(action==='archive'){
        const post=intended.posts.find(p=>p.id===postId);post.stage='archived';post.scheduleBinding=null;
      }else{
        if(snapshot.posts.length>=100||snapshot.posts.reduce((n,p)=>n+p.variants.length,0)+source.variants.length>300)error('Beitrags- oder Variantenlimit erreicht.','ARCHIVE_LIMIT');
        const ids=new Set(snapshot.posts.flatMap(p=>[p.id,...p.variants.map(v=>v.id)]));
        const fresh=()=>{const id=crypto.randomUUID();if(ids.has(id))error('Neue ID nicht verfügbar.','ARCHIVE_ID_COLLISION');ids.add(id);return id;};
        const copy=structuredClone(source);copy.id=fresh();copyId=copy.id;copy.stage='draft';copy.scheduleBinding=null;copy.scheduledAt=null;copy.createdAt=new Date().toISOString();
        copy.variants=copy.variants.map(v=>({...v,id:fresh(),status:'draft',scheduledAt:null,publishedAt:null,publishedUrl:null,statusNote:''}));
        intended.posts.push(copy);
      }
      const canonical=scheduling(()=>validateState(intended));
      if(new TextEncoder().encode(JSON.stringify(canonical)).byteLength>1024*1024)error('Speichergrenze erreicht.','ARCHIVE_LIMIT',413);
      busy=true;
      try{
        let saved,received=false;
        try{
          saved=await client.save(canonical);received=true;
          let matches=false;
          try{matches=saved?.revision===snapshot.revision+1&&sameData(splitReceipt(saved),splitReceipt({...canonical,media:snapshot.media}));}catch{}
          if(!matches)error('Archivaktion nicht bestätigt. Neu laden und prüfen.','INVALID_RESPONSE');
          toUI(saved);
        }catch(cause){if(received||!DEFINITIVE_SAVE_REJECTIONS.has(`${cause?.status}:${cause?.code}`))splitNeedsReload=true;throw cause;}
        snapshot=saved;currentZone=saved.settings.timezone;onTimezone(currentZone);return {state:toUI(saved),copyId};
      }finally{busy=false;}
    },
    /** Split only an unchanged, saved draft. Never reconstruct moved variants
     * from the UI: that projection deliberately omits canonical status notes. */
    async splitDraft(ui,{postId}={}){
      if(replaceNeedsReload||shiftNeedsReload||labelsNeedsReload||swapNeedsReload||returnNeedsReload||reflowNeedsReload)error('Neuplanung nicht bestätigt. Neu laden und Termine prüfen.','RELOAD_REQUIRED');
      if(replaceNeedsReload||shiftNeedsReload||labelsNeedsReload||swapNeedsReload||priorityNeedsReload)error('Priorisierung nicht bestätigt. Neu laden und Termine prüfen.','RELOAD_REQUIRED');
      if(importNeedsReload)error('Der Import wurde nicht eindeutig bestätigt. Bitte neu laden und Einträge prüfen.','RELOAD_REQUIRED');
      if(busy)error('Speicherung läuft noch.','BUSY');
      if(batchNeedsReload)error('Die Stapelplanung wurde nicht eindeutig bestätigt. Bitte neu laden und Termine prüfen.','RELOAD_REQUIRED');
      if(splitNeedsReload)error('Der Ausgang der Aufteilung ist unklar. Lade die Planung neu und prüfe die Entwürfe.','RELOAD_REQUIRED');
      if(!snapshot)error('Planer zuerst laden.','NOT_LOADED');
      if(ui?.revision!==snapshot.revision)error('Die Planung wurde inzwischen geändert. Bitte neu laden.','REVISION_CONFLICT',409);
      if(!sameData(ui,toUI(snapshot)))error('Speichere deine Änderungen vor dem Aufteilen.','SPLIT_STATE_CHANGED');
      const source=snapshot.posts.find(post=>post.id===postId);
      if(!source||source.stage!=='draft'||source.scheduledAt!==null||source.scheduleBinding!==null||source.variants.length<2||
        source.variants.some(v=>v.status!=='draft'||v.scheduledAt!==null||v.publishedAt!==null||v.publishedUrl!==null))error('Nur gespeicherte Entwürfe ohne Termin mit mehreren Kanälen lassen sich aufteilen.','SPLIT_NOT_ALLOWED');
      if(snapshot.posts.length+source.variants.length-1>100||snapshot.posts.reduce((count,post)=>count+post.variants.length,0)>300)error('Das Beitrags- oder Variantenlimit würde überschritten.','SPLIT_LIMIT');
      const ids=new Set(snapshot.posts.map(post=>post.id));
      const pieces=source.variants.map((variant,index)=>{
        const id=index===0?source.id:crypto.randomUUID();
        if(index&&ids.has(id))error('Eine neue Beitrags-ID konnte nicht erstellt werden.','SPLIT_ID_COLLISION');
        ids.add(id);return {...structuredClone(source),id,variants:[structuredClone(variant)]};
      });
      const intended={schemaVersion:DATA_SCHEMA_VERSION,revision:snapshot.revision,settings:structuredClone(snapshot.settings),channels:structuredClone(snapshot.channels),posts:snapshot.posts.flatMap(post=>post.id===source.id?pieces:[structuredClone(post)])};
      if(new TextEncoder().encode(JSON.stringify(intended)).byteLength>1024*1024)error('Die aufgeteilten Entwürfe überschreiten die Speichergrenze.','SPLIT_LIMIT',413);
      busy=true;
      try{
        let saved,replyReceived=false;
        try{
          saved=await client.save(intended);replyReceived=true;
          let matches=false;
          try{matches=!!saved&&saved.revision===intended.revision+1&&sameData(splitReceipt(saved),splitReceipt({...intended,media:snapshot.media}));}catch{/* Malformed collections are not commit receipts. */}
          if(!matches)error('Die Aufteilung wurde nicht eindeutig bestätigt. Bitte neu laden und prüfen.','INVALID_RESPONSE');
          toUI(saved);
        }catch(cause){
          if(replyReceived||!DEFINITIVE_SAVE_REJECTIONS.has(`${cause?.status}:${cause?.code}`))splitNeedsReload=true;
          throw cause;
        }
        snapshot=saved;currentZone=saved.settings.timezone;onTimezone(currentZone);return toUI(saved);
      }finally{busy=false;}
    },
    /** Keep the intended canonical write private; UI receives only its exact preview. */
    previewDraftBatch(ui,{postIds}={}){
      if(busy)error('Speicherung läuft noch.','BUSY');
      if(replaceNeedsReload||shiftNeedsReload||labelsNeedsReload||swapNeedsReload||returnNeedsReload||batchNeedsReload||splitNeedsReload||importNeedsReload||priorityNeedsReload||reflowNeedsReload)error('Bitte neu laden und die Planung prüfen.','RELOAD_REQUIRED');
      batchPreview=null;
      if(!snapshot)error('Planer zuerst laden.','NOT_LOADED');
      if(ui?.revision!==snapshot.revision)error('Die Planung wurde inzwischen geändert. Bitte neu laden.','REVISION_CONFLICT',409);
      if(!sameData(ui,toUI(snapshot)))error('Speichere deine Änderungen vor der Stapelplanung.','BATCH_STATE_CHANGED');
      const {next,entries}=scheduling(()=>prepareDraftBatch(snapshot,{postIds}));
      for(const entry of entries){
        const source=next.posts.find(post=>post.id===entry.postId);
        for(const variant of source.variants){
          const limit=channels.find(channel=>channel.id===variant.channelId)?.limit;
          if(limit&&Array.from(variant.body).length>limit)error('Ein ausgewählter Kanaltext ist zu lang.','BATCH_CONTENT_REQUIRED');
          if(variant.mediaIds.some(id=>!snapshot.media.find(media=>media.id===id)?.altText?.trim()))error('Ergänze den Alternativtext des gespeicherten Bilds.','BATCH_CONTENT_REQUIRED');
        }
      }
      const intended={schemaVersion:DATA_SCHEMA_VERSION,revision:next.revision,settings:next.settings,channels:next.channels,posts:next.posts};
      if(new TextEncoder().encode(JSON.stringify(intended)).byteLength>1024*1024)error('Die Stapelplanung überschreitet die Speichergrenze.','BATCH_LIMIT',413);
      const preview={token:crypto.randomUUID(),revision:snapshot.revision,entries};
      batchPreview={preview:structuredClone(preview),intended,source:structuredClone(snapshot)};
      return preview;
    },
    async scheduleDraftBatch(ui,preview){
      if(busy)error('Speicherung läuft noch.','BUSY');
      if(replaceNeedsReload||shiftNeedsReload||labelsNeedsReload||swapNeedsReload||returnNeedsReload||batchNeedsReload||splitNeedsReload||importNeedsReload||priorityNeedsReload||reflowNeedsReload)error('Bitte neu laden und die Planung prüfen.','RELOAD_REQUIRED');
      const pending=batchPreview;batchPreview=null;
      if(!pending||!sameData(preview,pending.preview))error('Prüfe die Termine erneut.','BATCH_PREVIEW_CHANGED');
      if(!snapshot||ui?.revision!==snapshot.revision||!sameData(snapshot,pending.source)||!sameData(ui,toUI(snapshot)))error('Die Planung wurde inzwischen geändert. Prüfe die Termine erneut.','BATCH_STATE_CHANGED');
      const intended=pending.intended;
      scheduling(()=>validateScheduleChanges(intended,snapshot));
      busy=true;
      try{
        let saved,replyReceived=false;
        try{
          saved=await client.save(intended);replyReceived=true;
          let matches=false;
          try{matches=!!saved&&saved.revision===intended.revision+1&&sameData(splitReceipt(saved),splitReceipt({...intended,media:snapshot.media}));}catch{/* A malformed reply cannot confirm the batch. */}
          if(!matches)error('Die Stapelplanung wurde nicht eindeutig bestätigt. Bitte neu laden und Termine prüfen.','INVALID_RESPONSE');
          toUI(saved);
        }catch(cause){
          if(replyReceived||!DEFINITIVE_SAVE_REJECTIONS.has(`${cause?.status}:${cause?.code}`))batchNeedsReload=true;
          throw cause;
        }
        snapshot=saved;currentZone=saved.settings.timezone;onTimezone(currentZone);return toUI(saved);
      }finally{busy=false;}
    },
    /** Exact canonical intent; never rebuild a label edit from the UI projection. */
    previewDraftLabels(ui,{postIds,add,remove}={}){
      if(busy)error('Speicherung läuft noch.','BUSY');
      if(replaceNeedsReload||shiftNeedsReload||labelsNeedsReload||swapNeedsReload||returnNeedsReload||priorityNeedsReload||batchNeedsReload||splitNeedsReload||importNeedsReload||reflowNeedsReload)error('Neu laden und Labels prüfen.','RELOAD_REQUIRED');
      labelsPreview=null;
      if(!snapshot)error('Planer zuerst laden.','NOT_LOADED');
      if(ui?.revision!==snapshot.revision)error('Planung geändert. Neu laden.','REVISION_CONFLICT',409);
      if(!sameData(ui,toUI(snapshot)))error('Änderungen zuerst speichern.','LABELS_STATE_CHANGED');
      const verified=scheduling(()=>validateState(snapshot));
      if(!sameData(splitReceipt(snapshot),splitReceipt({...verified,media:snapshot.media})))error('Planung zuerst neu laden.','LABELS_STATE_CHANGED');
      const {next,entries}=scheduling(()=>prepareDraftLabels(snapshot,{postIds,add,remove}));
      const intended={schemaVersion:DATA_SCHEMA_VERSION,revision:next.revision,settings:next.settings,channels:next.channels,posts:next.posts};
      if(new TextEncoder().encode(JSON.stringify(intended)).byteLength>1024*1024)error('Speichergrenze erreicht.','LABELS_LIMIT',413);
      const preview={token:crypto.randomUUID(),revision:snapshot.revision,postIds,add,remove,entries};
      labelsPreview={preview:structuredClone(preview),intended,source:structuredClone(snapshot)};
      return preview;
    },
    cancelDraftLabels(preview){
      if(!busy&&labelsPreview&&preview?.token===labelsPreview.preview.token)labelsPreview=null;
    },
    async applyDraftLabels(ui,preview){
      if(busy)error('Speicherung läuft noch.','BUSY');
      if(replaceNeedsReload||shiftNeedsReload||labelsNeedsReload||swapNeedsReload||returnNeedsReload||priorityNeedsReload||batchNeedsReload||splitNeedsReload||importNeedsReload||reflowNeedsReload)error('Neu laden und Labels prüfen.','RELOAD_REQUIRED');
      const pending=labelsPreview;labelsPreview=null;
      if(!pending||!sameData(preview,pending.preview))error('Labels erneut prüfen.','LABELS_PREVIEW_CHANGED');
      if(!snapshot||ui?.revision!==snapshot.revision||!sameData(snapshot,pending.source)||!sameData(ui,toUI(snapshot)))error('Planung geändert. Labels erneut prüfen.','LABELS_STATE_CHANGED');
      const intended=pending.intended;
      busy=true;
      try{
        let saved,replyReceived=false;
        try{
          saved=await client.save(intended);replyReceived=true;
          let matches=false;
          try{matches=!!saved&&saved.revision===intended.revision+1&&sameData(splitReceipt(saved),splitReceipt({...intended,media:snapshot.media}));}catch{/* An unverified receipt never confirms a label edit. */}
          if(!matches)error('Label-Änderung nicht bestätigt. Neu laden und Labels prüfen.','INVALID_RESPONSE');
          toUI(saved);
        }catch(cause){
          if(replyReceived||!DEFINITIVE_SAVE_REJECTIONS.has(`${cause?.status}:${cause?.code}`))labelsNeedsReload=true;
          throw cause;
        }
        snapshot=saved;currentZone=saved.settings.timezone;onTimezone(currentZone);return toUI(saved);
      }finally{busy=false;}
    },
    /** Exact canonical intent; never rebuild a text edit from the UI projection. */
    previewDraftReplace(ui,{postIds,find,replace,scope}={}){
      if(busy)error('Speicherung läuft noch.','BUSY');
      if(labelsNeedsReload||shiftNeedsReload||replaceNeedsReload||swapNeedsReload||returnNeedsReload||priorityNeedsReload||batchNeedsReload||splitNeedsReload||importNeedsReload||reflowNeedsReload)error('Neu laden und Texte prüfen.','RELOAD_REQUIRED');
      replacePreview=null;
      if(!snapshot)error('Planer zuerst laden.','NOT_LOADED');
      if(ui?.revision!==snapshot.revision)error('Planung geändert. Neu laden.','REVISION_CONFLICT',409);
      if(!sameData(ui,toUI(snapshot)))error('Änderungen zuerst speichern.','REPLACE_STATE_CHANGED');
      const verified=scheduling(()=>validateState(snapshot));
      if(!sameData(splitReceipt(snapshot),splitReceipt({...verified,media:snapshot.media})))error('Planung zuerst neu laden.','REPLACE_STATE_CHANGED');
      const {next,entries}=scheduling(()=>prepareDraftReplace(snapshot,{postIds,find,replace,scope}));
      const intended={schemaVersion:DATA_SCHEMA_VERSION,revision:next.revision,settings:next.settings,channels:next.channels,posts:next.posts};
      if(new TextEncoder().encode(JSON.stringify(intended)).byteLength>1024*1024)error('Speichergrenze erreicht.','REPLACE_LIMIT',413);
      const preview={token:crypto.randomUUID(),revision:snapshot.revision,postIds,find,replace,scope,entries};
      replacePreview={preview:structuredClone(preview),intended,source:structuredClone(snapshot)};
      return preview;
    },
    cancelDraftReplace(preview){
      if(!busy&&replacePreview&&preview?.token===replacePreview.preview.token)replacePreview=null;
    },
    async applyDraftReplace(ui,preview){
      if(busy)error('Speicherung läuft noch.','BUSY');
      if(labelsNeedsReload||shiftNeedsReload||replaceNeedsReload||swapNeedsReload||returnNeedsReload||priorityNeedsReload||batchNeedsReload||splitNeedsReload||importNeedsReload||reflowNeedsReload)error('Neu laden und Texte prüfen.','RELOAD_REQUIRED');
      const pending=replacePreview;replacePreview=null;
      if(!pending||!sameData(preview,pending.preview))error('Texte erneut prüfen.','REPLACE_PREVIEW_CHANGED');
      if(!snapshot||ui?.revision!==snapshot.revision||!sameData(snapshot,pending.source)||!sameData(ui,toUI(snapshot)))error('Planung geändert. Texte erneut prüfen.','REPLACE_STATE_CHANGED');
      const intended=pending.intended;
      busy=true;
      try{
        let saved,replyReceived=false;
        try{
          saved=await client.save(intended);replyReceived=true;
          let matches=false;
          try{matches=!!saved&&saved.revision===intended.revision+1&&sameData(splitReceipt(saved),splitReceipt({...intended,media:snapshot.media}));}catch{/* An unverified receipt never confirms a text edit. */}
          if(!matches)error('Textänderung nicht bestätigt. Neu laden und Texte prüfen.','INVALID_RESPONSE');
          toUI(saved);
        }catch(cause){
          if(replyReceived||!DEFINITIVE_SAVE_REJECTIONS.has(`${cause?.status}:${cause?.code}`))replaceNeedsReload=true;
          throw cause;
        }
        snapshot=saved;currentZone=saved.settings.timezone;onTimezone(currentZone);return toUI(saved);
      }finally{busy=false;}
    },
    /** Exact canonical intent; never rebuild a rotation from the UI projection. */
    previewQueuePriority(ui,{postId,channelId}={}){
      if(busy)error('Speicherung läuft noch.','BUSY');
      if(replaceNeedsReload||shiftNeedsReload||labelsNeedsReload||swapNeedsReload||returnNeedsReload||priorityNeedsReload||batchNeedsReload||splitNeedsReload||importNeedsReload||reflowNeedsReload)error('Neu laden und Termine prüfen.','RELOAD_REQUIRED');
      priorityPreview=null;
      if(!snapshot)error('Planer zuerst laden.','NOT_LOADED');
      if(ui?.revision!==snapshot.revision)error('Planung geändert. Neu laden.','REVISION_CONFLICT',409);
      if(!sameData(ui,toUI(snapshot)))error('Änderungen zuerst speichern.','PRIORITY_STATE_CHANGED');
      const {next,entries}=scheduling(()=>prepareQueuePriority(snapshot,{postId,channelId}));
      const intended={schemaVersion:DATA_SCHEMA_VERSION,revision:next.revision,settings:next.settings,channels:next.channels,posts:next.posts};
      if(new TextEncoder().encode(JSON.stringify(intended)).byteLength>1024*1024)error('Speichergrenze erreicht.','PRIORITY_LIMIT',413);
      const preview={token:crypto.randomUUID(),revision:snapshot.revision,postId,channelId,entries};
      priorityPreview={preview:structuredClone(preview),intended,source:structuredClone(snapshot)};
      return preview;
    },
    cancelQueuePriority(preview){
      if(!busy&&priorityPreview&&preview?.token===priorityPreview.preview.token)priorityPreview=null;
    },
    async prioritizeQueue(ui,preview){
      if(busy)error('Speicherung läuft noch.','BUSY');
      if(replaceNeedsReload||shiftNeedsReload||labelsNeedsReload||swapNeedsReload||returnNeedsReload||priorityNeedsReload||batchNeedsReload||splitNeedsReload||importNeedsReload||reflowNeedsReload)error('Neu laden und Termine prüfen.','RELOAD_REQUIRED');
      const pending=priorityPreview;priorityPreview=null;
      if(!pending||!sameData(preview,pending.preview))error('Termine erneut prüfen.','PRIORITY_PREVIEW_CHANGED');
      if(!snapshot||ui?.revision!==snapshot.revision||!sameData(snapshot,pending.source)||!sameData(ui,toUI(snapshot)))error('Planung geändert. Termine erneut prüfen.','PRIORITY_STATE_CHANGED');
      const intended=pending.intended;
      scheduling(()=>validateScheduleChanges(intended,snapshot));
      busy=true;
      try{
        let saved,replyReceived=false;
        try{
          saved=await client.save(intended);replyReceived=true;
          let matches=false;
          try{matches=!!saved&&saved.revision===intended.revision+1&&sameData(splitReceipt(saved),splitReceipt({...intended,media:snapshot.media}));}catch{/* An unverified receipt never confirms a rotation. */}
          if(!matches)error('Priorisierung nicht bestätigt. Neu laden und Termine prüfen.','INVALID_RESPONSE');
          toUI(saved);
        }catch(cause){
          if(replyReceived||!DEFINITIVE_SAVE_REJECTIONS.has(`${cause?.status}:${cause?.code}`))priorityNeedsReload=true;
          throw cause;
        }
        snapshot=saved;currentZone=saved.settings.timezone;onTimezone(currentZone);return toUI(saved);
      }finally{busy=false;}
    },
    /** Exact canonical intent; never rebuild a date shift from the UI projection. */
    previewDateShift(ui,{postIds,days}={}){
      if(busy)error('Speicherung läuft noch.','BUSY');
      if(replaceNeedsReload||shiftNeedsReload||labelsNeedsReload||swapNeedsReload||returnNeedsReload||priorityNeedsReload||batchNeedsReload||splitNeedsReload||importNeedsReload||reflowNeedsReload)error('Neu laden und Termine prüfen.','RELOAD_REQUIRED');
      shiftPreview=null;
      if(!snapshot)error('Planer zuerst laden.','NOT_LOADED');
      if(ui?.revision!==snapshot.revision)error('Planung geändert. Neu laden.','REVISION_CONFLICT',409);
      if(!sameData(ui,toUI(snapshot)))error('Änderungen zuerst speichern.','SHIFT_STATE_CHANGED');
      const verified=scheduling(()=>validateState(snapshot));
      if(!sameData(splitReceipt(snapshot),splitReceipt({...verified,media:snapshot.media})))error('Planung zuerst neu laden.','SHIFT_STATE_CHANGED');
      const {next,entries}=scheduling(()=>prepareDateShift(snapshot,{postIds,days}));
      const intended={schemaVersion:DATA_SCHEMA_VERSION,revision:next.revision,settings:next.settings,channels:next.channels,posts:next.posts};
      if(new TextEncoder().encode(JSON.stringify(intended)).byteLength>1024*1024)error('Speichergrenze erreicht.','SHIFT_LIMIT',413);
      scheduling(()=>validateState(intended));
      const preview={token:crypto.randomUUID(),revision:snapshot.revision,postIds,days,entries};
      shiftPreview={preview:structuredClone(preview),intended,source:structuredClone(snapshot)};
      return preview;
    },
    cancelDateShift(preview){
      if(!busy&&shiftPreview&&preview?.token===shiftPreview.preview.token)shiftPreview=null;
    },
    async shiftDates(ui,preview){
      if(busy)error('Speicherung läuft noch.','BUSY');
      if(replaceNeedsReload||shiftNeedsReload||labelsNeedsReload||swapNeedsReload||returnNeedsReload||priorityNeedsReload||batchNeedsReload||splitNeedsReload||importNeedsReload||reflowNeedsReload)error('Neu laden und Termine prüfen.','RELOAD_REQUIRED');
      const pending=shiftPreview;shiftPreview=null;
      if(!pending||!sameData(preview,pending.preview))error('Termine erneut prüfen.','SHIFT_PREVIEW_CHANGED');
      if(!snapshot||ui?.revision!==snapshot.revision||!sameData(snapshot,pending.source)||!sameData(ui,toUI(snapshot)))error('Planung geändert. Termine erneut prüfen.','SHIFT_STATE_CHANGED');
      const intended=pending.intended;
      const checked=scheduling(()=>prepareDateShift(snapshot,{postIds:pending.preview.postIds,days:pending.preview.days}));
      if(!sameData(checked.entries,pending.preview.entries))error('Termine erneut prüfen.','SHIFT_PREVIEW_CHANGED');
      scheduling(()=>validateState(intended));
      scheduling(()=>validateScheduleChanges(intended,snapshot));
      busy=true;
      try{
        let saved,replyReceived=false;
        try{
          saved=await client.save(intended);replyReceived=true;
          let matches=false;
          try{matches=!!saved&&saved.revision===intended.revision+1&&sameData(splitReceipt(saved),splitReceipt({...intended,media:snapshot.media}));}catch{/* An unverified receipt never confirms a date shift. */}
          if(!matches)error('Verschiebung nicht bestätigt. Neu laden und Termine prüfen.','INVALID_RESPONSE');
          toUI(saved);
        }catch(cause){
          if(replyReceived||!DEFINITIVE_SAVE_REJECTIONS.has(`${cause?.status}:${cause?.code}`))shiftNeedsReload=true;
          throw cause;
        }
        snapshot=saved;currentZone=saved.settings.timezone;onTimezone(currentZone);return toUI(saved);
      }finally{busy=false;}
    },
    /** Exact canonical intent; never rebuild a exchange from the UI projection. */
    previewQueueSwap(ui,{postIds,channelId}={}){
      if(busy)error('Speicherung läuft noch.','BUSY');
      if(replaceNeedsReload||shiftNeedsReload||labelsNeedsReload||swapNeedsReload||returnNeedsReload||priorityNeedsReload||batchNeedsReload||splitNeedsReload||importNeedsReload||reflowNeedsReload)error('Neu laden und Termine prüfen.','RELOAD_REQUIRED');
      swapPreview=null;
      if(!snapshot)error('Planer zuerst laden.','NOT_LOADED');
      if(ui?.revision!==snapshot.revision)error('Planung geändert. Neu laden.','REVISION_CONFLICT',409);
      if(!sameData(ui,toUI(snapshot)))error('Änderungen zuerst speichern.','SWAP_STATE_CHANGED');
      const verified=scheduling(()=>validateState(snapshot));
      if(!sameData(splitReceipt(snapshot),splitReceipt({...verified,media:snapshot.media})))error('Planung zuerst neu laden.','SWAP_STATE_CHANGED');
      const {next,entries}=scheduling(()=>prepareQueueSwap(snapshot,{postIds,channelId}));
      const intended={schemaVersion:DATA_SCHEMA_VERSION,revision:next.revision,settings:next.settings,channels:next.channels,posts:next.posts};
      if(new TextEncoder().encode(JSON.stringify(intended)).byteLength>1024*1024)error('Speichergrenze erreicht.','SWAP_LIMIT',413);
      const preview={token:crypto.randomUUID(),revision:snapshot.revision,postIds,channelId,entries};
      swapPreview={preview:structuredClone(preview),intended,source:structuredClone(snapshot)};
      return preview;
    },
    cancelQueueSwap(preview){
      if(!busy&&swapPreview&&preview?.token===swapPreview.preview.token)swapPreview=null;
    },
    async swapQueue(ui,preview){
      if(busy)error('Speicherung läuft noch.','BUSY');
      if(replaceNeedsReload||shiftNeedsReload||labelsNeedsReload||swapNeedsReload||returnNeedsReload||priorityNeedsReload||batchNeedsReload||splitNeedsReload||importNeedsReload||reflowNeedsReload)error('Neu laden und Termine prüfen.','RELOAD_REQUIRED');
      const pending=swapPreview;swapPreview=null;
      if(!pending||!sameData(preview,pending.preview))error('Termine erneut prüfen.','SWAP_PREVIEW_CHANGED');
      if(!snapshot||ui?.revision!==snapshot.revision||!sameData(snapshot,pending.source)||!sameData(ui,toUI(snapshot)))error('Planung geändert. Termine erneut prüfen.','SWAP_STATE_CHANGED');
      const intended=pending.intended;
      scheduling(()=>validateScheduleChanges(intended,snapshot));
      busy=true;
      try{
        let saved,replyReceived=false;
        try{
          saved=await client.save(intended);replyReceived=true;
          let matches=false;
          try{matches=!!saved&&saved.revision===intended.revision+1&&sameData(splitReceipt(saved),splitReceipt({...intended,media:snapshot.media}));}catch{/* An unverified receipt never confirms a exchange. */}
          if(!matches)error('Tausch nicht bestätigt. Neu laden und Termine prüfen.','INVALID_RESPONSE');
          toUI(saved);
        }catch(cause){
          if(replyReceived||!DEFINITIVE_SAVE_REJECTIONS.has(`${cause?.status}:${cause?.code}`))swapNeedsReload=true;
          throw cause;
        }
        snapshot=saved;currentZone=saved.settings.timezone;onTimezone(currentZone);return toUI(saved);
      }finally{busy=false;}
    },
    /** Explicit selection only, with a private canonical one-use intent. */
    previewReturnDrafts(ui,{postIds}={}){
      if(busy)error('Speicherung läuft noch.','BUSY');
      if(replaceNeedsReload||shiftNeedsReload||labelsNeedsReload||swapNeedsReload||returnNeedsReload||reflowNeedsReload||priorityNeedsReload||batchNeedsReload||splitNeedsReload||importNeedsReload)error('Neu laden und Termine prüfen.','RELOAD_REQUIRED');
      returnPreview=null;
      if(!snapshot)error('Planer zuerst laden.','NOT_LOADED');
      if(ui?.revision!==snapshot.revision)error('Planung geändert. Neu laden.','REVISION_CONFLICT',409);
      if(!sameData(ui,toUI(snapshot)))error('Änderungen zuerst speichern.','RETURN_STATE_CHANGED');
      const verified=scheduling(()=>validateState(snapshot));
      if(!sameData(splitReceipt(snapshot),splitReceipt({...verified,media:snapshot.media})))error('Planung einzeln prüfen.','RETURN_STATE_CHANGED');
      const {next,entries}=scheduling(()=>prepareReturnDrafts(snapshot,{postIds}));
      const intended={schemaVersion:DATA_SCHEMA_VERSION,revision:next.revision,settings:next.settings,channels:next.channels,posts:next.posts};
      // Use the actual server validator, not only the narrower scheduling checks.
      scheduling(()=>validateState(intended));
      if(new TextEncoder().encode(JSON.stringify(intended)).byteLength>1024*1024)error('Speichergrenze erreicht.','RETURN_LIMIT',413);
      const preview={token:crypto.randomUUID(),revision:snapshot.revision,entries};
      returnPreview={preview:structuredClone(preview),intended,source:structuredClone(snapshot)};
      return preview;
    },
    cancelReturnDrafts(preview){
      if(!busy&&returnPreview&&preview?.token===returnPreview.preview.token)returnPreview=null;
    },
    async returnDrafts(ui,preview){
      if(busy)error('Speicherung läuft noch.','BUSY');
      if(replaceNeedsReload||shiftNeedsReload||labelsNeedsReload||swapNeedsReload||returnNeedsReload||reflowNeedsReload||priorityNeedsReload||batchNeedsReload||splitNeedsReload||importNeedsReload)error('Neu laden und Termine prüfen.','RELOAD_REQUIRED');
      const pending=returnPreview;returnPreview=null;
      if(!pending||!sameData(preview,pending.preview))error('Auswahl erneut prüfen.','RETURN_PREVIEW_CHANGED');
      if(!snapshot||ui?.revision!==snapshot.revision||!sameData(snapshot,pending.source)||!sameData(ui,toUI(snapshot)))error('Planung geändert. Auswahl erneut prüfen.','RETURN_STATE_CHANGED');
      const intended=pending.intended,now=new Date().toISOString();
      scheduling(()=>validateState(intended,now));
      scheduling(()=>validateScheduleChanges(intended,snapshot,now));
      if(new TextEncoder().encode(JSON.stringify(intended)).byteLength>1024*1024)error('Speichergrenze erreicht.','RETURN_LIMIT',413);
      busy=true;
      try{
        let saved,replyReceived=false;
        try{
          saved=await client.save(intended);replyReceived=true;
          let matches=false;
          try{matches=!!saved&&saved.revision===intended.revision+1&&sameData(splitReceipt(saved),splitReceipt({...intended,media:snapshot.media}));}catch{/* No partial receipt can acknowledge this batch. */}
          if(!matches)error('Entwürfe nicht bestätigt. Neu laden und Termine prüfen.','INVALID_RESPONSE');
          toUI(saved);
        }catch(cause){
          if(replyReceived||!DEFINITIVE_SAVE_REJECTIONS.has(`${cause?.status}:${cause?.code}`))returnNeedsReload=true;
          throw cause;
        }
        snapshot=saved;currentZone=saved.settings.timezone;onTimezone(currentZone);return toUI(saved);
      }finally{busy=false;}
    },
    /** Whole-channel canonical reflow, independent of list filters. */
    previewQueueReflow(ui,{channelId}={}){
      if(busy)error('Speicherung läuft noch.','BUSY');
      if(replaceNeedsReload||shiftNeedsReload||labelsNeedsReload||swapNeedsReload||returnNeedsReload||reflowNeedsReload||priorityNeedsReload||batchNeedsReload||splitNeedsReload||importNeedsReload)error('Neu laden und Termine prüfen.','RELOAD_REQUIRED');
      reflowPreview=null;
      if(!snapshot)error('Planer zuerst laden.','NOT_LOADED');
      if(ui?.revision!==snapshot.revision)error('Planung geändert. Neu laden.','REVISION_CONFLICT',409);
      if(!sameData(ui,toUI(snapshot)))error('Änderungen zuerst speichern.','REFLOW_STATE_CHANGED');
      const {next,entries,unchanged}=scheduling(()=>prepareQueueReflow(snapshot,{channelId}));
      const intended={schemaVersion:DATA_SCHEMA_VERSION,revision:next.revision,settings:next.settings,channels:next.channels,posts:next.posts};
      // Use the actual server validator, not only the narrower scheduling checks.
      scheduling(()=>validateState(intended));
      if(new TextEncoder().encode(JSON.stringify(intended)).byteLength>1024*1024)error('Speichergrenze erreicht.','REFLOW_LIMIT',413);
      const preview={token:crypto.randomUUID(),revision:snapshot.revision,channelId,entries,unchanged};
      reflowPreview={preview:structuredClone(preview),intended,source:structuredClone(snapshot)};
      return preview;
    },
    cancelQueueReflow(preview){
      if(!busy&&reflowPreview&&preview?.token===reflowPreview.preview.token)reflowPreview=null;
    },
    async reflowQueue(ui,preview){
      if(busy)error('Speicherung läuft noch.','BUSY');
      if(replaceNeedsReload||shiftNeedsReload||labelsNeedsReload||swapNeedsReload||returnNeedsReload||reflowNeedsReload||priorityNeedsReload||batchNeedsReload||splitNeedsReload||importNeedsReload)error('Neu laden und Termine prüfen.','RELOAD_REQUIRED');
      const pending=reflowPreview;reflowPreview=null;
      if(!pending||!sameData(preview,pending.preview))error('Termine erneut prüfen.','REFLOW_PREVIEW_CHANGED');
      if(!snapshot||ui?.revision!==snapshot.revision||!sameData(snapshot,pending.source)||!sameData(ui,toUI(snapshot)))error('Planung geändert. Termine erneut prüfen.','REFLOW_STATE_CHANGED');
      const intended=pending.intended,now=new Date().toISOString();
      // Never revive a source that crossed into the past while its preview was open.
      if(pending.preview.entries.some(entry=>Date.parse(entry.from.instant)<=Date.parse(now)||Date.parse(entry.to.instant)<=Date.parse(now)))error('Ein Termin ist inzwischen verstrichen. Neu prüfen.','PAST_TIME');
      scheduling(()=>validateState(intended,now));
      scheduling(()=>validateScheduleChanges(intended,snapshot,now));
      if(new TextEncoder().encode(JSON.stringify(intended)).byteLength>1024*1024)error('Speichergrenze erreicht.','REFLOW_LIMIT',413);
      busy=true;
      try{
        let saved,replyReceived=false;
        try{
          saved=await client.save(intended);replyReceived=true;
          let matches=false;
          try{matches=!!saved&&saved.revision===intended.revision+1&&sameData(splitReceipt(saved),splitReceipt({...intended,media:snapshot.media}));}catch{/* No partial/malformed receipt can acknowledge this reflow. */}
          if(!matches)error('Neuplanung nicht bestätigt. Neu laden und Termine prüfen.','INVALID_RESPONSE');
          toUI(saved);
        }catch(cause){
          if(replyReceived||!DEFINITIVE_SAVE_REJECTIONS.has(`${cause?.status}:${cause?.code}`))reflowNeedsReload=true;
          throw cause;
        }
        snapshot=saved;currentZone=saved.settings.timezone;onTimezone(currentZone);return toUI(saved);
      }finally{busy=false;}
    },
    async save(ui,{expectedInstants=null,requireFuture=false}={}){
      if(replaceNeedsReload||shiftNeedsReload||labelsNeedsReload||swapNeedsReload||returnNeedsReload||reflowNeedsReload)error('Neuplanung nicht bestätigt. Neu laden und Termine prüfen.','RELOAD_REQUIRED');
      if(replaceNeedsReload||shiftNeedsReload||labelsNeedsReload||swapNeedsReload||priorityNeedsReload)error('Priorisierung nicht bestätigt. Neu laden und Termine prüfen.','RELOAD_REQUIRED');
      if(importNeedsReload)error('Der Import wurde nicht eindeutig bestätigt. Bitte neu laden und Einträge prüfen.','RELOAD_REQUIRED');
      if(batchNeedsReload)error('Die Stapelplanung wurde nicht eindeutig bestätigt. Bitte neu laden und Termine prüfen.','RELOAD_REQUIRED');
      if(splitNeedsReload)error('Der Ausgang der Aufteilung ist unklar. Lade die Planung neu und prüfe die Entwürfe.','RELOAD_REQUIRED');
      if(busy)error('Speicherung läuft noch.','BUSY');if(!snapshot)error('Planer zuerst laden.','NOT_LOADED');busy=true;
      try{
        pruneDeleted();
        if(typeof requireFuture!=='boolean'||requireFuture&&expectedInstants===null)error('Ungültige CSV-Terminprüfung.','INVALID_IMPORT_EXPECTATION');
        if(expectedInstants!==null){ui=structuredClone(ui);expectedInstants=structuredClone(expectedInstants);}
        if(ui?.schemaVersion!==3||!Array.isArray(ui.posts)||!Array.isArray(ui.channels))error('Dieses Formular verwendet ein altes Planungsformat. Bitte neu laden.','UI_SCHEMA_UNSUPPORTED');
        if(ui.revision!==snapshot.revision)error('Die geladene Planungsrevision wurde verändert. Bitte neu laden.','REVISION_CONFLICT',409);
        if(expectedInstants!==null&&(!expectedInstants||typeof expectedInstants!=='object'||Array.isArray(expectedInstants)||Object.entries(expectedInstants).some(([id,instant])=>!ui.posts.some(p=>p.id===id&&p.status==='scheduled')||typeof instant!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(instant))))error('Ungültige Import-Terminprüfung.','INVALID_IMPORT_EXPECTATION');
        // CSV alone requires new times to remain future. Historical JSON imports
        // retain their existing contract. The map must cover every new appointment.
        if(requireFuture){
          const newTimed=ui.posts.filter(p=>p.status==='scheduled'&&!snapshot.posts.some(old=>old.id===p.id));
          if(Object.keys(expectedInstants).length!==newTimed.length||newTimed.some(p=>!Object.hasOwn(expectedInstants,p.id)))error('CSV-Terminvorschau unvollständig.','INVALID_IMPORT_EXPECTATION');
        }
        const channelIds=new Set(definitions.map(c=>c.id));
        const selectedChannels=ui.channels.map(c=>{if(!c||!channelIds.has(c.id)||!Object.hasOwn(c,'postingSchedule'))error('Ein Kanal oder seine Posting-Zeiten fehlen.','INVALID_SCHEDULE');return{...structuredClone(c),postingSchedule:scheduling(()=>normalizePostingSchedule(c.postingSchedule))};});
        const ids=new Set();for(const p of ui.posts){if(!p||typeof p.id!=='string'||ids.has(p.id)||!['idea','draft','scheduled','archived'].includes(p.status)||typeof p.text!=='string'||!Array.isArray(p.channels))error('Ungültiger Beitrag.');if(Object.hasOwn(p,'media'))error('Veraltetes Bildfeld.');try{normalizeMediaItems(p.mediaItems);if(Object.hasOwn(p,'channelMediaItems'))normalizeChannelMediaItems(p.channelMediaItems,p.channels,p.mediaItems);else {const previous=previousPost(p.id);if(previous?.variants.some(v=>!sameData(v.mediaIds,previous.variants[0].mediaIds)))error('Eigene Kanalbilder fehlen. Bitte neu laden.','CHANNEL_MEDIA_REQUIRED');}}catch(e){error(e.message,'INVALID_MEDIA');}if(p.mediaItems.length&&!p.channels.length)error('Ein Medium braucht mindestens einen Zielkanal. Wähle zuerst einen Kanal.','MEDIA_TARGET_REQUIRED');
          if(Object.hasOwn(p,'title')&&typeof p.title!=='string')error('Der Titel muss Text sein.','INVALID_POST_METADATA');
          if(Object.hasOwn(p,'tags')&&(!Array.isArray(p.tags)||p.tags.some(tag=>typeof tag!=='string')))error('Tags müssen eine Liste von Texten sein.','INVALID_POST_METADATA');
          if(p.status==='idea'&&(p.channels.length||p.scheduledAt||p.mediaItems.length||Object.keys(p.variantTexts??{}).length))error('Eine Idee hat noch keine Kanäle, Medien, Kanaltexte oder Termine.','IDEA_FIELDS_UNSUPPORTED');
          if(p.status==='idea'&&(previousPost(p.id)&&previousPost(p.id).stage!=='idea'))error('Ein bestehender Beitrag kann in dieser Ansicht nicht zurück in eine Idee umgewandelt werden.','IDEA_TRANSITION_UNSUPPORTED');
          if(p.variantTexts!=null&&(typeof p.variantTexts!=='object'||Array.isArray(p.variantTexts)))error('Kanaltexte müssen eine Zuordnung von Kanal zu Text sein.','INVALID_VARIANT_TEXTS');
          if(p.variantTexts==null&&previousPost(p.id)?.variants.some(v=>!v.inheritsBody))error('Die eigenen Kanaltexte fehlen im gespeicherten Formular. Bitte neu laden oder die Vererbung ausdrücklich zurücksetzen.','VARIANT_TEXTS_REQUIRED');
          for(const [channelId,text] of Object.entries(p.variantTexts??{})){if(!p.channels.includes(channelId)||typeof text!=='string')error('Jeder eigene Kanaltext braucht einen ausgewählten Kanal und einen Text.','INVALID_VARIANT_TEXTS');}
          if(!Object.hasOwn(p,'scheduleBinding')||!Object.hasOwn(p,'scheduledInstant'))error('Terminbindung oder UTC-Projektion fehlt.','STATE_SCHEMA_CHANGED');
          scheduling(()=>normalizeScheduleBinding(p.scheduleBinding));
          if(p.status!=='scheduled'&&(p.scheduleBinding!==null||p.scheduledInstant!==null||p.scheduledAt))error('Entwürfe und Ideen dürfen keine verdeckte Terminbindung behalten.','INVALID_SCHEDULE');
          ids.add(p.id);}
        const archivedUI=new Map(toUI(snapshot).posts.filter(p=>p.status==='archived').map(p=>[p.id,p]));
        for(const [id,post] of archivedUI)if(!sameData(post,ui.posts.find(p=>p.id===id)))error('Archivierte Beiträge bleiben unverändert.','ARCHIVE_READ_ONLY');
        for(const post of ui.posts)if(post.status==='archived'&&!archivedUI.has(post.id))error('Archivieren ist nur als eigene Aktion möglich.','ARCHIVE_READ_ONLY');
        const selectedZone=ui.settings?.timezone??currentZone;new Intl.DateTimeFormat('de',{timeZone:selectedZone}).format();
        // Validate every image, including later posts, before any upload. Keep
        // prepared files private and reject duplicate upload identities per post.
        const preparedImages=new Map();
        const confirmedPosts=new Map(toUI(snapshot).posts.map(post=>[post.id,post]));
        for(const p of ui.posts){
          const prepared=[],identities=new Set();
          for(const item of allReferencedMediaItems(p)){
            // Unchanged historical references must not block unrelated repairs.
            // Any edited/new post still needs an alt for every image.
            if(!item.alt.trim()&&!(item.id&&sameData(p,confirmedPosts.get(p.id))))error('Ergänze eine Beschreibung für jedes Bild oder Video.','INVALID_MEDIA');
            let entry;
            if(item.id){
              const m=snapshot.media.find(m=>m.id===item.id);
              if(!m||!MEDIA_PATH.test(item.url)||m.url!==item.url)error('Unbekanntes Cloud-Medium.','INVALID_MEDIA');
              if(item.alt!==m.altText||item.name!==m.filename||item.type!==m.mimeType)error('Metadaten eines gespeicherten Bilds dürfen nur als neue Kopie geändert werden.','MEDIA_METADATA_UNSUPPORTED');
              entry={id:m.id,identity:'id:'+m.id};
            }else{
              const file=decodeMedia(item);
              const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))).map(b=>b.toString(16).padStart(2,'0')).join('');
              const key=JSON.stringify([digest,item.alt,file.name,file.type]);
              const cached=uploadedImages.get(key);
              entry={file,key,alt:item.alt,id:cached?.id,identity:cached?'id:'+cached.id:'upload:'+key};
            }
            if(identities.has(entry.identity))error('Ein Bild darf nicht doppelt im Beitrag vorkommen.','INVALID_MEDIA');
            identities.add(entry.identity);prepared.push(entry);
          }
          preparedImages.set(p.id,prepared);
        }
        const posts=[];
        for(const p of ui.posts){
          if(p.status==='archived'){posts.push(structuredClone(snapshot.posts.find(old=>old.id===p.id)));continue;}
          const postZone=p.timeZone??selectedZone;new Intl.DateTimeFormat('de',{timeZone:postZone}).format();
          let scheduledAt=null;
          const previousTime=previousPost(p.id);
          if(p.scheduleBinding!==null){
            const binding=scheduling(()=>normalizeScheduleBinding(p.scheduleBinding));
            if(p.status!=='scheduled'||wallTime(binding.instant,postZone)!==p.scheduledAt||p.scheduledInstant!==binding.instant)error('Queue-Bindung und Termin stimmen nicht überein.','INVALID_BINDING');
            scheduledAt=binding.instant;
          }else if(p.scheduledInstant!==null){
            if(!previousTime||previousTime.scheduledAt!==p.scheduledInstant||previousTime.timezone!==postZone||wallTime(previousTime.scheduledAt,postZone)!==p.scheduledAt)error('Ein UTC-Zeitpunkt darf nur für einen unveränderten gespeicherten Termin wiederverwendet werden.','UNTRUSTED_SCHEDULE_INSTANT');
            scheduledAt=previousTime.scheduledAt;
          }else if(p.scheduledAt){
            scheduledAt=(await client.resolveTime(p.scheduledAt,postZone)).scheduledAt;
          }
          if(p.status==='scheduled'&&!scheduledAt)error('Geplante Beiträge brauchen einen Zeitpunkt.');
          if(expectedInstants!==null&&Object.hasOwn(expectedInstants,p.id)&&scheduledAt!==expectedInstants[p.id])error('Server und Importvorschau lösen den Termin unterschiedlich auf. Nichts importiert.','IMPORT_TIME_CHANGED');
          const mediaIds=[];
          for(const item of preparedImages.get(p.id)){
            let id=item.id;
            if(!id){let media=uploadedImages.get(item.key);if(!media){
              media=await client.uploadMedia(item.file,item.alt);
              // Upload success is not proof of the requested metadata. Never
              // cache an unverified receipt or use its ID in a planning write.
              if(!media||typeof media.id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(media.id)||media.url!==`/api/planner/media/${media.id}`||media.altText!==item.alt||media.filename!==item.file.name||media.mimeType!==item.file.type||snapshot.media.some(existing=>existing.id===media.id))error('Bild-Upload nicht eindeutig bestätigt. Bitte neu laden.','INVALID_RESPONSE');
              snapshot.media.push(media);uploadedImages.set(item.key,media);
            }id=media.id;}
            if(mediaIds.includes(id))error('Doppelte Bildreferenz in der Uploadantwort.','INVALID_MEDIA');
            mediaIds.push(id);
          }
          const previous=previousPost(p.id);
          posts.push({id:p.id,scheduleBinding:structuredClone(p.scheduleBinding),title:Object.hasOwn(p,'title')?p.title:(previous?.title??p.text.trim().split('\n')[0].slice(0,200)),body:p.text,stage:p.status==='scheduled'?'planned':p.status,tags:Object.hasOwn(p,'tags')?[...p.tags]:[...(previous?.tags??[])],cover:p.cover??null,scheduledAt,timezone:postZone,createdAt:previous?.createdAt??p.createdAt,variants:p.channels.map(channelId=>({id:previous?.variants.find(v=>v.channelId===channelId)?.id??crypto.randomUUID(),channelId,body:Object.hasOwn(p.variantTexts??{},channelId)?p.variantTexts[channelId]:p.text,inheritsBody:!Object.hasOwn(p.variantTexts??{},channelId),format:'post',status:p.status==='scheduled'?'planned':'draft',statusNote:previous?.variants.find(v=>v.channelId===channelId)?.statusNote??'',scheduledAt,timezone:postZone,mediaIds:Object.hasOwn(p,'channelMediaItems')?p.channelMediaItems[channelId].map(item=>item.id):[...mediaIds]}))});
        }
        // Do not merge/retry a conflict automatically: let the user reload safely.
        const deletedCandidates=await Promise.all(snapshot.posts.filter(old=>old.scheduleBinding&&!posts.some(post=>post.id===old.id)).map(async post=>({post:structuredClone(post),digest:await scheduleRestoreDigest(post)})));
        const intended=scheduling(()=>validateState({schemaVersion:DATA_SCHEMA_VERSION,revision:ui.revision,settings:{...snapshot.settings,timezone:selectedZone},channels:selectedChannels,posts}));
        // Resolve every row first, then check once immediately before the PUT.
        // No server-time guarantee is implied for unbound manual appointments.
        if(requireFuture){const now=Date.now();if(Object.values(expectedInstants).some(instant=>Date.parse(instant)<=now))error('Ein CSV-Termin ist inzwischen vergangen. Nichts importiert.','IMPORT_TIME_ELAPSED');}
        const intendedReceipt=splitReceipt({...intended,media:snapshot.media});
        let saved,replyReceived=false;try{
          saved=await client.save(intended);replyReceived=true;
          // A fulfilled transport is not a confirmed commit receipt. Validate its
          // projection before changing the private snapshot or consuming Undo.
          if(!saved||saved.revision!==ui.revision+1||!saved.settings||typeof saved.settings.timezone!=='string')error('Ungültige Serverantwort.','INVALID_RESPONSE');
          let matches=false;
          try{matches=sameData(splitReceipt({...validateState(saved),media:saved.media}),intendedReceipt);}catch{/* Malformed data cannot confirm a write. */}
          if(!matches)error('Die Speicherung wurde nicht eindeutig bestätigt. Bitte neu laden und Einträge prüfen.','INVALID_RESPONSE');
          toUI(saved);
          for(const post of posts){
            const actual=saved.posts.find(p=>p.id===post.id);
            if(!actual||post.variants.some(v=>!sameData(v.mediaIds,actual.variants.find(x=>x.channelId===v.channelId)?.mediaIds)))error('Bildreihenfolge nicht bestätigt. Bitte neu laden.','INVALID_RESPONSE');
            for(const id of new Set(post.variants.flatMap(v=>v.mediaIds))){const before=snapshot.media.find(m=>m.id===id),after=saved.media.find(m=>m.id===id);if(!before||!after||!sameData([before.id,before.url,before.altText,before.filename,before.mimeType],[after.id,after.url,after.altText,after.filename,after.mimeType]))error('Bildmetadaten nicht bestätigt. Bitte neu laden.','INVALID_RESPONSE');}
          }
        }catch(error){
          const unknown=replyReceived||!DEFINITIVE_SAVE_REJECTIONS.has(`${error?.status}:${error?.code}`);
          if(unknown&&ui.posts.some(p=>Object.hasOwn(p,'channelMediaItems')))splitNeedsReload=true;
          if(expectedInstants!==null&&unknown)importNeedsReload=true;
          if(deletedCandidates.length&&unknown&&!pendingDelete)pendingDelete={candidates:deletedCandidates.slice(0,100),expiresAt:Date.now()+60000};throw error;
        }
        pendingDelete=null;rememberDeleted(snapshot,saved);snapshot=saved;currentZone=saved.settings.timezone;onTimezone(currentZone);
        return toUI(saved);
      }finally{busy=false;}
    }
  };
}
