import {normalizePostingSchedule,normalizeScheduleBinding,validatePostScheduleBinding,scheduleRestoreDigest} from '../workflows/posting-schedules.mjs';
import {createPlannerClient,PlannerClientError} from './client.mjs';
const DATA_SCHEMA_VERSION=3;
// Only known application rejections prove that this save did not commit.
// Transient/proxy statuses and unfamiliar responses retain a bounded candidate,
// never a retry or a restoration right without a matching private server proof.
const DEFINITIVE_SAVE_REJECTIONS=new Set(['409:REVISION_CONFLICT','409:STATE_SCHEMA_CHANGED','401:SIGN_IN_REQUIRED','403:CROSS_ORIGIN_REQUEST','400:INVALID_JSON','413:PAYLOAD_TOO_LARGE','415:JSON_REQUIRED']);
const MEDIA_PATH=/^\/api\/planner\/media\/[A-Za-z0-9_-]{1,100}$/;
function error(message,code='UI_SCHEMA_UNSUPPORTED',status=400){throw new PlannerClientError(message,status,code);}
function scheduling(fn){try{return fn();}catch(e){error(e.message,e.code??'INVALID_SCHEDULE');}}
function wallTime(iso,zone){if(!iso)return null;return new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(iso)).replace(' ','T');}
function decodeImage(media){
  const match=typeof media.dataUrl==='string'&&media.dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]*={0,2})$/);
  if(!match||match[2].length>Math.ceil(2*1024*1024/3)*4)error('Ungültiges Bild oder Bild größer als 2 MB.','INVALID_MEDIA');
  let binary;try{binary=atob(match[2]);}catch{error('Ungültige Bilddaten.','INVALID_MEDIA');}
  if(!binary.length||binary.length>2*1024*1024)error('Ungültige Bildgröße.','INVALID_MEDIA');
  if(media.type&&media.type!==match[1])error('Bildtyp stimmt nicht mit dem Dateiinhalt überein.','INVALID_MEDIA');
  const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));return new File([bytes],media.name||'Bild',{type:match[1]});
}
/** Optional bridge for the simple Takt UI. Its zone must be visible in the UI.
 * normalizeState must preserve media.id/url from this adapter, not require dataUrl.
 * Unsupported richer state is rejected rather than silently flattened on save.
 */
