/** Literal, case-sensitive replacement of saved draft bodies only. */
import {WorkflowError} from './workflows.mjs';
const fail=(code,message)=>{throw new WorkflowError(code,message);};
export function prepareDraftReplace(snapshot,{postIds,find,replace='',scope='base'}={}){
 if(!Array.isArray(postIds)||!postIds.length||postIds.length>50||new Set(postIds).size!==postIds.length||postIds.some(id=>typeof id!=='string'||!id))fail('REPLACE_SELECTION_REQUIRED','Wähle 1 bis 50 eindeutige gespeicherte Entwürfe.');
 if(typeof find!=='string'||!find.length||find.length>20000||typeof replace!=='string'||replace.length>20000||!['base','all'].includes(scope))fail('REPLACE_INVALID','Suchtext und Bereich prüfen. Höchstens 20.000 Zeichen.');
 if(new TextEncoder().encode(JSON.stringify(snapshot)).byteLength>1024*1024)fail('REPLACE_LIMIT','Die Planung überschreitet die Speichergrenze.');
 const next=structuredClone(snapshot),entries=[];
 const transform=(before,enabled=true)=>{
  if(typeof before!=='string'||before.length>20000)fail('REPLACE_LIMIT','Ein Text überschreitet 20.000 Zeichen.');
  const parts=enabled?before.split(find):[before],count=parts.length-1;
  // Bound output before joining: replacement tokens such as $& are literal.
  if(before.length+count*(replace.length-find.length)>20000)fail('REPLACE_LIMIT','Ein Ergebnis überschreitet 20.000 Zeichen.');
  return {before,after:parts.join(replace),count};
 };
 for(const postId of postIds){
  const post=next.posts.find(p=>p.id===postId);
  if(!post||post.stage!=='draft'||post.scheduledAt!==null||post.scheduleBinding!==null||!Array.isArray(post.variants)||post.variants.some(v=>v.status!=='draft'||v.scheduledAt!==null||v.publishedAt!==null||v.publishedUrl!==null||typeof v.inheritsBody!=='boolean'||(v.inheritsBody&&v.body!==post.body)))fail('REPLACE_DRAFT_REQUIRED','Nur gespeicherte Entwürfe ohne Termin sind möglich.');
  const base=transform(post.body),fields=[{channelId:null,...base,inherited:false}];
  post.body=base.after;
  for(const variant of post.variants){
   const change=variant.inheritsBody?{...base}:transform(variant.body,scope==='all');
   fields.push({channelId:variant.channelId,...change,inherited:variant.inheritsBody});variant.body=change.after;
  }
  entries.push({postId,title:post.title,fields,count:fields.filter(f=>!f.inherited).reduce((n,f)=>n+f.count,0),changed:fields.some(f=>f.before!==f.after)});
 }
 if(!entries.some(e=>e.changed))fail('REPLACE_NO_CHANGE','Die Auswahl würde keinen Text ändern.');
 if(new TextEncoder().encode(JSON.stringify(next)).byteLength>1024*1024)fail('REPLACE_LIMIT','Die Auswahl überschreitet die Speichergrenze.');
 return {next,entries};
}
