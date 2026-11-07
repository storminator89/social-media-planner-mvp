import {createPlannerClient,PlannerClientError} from './client.mjs';
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
  const definitions=channels.map(c=>({id:c.id,platform:c.platform??c.id,name:c.name,handle:c.handle??'',color:c.color??'#64748b',enabled:true,connectionStatus:'manual'}));
  function toUI(state){
    const channelIds=new Set(definitions.map(c=>c.id));const ms=new Map(state.media.map(m=>[m.id,m]));
    for(const c of state.channels)if(!channelIds.has(c.id))error('Der Planer enthält einen Kanal, den diese einfache Ansicht noch nicht unterstützt.');
    const posts=state.posts.map(p=>{
      if(!['draft','planned'].includes(p.stage)||p.tags.length)error('Der Planer enthält zusätzliche Phasen oder Tags, die diese einfache Ansicht noch nicht unterstützt.');
      let mediaId=null;const mediaChoices=new Set();
      for(const v of p.variants){
        if(v.body!==p.body||v.status!==(p.stage==='planned'?'planned':'draft')||v.format!=='post'||v.mediaIds.length>1||v.scheduledAt!==p.scheduledAt||v.timezone!==p.timezone)error('Dieser Beitrag hat eigene Kanalvarianten. Bitte in einer Varianten-fähigen Ansicht bearbeiten.');
        mediaChoices.add(v.mediaIds[0]??null);if(mediaChoices.size>1)error('Kanalvarianten nutzen unterschiedliche Medien.');
        mediaId=v.mediaIds[0]??null;
      }
      const media=mediaId?ms.get(mediaId):null;if(mediaId&&!media)error('Ein gespeichertes Medium fehlt.');
      return{id:p.id,text:p.body,channels:p.variants.map(v=>v.channelId),status:p.stage==='planned'?'scheduled':'draft',scheduledAt:wallTime(p.scheduledAt,p.timezone),timeZone:p.timezone,cover:p.cover??null,media:media?{id:media.id,url:media.url,alt:media.altText,name:media.filename,type:media.mimeType}:null,createdAt:p.createdAt,updatedAt:p.updatedAt};
    });return{schemaVersion:1,settings:{timezone:currentZone},posts};
  }
  return{
    get timezone(){return currentZone;},
    async load(){if(busy)error('Speicherung läuft noch.','BUSY');const loaded=await client.load();currentZone=loaded.revision===0?timezone:loaded.settings.timezone;const state=toUI(loaded);snapshot=loaded;onTimezone(currentZone);return state;},
    async save(ui){
      if(busy)error('Speicherung läuft noch.','BUSY');if(!snapshot)error('Planer zuerst laden.','NOT_LOADED');busy=true;
      try{
        if(ui?.schemaVersion!==1||!Array.isArray(ui.posts))error('Ungültiger UI-Snapshot.');
        const ids=new Set();for(const p of ui.posts){if(!p||typeof p.id!=='string'||ids.has(p.id)||!['draft','scheduled'].includes(p.status)||typeof p.text!=='string'||!Array.isArray(p.channels))error('Ungültiger Beitrag.');if(p.media&&!p.channels.length)error('Ein Bild braucht mindestens einen Zielkanal. Wähle zuerst einen Kanal.','MEDIA_TARGET_REQUIRED');ids.add(p.id);}
        const selectedZone=ui.settings?.timezone??currentZone;new Intl.DateTimeFormat('de',{timeZone:selectedZone}).format();
        const posts=[];
        for(const p of ui.posts){
          const postZone=p.timeZone??selectedZone;new Intl.DateTimeFormat('de',{timeZone:postZone}).format();
          let scheduledAt=null;
          if(p.scheduledAt){
            const previous=snapshot.posts.find(old=>old.id===p.id);
            // Preserve the exact instant for unchanged wall time, including a DST fold.
            scheduledAt=previous&&previous.timezone===postZone&&wallTime(previous.scheduledAt,postZone)===p.scheduledAt?previous.scheduledAt:(await client.resolveTime(p.scheduledAt,postZone)).scheduledAt;
          }
          if(p.status==='scheduled'&&!scheduledAt)error('Geplante Beiträge brauchen einen Zeitpunkt.');
          let mediaId=null;
          if(p.media){
            if(p.media.id){const m=snapshot.media.find(m=>m.id===p.media.id);if(!m||!MEDIA_PATH.test(p.media.url)||m.url!==p.media.url)error('Unbekanntes Cloud-Medium.','INVALID_MEDIA');if(p.media.alt!==m.altText)error('Alternativtext eines gespeicherten Bilds kann in dieser Ansicht noch nicht geändert werden. Bitte das Bild neu wählen.','MEDIA_METADATA_UNSUPPORTED');mediaId=m.id;}
            else {const file=decodeImage(p.media);const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))).map(b=>b.toString(16).padStart(2,'0')).join('');const key=JSON.stringify([digest,p.media.alt??'',file.name]);let media=uploadedImages.get(key);if(!media){media=await client.uploadMedia(file,String(p.media.alt??''));snapshot.media.push(media);uploadedImages.set(key,media);}mediaId=media.id;}
          }
          const previous=snapshot.posts.find(old=>old.id===p.id);
          // The simple UI does not expose title or per-channel status notes.
          // Preserve those fields verbatim rather than rewriting hidden metadata.
          posts.push({id:p.id,title:previous?.title??p.text.trim().split('\n')[0].slice(0,200),body:p.text,stage:p.status==='scheduled'?'planned':'draft',tags:[],cover:p.cover??null,scheduledAt,timezone:postZone,createdAt:previous?.createdAt??p.createdAt,variants:p.channels.map(channelId=>({id:previous?.variants.find(v=>v.channelId===channelId)?.id??crypto.randomUUID(),channelId,body:p.text,format:'post',status:p.status==='scheduled'?'planned':'draft',statusNote:previous?.variants.find(v=>v.channelId===channelId)?.statusNote??'',scheduledAt,timezone:postZone,mediaIds:mediaId?[mediaId]:[]}))});
        }
        // Do not merge/retry a conflict automatically: let the user reload safely.
        const saved=await client.save({revision:snapshot.revision,settings:{...snapshot.settings,timezone:selectedZone},channels:snapshot.channels.length?snapshot.channels:definitions,posts});snapshot=saved;currentZone=saved.settings.timezone;onTimezone(currentZone);
        return toUI(saved);
      }finally{busy=false;}
    }
  };
}
