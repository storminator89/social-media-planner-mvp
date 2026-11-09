import {effectiveText} from './variants.js';
// The URL carries only an opaque record reference, never draft text or account data.
export function handoffReference(id,revision){
 if(typeof id!=='string'||!id||id.length>100||!/^[A-Za-z0-9_-]+$/.test(id)||!Number.isSafeInteger(revision)||revision<0)throw Error('Ungültiger gespeicherter Stand.');
 return '#planner='+encodeURIComponent(id)+'&revision='+revision;
}
export function parseHandoff(hash){
 if(!hash)return null;
 const p=new URLSearchParams(hash.slice(1));
 if([...p.keys()].sort().join(',')!=='planner,revision'||!/^\d+$/.test(p.get('revision')||''))throw Error('Ungültige Übergabe. Bitte den gespeicherten Beitrag erneut im Planer öffnen.');
 const id=p.get('planner'),revision=Number(p.get('revision'));handoffReference(id,revision);return{id,revision};
}
export function savedMastodonText(state,reference){
 if(!state||state.revision!==reference.revision)throw Error('Der gespeicherte Planerstand hat sich geändert. Bitte den Beitrag im Planer erneut öffnen.');
 const p=state.posts?.find(p=>p.id===reference.id);
 if(!p||!['draft','scheduled'].includes(p.status)||!p.channels?.includes('mastodon'))throw Error('Kein gespeicherter Mastodon-Beitrag gefunden.');
 if(p.media||p.cover||(p.attachments!=null&&(!Array.isArray(p.attachments)||p.attachments.length>0)))throw Error('Dieser Beitrag enthält ein Bild oder weitere Anhänge. Der Versanddialog unterstützt nur Text; es wird nichts stillschweigend weggelassen.');
 const text=effectiveText(p,'mastodon');
 if(typeof text!=='string'||!text.trim()||Array.from(text).length>500)throw Error('Der gespeicherte Mastodon-Text muss 1 bis 500 Zeichen enthalten.');
 return text;
}
// A deadline also wins if the transport ignores AbortSignal.
export async function boundedPlannerRead(load,timeoutMs=8000){
 let timer;const abort=new AbortController();
 try{return await Promise.race([load(abort.signal),new Promise((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(Error('Planerstand nicht rechtzeitig verfügbar. Nichts übernommen.'));},timeoutMs);})]);}finally{clearTimeout(timer);abort.abort();}
}
