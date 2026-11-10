const TYPES=new Set(['image/jpeg','image/png','image/webp']);
const ID=/^[A-Za-z0-9_-]{1,100}$/;
const copy=media=>({id:media.id,url:media.url,alt:media.alt,name:media.name,type:media.type});
export const savedImageIdentity=media=>JSON.stringify([media.id,media.url,media.alt,media.name,media.type]);
export function isSavedImage(media){
 return !!media&&typeof media==='object'&&!Array.isArray(media)&&!Object.hasOwn(media,'dataUrl')&&typeof media.id==='string'&&ID.test(media.id)&&media.url===`/api/planner/media/${media.id}`&&TYPES.has(media.type)&&typeof media.alt==='string'&&media.alt.length<=2000&&typeof media.name==='string'&&media.name.length<=255;
}
/** Only images referenced by loaded posts, not an inventory of all retained storage. */
export function savedImageCatalog(state,{available=true}={}){
 if(!available)return {available:false,items:[],hasUnavailableImages:false};
 const entries=new Map(),blocked=new Set();let hasUnavailableImages=false;
 for(const post of state.posts){
  const media=post.media;if(!media)continue;
  if(!isSavedImage(media)||!media.alt.trim()){hasUnavailableImages=true;if(typeof media.id==='string'&&ID.test(media.id))blocked.add(media.id);continue;}
  const label=(typeof post.title==='string'&&post.title.trim()?post.title:typeof post.text==='string'?post.text.split('\n')[0]:'').slice(0,100)||'Beitrag ohne Text';
  const found=entries.get(media.id);
  if(found){if(savedImageIdentity(found.media)!==savedImageIdentity(media)){blocked.add(media.id);hasUnavailableImages=true;}else{found.usageCount++;if(!found.sourceTitles.includes(label))found.sourceTitles.push(label);}}
  else entries.set(media.id,{id:media.id,media:copy(media),sourceTitles:[label],usageCount:1});
 }
 return {available:true,items:[...entries.values()].filter(item=>!blocked.has(item.id)),hasUnavailableImages};
}
export function resolveSavedImage(state,selected,{available=true}={}){
 if(!available||!isSavedImage(selected))throw Error('Die gespeicherte Bildauswahl ist nicht mehr verfügbar. Öffne die Auswahl erneut.');
 const item=savedImageCatalog(state).items.find(item=>item.id===selected.id);
 if(!item||savedImageIdentity(item.media)!==savedImageIdentity(selected))throw Error('Dieses Bild wurde inzwischen geändert oder ist nicht mehr in der geladenen Planung. Öffne die Auswahl erneut.');
 return copy(item.media);
}
/** Bounded private image read. Cancel/timeout detach callbacks before any editor adoption. */
export function decodeSavedImage(media,{signal,ImageClass=Image,setTimer=setTimeout,clearTimer=clearTimeout}={}){
 if(!isSavedImage(media))return Promise.reject(Error('Ungültige gespeicherte Bildreferenz.'));
 return new Promise((resolve,reject)=>{
  const image=new ImageClass();let settled=false,timer=null;
  const abort=()=>finish(Error('Bildauswahl abgebrochen.'));
  const finish=error=>{if(settled)return;settled=true;if(timer!==null)clearTimer(timer);signal?.removeEventListener('abort',abort);image.onload=null;image.onerror=null;if(error){try{image.src='';}catch{}reject(error);}else resolve();};
  image.onload=()=>{const w=image.naturalWidth,h=image.naturalHeight;finish(!Number.isInteger(w)||!Number.isInteger(h)||w<=0||h<=0||w>16384||h>16384||w*h>40_000_000?Error('Dieses gespeicherte Bild ist zu groß oder kann nicht gelesen werden.'):null);};
  image.onerror=()=>finish(Error('Das gespeicherte Bild konnte nicht geladen werden. Die bisherige Auswahl bleibt erhalten.'));
  signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted){abort();return;}
  timer=setTimer(()=>finish(Error('Das gespeicherte Bild konnte nicht rechtzeitig geladen werden.')),15000);
  try{image.src=media.url;}catch{finish(Error('Das gespeicherte Bild konnte nicht geladen werden.'));}
 });
}
