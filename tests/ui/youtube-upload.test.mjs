import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeYouTubeMedia,normalizeYouTubeUpload,normalizeYouTubeObservation,normalizeYouTubeMetadata,validateYouTubeFile,createYouTubeUploadClient} from '../../public/youtube-upload-data.js';
import {createYouTubeUploadController,renderYouTubeUpload} from '../../public/youtube-upload.js';
import {NOW,media,metadata,draft,upload,snapshot,flush,deferred,response} from './youtube-fixtures.mjs';
function harness(overrides={}){const calls=[];const client={list:async()=>[],listMedia:async()=>[media()],prepare:async()=>upload(),step:async(id,action,body)=>{calls.push({id,action,body});return upload('upload_accepted',2);},read:async()=>upload('unknown',2),...overrides};const controller=createYouTubeUploadController({client,now:()=>NOW});controller.setReadiness(snapshot());return {controller,client,calls};}
async function prepared(h){h.controller.show();await flush();h.controller.patch(draft());await h.controller.prepare();h.controller.setUploadConsent({privacyStatus:'private',communityGuidelines:true});}
test('private DTO verifies immutable media/metadata/fingerprint and rejects injected secrets or visibility',()=>{assert.deepEqual(normalizeYouTubeUpload(upload()),upload());for(const mutate of [v=>v.sessionUrl='https://secret',v=>v.operation.metadata.status.privacyStatus='invalid',v=>v.operation.notifySubscribers=true,v=>v.operation.publishAt='tomorrow',v=>v.media.objectKey='secret',v=>v.operation.media.sha256='c'.repeat(64),v=>v.uploadedBytes=99,v=>v.fingerprint='c'.repeat(64),v=>v.nextAction='upload_next_chunk',v=>v.approval='approved',v=>v.operation.metadata.status.containsSyntheticMedia=null]){const v=upload();mutate(v);assert.throws(()=>normalizeYouTubeUpload(v));}});
test('metadata never guesses disclosure choices and matches confirmed content limits',()=>{assert.deepEqual(normalizeYouTubeMetadata(metadata()),metadata());for(const patch of [{madeForKids:null},{containsSyntheticMedia:undefined},{title:'A'.repeat(101)},{description:'ä'.repeat(2501)},{title:'<bad>'},{tags:['A'.repeat(501)]},{categoryId:'abc'}])assert.throws(()=>normalizeYouTubeMetadata({...metadata(),...patch}));});
test('media accepts only bounded MP4/WebM with no foreign paths or browser hashes',()=>{assert.deepEqual(normalizeYouTubeMedia(media()),media());for(const patch of [{byteSize:8388609},{mimeType:'image/png'},{sha256:'bad'},{objectKey:'secret'},{filename:'\nname'}])assert.throws(()=>normalizeYouTubeMedia({...media(),...patch}));assert.equal(validateYouTubeFile(new File(['abc'],'test.mp4',{type:'video/mp4'})).size,3);assert.throws(()=>validateYouTubeFile(new File(['abc'],'bad.mp4',{type:'text/plain'})));});
test('inspection distinguishes accepted, processing and private-ready without public success',()=>{assert.deepEqual(normalizeYouTubeObservation({state:'not_found',code:'VIDEO_NOT_FOUND_AT_CHECK_TIME'}),{state:'not_found',code:'VIDEO_NOT_FOUND_AT_CHECK_TIME'});for(const processingStatus of ['succeeded','unknown'])assert.equal(normalizeYouTubeObservation({state:'private_ready',videoId:'abcdefghijk',privacyStatus:'private',processingStatus,uploadStatus:'processed'}).state,'private_ready');assert.throws(()=>normalizeYouTubeObservation({state:'private_ready',videoId:'abcdefghijk',privacyStatus:'public',processingStatus:'succeeded',uploadStatus:'processed'}));assert.throws(()=>normalizeYouTubeObservation({state:'check_failed',code:'SECRET'}));});
test('file selection is local and saving media requires its own explicit raw same-origin request',async()=>{let call;const client=createYouTubeUploadClient({fetcher:async(path,options)=>{call={path,options};return response({schemaVersion:1,media:media()});}});const file=new File(['abc'],'test.mp4',{type:'video/mp4'});await client.saveMedia(file);assert.equal(call.path,'/api/providers/youtube/media');assert.equal(call.options.body,file);assert.equal(call.options.headers['Content-Type'],'video/mp4');assert.equal(call.options.headers['X-Planner-File-Name'],'test.mp4');assert.equal(call.options.redirect,'error');});
test('upload client sends only stored ids and explicit approval fingerprint',async()=>{const calls=[];const c=createYouTubeUploadClient({fetcher:async(path,options)=>{calls.push({path,options});return response({schemaVersion:1,upload:upload('upload_accepted',2)});}});await c.step('operation_1','start',{expectedRevision:0,fingerprint:'b'.repeat(64),intent:'upload_private',privacyStatus:'private',communityGuidelines:'youtube-guidelines-v1'});assert.equal(calls[0].path,'/api/providers/youtube/uploads/operation_1/start');assert.deepEqual(JSON.parse(calls[0].options.body),{expectedRevision:0,fingerprint:'b'.repeat(64),intent:'upload_private',privacyStatus:'private',communityGuidelines:'youtube-guidelines-v1'});await assert.rejects(c.step('https://evil.example','probe'));await assert.rejects(c.step('operation_1','start',{expectedRevision:0,fingerprint:'b'.repeat(64),intent:'upload_public'}));assert.equal(calls.length,1);});
test('no default disclosure selection, public controls, URLs or schedule in the upload form',async()=>{const h=harness();h.controller.show();await flush();const html=renderYouTubeUpload(h.controller.snapshot);assert.doesNotMatch(html,/type="radio"[^>]*checked|publishAt|<input[^>]*type="url"|<input[^>]*type="password"/);assert.match(html,/höchstens 8 MiB/);assert.match(html,/maximal 20 eigene Dateien/);h.controller.destroy();});
test('show, prepare and list do not upload; explicit reviewed plan starts once',async()=>{const h=harness();await prepared(h);assert.equal(h.calls.length,0);assert.equal(h.controller.snapshot.selected.state,'prepared');assert.equal(h.controller.snapshot.confirm,true);await h.controller.step('start');assert.equal(h.calls.length,1);assert.equal(h.controller.snapshot.selected.state,'upload_accepted');assert.match(h.controller.snapshot.message,/Verarbeitung.*noch nicht bestätigt/);await h.controller.step('start');assert.equal(h.calls.length,1);h.controller.destroy();});
test('history never auto-resumes and selecting a prepared plan needs explicit review',async()=>{const h=harness({list:async()=>[upload()]});h.controller.show();await flush();h.controller.select('operation_1');await h.controller.step('start');assert.equal(h.calls.length,0);h.controller.review();h.controller.setUploadConsent({privacyStatus:'private',communityGuidelines:true});await h.controller.step('start');assert.equal(h.calls.length,1);h.controller.destroy();});
test('unknown mutation outcomes lock repeats until explicit stored-status readback',async()=>{let writes=0;const h=harness({step:async()=>{writes++;throw Error('RAW_SECRET')}});await prepared(h);await h.controller.step('start');assert.equal(writes,1);assert.equal(h.controller.snapshot.uncertain,true);await h.controller.step('start');assert.equal(writes,1);assert.doesNotMatch(h.controller.snapshot.message,/RAW_SECRET/);await h.controller.read();assert.equal(h.controller.snapshot.selected.state,'unknown');assert.equal(h.controller.snapshot.uncertain,false);assert.equal(writes,1);h.controller.destroy();});
test('hide aborts local continuation and discards late results without resuming on reopen',async()=>{const pending=deferred();let writes=0;const h=harness({step:async()=>{writes++;return pending.promise}});await prepared(h);const active=h.controller.step('start');h.controller.hide();pending.resolve(upload('session_ready',1));await active;h.controller.show();await flush();assert.equal(writes,1);assert.notEqual(h.controller.snapshot.selected?.state,'session_ready');h.controller.destroy();});
test('explicit start only chains known-ready chunks and stops when uncertain',async()=>{const actions=[];const h=harness({step:async(_id,action)=>{actions.push(action);return upload(action==='start'?'session_ready':'unknown',actions.length);}});await prepared(h);await h.controller.step('start');assert.deepEqual(actions,['start','chunk']);assert.equal(h.controller.snapshot.selected.state,'unknown');h.controller.destroy();});
test('changed server plan never receives a next chunk after approval',async()=>{let calls=0;const h=harness({step:async()=>{calls++;const v=upload('session_ready',1);v.operation.metadata.snippet.title='Changed';return v;}});await prepared(h);await h.controller.step('start');assert.equal(calls,1);assert.equal(h.controller.snapshot.uncertain,true);h.controller.destroy();});
test('expired or disconnected credentials still allow history read but no execution',async()=>{for(const stage of ['expired','disconnected']){const h=harness({list:async()=>[upload()]});h.controller.setReadiness(snapshot(stage));h.controller.show();await flush();assert.equal(h.controller.snapshot.uploads.length,1);h.controller.select('operation_1');h.controller.review();h.controller.setUploadConsent({privacyStatus:'private',communityGuidelines:true});await h.controller.step('start');assert.equal(h.calls.length,0);h.controller.destroy();}});
test('all duplicate clicks are locked while a write is pending',async()=>{const p=deferred(),h=harness({step:()=>{h.calls.push('write');return p.promise;}});await prepared(h);const first=h.controller.step('start');await h.controller.step('start');await h.controller.step('cancel');assert.equal(h.calls.length,1);p.resolve(upload('upload_accepted',2));await first;h.controller.destroy();});
test('server retry wait may coexist with a known session; it never auto-transfers',async()=>{const op=upload('session_ready',1);op.nextAction='wait';op.retryAt=new Date(NOW+60000).toISOString();assert.equal(normalizeYouTubeUpload(op).nextAction,'wait');const h=harness({list:async()=>[op]});h.controller.show();await flush();h.controller.select(op.operationId);await h.controller.step('chunk');assert.equal(h.calls.length,0);h.controller.destroy();});
test('file ingestion requires capability, available quota and its explicit action',async()=>{let saves=0;const h=harness({saveMedia:async()=>{saves++;return media();}});h.controller.show();await flush();h.controller.selectFile(new File(['abc'],'test.mp4',{type:'video/mp4'}));assert.equal(saves,0);await h.controller.ingest();assert.equal(saves,1);assert.match(h.controller.snapshot.message,/Noch kein Upload zu Google/);h.controller.setReadiness(snapshot('linked',false));await h.controller.ingest();assert.equal(saves,1);h.controller.destroy();});
test('cancel requires its own confirmation and never deletes an accepted video',async()=>{const h=harness({step:async(id,action,body)=>{h.calls.push({id,action,body});return upload('cancelled',1);}});await prepared(h);await h.controller.step('cancel');assert.equal(h.calls.length,0);h.controller.askCancel();h.controller.keep();await h.controller.step('cancel');assert.equal(h.calls.length,0);h.controller.askCancel();await h.controller.step('cancel');assert.equal(h.calls.length,1);assert.equal(h.calls[0].action,'cancel');h.controller.destroy();});
test('unknown Site-file save is not repeated before successful explicit list readback',async()=>{let saves=0;const h=harness({saveMedia:async()=>{saves++;throw Error('uncertain')}});h.controller.show();await flush();h.controller.selectFile(new File(['abc'],'test.mp4',{type:'video/mp4'}));await h.controller.ingest();await h.controller.ingest();assert.equal(saves,1);assert.equal(h.controller.snapshot.uncertain,true);await h.controller.load();assert.equal(h.controller.snapshot.uncertain,false);assert.equal(h.controller.snapshot.fileSummary,null);h.controller.destroy();});
test('execution stops at token expiry between the approved start and next chunk',async()=>{let current=NOW,writes=0;const client={list:async()=>[],listMedia:async()=>[media()],prepare:async()=>upload(),step:async()=>{writes++;current=NOW+600001;return upload('session_ready',1);}};const c=createYouTubeUploadController({client,now:()=>current});c.setReadiness(snapshot());c.show();await flush();c.patch(draft());await c.prepare();c.setUploadConsent({privacyStatus:'private',communityGuidelines:true});await c.step('start');assert.equal(writes,1);assert.equal(c.snapshot.canExecute,false);c.destroy();});
test('server plan response with changed media or disclosure is never shown as approved',async()=>{const h=harness({prepare:async()=>{const u=upload();u.operation.metadata.status.selfDeclaredMadeForKids=true;return u;}});await prepared(h);assert.equal(h.controller.snapshot.confirm,false);assert.equal(h.controller.snapshot.selected,null);assert.equal(h.controller.snapshot.uncertain,true);h.controller.destroy();});
test('failed history/media reads are not displayed as an empty or zero-file success',async()=>{const h=harness({list:async()=>{throw Error()},listMedia:async()=>{throw Error()}});h.controller.show();await flush();const html=renderYouTubeUpload(h.controller.snapshot);assert.match(html,/Anzahl gespeicherter Dateien derzeit nicht bestätigt/);assert.match(html,/Verlauf derzeit nicht bestätigt/);assert.doesNotMatch(html,/0 von 20 gespeicherten Dateien/);h.controller.destroy();});
test('expired/disconnected history can explicitly cancel future Takt steps but never upload',async()=>{for(const stage of ['expired','disconnected']){const h=harness({list:async()=>[upload('session_ready',1)],step:async(id,action,body)=>{h.calls.push({id,action,body});return upload('cancelled',2);}});h.controller.setReadiness(snapshot(stage));h.controller.show();await flush();h.controller.select('operation_1');await h.controller.step('chunk');assert.equal(h.calls.length,0);h.controller.askCancel();await h.controller.step('cancel');assert.deepEqual(h.calls.map(c=>c.action),['cancel']);assert.equal(h.controller.snapshot.selected.state,'cancelled');h.controller.destroy();}});

