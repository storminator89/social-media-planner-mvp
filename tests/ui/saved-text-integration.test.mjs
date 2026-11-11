import {preservationContext} from './preservation-context.mjs';
import {createComposerMedia} from '../../public/composer-media.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {savedTextCatalog,resolveSavedText,insertSavedText} from '../../public/saved-texts.js';
import {effectiveText} from '../../public/variants.js';
const source=readFileSync(new URL('../../public/app.js',import.meta.url),'utf8');
function fn(name){const start=source.search(new RegExp(`(?:async )?function ${name}\\(`));assert.ok(start>=0,name);const next=source.slice(start+1).search(/\n(?:async )?function /);return source.slice(start,next<0?undefined:start+1+next);}
const clone=structuredClone;
function harness(extra={}){
 const fields={'#composer':{open:true},'#post-text':{value:'Existing',selectionStart:2,selectionEnd:5,selectionDirection:'backward',scrollTop:14,scrollLeft:2,focus(){this.focused=true},setSelectionRange(start,end,direction){this.selectionStart=start;this.selectionEnd=end;this.selectionDirection=direction},setRangeText(text,start,end){this.value=this.value.slice(0,start)+text+this.value.slice(end);this.setSelectionRange(start,start+text.length,'forward')}},'#post-tags':{value:'Tag'},'#post-date':{value:'2027-02-01'},'#post-time':{value:'10:00'},'#post-zone':{value:'Europe/Berlin'}};
 // Native textarea API values normalize CRLF and bare CR, including setRangeText.
 // Keeping this in the shared harness catches raw-string insertion/length errors.
 let textareaValue=fields['#post-text'].value;
 Object.defineProperty(fields['#post-text'],'value',{get(){return textareaValue},set(value){textareaValue=String(value).replace(/\r\n?/g,'\n')}});
 let opens=0,captures=0,otherDialog=false;
 const c=vm.createContext({...preservationContext(),composerImages:createComposerMedia(),structuredClone,plannerLoaded:true,localFallback:false,saving:false,mediaLoading:false,workspacePlannerReading:false,workspaceRestoring:false,splitPending:false,composerGeneration:3,savedTextTarget:null,postTemplatePicker:{isOpen:false,close(){}},
  composerBaseText:'Existing',composerVariantTexts:{mastodon:'Own'},activeTextTarget:'base',composerMedia:{id:'image',alt:'Exact'},composerCover:'forms',composerMissingMedia:true,initialEditor:'Original',editingId:'current',composerIdeaFingerprint:'Idea fingerprint',composerLabelState:{title:'Title',tags:['Tag']},composerTiming:{snapshot:{scheduleBinding:{id:'schedule'},scheduledInstant:'2027-02-01T09:00Z'}},
  state:{posts:[{id:'source',status:'draft',title:'Source',text:' SAVED ',channels:['mastodon'],variantTexts:{mastodon:' VARIANT '},updatedAt:'2027-01-01'}]},CHANNELS:[{id:'mastodon',name:'Mastodon'},{id:'linkedin',name:'LinkedIn'}],
  $:selector=>fields[selector],$$:()=>[{value:'mastodon'},{value:'linkedin'}],document:{querySelector:()=>otherDialog?{}:null},resolveSavedText,insertSavedText,effectiveText,
  renderPreview(){captures++;if(extra.render)extra.render(c)},savedTextPicker:{isOpen:false,open(origin){opens++;this.isOpen=true;return true},close(options){if(!this.isOpen)return;this.isOpen=false;c.closeSavedTexts(c.savedTextTarget,{restoreFocus:options?.restoreFocus!==false})}},...extra.context});
 c.composerImages.reset([c.composerMedia]);c.composerMedia=c.composerImages.selected;
 for(const name of ['editorSnapshot','editorPost','canChooseSavedText','openSavedTexts','applySavedText','applyComposerText','closeSavedTexts'])vm.runInContext(fn(name),c);
 return {c,fields,get opens(){return opens},get captures(){return captures},set otherDialog(value){otherDialog=value},get chosen(){return savedTextCatalog(c.state,c.CHANNELS).items[0]},open(){c.openSavedTexts();return c.savedTextTarget},apply(item=this.chosen,origin=c.savedTextTarget){return c.applySavedText(item,origin)}};
}
test('only explicit apply inserts at selectionEnd, preserves selected text and selects inserted range',()=>{
 const h=harness(),before=clone(h.c.state),origin=h.open();assert.equal(h.opens,1);assert.equal(h.fields['#post-text'].value,'Existing');assert.match(origin.label,/Basistext · Nach Auswahl/);
 assert.equal(h.apply(),true);assert.equal(h.fields['#post-text'].value,'Exist SAVED ing');assert.equal(h.c.composerBaseText,'Exist SAVED ing');assert.equal(h.c.composerVariantTexts.mastodon,'Own');assert.equal(h.c.initialEditor,'Original');
 assert.deepEqual(h.c.state,before);assert.equal(h.c.editingId,'current');assert.equal(h.c.composerIdeaFingerprint,'Idea fingerprint');assert.equal(h.c.composerMedia.alt,'Exact');assert.equal(h.c.composerCover,'forms');assert.equal(h.c.composerMissingMedia,true);assert.equal(h.fields['#post-tags'].value,'Tag');assert.equal(h.fields['#post-date'].value,'2027-02-01');assert.equal(h.c.composerTiming.snapshot.scheduleBinding.id,'schedule');assert.equal(h.captures,1);
 h.c.closeSavedTexts(origin,{restoreFocus:true});assert.equal(h.fields['#post-text'].focused,true);assert.equal(h.fields['#post-text'].selectionStart,5);assert.equal(h.fields['#post-text'].selectionEnd,12);
});
test('inherited active channel becomes only its own override; existing own channel is updated in isolation',()=>{
 for(const target of ['linkedin','mastodon']){const h=harness();h.c.activeTextTarget=target;h.fields['#post-text'].value=target==='linkedin'?'Existing':'Own';h.fields['#post-text'].setSelectionRange(1,1,'none');const origin=h.open();assert.match(origin.label,/Eigener Text/);h.apply();assert.equal(h.c.composerBaseText,'Existing');assert.equal(h.c.composerVariantTexts[target],target==='linkedin'?'E SAVED xisting':'O SAVED wn');if(target==='linkedin')assert.equal(h.c.composerVariantTexts.mastodon,'Own');}
});
test('explicit empty channel remains isolated and accepts insertion without inherited base text',()=>{
 const h=harness();h.c.activeTextTarget='mastodon';h.c.composerVariantTexts.mastodon='';h.fields['#post-text'].value='';h.fields['#post-text'].setSelectionRange(0,0,'none');h.open();h.apply();assert.equal(h.c.composerVariantTexts.mastodon,' SAVED ');assert.equal(h.c.composerBaseText,'Existing');
});
for(const flag of ['saving','mediaLoading','workspacePlannerReading','workspaceRestoring','splitPending'])test(`${flag} blocks opening and application without losing input`,()=>{
 const h=harness();h.c[flag]=true;h.open();assert.equal(h.opens,0);h.c[flag]=false;h.open();h.c[flag]=true;assert.throws(()=>h.apply());assert.equal(h.c.composerBaseText,'Existing');assert.equal(h.captures,0);
});
test('closed, disabled, read-only, other modal and already-open picker cannot open',()=>{
 for(const change of [h=>h.fields['#composer'].open=false,h=>h.fields['#post-text'].disabled=true,h=>h.fields['#post-text'].readOnly=true,h=>h.otherDialog=true,h=>h.c.savedTextPicker.isOpen=true]){const h=harness();change(h);h.open();assert.equal(h.opens,0);}
});
test('generation, target, text, selection, editor metadata or changed origin rejects stale application',()=>{
 for(const change of [h=>h.c.composerGeneration++,h=>h.c.activeTextTarget='mastodon',h=>h.c.composerBaseText='Newer',h=>h.fields['#post-text'].value='Newer',h=>h.fields['#post-text'].selectionStart++,h=>h.fields['#post-text'].selectionEnd++,h=>h.fields['#post-text'].selectionDirection='forward',h=>h.fields['#post-tags'].value='New tag',h=>h.c.composerVariantTexts.mastodon='New variant',h=>h.c.composerMedia.alt='New alt',h=>h.c.savedTextTarget={}]){
  const h=harness(),origin=h.open(),chosen=h.chosen;change(h);const before=h.c.editorSnapshot(),value=h.fields['#post-text'].value;assert.throws(()=>h.apply(chosen,origin));assert.equal(h.c.editorSnapshot(),before);assert.equal(h.fields['#post-text'].value,value);assert.equal(h.captures,0);
 }
});
test('source changes/deletion, unavailable planning and length overflow fail before mutation',()=>{
 for(const change of [h=>h.c.state.posts[0].text='Changed',h=>h.c.state.posts=[],h=>h.c.plannerLoaded=false,h=>h.c.localFallback=true]){const h=harness();h.open();const chosen=h.chosen;change(h);assert.throws(()=>h.apply(chosen));assert.equal(h.c.composerBaseText,'Existing');assert.equal(h.captures,0);}
 const h=harness();h.c.composerBaseText=h.fields['#post-text'].value='x'.repeat(20000);h.open();assert.throws(()=>h.apply(),/20.000/);assert.equal(h.fields['#post-text'].value.length,20000);assert.equal(h.captures,0);
});
test('cancel restores exact range/direction/scroll/focus but stale close cannot change newer composer',()=>{
 const h=harness(),origin=h.open();h.fields['#post-text'].setSelectionRange(0,0,'none');h.fields['#post-text'].scrollTop=0;h.c.closeSavedTexts(origin,{restoreFocus:true});assert.equal(h.fields['#post-text'].selectionStart,2);assert.equal(h.fields['#post-text'].selectionEnd,5);assert.equal(h.fields['#post-text'].selectionDirection,'backward');assert.equal(h.fields['#post-text'].scrollTop,14);assert.equal(h.fields['#post-text'].scrollLeft,2);assert.equal(h.fields['#post-text'].focused,true);assert.equal(h.captures,0);
 h.c.savedTextPicker.isOpen=false;const newer=h.open();h.fields['#post-text'].focused=false;h.c.closeSavedTexts(origin,{restoreFocus:true});assert.equal(h.c.savedTextTarget,newer);assert.equal(h.fields['#post-text'].focused,false);
 h.c.composerGeneration++;h.c.closeSavedTexts(newer,{restoreFocus:true});assert.equal(h.fields['#post-text'].focused,false);
});
test('applied target is one-use and failed presentation rolls back all text state',()=>{
 const h=harness(),origin=h.open();h.apply();assert.throws(()=>h.apply(h.chosen,origin));assert.equal(h.c.composerBaseText,'Exist SAVED ing');assert.equal(h.captures,1);
 let first=true;const failed=harness({render(){if(first){first=false;throw Error('SECRET')}}});failed.open();assert.throws(()=>failed.apply(),error=>!error.message.includes('SECRET'));assert.equal(failed.c.composerBaseText,'Existing');assert.equal(failed.fields['#post-text'].value,'Existing');assert.equal(failed.c.composerVariantTexts.mastodon,'Own');assert.equal(failed.fields['#post-text'].selectionDirection,'backward');
});
test('save invalidates picker even if a failed save later releases the lock; stale callbacks cannot insert',()=>{
 const h=harness(),origin=h.open(),chosen=h.chosen,controls=[];h.fields['#composer-form']={setAttribute(){}};h.c.disabledDuringCommit=new Map();h.c.updateSaveAvailability=()=>{};h.c.$$=()=>controls;vm.runInContext(fn('setComposerBusy'),h.c);h.c.saving=true;h.c.setComposerBusy(true);assert.equal(h.c.savedTextTarget,null);h.c.saving=false;h.c.setComposerBusy(false);assert.throws(()=>h.apply(chosen,origin));assert.equal(h.c.composerBaseText,'Existing');
});
test('integration has no new save/upload/fetch path and remains a concise text-only entry',()=>{
 assert.doesNotMatch(fn('applySavedText'),/\b(?:persist|uploadMedia|savePost|fetch|openComposer)\s*\(/);
 assert.match(fn('applySavedText'),/applyComposerText\(text,origin\)/);assert.match(fn('applyComposerText'),/renderPreview\(\)/);assert.match(fn('renderPreview'),/workspaceUI\?\.captureChanged\(\)/);
 assert.match(fn('openComposer'),/savedTextPicker\?\.close\(\{restoreFocus:false\}\)/);assert.match(fn('closeComposer'),/savedTextPicker\?\.close\(\{restoreFocus:false\}\)/);
 const html=readFileSync(new URL('../../public/index.html',import.meta.url),'utf8');assert.match(html,/id="choose-saved-text">Text übernehmen<\/button>/);assert.match(html,/saved-text-picker.css/);
});

for(const target of ['base','linkedin','mastodon'])test(`native textarea newline normalization inserts into ${target} with correct selected range and untouched source`,()=>{
 const raw='QA Windows erste\r\nzweite\rdritte\n😀',normalized='QA Windows erste\nzweite\ndritte\n😀',h=harness(),input=h.fields['#post-text'];
 h.c.state.posts[0].text=raw;h.c.activeTextTarget=target;
 input.value=target==='mastodon'?'Own':'Existing';input.setSelectionRange(1,2,'backward');
 const original=input.value,before=clone(h.c.state),origin=h.open(),selected=h.chosen;
 assert.equal(selected.text,raw);assert.equal(resolveSavedText(h.c.state,selected,h.c.CHANNELS),raw);
 assert.equal(h.apply(selected),true);assert.equal(input.value,original.slice(0,2)+normalized+original.slice(2));
 h.c.closeSavedTexts(origin,{restoreFocus:true});
 assert.equal(input.selectionStart,2);assert.equal(input.selectionEnd,2+normalized.length);assert.equal(input.value.slice(input.selectionStart,input.selectionEnd),normalized);assert.equal(input.focused,true);
 assert.equal(target==='base'?h.c.composerBaseText:h.c.composerVariantTexts[target],input.value);
 if(target!=='base')assert.equal(h.c.composerBaseText,'Existing');if(target!=='mastodon')assert.equal(h.c.composerVariantTexts.mastodon,'Own');
 assert.deepEqual(h.c.state,before);assert.equal(h.captures,1);
});
test('raw source line-ending changes still invalidate identity even when the displayed text is identical',()=>{
 const h=harness();h.c.state.posts[0].text='First\r\nSecond';h.open();const chosen=h.chosen;h.c.state.posts[0].text='First\nSecond';
 assert.throws(()=>h.apply(chosen),/geändert/);assert.equal(h.fields['#post-text'].value,'Existing');assert.equal(h.captures,0);
});
test('normalized payload length controls the textarea 20k boundary without truncating content',()=>{
 const h=harness(),input=h.fields['#post-text'];h.c.state.posts[0].text='a\r\nb\rc';h.c.composerBaseText=input.value='x'.repeat(19995);input.setSelectionRange(19995,19995,'none');const origin=h.open();
 assert.equal(h.apply(),true);h.c.closeSavedTexts(origin,{restoreFocus:true});assert.equal(input.value.length,20000);assert.equal(input.value.slice(input.selectionStart,input.selectionEnd),'a\nb\nc');assert.equal(input.selectionEnd,20000);
});

for(const target of ['base','mastodon','linkedin'])test(`template insertion protects ${target} and existing text`,()=>{const h=harness();h.c.activeTextTarget=target;const original=h.fields['#post-text'].value;const origin=h.open();assert.equal(h.c.applyComposerText('New template',origin),true);assert.equal(h.fields['#post-text'].value,original.slice(0,5)+'New template'+original.slice(5));if(target!=='base')assert.equal(h.c.composerBaseText,'Existing');assert.throws(()=>h.c.applyComposerText('Replay',origin));});
test('template insertion rejects stale target without touching text',()=>{const h=harness();const origin=h.open();h.c.composerGeneration++;assert.throws(()=>h.c.applyComposerText('Template',origin));assert.equal(h.fields['#post-text'].value,'Existing');});
