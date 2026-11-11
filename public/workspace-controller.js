/** One visible editor, explicit recovery after uncertain writes. Never writes planner posts. */
import {createWorkspaceClient,normalizeWorkspacePayload,workspacePayloadEqual,workspaceReceiptMatches,closedDiscardMatches} from './workspace-client.js';
import {workspaceHasOmissions} from './workspace-restore.js';
const copy=v=>v===null?null:structuredClone(v);
const unsupportedChannelMedia=p=>!!p&&Object.hasOwn(p,'channelMediaItems');
const channelMediaWarning='Kanalmedien nicht automatisch gesichert. Beitrag speichern oder Eingabe kopieren.';
export function createWorkspaceController({client=createWorkspaceClient(),onChange=()=>{},uuid=()=>crypto.randomUUID(),delay=900,setTimer=setTimeout,clearTimer=clearTimeout}={}){
 let state={open:false,activeEditor:false,localOnly:false,valid:true,phase:'idle',workspace:null,sourcePostId:null,basePlannerRevision:null,payload:null,confirmedPayload:null,message:'',remote:null,dirty:false},timer=null,request=null,generation=0,pending=null,disposed=false;
 const emit=()=>{if(!disposed)onChange(snapshot());};
 const snapshot=()=>({...copy(state),pendingWrite:!!pending,canWrite:state.open&&state.activeEditor&&!request&&!pending&&['dirty','saved','paused'].includes(state.phase),canReconcile:!!pending&&!request});
 const clear=()=>{if(timer!==null)clearTimer(timer);timer=null;};
 function abort(){clear();generation++;request?.abort();request=null;}
 function start(){request=new AbortController();return {generation,signal:request.signal};}
 const current=r=>!disposed&&r.generation===generation&&!r.signal.aborted;
 function setPhase(phase,message){state={...state,phase,message};emit();}
 function schedule(){clear();if(!state.open||!state.activeEditor||request||pending||state.phase!=='dirty')return;timer=setTimer(()=>{timer=null;void save();},delay);}
 function unsupported(payload){
  abort();state.payload=copy(payload);state.valid=false;state.localOnly=true;state.unsupportedMedia=true;state.dirty=true;
  setPhase(pending?'uncertain':'local_only',pending?channelMediaWarning+' Eine frühere Sicherung ist noch unklar.':channelMediaWarning);
 }
 function open({sourcePostId=null,basePlannerRevision=null,payload},workspace=null){
  if(disposed)return false;
  if(unsupportedChannelMedia(payload)){if(!pending)state={open:true,activeEditor:true,workspace:workspace?copy(workspace):null,workspaceId:workspace?.workspaceId||uuid(),sourcePostId,basePlannerRevision,confirmedPayload:null,remote:null};else state={...state,open:true,activeEditor:true};unsupported(payload);return false;}
  if(pending){abort();state={...state,open:true,activeEditor:false,phase:'uncertain',message:'Eine frühere Sicherung ist noch unklar. Prüfe zuerst genau diese Arbeitsfassung. Dieser Editor wird bisher nicht automatisch gesichert.'};emit();return false;}
  abort();let p;try{p=normalizeWorkspacePayload(payload);}catch{state={open:true,activeEditor:true,localOnly:false,valid:false,phase:'invalid',workspace:null,workspaceId:uuid(),sourcePostId,basePlannerRevision,payload:null,confirmedPayload:null,message:'Die vorhandenen Eingaben passen nicht in das sichere Arbeitsfassungsformat. Sie bleiben im Editor; bisher wurde nichts gesichert.',remote:null,dirty:true};emit();return false;}
  state={open:true,activeEditor:true,localOnly:false,valid:true,phase:'saved',workspace:workspace?copy(workspace):null,workspaceId:workspace?.workspaceId||uuid(),sourcePostId,basePlannerRevision,payload:p,confirmedPayload:copy(p),message:workspace?'Arbeitsfassung bewusst wiederaufgenommen. Der Beitrag wurde nicht verändert.':'Änderungen werden als separate Arbeitsfassung gesichert. Der Beitrag bleibt bis zum Speichern unverändert.',remote:null,dirty:false};emit();return true;
 }
 // Once this workspace has used v3, never downgrade its protocol after video removal.
 const normalizeChangedPayload=payload=>{const p=normalizeWorkspacePayload(payload);if(p.schemaVersion!==4&&[state.payload,state.confirmedPayload,state.workspace?.payload].some(v=>v?.schemaVersion===4))throw Error('Kanalzuordnung fehlt.');if(p.schemaVersion===2&&[state.payload,state.confirmedPayload,state.workspace?.payload].some(v=>v?.schemaVersion===3))p.schemaVersion=3;return p;};
 function changed(payload){
  if(!state.open||!state.activeEditor||disposed)return;
  if(unsupportedChannelMedia(payload)||state.unsupportedMedia){unsupported(payload);return;}
  let p;try{p=normalizeChangedPayload(payload);}catch{clear();state.valid=false;state.dirty=true;setPhase('invalid','Diese Eingabe kann noch nicht als Arbeitsfassung gesichert werden. Deine lokale Eingabe bleibt erhalten.');return;}
  state.valid=true;state.payload=p;state.dirty=!workspacePayloadEqual(p,state.confirmedPayload);
  if(pending||['conflict','uncertain','closed','paused','error'].includes(state.phase)){emit();return;}
  if(request){emit();return;}
  setPhase(state.dirty?'dirty':'saved',state.dirty?'Änderungen noch nicht gesichert.':state.workspace?'Arbeitsfassung gesichert. Der Beitrag wurde dadurch nicht gespeichert.':'Noch keine neue Arbeitsfassung nötig.');schedule();
 }
 async function save(){
  clear();if(!state.open||!state.activeEditor||disposed||request||pending||!state.dirty||!state.valid||!['dirty','paused'].includes(state.phase))return;
  const mutation={workspaceId:state.workspaceId,expectedRevision:state.workspace?.revision||0,writeId:uuid(),sourcePostId:state.sourcePostId,basePlannerRevision:state.basePlannerRevision,payload:copy(state.payload)};
  pending={kind:'save',mutation};const r=start();setPhase('saving','Arbeitsfassung wird separat gesichert …');
  try{const receipt=await client.save(mutation,{signal:r.signal});if(!current(r))return;if(!workspaceReceiptMatches(receipt,mutation))throw Error();pending=null;state.workspace=receipt;state.confirmedPayload=copy(mutation.payload);state.dirty=!state.valid||!workspacePayloadEqual(state.payload,mutation.payload);request=null;setPhase(!state.valid?'invalid':state.dirty?'dirty':'saved',!state.valid?'Nur die frühere gültige Fassung ist gesichert. Deine aktuelle Eingabe konnte noch nicht gesichert werden.':state.dirty?'Der gesendete Stand ist gesichert. Neuere Eingaben werden als Nächstes gesichert.':'Arbeitsfassung gesichert. Kein Beitrag und keine Veröffentlichung wurde ausgelöst.');schedule();}
  catch(e){if(!current(r))return;request=null;if(e.status===409){pending=null;setPhase('conflict','Eine andere Fassung oder eine Speichergrenze verhindert diese Sicherung. Deine Eingabe bleibt hier. Keine automatische Wiederholung oder Überschreibung.');}else if(e.status===410){pending=null;setPhase('closed','Diese Arbeitsfassung ist geschlossen oder abgelaufen. Deine lokale Eingabe bleibt hier, sie wird nicht automatisch unter neuer ID gespeichert.');}else if(e.status===400||e.status===413||e.status===404){pending=null;setPhase('error','Diese Arbeitsfassung wurde nicht angenommen. Eingabe und Medienverweise prüfen; es erfolgt keine automatische Wiederholung.');}else setPhase('uncertain','Der Ausgang der Sicherung ist unklar. Nur diese Arbeitsfassung prüfen, nicht erneut senden. Deine aktuelle Eingabe bleibt hier.');}
 }
 async function reconcile(){
  if(disposed||request||!pending)return;clear();const expected=copy(pending),r=start();setPhase('checking','Nur den gespeicherten Stand dieser Arbeitsfassung prüfen …');
  try{const remote=await client.read(expected.mutation.workspaceId,{signal:r.signal});if(!current(r))return;request=null;
   if(!workspaceReceiptMatches(remote,expected.mutation,expected.kind)){state.remote=remote;setPhase('uncertain','Der gelesene Stand bestätigt die unklare Anfrage nicht eindeutig. Es wird nichts erneut gesendet oder überschrieben.');return;}
   pending=null;state.workspace=remote;state.confirmedPayload=copy(remote.payload);state.dirty=!state.valid||!workspacePayloadEqual(state.payload,remote.payload);if(state.unsupportedMedia){setPhase('local_only',channelMediaWarning+' Die frühere Sicherung ist bestätigt.');return;}setPhase(!state.valid?'invalid':!state.activeEditor?'local_only':state.dirty?'paused':'saved',!state.activeEditor?'Die frühere Sicherung ist bestätigt. Neuere Eingaben bleiben nur in diesem Editor; kopiere sie vor dem Schließen.':state.dirty?'Die frühere Sicherung ist bestätigt. Weitere Sicherungen erst nach deiner bewussten Fortsetzung.':'Die Sicherung wurde durch passenden Schreibbeleg bestätigt.');
  }catch(e){if(!current(r))return;request=null;if(expected.kind==='discard'&&closedDiscardMatches(e.closed,expected.mutation)){pending=null;state.workspace=null;state.dirty=!!state.localOnly;state.activeEditor=false;setPhase(state.localOnly?'local_only':'closed',state.localOnly?'Die frühere Arbeitsfassung ist nachweislich geschlossen. Neuere Eingaben bleiben nur in diesem Editor und sind nicht gesichert. Kopiere sie vor dem Schließen oder speichere sie bewusst als Beitrag.':'Die separate Arbeitsfassung ist nachweislich geschlossen. Der Beitrag bleibt gespeichert.');return;}setPhase('uncertain',e.status===410?'Diese Arbeitsfassung ist geschlossen. Der genaue Ausgang deiner Anfrage ist nicht bestätigt. Es wird nichts erneut gesendet.':'Der Ausgang bleibt unklar. Es wird nichts automatisch wiederholt.');}
 }
 async function readRemote(){
  if(disposed||request||pending||!state.workspaceId)return;clear();const r=start();setPhase('checking','Gespeicherte Arbeitsfassung lesen; deine Eingabe bleibt unverändert …');
  try{const remote=await client.read(state.workspaceId,{signal:r.signal});if(!current(r))return;request=null;state.remote=remote;setPhase('conflict','Aktuelle Serverfassung gelesen. Deine lokale Eingabe wurde nicht ersetzt. Wähle bewusst, welche Fassung du weiterverwenden möchtest.');}
  catch{if(current(r)){request=null;setPhase('error','Die aktuelle Arbeitsfassung konnte nicht gelesen werden. Deine Eingabe bleibt hier.');}}
 }
 function retainUnsavedInput(payload){
  if(disposed)return;
  if(unsupportedChannelMedia(payload)){state.open=true;state.activeEditor=false;unsupported(payload);return;}abort();state.open=true;state.activeEditor=false;state.localOnly=true;state.dirty=true;
  try{state.payload=normalizeChangedPayload(payload);state.valid=true;}catch{state.valid=false;}
  setPhase(pending?'uncertain':'local_only',pending?'Der Beitrag ist bereits gespeichert oder gelöscht. Neuere Eingaben sind nur in diesem Editor. Eine frühere Arbeitsfassungsanfrage ist zusätzlich noch unklar. Es wird nichts erneut gesendet. Kopiere deine Eingabe vor dem Schließen.':'Der Beitrag ist bereits gespeichert oder gelöscht. Neuere Eingaben sind nur in diesem Editor und werden nicht automatisch gesichert. Kopiere sie vor dem Schließen oder speichere sie bewusst als Beitrag.');
 }
 function resume(){if(state.phase!=='paused'||pending||request||!state.activeEditor)return;setPhase(state.dirty?'dirty':'saved','Automatische Sicherung für diesen Editor wieder freigegeben.');schedule();}
 function pause(){if(state.unsupportedMedia){clear();return;}clear();if(request){abort();setPhase(pending?'uncertain':'paused',pending?'Eine bereits gesendete Sicherung kann noch abgeschlossen werden. Ihr Ausgang muss erst geprüft werden.':'Die Leseprüfung wurde beendet. Die Sicherung bleibt pausiert.');}else if(!pending&&state.activeEditor)setPhase('paused','Automatische Sicherung pausiert. Deine Eingabe bleibt im Editor.');}
 function close(){abort();state.open=false;state.activeEditor=false;if(pending){state.phase='uncertain';state.message='Eine gesendete Sicherung kann noch abgeschlossen werden. Ihr Ausgang ist unklar.';}emit();}
 async function completed(){
  // Closing a confirmed workspace is separate from the already successful post save.
  if(disposed||!state.open||!state.activeEditor)return false;
  if(state.unsupportedMedia){close();return true;}
  clear();if(pending||request){close();return false;}const w=state.workspace;if(!w){close();return true;}
  const mutation={workspaceId:w.workspaceId,expectedRevision:w.revision,writeId:uuid()};pending={kind:'discard',mutation};const r=start();setPhase('closing','Beitrag gespeichert. Separate Arbeitsfassung wird geschlossen …');
  try{const receipt=await client.discard(mutation,{signal:r.signal});if(!current(r))return false;if(!workspaceReceiptMatches(receipt,mutation,'discard'))throw Error();pending=null;request=null;state.workspace=receipt;close();return true;}
  catch(e){if(!current(r))return false;request=null;if(e.status===409||e.status===410)pending=null;state.activeEditor=false;setPhase(pending?'uncertain':'closed','Der Beitrag ist gespeichert. Das Schließen der separaten Arbeitsfassung konnte nicht bestätigt werden. Den Beitrag nicht erneut speichern.');return false;}
 }
 return {open,changed,save,reconcile,readRemote,retainUnsavedInput,resume,pause,close,completed,get snapshot(){return snapshot();},get canCloseSafely(){return state.activeEditor&&state.valid&&!workspaceHasOmissions(state.payload)&&!state.dirty&&!pending&&!request;},destroy(){abort();disposed=true;}};
}