test('unclear Site save survives metadata edits, selection and unrelated upload readback',async()=>{
 let saves=0,mediaReads=0;
 const h=harness({list:async()=>[upload()],listMedia:async()=>{if(++mediaReads>1)throw Error('offline');return [media()];},saveMedia:async()=>{saves++;throw Error('unknown-save');}});
 const c=h.controller;c.show();await flush();c.select('operation_1');c.selectFile(new File(['abc'],'test.mp4',{type:'video/mp4'}));await c.ingest();
 assert.equal(c.snapshot.mediaUncertain,true);assert.equal(c.snapshot.fileSummary,null);
 c.patch({title:'edited'});await c.ingest();c.select('operation_1');await c.read();await c.ingest();await c.load();await c.ingest();
 assert.equal(c.snapshot.uncertain,true);assert.equal(c.snapshot.mediaLoaded,false);assert.equal(c.snapshot.canIngest,false);assert.equal(saves,1);c.destroy();
});
test('hide, reopen and a new controller cannot ingest before a successful media list',async()=>{
 let saves=0,reads=0;const client={list:async()=>[upload()],listMedia:async()=>{if(++reads>1)throw Error();return [media()];},saveMedia:async()=>{saves++;throw Error();}};
 const file=()=>new File(['abc'],'test.mp4',{type:'video/mp4'}),c=createYouTubeUploadController({client,now:()=>NOW});c.setReadiness(snapshot());c.show();await flush();c.selectFile(file());await c.ingest();
 c.hide();c.show();await flush();c.selectFile(file());await c.ingest();assert.equal(c.snapshot.mediaUncertain,true);assert.equal(saves,1);c.destroy();
 const d=createYouTubeUploadController({client,now:()=>NOW});d.setReadiness(snapshot());d.show();await flush();d.selectFile(file());await d.ingest();assert.equal(d.snapshot.canIngest,false);assert.equal(d.snapshot.mediaLoaded,false);assert.equal(saves,1);d.destroy();
});
test('unclear start survives selecting cached prepared plan and patching or preparing again',async()=>{
 let starts=0,prepares=0;const h=harness({prepare:async()=>{prepares++;return upload();},step:async()=>{starts++;throw Error();},list:async()=>[upload()]});
 await prepared(h);await h.controller.step('start');h.controller.select('operation_1');h.controller.review();h.controller.setUploadConsent({privacyStatus:'private',communityGuidelines:true});await h.controller.step('start');h.controller.patch({title:'edited'});await h.controller.prepare();
 assert.equal(starts,1);assert.equal(prepares,1);assert.deepEqual(h.controller.snapshot.uncertainOperationIds,['operation_1']);h.controller.destroy();
});
test('successful media list cannot acknowledge an unknown upload and unchanged operation read cannot unlock it',async()=>{
 let starts=0;const h=harness({step:async()=>{starts++;throw Error();},list:async()=>[upload()],read:async()=>upload()});await prepared(h);await h.controller.step('start');await h.controller.load();assert.equal(h.controller.snapshot.mediaLoaded,true);assert.equal(h.controller.snapshot.uncertain,true);await h.controller.read();h.controller.review();h.controller.setUploadConsent({privacyStatus:'private',communityGuidelines:true});await h.controller.step('start');assert.equal(starts,1);assert.equal(h.controller.snapshot.uncertain,true);h.controller.destroy();
});
test('read of another operation cannot acknowledge an uncertain start',async()=>{
 const other=upload();other.operationId='operation_2';other.operation.operationId='operation_2';let starts=0;
 const h=harness({list:async()=>[upload(),other],step:async()=>{starts++;throw Error();},read:async()=>({...other,revision:3})});await prepared(h);await h.controller.step('start');h.controller.select('operation_2');await h.controller.read();assert.equal(h.controller.snapshot.uncertain,true);h.controller.select('operation_1');h.controller.review();h.controller.setUploadConsent({privacyStatus:'private',communityGuidelines:true});await h.controller.step('start');assert.equal(starts,1);h.controller.destroy();
});
test('media readback alone cannot acknowledge an uncertain prepare',async()=>{
 let prepares=0,lists=0;const h=harness({list:async()=>{if(++lists>1)throw Error();return[];},prepare:async()=>{prepares++;throw Error();}});await prepared(h);await h.controller.load();assert.equal(h.controller.snapshot.mediaLoaded,true);assert.equal(h.controller.snapshot.prepareUncertain,true);await h.controller.prepare();assert.equal(prepares,1);h.controller.destroy();
});
test('ordinary refresh keeps an unsent local file while successful uncertain-save readback discards it',async()=>{
 let saves=0;const h=harness({saveMedia:async()=>{saves++;throw Error();}});h.controller.show();await flush();h.controller.selectFile(new File(['abc'],'test.mp4',{type:'video/mp4'}));await h.controller.load();assert.equal(h.controller.snapshot.fileSummary.name,'test.mp4');await h.controller.ingest();await h.controller.load();assert.equal(h.controller.snapshot.fileSummary,null);assert.equal(h.controller.snapshot.uncertain,false);await h.controller.ingest();assert.equal(saves,1);assert.match(renderYouTubeUpload(h.controller.snapshot),/bestätigt nicht, dass die frühere unklare Speicherung fehlgeschlagen ist/);h.controller.destroy();
});
test('closing an in-flight media write keeps its purpose lock and ignores late success',async()=>{
 const pending=deferred();let reads=0,saves=0;const h=harness({listMedia:async()=>{if(++reads>1)throw Error();return[media()]},saveMedia:async()=>{saves++;return pending.promise;}});h.controller.show();await flush();h.controller.selectFile(new File(['abc'],'test.mp4',{type:'video/mp4'}));const write=h.controller.ingest();h.controller.hide();pending.resolve(media());await write;h.controller.show();await flush();h.controller.selectFile(new File(['abc'],'test.mp4',{type:'video/mp4'}));await h.controller.ingest();assert.equal(saves,1);assert.equal(h.controller.snapshot.mediaUncertain,true);h.controller.destroy();
});
test('outcome DTO permits only fixed redacted codes and permanent manual warnings',()=>{
 const codes=['PROVIDER_OUTCOME_UNKNOWN','CREDENTIALS_REQUIRED','SESSION_NOT_FOUND_OR_EXPIRED','RATE_LIMITED','QUOTA_EXCEEDED','PROVIDER_PERMISSION_DENIED','VIDEO_IDENTITY_NOT_VERIFIED','UNEXPECTED_PROVIDER_VISIBILITY','PREMATURE_COMPLETION','PROBE_REQUIRED_BEFORE_UPLOAD','RETRY_AFTER_NOT_REACHED'];
 for(const code of codes){const u=upload('unknown',3);u.outcomeCode=code;u.nextAction='manual_reconciliation_no_reupload';assert.equal(normalizeYouTubeUpload(u).outcomeCode,code);}
 for(const code of ['RAW_PROVIDER_SECRET',{},''])assert.throws(()=>normalizeYouTubeUpload({...upload('unknown',3),outcomeCode:code}));
 const missing=upload();delete missing.outcomeCode;assert.throws(()=>normalizeYouTubeUpload(missing));
 for(const code of ['SESSION_NOT_FOUND_OR_EXPIRED','UNEXPECTED_PROVIDER_VISIBILITY'])assert.throws(()=>normalizeYouTubeUpload({...upload('unknown',3),outcomeCode:code}));
 for(const state of ['cancelled','upload_accepted'])assert.equal(normalizeYouTubeUpload({...upload(state,4),outcomeCode:'UNEXPECTED_PROVIDER_VISIBILITY',nextAction:'manual_reconciliation_no_reupload'}).nextAction,'manual_reconciliation_no_reupload');
});
test('manual session-loss warning survives read, selection, refresh and cancellation without a replacement plan',async()=>{
 const op={...upload('unknown',3),outcomeCode:'SESSION_NOT_FOUND_OR_EXPIRED',nextAction:'manual_reconciliation_no_reupload'};let prepares=0;
 const h=harness({list:async()=>[op],read:async()=>op,prepare:async()=>{prepares++;return upload();},step:async(id,action)=>{h.calls.push(action);return {...upload('cancelled',4),outcomeCode:op.outcomeCode,nextAction:op.nextAction};}});
 h.controller.show();await flush();h.controller.select('operation_1');await h.controller.read();await h.controller.load();await h.controller.step('probe');await h.controller.step('chunk');h.controller.patch(draft());await h.controller.prepare();assert.equal(prepares,0);assert.equal(h.calls.length,0);
 assert.match(renderYouTubeUpload(h.controller.snapshot),/bisherige Uploadsitzung wurde nicht gefunden oder ist abgelaufen/);
 h.controller.select('operation_1');h.controller.askCancel();await h.controller.step('cancel');assert.deepEqual(h.calls,['cancel']);assert.match(renderYouTubeUpload(h.controller.snapshot),/keine neue Sitzung und kein erneuter Upload als Ersatz/);await h.controller.step('start');assert.equal(h.calls.length,1);h.controller.destroy();
});
test('an older or downgraded read cannot remove a known manual-reconciliation warning',async()=>{
 const op={...upload('unknown',3),outcomeCode:'SESSION_NOT_FOUND_OR_EXPIRED',nextAction:'manual_reconciliation_no_reupload'};let lists=0;const h=harness({list:async()=>[++lists===1?op:upload('session_ready',4)],read:async()=>upload('session_ready',4)});h.controller.show();await flush();h.controller.select('operation_1');await h.controller.read();assert.equal(h.controller.snapshot.selected.nextAction,'manual_reconciliation_no_reupload');await h.controller.load();assert.equal(h.controller.snapshot.historyLoaded,false);assert.equal(h.controller.snapshot.selected.nextAction,'manual_reconciliation_no_reupload');await h.controller.step('chunk');assert.equal(h.calls.length,0);h.controller.destroy();
});
test('unexpected inspection visibility is prominently warned and persists in history after read/select/reopen',async()=>{
 const accepted=upload('upload_accepted',3),warned={...accepted,revision:4,outcomeCode:'UNEXPECTED_PROVIDER_VISIBILITY',nextAction:'manual_reconciliation_no_reupload'};let inspected=false;
 const h=harness({list:async()=>[inspected?warned:accepted],read:async()=>warned,inspect:async()=>{inspected=true;return {upload:warned,observation:{state:'check_failed',code:'UNEXPECTED_PROVIDER_VISIBILITY'}}}});
 h.controller.show();await flush();h.controller.select('operation_1');await h.controller.inspect();assert.match(renderYouTubeUpload(h.controller.snapshot),/Sicherheitswarnung: Die Sichtbarkeit bei YouTube entspricht nicht/);await h.controller.read();h.controller.patch({title:'changed'});assert.match(renderYouTubeUpload(h.controller.snapshot),/Sicherheitswarnung/);h.controller.select('operation_1');h.controller.hide();h.controller.show();await flush();assert.match(renderYouTubeUpload(h.controller.snapshot),/Sicherheitswarnung/);await h.controller.inspect();assert.equal(h.calls.length,0);h.controller.destroy();
});

