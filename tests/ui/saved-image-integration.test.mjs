import {preservationContext} from './preservation-context.mjs';
import {videoContext} from './video-context.mjs';
import {createComposerMedia} from '../../public/composer-media.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {resolveSavedImage} from '../../public/saved-images.js';
const source=readFileSync(new URL('../../public/app.js',import.meta.url),'utf8');
function actual(name){const start=source.search(new RegExp(`(?:async )?function ${name}\\(`));assert.ok(start>=0);const next=source.slice(start+1).search(/\n(?:async )?function /);return source.slice(start,next<0?undefined:start+1+next);}
const media=(id='saved',extra={})=>({id,url:'/api/planner/media/'+id,name:'Original.png',type:'image/png',alt:'Exact original description',...extra});
const clone=value=>structuredClone(value);
function harness(extra={}){
 const stored=media(),old={dataUrl:'data:image/png;base64,T0xE',name:'local.png',alt:'Local alt',type:'image/png'},fields={'#composer':{open:true},'#workspace-missing-media':{hidden:false},'#post-tags':{value:'Current label'},'#post-date':{value:'2027-02-01'},'#post-time':{value:'14:00'},'#post-zone':{value:'Europe/Berlin'}};
 const composerImages=createComposerMedia();composerImages.reset([old]);const notices=[],captures=[],availability=[],decoded=[];let otherDialog=false,opens=0,renderCalls=0,previewCalls=0;
 const c=vm.createContext({...preservationContext(),...videoContext(),composerImages,editorSnapshot:()=>JSON.stringify({mediaItems:composerImages.items}),structuredClone,savedAltEdit:null,plannerLoaded:true,localFallback:false,saving:false,mediaLoading:false,workspacePlannerReading:false,composerGeneration:10,mediaGeneration:20,composerMedia:composerImages.selected,composerCover:'forms',composerMissingMedia:true,composerBaseText:'Current text',composerVariantTexts:{mastodon:'Current variant'},composerLabelState:{title:'Current title',tags:['Current label'],baseline:'Current label'},activeTextTarget:'base',composerTiming:{planning:{kind:'manual'}},editingId:'current',initialEditor:'UNCHANGED BASELINE',state:{posts:[{id:'source',title:'Source',text:'Source content',mediaItems:[stored]}]},savedImageTarget:null,savedImagePicker:{isOpen:false,open(){opens++}},document:{querySelector:()=>otherDialog?{}:null},$:selector=>fields[selector],$$:()=>[{value:'mastodon'}],currentComposerRawTags:()=>fields['#post-tags'].value,resolveSavedImage,
 async decodeSavedImage(value,{signal}){decoded.push(clone(value));if(extra.decode)await extra.decode(value,signal)},
 updateSaveAvailability(){availability.push(c.mediaLoading)},renderMediaEditor(){renderCalls++;if(extra.render)extra.render(c)},renderPreview(){previewCalls++;if(extra.preview)extra.preview(c)},notify:value=>notices.push(value),workspaceUI:{async prepareCarousel(){return true},captureChanged(){captures.push(clone(c.captureWorkspacePayload()));if(extra.capture)extra.capture(c)}}});
 for(const name of ['canChooseSavedImage','openSavedImages','applySavedImage','captureWorkspacePayload','prepareMediaCommit'])vm.runInContext(actual(name),c);
 return {c,fields,old:c.composerMedia,stored,notices,captures,availability,decoded,get opens(){return opens},get renderCalls(){return renderCalls},get previewCalls(){return previewCalls},set otherDialog(value){otherDialog=value}};
}
function start(h){h.c.openSavedImages();assert.equal(h.opens,1)}
test('actual adoption uses exact saved metadata, only changes image state and captures an owned reference',async()=>{
 const h=harness(),before=clone(h.c.state);start(h);const labels=h.fields['#post-tags'].value;
 assert.equal(await h.c.applySavedImage(h.stored),true);assert.deepEqual(clone(h.c.composerMedia),h.stored);assert.notEqual(h.c.composerMedia,h.stored);assert.equal(h.c.composerCover,null);assert.equal(h.c.composerMissingMedia,false);assert.equal(h.fields['#workspace-missing-media'].hidden,true);assert.equal(h.c.initialEditor,'UNCHANGED BASELINE');assert.equal(h.c.composerBaseText,'Current text');assert.equal(h.c.composerVariantTexts.mastodon,'Current variant');assert.equal(h.fields['#post-tags'].value,labels);assert.equal(h.fields['#post-date'].value,'2027-02-01');assert.equal(h.c.editingId,'current');assert.deepEqual(h.c.state,before);assert.equal(h.captures[0].mediaItems.length,2);assert.deepEqual(h.captures[0].mediaItems[1],{kind:'planner_image',id:h.stored.id,alt:h.stored.alt,name:h.stored.name,type:h.stored.type});assert.deepEqual(h.availability,[true,false]);assert.equal(h.notices.length,1);
});
test('legacy long alt is adopted unchanged and remains an owned reference',async()=>{
 const h=harness();h.stored.alt=' '+ 'x'.repeat(1998)+' ';start(h);await h.c.applySavedImage(h.stored);assert.equal(h.c.composerMedia.alt,h.stored.alt);assert.equal(h.captures[0].mediaItems[1].alt.length,2000);assert.equal(h.c.composerMedia.dataUrl,undefined);
});
for(const flag of ['saving','mediaLoading','workspacePlannerReading'])test(`busy/unavailable ${flag} blocks opening and apply`,async()=>{
 const h=harness();h.c[flag]=true;h.c.openSavedImages();assert.equal(h.opens,0);await assert.rejects(h.c.applySavedImage(h.stored));assert.equal(h.decoded.length,0);assert.deepEqual(h.c.composerMedia,h.old);
});
test('closed composer, another modal and already-open picker block opening',async()=>{
 for(const change of [h=>h.fields['#composer'].open=false,h=>h.otherDialog=true,h=>h.c.savedImagePicker.isOpen=true]){const h=harness();change(h);h.c.openSavedImages();assert.equal(h.opens,0);assert.equal(h.decoded.length,0);}
});
test('pre-open media snapshot catches in-place metadata changes before apply',async()=>{
 const h=harness();start(h);h.old.alt='Newer alt';await assert.rejects(h.c.applySavedImage(h.stored));assert.equal(h.decoded.length,0);assert.equal(h.old.alt,'Newer alt');assert.deepEqual(h.c.composerMedia,h.old);
});
for(const change of ['alt','replacement','cover','missing','session','target'])test(`newer ${change} while decoding wins without being replaced or reset`,async()=>{
 let finish;const h=harness({decode:()=>new Promise(resolve=>{finish=resolve})});start(h);const pending=h.c.applySavedImage(h.stored);assert.equal(h.c.mediaLoading,true);
 if(change==='alt')h.old.alt='Newer local alt';if(change==='replacement')h.c.composerMedia={...h.old,name:'New image.png'};if(change==='cover')h.c.composerCover='nature';if(change==='missing')h.c.composerMissingMedia=false;if(change==='session'){h.c.composerGeneration++;h.c.mediaGeneration++;h.c.mediaLoading=true;}if(change==='target')h.c.savedImageTarget={};
 const latest={media:h.c.composerMedia,cover:h.c.composerCover,missing:h.c.composerMissingMedia};finish();await assert.rejects(pending,/nicht übernommen/);assert.equal(h.c.composerMedia,latest.media);assert.equal(h.c.composerCover,latest.cover);assert.equal(h.c.composerMissingMedia,latest.missing);assert.equal(h.captures.length,0);assert.equal(h.notices.length,0);assert.equal(h.c.mediaLoading,change==='session');
});
test('text, variant, labels and timing edits during image read remain intact and do not block unrelated adoption',async()=>{
 let finish;const h=harness({decode:()=>new Promise(resolve=>{finish=resolve})});start(h);const pending=h.c.applySavedImage(h.stored);h.c.composerBaseText='Newer text';h.c.composerVariantTexts.mastodon='Newer variant';h.fields['#post-tags'].value='Newer label';h.fields['#post-date'].value='2027-03-04';h.c.composerTiming.planning={kind:'changed timing'};finish();assert.equal(await pending,true);assert.equal(h.c.composerBaseText,'Newer text');assert.equal(h.c.composerVariantTexts.mastodon,'Newer variant');assert.equal(h.fields['#post-tags'].value,'Newer label');assert.equal(h.fields['#post-date'].value,'2027-03-04');assert.equal(h.c.composerTiming.planning.kind,'changed timing');
});
test('late deleted or changed source reference is rechecked before adoption',async()=>{
 for(const deleted of [false,true]){let finish;const h=harness({decode:()=>new Promise(resolve=>{finish=resolve})});start(h);const pending=h.c.applySavedImage(h.stored);if(deleted)h.c.state.posts=[];else h.stored.alt='Changed canonical alt';finish();await assert.rejects(pending);assert.deepEqual(h.c.composerMedia,h.old);assert.equal(h.captures.length,0);assert.equal(h.c.mediaLoading,false);}
});
test('abort and composer close retain the old media and ignore resolved late decode',async()=>{
 for(const close of [false,true]){let finish;const controller=new AbortController(),h=harness({decode:()=>new Promise(resolve=>{finish=resolve})});start(h);const pending=h.c.applySavedImage(h.stored,{signal:controller.signal});if(close)h.fields['#composer'].open=false;else controller.abort();finish();await assert.rejects(pending);assert.deepEqual(h.c.composerMedia,h.old);assert.equal(h.captures.length,0);assert.equal(h.c.mediaLoading,false);}
});
test('failed image read is generic and retains old image, cover, missing warning and dirty baseline',async()=>{
 const h=harness({decode:()=>{throw Error('SECRET upstream detail')}});start(h);await assert.rejects(h.c.applySavedImage(h.stored),error=>!error.message.includes('SECRET'));assert.deepEqual(h.c.composerMedia,h.old);assert.equal(h.c.composerCover,'forms');assert.equal(h.c.composerMissingMedia,true);assert.equal(h.c.initialEditor,'UNCHANGED BASELINE');assert.equal(h.renderCalls,0);assert.equal(h.captures.length,0);assert.deepEqual(h.availability,[true,false]);
});
for(const stage of ['render','preview','capture'])test(`${stage} failure rolls editor media back instead of leaving a partially adopted image`,async()=>{
 let first=true;const h=harness({[stage]:()=>{if(first){first=false;throw Error('SECRET')}}});start(h);await assert.rejects(h.c.applySavedImage(h.stored));assert.deepEqual(h.c.composerMedia,h.old);assert.equal(h.c.composerCover,'forms');assert.equal(h.c.composerMissingMedia,true);assert.equal(h.fields['#workspace-missing-media'].hidden,false);assert.equal(h.c.mediaLoading,false);assert.equal(h.notices.length,0);assert.equal(h.captures.at(-1).mediaItems[0].kind,'local_omitted');
});
test('double apply produces one decode and no automatic save/upload path',async()=>{
 let finish;const h=harness({decode:()=>new Promise(resolve=>{finish=resolve})});start(h);const pending=h.c.applySavedImage(h.stored);await assert.rejects(h.c.applySavedImage(h.stored));assert.equal(h.decoded.length,1);finish();await pending;assert.equal(h.notices.length,1);
 const body=actual('applySavedImage');assert.doesNotMatch(body,/\b(?:persist|uploadMedia|savePost|fetch|openComposer)\s*\(/);
});
test('installer uses full loaded planning and closes picker when parent composer closes',()=>{
 assert.match(source,/getCatalog:\(\)=>savedImageCatalog\(state,\{available:plannerLoaded&&!localFallback\}\)/);assert.match(source,/\$\('#composer'\)\.addEventListener\('close',\(\)=>savedImagePicker\.close\(\{force:true\}\)\)/);assert.match(source,/dialog\[open\]:not\(#composer\):not\(#saved-image-picker\)/);
});


test('unavailable planner can open the honest unavailable picker but cannot apply any reference',async()=>{
 for(const field of ['plannerLoaded','localFallback']){const h=harness();h.c[field]=field==='localFallback';h.c.openSavedImages();assert.equal(h.opens,1);await assert.rejects(h.c.applySavedImage(h.stored));assert.equal(h.decoded.length,0);assert.deepEqual(h.c.composerMedia,h.old);}
});

test('saved batch is sequential, atomic, exact and uses one commitMany',async()=>{
 const h=harness(),second=media('second',{alt:' '+ 'x'.repeat(1998)+' '}),third=media('third');h.c.state.posts[0].mediaItems.push(second,third);start(h);let calls=0;const commit=h.c.composerImages.commitMany.bind(h.c.composerImages);h.c.composerImages.commitMany=(...args)=>{calls++;return commit(...args)};await h.c.applySavedImage([third,second,h.stored]);assert.equal(calls,1);assert.deepEqual(h.decoded.map(x=>x.id),['third','second','saved']);assert.deepEqual(h.c.composerImages.items.slice(1),[third,second,h.stored]);assert.equal(h.c.composerImages.items[2].alt.length,2000);assert.equal(h.captures.length,1);
});
for(const change of ['invalid','decode','source','reorder','alt','abort','prepare'])test(`saved batch ${change} failure never partially inserts`,async()=>{
 let h;const controller=new AbortController();h=harness({decode:value=>{if(value.id==='second'){if(change==='decode')throw Error('decode');if(change==='source')h.stored.alt='changed';if(change==='reorder')h.c.composerImages.select(h.c.composerImages.selectedKey);if(change==='alt')h.c.composerImages.updateAlt('newer');if(change==='abort')controller.abort();}}});const second=media('second');h.c.state.posts[0].mediaItems.push(second);start(h);if(change==='prepare')h.c.prepareMediaCommit=async()=>{h.stored.alt='changed after await'};const selection=[h.stored,second];if(change==='invalid')selection.push(media('absent'));await assert.rejects(h.c.applySavedImage(selection,{signal:controller.signal}));assert.equal(h.c.composerImages.length,1);assert.equal(h.captures.length,0);if(change==='invalid')assert.equal(h.decoded.length,0);
});
test('replacement rejects batches and replaces only selected item',async()=>{
 const h=harness(),second=media('second');h.c.state.posts[0].mediaItems.push(second);start(h);h.c.savedImageTarget.ticket=h.c.composerImages.ticket('replace');await assert.rejects(h.c.applySavedImage([h.stored,second]));assert.equal(h.decoded.length,0);await h.c.applySavedImage([second]);assert.equal(h.c.composerImages.length,1);assert.equal(h.c.composerMedia.id,'second');
});
test('failed batch rendering rolls back atomically but never overwrites newer revision',async()=>{
 for(const newer of [false,true]){let first=true;const h=harness({render:c=>{if(first){first=false;if(newer)c.composerImages.updateAlt('newer');throw Error('render')}}}),second=media('second');h.c.state.posts[0].mediaItems.push(second);start(h);await assert.rejects(h.c.applySavedImage([h.stored,second]));assert.equal(h.c.composerImages.length,newer?3:1);if(newer)assert.equal(h.c.composerImages.selected.alt,'newer');}
});

test('existing saved reference plus new member rejects entire append before decode or capture',async()=>{
 const h=harness(),second=media('second');h.c.state.posts[0].mediaItems.push(second);h.c.composerImages.reset([h.stored]);h.c.composerMedia=h.c.composerImages.selected;start(h);const before=h.c.composerImages.items;await assert.rejects(h.c.applySavedImage([h.stored,second]));assert.equal(h.decoded.length,0);assert.deepEqual(h.c.composerImages.items,before);assert.equal(h.captures.length,0);assert.equal(h.c.mediaLoading,false);
});
test('replacement excludes exactly target slot but rejects references in other slots',async()=>{
 for(const duplicate of [false,true]){const h=harness(),second=media('second');h.c.state.posts[0].mediaItems.push(second);h.c.composerImages.reset([h.stored,second]);h.c.composerMedia=h.c.composerImages.selected;start(h);h.c.savedImageTarget.ticket=h.c.composerImages.ticket('replace');if(duplicate){await assert.rejects(h.c.applySavedImage([second]));assert.equal(h.decoded.length,0);assert.equal(h.captures.length,0);}else{await h.c.applySavedImage([h.stored]);assert.equal(h.decoded.length,1);}assert.deepEqual(h.c.composerImages.items,[h.stored,second]);}
});
for(const stage of ['decode','prepare'])test(`existing duplicate introduced during ${stage} await rejects whole append`,async()=>{
 let h;const second=media('second');h=harness({decode:()=>{if(stage==='decode')h.c.composerImages.rows[1].media.id=second.id}});h.c.state.posts[0].mediaItems.push(second);h.c.composerImages.reset([h.old,media('other')]);h.c.composerMedia=h.c.composerImages.selected;start(h);if(stage==='prepare')h.c.prepareMediaCommit=async()=>{h.c.composerImages.rows[1].media.id=second.id};await assert.rejects(h.c.applySavedImage([second]));assert.equal(h.c.composerImages.length,2);assert.equal(h.captures.length,0);assert.equal(h.c.composerImages.rows[1].media.id,second.id);
});
