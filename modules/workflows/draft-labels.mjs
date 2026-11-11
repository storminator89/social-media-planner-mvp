/** Exact editorial-label changes only. All selected drafts participate or none do. */
import {WorkflowError} from './workflows.mjs';
const fail=(code,message)=>{throw new WorkflowError(code,message);};
export function prepareDraftLabels(snapshot,{postIds,add=[],remove=[]}={}){
 if(!Array.isArray(postIds)||!postIds.length||postIds.length>100||new Set(postIds).size!==postIds.length||postIds.some(id=>typeof id!=='string'))fail('LABELS_SELECTION_REQUIRED','Wähle eindeutige gespeicherte Entwürfe.');
 for(const values of [add,remove])if(!Array.isArray(values)||values.length>20||new Set(values).size!==values.length||values.some(v=>typeof v!=='string'||!v.trim()||v.length>60))fail('LABELS_INVALID','Labels brauchen 1 bis 60 Zeichen, höchstens 20 pro Beitrag.');
 if(!add.length&&!remove.length||add.some(v=>remove.includes(v)))fail('LABELS_INVALID','Wähle Labels zum Hinzufügen oder Entfernen.');
 const next=structuredClone(snapshot),entries=[];
 for(const postId of postIds){
  const post=next.posts.find(p=>p.id===postId);
  if(!post||post.stage!=='draft'||post.scheduledAt!==null||post.scheduleBinding!==null||post.variants.some(v=>v.status!=='draft'||v.scheduledAt!==null||v.publishedAt!==null||v.publishedUrl!==null))fail('LABELS_DRAFT_REQUIRED','Nur gespeicherte Entwürfe ohne Termin sind möglich.');
  const before=[...post.tags],after=before.filter(tag=>!remove.includes(tag));
  for(const tag of add)if(!after.includes(tag))after.push(tag);
  if(after.length>20)fail('LABELS_LIMIT','Ein ausgewählter Entwurf hätte mehr als 20 Labels.');
  post.tags=after;
  entries.push({postId,title:post.title,text:post.body,before,after,changed:JSON.stringify(before)!==JSON.stringify(after)});
 }
 if(!entries.some(e=>e.changed))fail('LABELS_NO_CHANGE','Die Auswahl würde keine Labels ändern.');
 return {next,entries};
}