test('newer persisted warning or revision invalidates an old private-ready observation',async()=>{
 for(const mode of ['warning','revision','same_revision_warning']){
  const accepted=upload('upload_accepted',3),latest={...accepted,revision:mode==='same_revision_warning'?3:4,...(mode==='revision'?{}:{outcomeCode:'UNEXPECTED_PROVIDER_VISIBILITY',nextAction:'manual_reconciliation_no_reupload'})};
  const h=harness({list:async()=>[accepted],inspect:async()=>({upload:accepted,observation:{state:'private_ready',videoId:'abcdefghijk',privacyStatus:'private',processingStatus:'succeeded',uploadStatus:'processed'}}),read:async()=>latest});
  h.controller.show();await flush();h.controller.select('operation_1');await h.controller.inspect();assert.match(renderYouTubeUpload(h.controller.snapshot),/Privates Video bereit:/);await h.controller.read();const html=renderYouTubeUpload(h.controller.snapshot);assert.equal(h.controller.snapshot.observation,null);assert.doesNotMatch(html,/Privates Video bereit:/);if(mode!=='revision')assert.match(html,/Sicherheitswarnung/);h.controller.select('operation_1');assert.equal(h.controller.snapshot.observation,null);h.controller.destroy();
 }
});
test('history refresh also invalidates a stale positive provider observation',async()=>{
 const accepted=upload('upload_accepted',3),warned={...accepted,revision:4,outcomeCode:'UNEXPECTED_PROVIDER_VISIBILITY',nextAction:'manual_reconciliation_no_reupload'};let calls=0;
 const h=harness({list:async()=>[++calls===1?accepted:warned],inspect:async()=>({upload:accepted,observation:{state:'private_ready',videoId:'abcdefghijk',privacyStatus:'private',processingStatus:'succeeded',uploadStatus:'processed'}})});
 h.controller.show();await flush();h.controller.select('operation_1');await h.controller.inspect();await h.controller.load();assert.equal(h.controller.snapshot.observation,null);assert.doesNotMatch(renderYouTubeUpload(h.controller.snapshot),/Privates Video bereit:/);assert.match(renderYouTubeUpload(h.controller.snapshot),/Sicherheitswarnung/);h.controller.destroy();
});

