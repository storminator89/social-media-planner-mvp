import {createPlannerClient,PlannerClientError} from './client.mjs';
const DATA_SCHEMA_VERSION=2;
const MEDIA_PATH=/^\/api\/planner\/media\/[A-Za-z0-9_-]{1,100}$/;
function error(message,code='UI_SCHEMA_UNSUPPORTED'){throw new PlannerClientError(message,400,code);}
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
  let snapshot=null;let currentZone=timezone;let busy=false;const uploadedImages=new Map();
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
  const definitions=channels.map(c=>({id:c.id,platform:c.platform??c.id,name:c.name,handle:c.handle??'',color:c.color??'#64748b',enabled:true,connectionStatus:'manual'}));
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
      return{id:p.id,title:p.title,tags:[...p.tags],text:p.body,variantTexts:Object.fromEntries(variantEntries),channels:p.variants.map(v=>v.channelId),status:p.stage==='planned'?'scheduled':p.stage,scheduledAt:wallTime(p.scheduledAt,p.timezone),timeZone:p.timezone,cover:p.cover??null,media:media?{id:media.id,url:media.url,alt:media.altText,name:media.filename,type:media.mimeType}:null,createdAt:p.createdAt,updatedAt:p.updatedAt};
    });return{schemaVersion:1,settings:{timezone:currentZone},posts};
  }
  return{
    get timezone(){return currentZone;},
    get plannerRevision(){return snapshot?.revision??null;},
    async load(){if(busy)error('Speicherung läuft noch.','BUSY');pruneDeleted();const loaded=await client.load();currentZone=loaded.revision===0?timezone:loaded.settings.timezone;const state=toUI(loaded);deletedPosts.clear();snapshot=loaded;onTimezone(currentZone);return state;},
    async save(ui){
      if(busy)error('Speicherung läuft noch.','BUSY');if(!snapshot)error('Planer zuerst laden.','NOT_LOADED');busy=true;
      try{
        pruneDeleted();
        if(ui?.schemaVersion!==1||!Array.isArray(ui.posts))error('Ungültiger UI-Snapshot.');
        const ids=new Set();for(const p of ui.posts){if(!p||typeof p.id!=='string'||ids.has(p.id)||!['idea','draft','scheduled'].includes(p.status)||typeof p.text!=='string'||!Array.isArray(p.channels))error('Ungültiger Beitrag.');if(p.media&&!p.channels.length)error('Ein Bild braucht mindestens einen Zielkanal. Wähle zuerst einen Kanal.','MEDIA_TARGET_REQUIRED');
          if(Object.hasOwn(p,'title')&&typeof p.title!=='string')error('Der Titel muss Text sein.','INVALID_POST_METADATA');
          if(Object.hasOwn(p,'tags')&&(!Array.isArray(p.tags)||p.tags.some(tag=>typeof tag!=='string')))error('Tags müssen eine Liste von Texten sein.','INVALID_POST_METADATA');
          if(p.status==='idea'&&(p.channels.length||p.scheduledAt||p.media||Object.keys(p.variantTexts??{}).length))error('Eine Idee hat noch keine Kanäle, Medien, Kanaltexte oder Termine.','IDEA_FIELDS_UNSUPPORTED');
          if(p.status==='idea'&&(previousPost(p.id)&&previousPost(p.id).stage!=='idea'))error('Ein bestehender Beitrag kann in dieser Ansicht nicht zurück in eine Idee umgewandelt werden.','IDEA_TRANSITION_UNSUPPORTED');
          if(p.variantTexts!=null&&(typeof p.variantTexts!=='object'||Array.isArray(p.variantTexts)))error('Kanaltexte müssen eine Zuordnung von Kanal zu Text sein.','INVALID_VARIANT_TEXTS');
          if(p.variantTexts==null&&previousPost(p.id)?.variants.some(v=>!v.inheritsBody))error('Die eigenen Kanaltexte fehlen im gespeicherten Formular. Bitte neu laden oder die Vererbung ausdrücklich zurücksetzen.','VARIANT_TEXTS_REQUIRED');
          for(const [channelId,text] of Object.entries(p.variantTexts??{})){if(!p.channels.includes(channelId)||typeof text!=='string')error('Jeder eigene Kanaltext braucht einen ausgewählten Kanal und einen Text.','INVALID_VARIANT_TEXTS');}
          ids.add(p.id);}
        const selectedZone=ui.settings?.timezone??currentZone;new Intl.DateTimeFormat('de',{timeZone:selectedZone}).format();
        const posts=[];
        for(const p of ui.posts){
          const postZone=p.timeZone??selectedZone;new Intl.DateTimeFormat('de',{timeZone:postZone}).format();
          let scheduledAt=null;
          if(p.scheduledAt){
            const previous=previousPost(p.id);
            // Preserve the exact instant for unchanged wall time, including a DST fold.
            scheduledAt=previous&&previous.timezone===postZone&&wallTime(previous.scheduledAt,postZone)===p.scheduledAt?previous.scheduledAt:(await client.resolveTime(p.scheduledAt,postZone)).scheduledAt;
          }
          if(p.status==='scheduled'&&!scheduledAt)error('Geplante Beiträge brauchen einen Zeitpunkt.');
          let mediaId=null;
          if(p.media){
            if(p.media.id){const m=snapshot.media.find(m=>m.id===p.media.id);if(!m||!MEDIA_PATH.test(p.media.url)||m.url!==p.media.url)error('Unbekanntes Cloud-Medium.','INVALID_MEDIA');if(p.media.alt!==m.altText)error('Alternativtext eines gespeicherten Bilds kann in dieser Ansicht noch nicht geändert werden. Bitte das Bild neu wählen.','MEDIA_METADATA_UNSUPPORTED');mediaId=m.id;}
            else {const file=decodeImage(p.media);const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))).map(b=>b.toString(16).padStart(2,'0')).join('');const key=JSON.stringify([digest,p.media.alt??'',file.name]);let media=uploadedImages.get(key);if(!media){media=await client.uploadMedia(file,String(p.media.alt??''));snapshot.media.push(media);uploadedImages.set(key,media);}mediaId=media.id;}
          }
          const previous=previousPost(p.id);
          posts.push({id:p.id,title:Object.hasOwn(p,'title')?p.title:(previous?.title??p.text.trim().split('\n')[0].slice(0,200)),body:p.text,stage:p.status==='scheduled'?'planned':p.status,tags:Object.hasOwn(p,'tags')?[...p.tags]:[...(previous?.tags??[])],cover:p.cover??null,scheduledAt,timezone:postZone,createdAt:previous?.createdAt??p.createdAt,variants:p.channels.map(channelId=>({id:previous?.variants.find(v=>v.channelId===channelId)?.id??crypto.randomUUID(),channelId,body:Object.hasOwn(p.variantTexts??{},channelId)?p.variantTexts[channelId]:p.text,inheritsBody:!Object.hasOwn(p.variantTexts??{},channelId),format:'post',status:p.status==='scheduled'?'planned':'draft',statusNote:previous?.variants.find(v=>v.channelId===channelId)?.statusNote??'',scheduledAt,timezone:postZone,mediaIds:mediaId?[mediaId]:[]}))});
        }
        // Do not merge/retry a conflict automatically: let the user reload safely.
        const saved=await client.save({schemaVersion:DATA_SCHEMA_VERSION,revision:snapshot.revision,settings:{...snapshot.settings,timezone:selectedZone},channels:snapshot.channels.length?snapshot.channels:definitions,posts});rememberDeleted(snapshot,saved);snapshot=saved;currentZone=saved.settings.timezone;onTimezone(currentZone);
        return toUI(saved);
      }finally{busy=false;}
    }
  };
}
