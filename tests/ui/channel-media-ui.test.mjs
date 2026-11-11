import test from 'node:test';
import assert from 'node:assert/strict';
import {createChannelMediaUI} from '../../public/channel-media-ui.js';
import {channelMediaEligible,prepareChannelMedia,channelMediaMatches,channelMediaRecovery} from '../../public/channel-media.js';
const image=id=>({id,url:'/api/planner/media/'+id,type:'image/png',name:id+'.png',alt:'Alt '+id});
const post=()=>({id:'p',status:'draft',channels:['instagram','linkedin'],text:'Text',variantTexts:{linkedin:''},mediaItems:[image('a'),image('b')],scheduledAt:null,scheduledInstant:null,scheduleBinding:null,cover:null});
const context=()=>({state:{revision:7,posts:[post(),{...post(),id:'library',mediaItems:[image('c')]}]},postId:'p',revision:7,savedRevision:7,generation:2,editor:'clean',initialEditor:'clean',open:true});
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function harness(options={}){
 const ctx=context(),listeners={},fields={},calls=[],results=[],failures=[];
 const content={html:'',buttons:[],setAttribute(){},addEventListener(type,fn){listeners[type]=fn;},get innerHTML(){return this.html;},set innerHTML(value){if(this.buttons.includes(globalThis.document.activeElement))globalThis.document.activeElement=globalThis.document.body;this.html=value;this.buttons=[...value.matchAll(/<button\b([^>]+)>/g)].map(([,attrs])=>{const dataset={};for(const [,key,val] of attrs.matchAll(/data-([a-z-]+)="([^"]*)"/g))dataset[key.replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=val;return {dataset,disabled:/\bdisabled\b/.test(attrs),focus(){this.focused=true;globalThis.document.activeElement=this;}};});for(const [,id] of value.matchAll(/id="([^"]+)"/g))fields['#'+id]={id,value:'',disabled:new RegExp('<[^>]+id="'+id+'"[^>]*\\bdisabled\\b').test(value),focus(){this.focused=true;globalThis.document.activeElement=this;},select(){this.selected=true;}};},querySelectorAll(){return this.buttons;},querySelector(id){return fields[id];}};
 const dialog={open:false,addEventListener(type,fn){listeners['dialog-'+type]=fn;},querySelector(){return content;},showModal(){this.open=true;},close(){this.open=false;}};
 const previous=globalThis.document;globalThis.document={body:{tagName:'BODY'},activeElement:{isConnected:true,focus(){}}};
 const ui=createChannelMediaUI({dialog,getContext:()=>ctx,channels:[{id:'instagram',name:'Instagram'},{id:'linkedin',name:'LinkedIn'}],save:async(state,request)=>{calls.push(structuredClone({state,request}));return options.save?options.save(state,request):{...state,revision:8};},onSaved:(value,preview)=>results.push({value,preview}),onFailure:e=>failures.push(e),decode:options.decode||(async()=>{})});
 const click=(action,index)=>{const button=content.buttons.find(b=>b.dataset.channelMediaAction===action&&(index===undefined||b.dataset.index===String(index)));assert.ok(button,action);if(!button.disabled)button.focus();listeners.click({target:{closest:()=>button}});};
 return {ui,ctx,content,dialog,fields,calls,results,failures,click,change(id){listeners.change({target:{id:'channel-media-target',value:id}});},escape(){let prevented=false;listeners['dialog-cancel']({preventDefault(){prevented=true;}});assert.equal(prevented,true);},cleanup(){globalThis.document=previous;}};
}
test('saved-draft gate rejects pending/dirty/restored/scheduled/video sources and retains explicit emptiness',()=>{
 const c=context();assert.equal(channelMediaEligible(c),true);for(const extra of [{busy:true},{restored:true},{open:false},{editor:'dirty'},{savedRevision:6}])assert.equal(channelMediaEligible({...c,...extra}),false);
 for(const extra of [{status:'scheduled'},{channels:['instagram']},{mediaItems:[{...image('v'),type:'video/mp4'}]},{mediaItems:[{dataUrl:'data:image/png;base64,AA==',alt:'A',name:'a',type:'image/png'}]}])assert.equal(channelMediaEligible({...c,state:{...c.state,posts:[{...post(),...extra}]}}),false);
 const p=prepareChannelMedia(c);assert.equal(channelMediaMatches(p,c),true);assert.equal(channelMediaMatches(p,{...c,generation:3}),false);const map={instagram:[],linkedin:[image('b'),image('a')]};assert.deepEqual(channelMediaRecovery(p,map).channelMediaItems,map);
});
test('open is read-only; reorder/remove affects only chosen channel; full map save exactly once',async t=>{
 const h=harness();t.after(h.cleanup);assert.equal(h.ui.open(),true);assert.equal(h.calls.length,0);h.change('linkedin');h.click('left',1);h.click('remove',1);h.click('save');h.click('save');await settle();assert.equal(h.calls.length,1);assert.deepEqual(h.calls[0].request.channelMediaItems,{instagram:[image('a'),image('b')],linkedin:[image('b')]});assert.equal(h.results.length,1);assert.equal(h.dialog.open,false);
});
test('dirty Escape offers discard, retains copy, and never sends until explicit save',t=>{
 const h=harness();t.after(h.cleanup);h.ui.open();h.click('remove',0);h.escape();assert.equal(h.dialog.open,true);assert.match(h.content.html,/Änderungen verwerfen/);h.click('keep');h.click('copy');assert.match(h.content.html,/channelMediaItems/);assert.match(h.content.html,/linkedin/);h.click('cancel');h.click('discard');assert.equal(h.dialog.open,false);assert.equal(h.calls.length,0);
});
test('explicit use for all removes divergence without an inheritance marker',async t=>{
 const h=harness();t.after(h.cleanup);h.ui.open();h.click('remove',0);h.click('remove',0);h.click('all');h.click('save');await settle();assert.deepEqual(h.calls[0].request.channelMediaItems,{instagram:[],linkedin:[]});assert.equal(JSON.stringify(h.calls[0]).includes('inherit'),false);
});
test('saved catalog addition is decoded then owned references adopted; stale decode cannot attach',async t=>{
 const held=deferred(),h=harness({decode:()=>held.promise});t.after(h.cleanup);h.ui.open();h.fields['#channel-media-image'].value='c';h.click('add');assert.equal(h.ui.hasUnsavedInput,true);h.escape();assert.equal(h.dialog.open,false);held.resolve();await settle();assert.equal(h.calls.length,0);assert.equal(h.ui.open(),true);h.fields['#channel-media-image'].value='c';h.click('add');await settle();h.click('save');await settle();assert.deepEqual(h.calls[0].request.channelMediaItems.instagram.map(x=>x.id),['a','b','c']);
});
test('revision/editor changes reject dialog save without discarding staged arrays',async t=>{
 const h=harness();t.after(h.cleanup);h.ui.open();h.click('remove',0);h.ctx.state.revision++;h.click('save');await settle();assert.equal(h.calls.length,0);assert.match(h.content.html,/Entwurf geändert/);h.click('copy');assert.match(h.content.html,/channelMediaItems/);
});
test('pending write cannot close/repeat; failed receipt retains raw recovery and fences another send',async t=>{
 const held=deferred(),h=harness({save:()=>held.promise});t.after(h.cleanup);h.ui.open();h.click('remove',0);h.click('save');h.escape();assert.equal(h.dialog.open,true);assert.equal(h.ui.pending,true);h.click('save');assert.equal(h.calls.length,1);held.reject(Error('Speicherung unklar. Neu laden.'));await settle();assert.equal(h.failures.length,1);assert.equal(h.ui.pending,false);assert.equal(h.dialog.open,true);h.click('save');assert.equal(h.calls.length,1);h.click('copy');assert.match(h.content.html,/channelMediaItems/);assert.match(h.content.html,/linkedin/);
});
test('move-to-first and move-to-last focus surviving controls on the moved row',t=>{
 const h=harness();t.after(h.cleanup);h.ui.open();h.click('left',1);assert.equal(document.activeElement.dataset.channelMediaAction,'right');assert.equal(document.activeElement.dataset.index,'0');assert.equal(document.activeElement.disabled,false);h.click('right',0);assert.equal(document.activeElement.dataset.channelMediaAction,'left');assert.equal(document.activeElement.dataset.index,'1');assert.equal(document.activeElement.disabled,false);
});
test('removing focuses next surviving image, then usable image picker when empty',t=>{
 const h=harness();t.after(h.cleanup);h.ui.open();h.click('remove',0);assert.equal(document.activeElement.dataset.channelMediaAction,'remove');assert.equal(document.activeElement.dataset.index,'0');h.click('remove',0);assert.equal(document.activeElement.id,'channel-media-image');assert.equal(document.activeElement.disabled,false);
});
test('adding final catalog image focuses its Remove control when Add becomes disabled',async t=>{
 const h=harness();t.after(h.cleanup);h.ui.open();h.fields['#channel-media-image'].value='c';h.click('add');await settle();assert.equal(document.activeElement.dataset.channelMediaAction,'remove');assert.equal(document.activeElement.dataset.index,'2');assert.equal(document.activeElement.disabled,false);assert.equal(h.content.buttons.find(b=>b.dataset.channelMediaAction==='add').disabled,true);
});
test('explicit copy-to-all preserves focus on its surviving action',t=>{
 const h=harness();t.after(h.cleanup);h.ui.open();h.click('all');assert.equal(document.activeElement.dataset.channelMediaAction,'all');assert.equal(document.activeElement.disabled,false);
});
