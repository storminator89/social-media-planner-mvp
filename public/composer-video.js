import {validateStillSource} from './video-still-model.js';
import {inspectComposerOriginal,validateDecodedOriginal} from './composer-original-profile.js';
export const isVideoMedia=media=>['video/mp4','video/webm'].includes(media?.type);
/** Original file bytes only: no recording, transcoding, upload or provider action. */
export async function prepareComposerVideo(file,{current=()=>true,signal,document:doc=document,URL:urls=URL}={}){
 validateStillSource(file);
 if(signal?.aborted)return null;
 const bounded=(job,label)=>new Promise((resolve,reject)=>{let settled=false;const timer=setTimeout(()=>finish(Error(label)),15000);function finish(error,value){if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value);}Promise.resolve().then(job).then(value=>finish(null,value),finish);});
 const bytes=new Uint8Array(await bounded(()=>file.arrayBuffer(),'Video konnte nicht rechtzeitig gelesen werden.'));
 if(signal?.aborted||!current())return null;
 const info=inspectComposerOriginal(bytes,file.type);
 const video=doc.createElement('video'),url=urls.createObjectURL(new Blob([bytes],{type:file.type}));
 video.preload='auto';video.muted=true;video.playsInline=true;
 let cancel;
 try{
  await new Promise((resolve,reject)=>{let settled=false;const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);video.removeEventListener('loadeddata',loaded);video.removeEventListener('error',failed);signal?.removeEventListener('abort',cancel);error?reject(error):resolve();};const loaded=()=>{try{validateDecodedOriginal(video,info);finish();}catch(e){finish(e);}};const failed=()=>finish(Error('Dieses Video kann der Browser nicht wiedergeben.'));const timer=setTimeout(()=>finish(Error('Die Videovorschau hat nicht rechtzeitig geladen.')),15000);cancel=()=>finish(Error('Videoauswahl abgebrochen.'));signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted){cancel();return;}video.addEventListener('loadeddata',loaded);video.addEventListener('error',failed);video.src=url;video.load();});
  if(signal?.aborted||!current())return null;
  let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return {dataUrl:`data:${file.type};base64,${btoa(binary)}`,type:file.type,name:file.name,alt:''};
 }finally{cancel?.();try{video.pause();video.removeAttribute('src');video.load();}catch{}urls.revokeObjectURL(url);}
}
/** At most one local preview URL. Saved videos use private owner-scoped URLs. */
export function createVideoPreviewURLs(urls=URL){let data=null,url=null;return{
 source(media){if(!isVideoMedia(media)||!media.dataUrl)return null;if(data===media.dataUrl)return url;this.clear();const match=media.dataUrl.match(/^data:(video\/(?:mp4|webm));base64,([A-Za-z0-9+/]+={0,2})$/);if(!match||match[2].length>Math.ceil(8*1024*1024/3)*4)return null;const binary=atob(match[2]);if(binary.length>8*1024*1024)return null;const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));url=urls.createObjectURL(new Blob([bytes],{type:match[1]}));data=media.dataUrl;return url;},
 clear(){if(url)urls.revokeObjectURL(url);url=null;data=null;}
};}