test('visibility and guidelines never default and public/unlisted never transmit',async()=>{const h=harness();await prepared(h);h.controller.review();assert.equal(h.controller.snapshot.uploadConsent,null);const html=renderYouTubeUpload(h.controller.snapshot);for(const value of ['private','public','unlisted'])assert.match(html,new RegExp('value="'+value+'"'));assert.doesNotMatch(html,/type="checkbox"[^>]*checked/);await h.controller.step('start');assert.equal(h.calls.length,0);for(const privacyStatus of ['public','unlisted','']){h.controller.setUploadConsent({privacyStatus,communityGuidelines:true});await h.controller.step('start');assert.equal(h.calls.length,0);}h.controller.setUploadConsent({privacyStatus:'private',communityGuidelines:false});await h.controller.step('start');assert.equal(h.calls.length,0);h.controller.setUploadConsent({privacyStatus:'private',communityGuidelines:true});await h.controller.step('start');assert.equal(h.calls.length,1);assert.equal(h.calls[0].body.communityGuidelines,'youtube-guidelines-v1');h.controller.destroy();});
test('review and changed draft discard prior policy acknowledgment',async()=>{const h=harness();await prepared(h);h.controller.review();await h.controller.step('start');assert.equal(h.calls.length,0);h.controller.setUploadConsent({privacyStatus:'private',communityGuidelines:true});h.controller.patch({title:'changed'});await h.controller.step('start');assert.equal(h.calls.length,0);await h.controller.prepare();assert.equal(h.controller.snapshot.uploadConsent,null);h.controller.destroy();});

