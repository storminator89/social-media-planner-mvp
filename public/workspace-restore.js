/** Pure restore decisions: resumption never writes the canonical planner. */
import {normalizeWorkspacePayload} from './workspace-client.js';
export function workspaceRestoreDecision(workspace,{posts,revision,allowedChannels,isTimeZone,dateAccepts,timeAccepts}){
 const p=normalizeWorkspacePayload(workspace.payload),reasons=[];
 if(p.channels.some(id=>!allowedChannels.includes(id))||Object.keys(p.variantTexts).some(id=>!allowedChannels.includes(id)||!p.channels.includes(id)))reasons.push('Diese Arbeitsfassung enthält hier nicht unterstützte Kanäle.');
 if(!isTimeZone(p.timeZone))reasons.push('Die gespeicherte Zeitzone kann in diesem Editor nicht verlustfrei übernommen werden.');
 if(!dateAccepts(p.date)||!timeAccepts(p.time))reasons.push('Unvollständige Datums- oder Zeitwerte passen noch nicht in die Datumsfelder dieses Editors.');
 const source=workspace.sourcePostId?posts.find(p=>p.id===workspace.sourcePostId):null;
 const sameSource=!!source&&Number.isSafeInteger(workspace.basePlannerRevision)&&Number.isSafeInteger(revision)&&workspace.basePlannerRevision===revision;
 return {supported:!reasons.length,reasons,sameSource,requiresCopy:!!workspace.sourcePostId&&!sameSource,source,mediaConflict:workspace.mediaMetadataConflict,missingLocalMedia:p.localMediaOmitted};
}
export function restoredWorkspacePayload(workspace,{useCanonicalAlt=false}={}){
 const p=normalizeWorkspacePayload(workspace.payload);
 if(workspace.mediaMetadataConflict&&!useCanonicalAlt)throw Error('Wähle zuerst bewusst den aktuellen Alternativtext des gespeicherten Bildes.');
 if(workspace.mediaMetadataConflict){if(p.attachments){p.attachments.forEach((m,i)=>{m.alt=workspace.resolvedAttachments[i].alt;});p.media=p.attachments[0]?{...p.attachments[0]}:null;}else p.media.alt=workspace.resolvedMedia.alt;}
 return p;
}