export function createTaktStore({client=createPlannerClient(),timezone,channels,onTimezone=()=>{}}){
  if(!timezone)error('Eine sichtbare IANA-Zeitzone ist erforderlich.','TIMEZONE_REQUIRED');
  new Intl.DateTimeFormat('de',{timeZone:timezone}).format();
  let snapshot=null;let currentZone=timezone;let busy=false;let pendingDelete=null;const uploadedImages=new Map();
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
      if(!['idea','draft','planned'].includes(p.stage))error('Der Planer enthält eine Phase, die diese Ansicht noch nicht unterstützt.');
      if(p.stage==='idea'&&(p.variants.length||p.scheduledAt))error('Diese Idee enthält bereits Kanalvarianten oder einen Termin. Sie wird nicht still vereinfacht.','IDEA_SCHEMA_UNSUPPORTED');
      let mediaId=null;const mediaChoices=new Set();const variantEntries=[];
      for(const v of p.variants){
        if(typeof v.inheritsBody!=='boolean')error('Bei einer Kanalvariante fehlt die explizite Vererbungseinstellung.');
        if((v.inheritsBody&&v.body!==p.body)||v.status!==(p.stage==='planned'?'planned':'draft')||v.format!=='post'||v.mediaIds.length>1||v.scheduledAt!==p.scheduledAt||v.timezone!==p.timezone)error('Dieser Beitrag nutzt eigene Kanaltermine, Medien, Formate oder Status. Diese Ansicht unterstützt nur eigene Kanaltexte.');
        if(!v.inheritsBody)variantEntries.push([v.channelId,v.body]);
        mediaChoices.add(v.mediaIds[0]??null);if(mediaChoices.size>1)error('Kanalvarianten nutzen unterschiedliche Medien.');
        mediaId=v.mediaIds[0]??null;
      }
      const media=mediaId?ms.get(mediaId):null;if(mediaId&&!media)error('Ein gespeichertes Medium fehlt.');
      if(!Object.hasOwn(p,'scheduleBinding'))error('Die Queue-Bindung fehlt.','STATE_SCHEMA_CHANGED');
      scheduling(()=>validatePostScheduleBinding(p));
      return{id:p.id,scheduleBinding:structuredClone(p.scheduleBinding),scheduledInstant:p.scheduledAt,title:p.title,tags:[...p.tags],text:p.body,variantTexts:Object.fromEntries(variantEntries),channels:p.variants.map(v=>v.channelId),status:p.stage==='planned'?'scheduled':p.stage,scheduledAt:wallTime(p.scheduledAt,p.timezone),timeZone:p.timezone,cover:p.cover??null,media:media?{id:media.id,url:media.url,alt:media.altText,name:media.filename,type:media.mimeType}:null,createdAt:p.createdAt,updatedAt:p.updatedAt};
    });
    // Add only the newly supported planning target to this UI projection.
    // No write until the ordinary revision-checked save; retain all existing metadata.
    const loadedChannels=state.channels.length?[...state.channels,...definitions.filter(c=>c.id==='mastodon'&&!state.channels.some(existing=>existing.id===c.id))]:definitions;
    const uiChannels=loadedChannels.map(c=>{if(!Object.hasOwn(c,'postingSchedule'))error('Posting-Zeiten fehlen.','STATE_SCHEMA_CHANGED');return{...structuredClone(c),postingSchedule:scheduling(()=>normalizePostingSchedule(c.postingSchedule))};});
    return{schemaVersion:2,revision:state.revision,channels:uiChannels,settings:{timezone:currentZone},posts};
  }
  return{
    get timezone(){return currentZone;},
    get plannerRevision(){return snapshot?.revision??null;},
    async load(){if(busy)error('Speicherung läuft noch.','BUSY');pruneDeleted();const loaded=await client.load();currentZone=loaded.revision===0?timezone:loaded.settings.timezone;const state=toUI(loaded);
      const restoreCandidates=await Promise.all([...deletedPosts.values()].filter(item=>item.post.scheduleBinding&&item.expiresAt>Date.now()).map(async item=>({post:item.post,digest:await scheduleRestoreDigest(item.post),expiresAt:item.expiresAt})));
      if(pendingDelete&&pendingDelete.expiresAt>Date.now())restoreCandidates.push(...pendingDelete.candidates.map(candidate=>({...candidate,expiresAt:pendingDelete.expiresAt})));
      deletedPosts.clear();
      for(const candidate of restoreCandidates){const proof=loaded.restoreProofs?.find(item=>item.postId===candidate.post.id&&item.payloadDigest===candidate.digest&&item.expiresAt*1000>Date.now());if(proof&&!loaded.posts.some(post=>post.id===candidate.post.id))deletedPosts.set(candidate.post.id,{post:structuredClone(candidate.post),expiresAt:Math.min(candidate.expiresAt,proof.expiresAt*1000)});}
      pendingDelete=null;snapshot=loaded;onTimezone(currentZone);return state;},
    async save(ui){
      if(busy)error('Speicherung läuft noch.','BUSY');if(!snapshot)error('Planer zuerst laden.','NOT_LOADED');busy=true;
      try{
        pruneDeleted();
        if(ui?.schemaVersion!==2||!Array.isArray(ui.posts)||!Array.isArray(ui.channels))error('Dieses Formular verwendet ein altes Planungsformat. Bitte neu laden.','UI_SCHEMA_UNSUPPORTED');
        if(ui.revision!==snapshot.revision)error('Die geladene Planungsrevision wurde verändert. Bitte neu laden.','REVISION_CONFLICT',409);
        const channelIds=new Set(definitions.map(c=>c.id));
        const selectedChannels=ui.channels.map(c=>{if(!c||!channelIds.has(c.id)||!Object.hasOwn(c,'postingSchedule'))error('Ein Kanal oder seine Posting-Zeiten fehlen.','INVALID_SCHEDULE');return{...structuredClone(c),postingSchedule:scheduling(()=>normalizePostingSchedule(c.postingSchedule))};});
        const ids=new Set();for(const p of ui.posts){if(!p||typeof p.id!=='string'||ids.has(p.id)||!['idea','draft','scheduled'].includes(p.status)||typeof p.text!=='string'||!Array.isArray(p.channels))error('Ungültiger Beitrag.');if(p.media&&!p.channels.length)error('Ein Bild braucht mindestens einen Zielkanal. Wähle zuerst einen Kanal.','MEDIA_TARGET_REQUIRED');
          if(Object.hasOwn(p,'title')&&typeof p.title!=='string')error('Der Titel muss Text sein.','INVALID_POST_METADATA');
          if(Object.hasOwn(p,'tags')&&(!Array.isArray(p.tags)||p.tags.some(tag=>typeof tag!=='string')))error('Tags müssen eine Liste von Texten sein.','INVALID_POST_METADATA');
          if(p.status==='idea'&&(p.channels.length||p.scheduledAt||p.media||Object.keys(p.variantTexts??{}).length))error('Eine Idee hat noch keine Kanäle, Medien, Kanaltexte oder Termine.','IDEA_FIELDS_UNSUPPORTED');
          if(p.status==='idea'&&(previousPost(p.id)&&previousPost(p.id).stage!=='idea'))error('Ein bestehender Beitrag kann in dieser Ansicht nicht zurück in eine Idee umgewandelt werden.','IDEA_TRANSITION_UNSUPPORTED');
          if(p.variantTexts!=null&&(typeof p.variantTexts!=='object'||Array.isArray(p.variantTexts)))error('Kanaltexte müssen eine Zuordnung von Kanal zu Text sein.','INVALID_VARIANT_TEXTS');
          if(p.variantTexts==null&&previousPost(p.id)?.variants.some(v=>!v.inheritsBody))error('Die eigenen Kanaltexte fehlen im gespeicherten Formular. Bitte neu laden oder die Vererbung ausdrücklich zurücksetzen.','VARIANT_TEXTS_REQUIRED');
          for(const [channelId,text] of Object.entries(p.variantTexts??{})){if(!p.channels.includes(channelId)||typeof text!=='string')error('Jeder eigene Kanaltext braucht einen ausgewählten Kanal und einen Text.','INVALID_VARIANT_TEXTS');}
          if(!Object.hasOwn(p,'scheduleBinding')||!Object.hasOwn(p,'scheduledInstant'))error('Terminbindung oder UTC-Projektion fehlt.','STATE_SCHEMA_CHANGED');
          scheduling(()=>normalizeScheduleBinding(p.scheduleBinding));
          if(p.status!=='scheduled'&&(p.scheduleBinding!==null||p.scheduledInstant!==null||p.scheduledAt))error('Entwürfe und Ideen dürfen keine verdeckte Terminbindung behalten.','INVALID_SCHEDULE');
          ids.add(p.id);}
        const selectedZone=ui.settings?.timezone??currentZone;new Intl.DateTimeFormat('de',{timeZone:selectedZone}).format();
        const posts=[];
        for(const p of ui.posts){
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
          let mediaId=null;
          if(p.media){
            if(p.media.id){const m=snapshot.media.find(m=>m.id===p.media.id);if(!m||!MEDIA_PATH.test(p.media.url)||m.url!==p.media.url)error('Unbekanntes Cloud-Medium.','INVALID_MEDIA');if(p.media.alt!==m.altText)error('Alternativtext eines gespeicherten Bilds kann in dieser Ansicht noch nicht geändert werden. Bitte das Bild neu wählen.','MEDIA_METADATA_UNSUPPORTED');mediaId=m.id;}
            else {const file=decodeImage(p.media);const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))).map(b=>b.toString(16).padStart(2,'0')).join('');const key=JSON.stringify([digest,p.media.alt??'',file.name]);let media=uploadedImages.get(key);if(!media){media=await client.uploadMedia(file,String(p.media.alt??''));snapshot.media.push(media);uploadedImages.set(key,media);}mediaId=media.id;}
          }
          const previous=previousPost(p.id);
          posts.push({id:p.id,scheduleBinding:structuredClone(p.scheduleBinding),title:Object.hasOwn(p,'title')?p.title:(previous?.title??p.text.trim().split('\n')[0].slice(0,200)),body:p.text,stage:p.status==='scheduled'?'planned':p.status,tags:Object.hasOwn(p,'tags')?[...p.tags]:[...(previous?.tags??[])],cover:p.cover??null,scheduledAt,timezone:postZone,createdAt:previous?.createdAt??p.createdAt,variants:p.channels.map(channelId=>({id:previous?.variants.find(v=>v.channelId===channelId)?.id??crypto.randomUUID(),channelId,body:Object.hasOwn(p.variantTexts??{},channelId)?p.variantTexts[channelId]:p.text,inheritsBody:!Object.hasOwn(p.variantTexts??{},channelId),format:'post',status:p.status==='scheduled'?'planned':'draft',statusNote:previous?.variants.find(v=>v.channelId===channelId)?.statusNote??'',scheduledAt,timezone:postZone,mediaIds:mediaId?[mediaId]:[]}))});
        }
        // Do not merge/retry a conflict automatically: let the user reload safely.
        const deletedCandidates=await Promise.all(snapshot.posts.filter(old=>old.scheduleBinding&&!posts.some(post=>post.id===old.id)).map(async post=>({post:structuredClone(post),digest:await scheduleRestoreDigest(post)})));
        let saved,replyReceived=false;try{
          saved=await client.save({schemaVersion:DATA_SCHEMA_VERSION,revision:ui.revision,settings:{...snapshot.settings,timezone:selectedZone},channels:selectedChannels,posts});replyReceived=true;
          // A fulfilled transport is not a confirmed commit receipt. Validate its
          // projection before changing the private snapshot or consuming Undo.
          if(!saved||saved.revision!==ui.revision+1||!saved.settings||typeof saved.settings.timezone!=='string')error('Ungültige Serverantwort.','INVALID_RESPONSE');
          toUI(saved);
        }catch(error){
          const unknown=replyReceived||!DEFINITIVE_SAVE_REJECTIONS.has(`${error?.status}:${error?.code}`);
          if(deletedCandidates.length&&unknown&&!pendingDelete)pendingDelete={candidates:deletedCandidates.slice(0,100),expiresAt:Date.now()+60000};throw error;
        }
        pendingDelete=null;rememberDeleted(snapshot,saved);snapshot=saved;currentZone=saved.settings.timezone;onTimezone(currentZone);
        return toUI(saved);
      }finally{busy=false;}
    }
  };
}