for(const privacyStatus of ['public','unlisted'])test('UI '+privacyStatus+' needs explicit immutable plan approval and publishing gate',async()=>{
 const plan=(state='prepared',revision=0)=>{const v=upload(state,revision);v.operation.metadata.status.privacyStatus=privacyStatus;return v;};
 const h=harness({prepare:async()=>plan(),step:async(id,action,body)=>{h.calls.push({id,action,body});return plan('upload_accepted',2);}});
 h.controller.show();await flush();assert.equal(h.controller.snapshot.draft.privacyStatus,'');h.controller.patch({...draft(),privacyStatus});await h.controller.prepare();assert.equal(h.controller.snapshot.uploadConsent,null);
 h.controller.setUploadConsent({privacyStatus,communityGuidelines:true});await h.controller.step('start');assert.equal(h.calls.length,0);
 const ready=snapshot();ready.readiness.capabilities.publishing=true;ready.readiness.blockerCodes=ready.readiness.blockerCodes.filter(x=>x!=='PUBLISHING_DISABLED');h.controller.setReadiness(ready);
 h.controller.review();await h.controller.step('start');assert.equal(h.calls.length,0);
 h.controller.setUploadConsent({privacyStatus:'private',communityGuidelines:true});await h.controller.step('start');assert.equal(h.calls.length,0);
 h.controller.setUploadConsent({privacyStatus,communityGuidelines:false});await h.controller.step('start');assert.equal(h.calls.length,0);
 h.controller.setUploadConsent({privacyStatus,communityGuidelines:true});const html=renderYouTubeUpload(h.controller.snapshot);assert.match(html,new RegExp(privacyStatus==='public'?'öffentlich veröffentlichen':'nicht gelistet hochladen'));
 await h.controller.step('start');assert.equal(h.calls.length,1);assert.equal(h.calls[0].body.intent,'upload_'+privacyStatus);assert.equal(h.calls[0].body.privacyStatus,privacyStatus);await h.controller.step('start');assert.equal(h.calls.length,1);h.controller.destroy();
});
test('server changed visibility cannot become an approved UI plan',async()=>{const h=harness({prepare:async()=>{const v=upload();v.operation.metadata.status.privacyStatus='public';return v;}});await prepared(h);assert.equal(h.controller.snapshot.selected,null);assert.equal(h.controller.snapshot.uncertain,true);await h.controller.step('start');assert.equal(h.calls.length,0);h.controller.destroy();});


