/** Actual app readVideo orchestration with real composer identities; no network or uploads. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createComposerMedia} from '../../public/composer-media.js';
const app=readFileSync(new URL('../../public/app.js',import.meta.url),'utf8');
const start=app.indexOf('async function readVideo('),end=app.indexOf('\nfunction ',start);
assert.ok(start>=0&&end>start);const actual=app.slice(start,end);
const image={id:'image-1',url:'/api/planner/media/image-1',name:'original.png',type:'image/png',alt:'Original'};
const video={dataUrl:'data:video/webm;base64,QUJD',name:'original.webm',type:'video/webm',alt:''};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
function harness({items=[],prepare=async()=>video,throwRender=false}={}){
 let id=0;const composerImages=createComposerMedia({key:()=>String(++id)});composerImages.reset(items);
 const fields=new Map([['#composer',{open:true}],['#video-file',{value:'selected.webm'}],['#workspace-missing-media',{hidden:false}],['#media-alt',{focus(){}}]]);
 const notices=[],calls={prepare:0,commit:0,render:0};
 const context=vm.createContext({AbortController,composerImages,composerMedia:composerImages.selected,composerCover:'forms',composerMissingMedia:true,composerGeneration:1,mediaGeneration:0,mediaLoading:false,saving:false,savedAltEdit:null,videoSelectionController:null,$:key=>fields.get(key),notify:m=>notices.push(m),updateSaveAvailability(){},updateDraftSplitAvailability(){},prepareComposerVideo:async(...args)=>{calls.prepare++;return prepare(...args);},prepareMediaCommit:async ticket=>{calls.commit++;assert.equal(composerImages.current(ticket),true);},renderMediaEditor(){calls.render++;if(throwRender)throw Error('synthetic render failure');},renderPreview(){}});
 vm.runInContext(actual,context);return{context,fields,notices,calls,composerImages};
}
test('existing image carousel rejects video early and retains exact media and presentation',async()=>{
 const h=harness({items:[image]});const before=h.composerImages.checkpoint();assert.equal(await h.context.readVideo({name:'a.webm'}),false);assert.deepEqual(h.composerImages.checkpoint(),before);assert.equal(h.context.composerCover,'forms');assert.equal(h.context.composerMissingMedia,true);assert.equal(h.calls.prepare,0);assert.equal(h.calls.commit,0);assert.equal(h.context.mediaLoading,false);assert.equal(h.notices.length,1);
});
test('successful actual readVideo commits the original prepared item without conversion or upload',async()=>{
 const file={name:'original.webm'},h=harness({prepare:async received=>{assert.equal(received,file);return video;}});assert.equal(await h.context.readVideo(file),true);assert.deepEqual(h.composerImages.items,[video]);assert.equal(h.context.composerMedia.dataUrl,video.dataUrl);assert.equal(h.context.composerCover,null);assert.equal(h.context.composerMissingMedia,false);assert.equal(h.context.mediaLoading,false);assert.equal(h.context.videoSelectionController,null);assert.equal(h.fields.get('#video-file').value,'');assert.equal(h.calls.commit,1);
});
for(const mode of ['cancel','closed','new-generation','new-selection'])test(`late readVideo completion after ${mode} cannot commit`,async()=>{
 const gate=deferred();let options;const h=harness({prepare:(_file,o)=>{options=o;return gate.promise;}});const pending=h.context.readVideo({name:'a.webm'});assert.equal(h.context.mediaLoading,true);
 if(mode==='cancel')h.context.videoSelectionController.abort();
 if(mode==='closed')h.fields.get('#composer').open=false;
 if(mode==='new-generation'){h.context.composerGeneration++;h.context.mediaGeneration++;h.context.mediaLoading=false;}
 if(mode==='new-selection')h.composerImages.reset([image]);
 const before=h.composerImages.checkpoint();assert.equal(options.current(),false);gate.resolve(video);assert.equal(await pending,false);assert.deepEqual(h.composerImages.checkpoint(),before);assert.equal(h.calls.commit,0);assert.equal(h.context.composerCover,'forms');assert.equal(h.context.composerMissingMedia,true);
});
test('prepare failure retains previous presentation and releases loading state',async()=>{
 const h=harness({prepare:async()=>{throw Error('decode failed');}});const before=h.composerImages.checkpoint();assert.equal(await h.context.readVideo({}),false);assert.deepEqual(h.composerImages.checkpoint(),before);assert.equal(h.context.composerCover,'forms');assert.equal(h.context.mediaLoading,false);assert.deepEqual(h.notices,['decode failed']);
});
test('render failure after actual commit rolls back video and restores cover and missing-media state',async()=>{
 const h=harness({throwRender:true});assert.equal(await h.context.readVideo({}),false);assert.deepEqual(h.composerImages.items,[]);assert.equal(h.context.composerMedia,null);assert.equal(h.context.composerCover,'forms');assert.equal(h.context.composerMissingMedia,true);assert.equal(h.fields.get('#workspace-missing-media').hidden,false);assert.equal(h.context.mediaLoading,false);assert.equal(h.context.videoSelectionController,null);assert.equal(h.calls.commit,1);assert.deepEqual(h.notices,['synthetic render failure']);
});
test('actual file-input handler snapshots then clears selection on every repeated same-file choice',()=>{
 const marker="$('#video-file').addEventListener('change',",start=app.indexOf(marker);assert.ok(start>=0);const stop=app.indexOf(";$('#",start);assert.ok(stop>start);const handlerCode=app.slice(start,stop+1);let handler;const calls=[];const c=vm.createContext({$:selector=>{assert.equal(selector,'#video-file');return{addEventListener(type,fn){assert.equal(type,'change');handler=fn;}};},readVideo:file=>{calls.push(file);assert.equal(target.value,'');}});vm.runInContext(handlerCode,c);const file={name:'same.webm'},target={files:[file],value:'same.webm'};handler({target});target.value='same.webm';handler({target});assert.deepEqual(calls,[file,file]);assert.equal(target.value,'');
});
