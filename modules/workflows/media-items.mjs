/** UI-only media contract: one video OR up to ten images. Storage remains mediaIds. */
export function normalizeMediaItems(items){
  if(!Array.isArray(items)||items.length>10)throw Error('Eine ausdrückliche Bildliste mit höchstens 10 Bildern ist erforderlich.');
  if(items.some(item=>item?.type?.startsWith('video/'))&&items.length!==1)throw Error('Ein Video muss allein stehen; Videos und Bilder dürfen nicht gemischt werden.');
  const seen=new Set();
  return items.map(item=>{
    if(!item||typeof item!=='object'||Array.isArray(item)||typeof item.alt!=='string'||item.alt.length>2000||typeof item.name!=='string'||item.name.length>255||!['image/png','image/jpeg','image/webp','video/mp4','video/webm'].includes(item.type))throw Error('Ungültige Bildmetadaten.');
    const local=Object.hasOwn(item,'dataUrl'),fields=local?['dataUrl','alt','name','type']:['id','url','alt','name','type'];
    if(Object.keys(item).some(k=>!fields.includes(k))||fields.some(k=>!Object.hasOwn(item,k)))throw Error('Unvollständiges oder mehrdeutiges Bild.');
    if(local){if(typeof item.dataUrl!=='string'||!new RegExp('^data:'+item.type+';base64,[A-Za-z0-9+/]+={0,2}$').test(item.dataUrl))throw Error('Ungültige lokale Bilddaten.');}
    else if(typeof item.id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(item.id)||item.url!==`/api/planner/media/${item.id}`)throw Error('Ungültige gespeicherte Bildreferenz.');
    const identity=local?JSON.stringify([item.dataUrl,item.alt,item.name]):item.id;
    if(seen.has(identity))throw Error('Ein Bild darf nicht doppelt im Beitrag vorkommen.');seen.add(identity);
    return {...item};
  });
}

/** Full saved-image map; absence alone means the legacy common list. */
export function normalizeChannelMediaItems(value,channels,mediaItems){
  if(!value||typeof value!=='object'||Array.isArray(value)||!Array.isArray(channels)||!channels.length||new Set(channels).size!==channels.length||Object.keys(value).length!==channels.length||channels.some(id=>!Object.hasOwn(value,id)))throw Error('Vollständige Bildlisten für alle ausgewählten Kanäle sind erforderlich.');
  const result=Object.fromEntries(channels.map(id=>[id,normalizeMediaItems(value[id])]));
  for(const items of Object.values(result))if(items.some(item=>!item.id||!item.type.startsWith('image/')))throw Error('Kanalbilder unterstützen nur gespeicherte Bilder.');
  const identity=items=>JSON.stringify(items.map(item=>[item.id,item.url,item.alt,item.name,item.type]));
  if(identity(normalizeMediaItems(mediaItems))!==identity(result[channels[0]]))throw Error('Die primäre Bildliste stimmt nicht mit dem ersten Kanal überein.');
  return result;
}
export function effectiveMediaItems(post,channelId){
  if(Object.hasOwn(post,'channelMediaItems'))return normalizeChannelMediaItems(post.channelMediaItems,post.channels,post.mediaItems)[channelId]??[];
  return normalizeMediaItems(post.mediaItems);
}
/** Deduplicate identical references, while retaining conflicting metadata for validation. */
export function allReferencedMediaItems(post){
  const lists=Object.hasOwn(post,'channelMediaItems')?Object.values(normalizeChannelMediaItems(post.channelMediaItems,post.channels,post.mediaItems)):[normalizeMediaItems(post.mediaItems)];
  const seen=new Set();return lists.flat().filter(item=>{const key=JSON.stringify([item.id,item.url,item.dataUrl,item.alt,item.name,item.type]);if(seen.has(key))return false;seen.add(key);return true;});
}