test('history-only dialog heading never claims visibility approval, including load failure', async () => {
 const pending=deferred();
 const h=harness({list:()=>pending.promise});
 h.controller.setReadiness(null);
 h.controller.show();
 const assertNeutral=()=>{
  const state=h.controller.snapshot;
  assert.equal(state.uploadConsent,null);
  assert.equal(state.confirm,false);
  assert.equal(state.draft.privacyStatus,'');
  const html=renderYouTubeUpload(state);
  assert.match(html,/<span class="eyebrow">UPLOAD UND VERLAUF\.<\/span>/);
  assert.doesNotMatch(html,/SICHTBARKEIT BEWUSST BESTÄTIGT/);
 };
 assertNeutral();
 pending.reject(new Error('History unavailable'));
 await flush();
 assert.equal(h.controller.snapshot.error,true);
 assertNeutral();
 assert.equal(h.calls.length,0);
 h.controller.hide();
 h.controller.destroy();
});

// Google reversed the unverified-project private-only restriction on 2026-11-02.
// https://developers.google.com/youtube/data/revision_history
test('upload copy never relies on an unverified project to enforce privacy',async()=>{
 const h=harness();h.controller.show();await flush();const html=renderYouTubeUpload(h.controller.snapshot);
 assert.doesNotMatch(html,/ungeprüfter API-Projekte|auf privat beschränken/);
 assert.match(html,/Erst deine Bestätigung überträgt ihn zu Google/);
 assert.match(html,/Öffentlich: für alle sichtbar/);
 assert.match(html,/Nicht gelistet: jeder mit dem Link/);
 assert.match(html,/Privat: nur für dich und von dir freigegebene Personen/);
 assert.match(html,/<option value="">Bitte auswählen<\/option>/);
 assert.equal(h.calls.length,0);h.controller.destroy();
});

