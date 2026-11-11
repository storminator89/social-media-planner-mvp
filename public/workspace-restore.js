/** Pure restore decisions: resumption never writes the canonical planner. */
import {normalizeWorkspacePayload} from './workspace-client.js';
export const workspaceHasOmissions=p=>!!p?.localMediaOmitted||!!p?.mediaItems?.some(m=>m.kind==='local_omitted');
export function workspaceRestoreDecision(workspace,{posts,revision,allowedChannels,isTimeZone,dateAccepts,timeAccepts}){
 const p=normalizeWorkspacePayload(workspace.payload),reasons=[];
 if(p.channels.some(id=>!allowedChannels.includes(id))||Object.keys(p.variantTexts).some(id=>!allowedChannels.includes(id)||!p.channels.includes(id)))reasons.push('Diese Arbeitsfassung enthält hier nicht unterstützte Kanäle.');
 if(!isTimeZone(p.timeZone))reasons.push('Die gespeicherte Zeitzone kann in diesem Editor nicht verlustfrei übernommen werden.');
 if(!dateAccepts(p.date)||!timeAccepts(p.time))reasons.push('Unvollständige Datums- oder Zeitwerte passen noch nicht in die Datumsfelder dieses Editors.');
 if(workspaceHasOmissions(p))reasons.push('Lokale Mediendateien fehlen. Die Bildreihenfolge und Beschreibungen sind nur als Daten gesichert. Eine vollständige Wiederaufnahme ist nicht möglich.');
 const source=workspace.sourcePostId?posts.find(p=>p.id===workspace.sourcePostId):null;
 const compatibleChannels=p.schemaVersion===4?JSON.stringify(source?.channels)===JSON.stringify(p.channels):!Object.hasOwn(source??{},'channelMediaItems');
 const sameSource=!!source&&compatibleChannels&&source.status!=='archived'&&source.stage!=='archived'&&Number.isSafeInteger(workspace.basePlannerRevision)&&Number.isSafeInteger(revision)&&workspace.basePlannerRevision===revision;
 return {supported:!reasons.length,reasons,sameSource,requiresCopy:!!workspace.sourcePostId&&!sameSource,source,mediaConflict:workspace.mediaMetadataConflict,missingLocalMedia:workspaceHasOmissions(p)};
}
export function restoredWorkspacePayload(workspace,{useCanonicalAlt=false}={}){
 const p=normalizeWorkspacePayload(workspace.payload);
 if(workspaceHasOmissions(p))throw Error('Lokale Mediendateien fehlen. Kopiere die Daten; eine unvollständige Wiederaufnahme ist gesperrt.');
 if(workspace.mediaMetadataConflict&&!useCanonicalAlt)throw Error('Prüfe und bestätige zuerst bewusst die aktuellen Mediendaten.');
 if(workspace.mediaMetadataConflict){if(p.schemaVersion>=2)p.mediaItems=p.mediaItems.map((m,i)=>{const r=workspace.resolvedMediaItems[i];return {kind:m.kind,id:m.id,alt:r.alt,name:r.name,type:r.type};});else p.media.alt=workspace.resolvedMedia.alt;}
 return p;
}
export function workspaceRestoreMedia(workspace,payload){
 if(workspaceHasOmissions(payload))throw Error('Lokale Mediendateien fehlen.');
 if(!(payload.schemaVersion>=2))return workspace.resolvedMedia?[{...workspace.resolvedMedia}]:[];
 if(!Array.isArray(workspace.resolvedMediaItems)||workspace.resolvedMediaItems.length!==payload.mediaItems.length)throw Error('Mediendaten unvollständig.');
 return payload.mediaItems.map((m,i)=>{const r=workspace.resolvedMediaItems[i];if(!r||!['planner_image','planner_video'].includes(m.kind)||m.id!==r.id||['alt','name','type'].some(k=>m[k]!==r[k]))throw Error('Mediendaten haben sich geändert.');return {...r};});
}
