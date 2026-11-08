/** Ordered editor attachments. Existing single-media posts remain readable. */
export const ATTACHMENT_LIMIT=10;
export function editorAttachments(post){return structuredClone(post?.attachments??(post?.media?[post.media]:[]));}
export function updateAttachment(items,media,target=null){
 const duplicate=items.some(item=>item!==target&&((media.id&&item.id===media.id)||(media.dataUrl&&item.dataUrl===media.dataUrl)));
 if(duplicate){const error=Error('Diese Datei ist bereits angehängt. Entferne den vorhandenen Anhang, bevor du sie erneut hinzufügst.');error.code='DUPLICATE_ATTACHMENT';throw error;}
 const next=[...items];
 if(target!==null){const index=next.indexOf(target);if(index<0)throw Error('Der bearbeitete Anhang wurde inzwischen entfernt.');next[index]=media;}
 else {if(next.length>=ATTACHMENT_LIMIT)throw Error('Ein Beitrag kann höchstens 10 Anhänge enthalten.');next.push(media);}
 return next;
}
export function moveAttachment(items,index,direction){const next=[...items],to=index+direction;if(!Number.isInteger(index)||![-1,1].includes(direction)||index<0||index>=next.length||to<0||to>=next.length)return next;[next[index],next[to]]=[next[to],next[index]];return next;}
export function workspaceAttachments(items){const owned=items.filter(m=>typeof m.id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(m.id)&&m.url===`/api/planner/media/${m.id}`&&!m.dataUrl).map(m=>({kind:m.type?.startsWith('video/')?'planner_video':'planner_image',id:m.id,alt:m.alt||''}));return {attachments:owned,media:owned[0]??null,localMediaOmitted:owned.length!==items.length};}