test('history-only view omits unavailable composition and keeps read controls',async()=>{
 const h=harness();h.controller.setReadiness(null);h.controller.show();await flush();
 const html=renderYouTubeUpload(h.controller.snapshot);
 assert.match(html,/YouTube-Verlauf/);assert.match(html,/Nur Verlauf · Upload derzeit nicht verfügbar/);
 assert.match(html,/youtube-history-title/);assert.match(html,/data-yt="load"/);
 assert.doesNotMatch(html,/youtube-compose|youtube-file|youtube-metadata|Uploadplan prüfen|MP4 oder WebM/);
 assert.match(html,/Eine Veröffentlichungsbestätigung liegt damit nicht vor/);
 assert.equal(h.calls.length,0);h.controller.destroy();
});
test('history-only view retains uncertain file-save warning and manual recovery',async()=>{
 const operation=upload();operation.nextAction='manual_reconciliation_no_reupload';
 const h=harness();h.controller.setReadiness(null);h.controller.show();await flush();
 const html=renderYouTubeUpload({...h.controller.snapshot,mediaReviewNotice:true,selected:operation,uploads:[operation]});
 assert.match(html,/bestätigt nicht, dass die frühere unklare Speicherung fehlgeschlagen ist/);
 assert.match(html,/Ausgang manuell klären/);assert.match(html,/kein neuer Upload und keine neue Sitzung als Ersatz/);
 assert.match(html,/Nur gespeicherten Status prüfen/);assert.doesNotMatch(html,/youtube-compose/);
 assert.equal(h.calls.length,0);h.controller.destroy();
});
test('history-only read failures remain visible without a disabled form',async()=>{
 const h=harness({list:async()=>{throw Error()},listMedia:async()=>{throw Error()}});
 h.controller.setReadiness(null);h.controller.show();await flush();const html=renderYouTubeUpload(h.controller.snapshot);
 assert.match(html,/role="alert"/);assert.match(html,/Uploadverlauf konnte nicht zuverlässig gelesen werden/);
 assert.match(html,/Verlauf derzeit nicht bestätigt/);assert.doesNotMatch(html,/youtube-compose/);
 h.controller.destroy();
});
