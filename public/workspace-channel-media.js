/** Explicit channel projections; no uploads, planner writes or browser persistence. */
import {normalizeMediaItems} from './workflows/media-items.mjs';
const fail=()=>{throw Error('Kanalbilder können nicht verlustfrei als Arbeitsfassung gesichert werden.');};
export function normalizeWorkspaceChannelRefs(value,channels,items){
 if(!value||![Object.prototype,null].includes(Object.getPrototypeOf(value))||!channels.length||Reflect.ownKeys(value).length!==channels.length)fail();
 const used=new Set(),out={};
 for(const channel of channels){
  const d=Object.getOwnPropertyDescriptor(value,channel);if(!d||!d.enumerable||!Object.hasOwn(d,'value'))fail();const refs=d.value;
  if(!Array.isArray(refs)||Object.getPrototypeOf(refs)!==Array.prototype||refs.length>10||Reflect.ownKeys(refs).length!==refs.length+1)fail();
  const list=[],seen=new Set();for(let i=0;i<refs.length;i++){const r=Object.getOwnPropertyDescriptor(refs,String(i));if(!r||!r.enumerable||!Object.hasOwn(r,'value')||!Number.isInteger(r.value)||r.value<0||r.value>=items.length||seen.has(r.value))fail();seen.add(r.value);used.add(r.value);list.push(r.value);}
  Object.defineProperty(out,channel,{value:list,enumerable:true,writable:true,configurable:true});
 }
 if(used.size!==items.length)fail();return out;
}
export function captureWorkspaceChannelMedia(map,channels){
 if(!map||![Object.prototype,null].includes(Object.getPrototypeOf(map))||!channels.length||new Set(channels).size!==channels.length||channels.length>20||Reflect.ownKeys(map).length!==channels.length)fail();
 const mediaItems=[],channelMediaRefs={},saved=new Map();
 for(const channel of channels){const d=Object.getOwnPropertyDescriptor(map,channel);if(!d||!d.enumerable||!Object.hasOwn(d,'value'))fail();
  const refs=normalizeMediaItems(d.value).map(item=>{
   if(!item.type.startsWith('image/'))fail();
   const slot={kind:item.id?'planner_image':'local_omitted',alt:item.alt,name:item.name,type:item.type,...(item.id?{id:item.id}:{})};
   if(item.id&&saved.has(item.id)){const index=saved.get(item.id);if(JSON.stringify(mediaItems[index])!==JSON.stringify(slot))fail();return index;}
   const index=mediaItems.length;mediaItems.push(slot);if(item.id)saved.set(item.id,index);return index;
  });Object.defineProperty(channelMediaRefs,channel,{value:refs,enumerable:true,writable:true,configurable:true});
 }
 normalizeWorkspaceChannelRefs(channelMediaRefs,channels,mediaItems);return {schemaVersion:4,mediaItems,channelMediaRefs};
}
export function projectWorkspaceChannelMedia(payload,mediaItems){
 const refs=normalizeWorkspaceChannelRefs(payload.channelMediaRefs,payload.channels,payload.mediaItems);
 if(mediaItems.length!==payload.mediaItems.length)fail();return Object.fromEntries(payload.channels.map(channel=>[channel,refs[channel].map(i=>({...mediaItems[i]}))]));
}
