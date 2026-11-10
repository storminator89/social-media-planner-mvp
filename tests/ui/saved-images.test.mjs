import test from 'node:test';
import assert from 'node:assert/strict';
import {savedImageCatalog,resolveSavedImage,isSavedImage,savedImageIdentity,decodeSavedImage} from '../../public/saved-images.js';
const media=(id='a',extra={})=>({id,url:'/api/planner/media/'+id,name:'Photo.png',type:'image/png',alt:'Original description',...extra});
const post=(id,image,extra={})=>({id,title:'Title '+id,text:'Original text',media:image,...extra});
const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(freeze)}return value};
const state=posts=>({posts,settings:{timezone:'UTC'}});
test('catalog is a pure full-post projection, deduplicates media and strips unrelated metadata',()=>{
 const image=media('a',{secret:'hidden'}),data=freeze(state([post('p1',image),post('p2',media('a')),post('p3',media('b'),{status:'draft'}),post('none',null)])),before=structuredClone(data);
 const list=savedImageCatalog(data);assert.equal(list.available,true);assert.equal(list.items.length,2);assert.equal(list.items[0].usageCount,2);assert.deepEqual(list.items[0].sourceTitles,['Title p1','Title p2']);assert.deepEqual(Object.keys(list.items[0].media),['id','url','alt','name','type']);assert.deepEqual(data,before);list.items[0].media.alt='local';assert.equal(image.alt,'Original description');
});
test('unavailable planner is not empty and does not inspect fallback data',()=>{
 assert.deepEqual(savedImageCatalog(null,{available:false}),{available:false,items:[],hasUnavailableImages:false});assert.deepEqual(savedImageCatalog(state([])),{available:true,items:[],hasUnavailableImages:false});
});
test('legacy 2000-character stored alt is preserved exactly, not trimmed to new-file form limits',()=>{
 const image=media('legacy',{alt:' '+ 'x'.repeat(1998)+' '}),data=state([post('p',image)]);assert.equal(isSavedImage(image),true);const result=savedImageCatalog(data);assert.equal(result.items[0].media.alt.length,2000);assert.equal(resolveSavedImage(data,image).alt,image.alt);assert.equal(savedImageIdentity(image),savedImageIdentity(result.items[0].media));
});
for(const [name,changed] of Object.entries({external:{url:'https://evil.example/image.png'},protocolRelative:{url:'//evil.example/a'},query:{url:'/api/planner/media/a?token=1'},fragment:{url:'/api/planner/media/a#x'},wrongId:{url:'/api/planner/media/b'},traversal:{id:'../x',url:'/api/planner/media/../x'},encodedSlash:{id:'a%2fb',url:'/api/planner/media/a%2fb'},local:{dataUrl:'data:image/png;base64,AA=='},svg:{type:'image/svg+xml'},video:{type:'video/mp4'},longAlt:{alt:'x'.repeat(2001)},longName:{name:'x'.repeat(256)},missingName:{name:undefined}}))test(`rejects ${name} without constructing a preview URL`,()=>{
 const image=media('a',changed),list=savedImageCatalog(state([post('p',image)]));assert.equal(isSavedImage(image),false);assert.equal(list.items.length,0);assert.equal(list.hasUnavailableImages,true);assert.throws(()=>resolveSavedImage(state([post('p',image)]),image));
});
for(const alt of ['', ' \n\t'])test('blank-alt references are not offered as reusable images',()=>{
 const image=media('empty',{alt}),list=savedImageCatalog(state([post('p',image)]));assert.equal(list.items.length,0);assert.equal(list.hasUnavailableImages,true);assert.throws(()=>resolveSavedImage(state([post('p',image)]),image));
});
for(const field of ['alt','name','type','url'])test(`conflicting ${field} for a repeated image ID poisons that ID in either order`,()=>{
 const a=media(),b=media('a',{[field]:field==='type'?'image/jpeg':field==='url'?'/api/planner/media/b':'Different'});
 for(const images of [[a,b],[b,a]]){const list=savedImageCatalog(state([...images.map((m,i)=>post('p'+i,m)),post('valid',media('safe'))]));assert.deepEqual(list.items.map(x=>x.id),['safe']);assert.equal(list.hasUnavailableImages,true);}
});
test('changed/deleted references and availability fail before adoption while consistent reuse returns a clone',()=>{
 const selected=media(),data=state([post('p',selected)]),copy=resolveSavedImage(data,selected);assert.deepEqual(copy,selected);assert.notEqual(copy,selected);
 assert.throws(()=>resolveSavedImage(data,selected,{available:false}));assert.throws(()=>resolveSavedImage(state([]),selected));assert.throws(()=>resolveSavedImage(state([post('p',media('a',{alt:'Changed'}))]),selected));
});
test('catalog does not serialize secrets or HTML; text labels are bounded and plain data',()=>{
 const data=state([post('p',media('a',{name:'<img onerror="bad">',alt:'<script>bad</script>'}),{title:'<svg/onload=bad>'.repeat(20),privateField:'SECRET'})]);const list=savedImageCatalog(data);assert.equal(list.items[0].sourceTitles[0].length,100);assert.equal(list.items[0].media.alt,'<script>bad</script>');assert.ok(!JSON.stringify(list).includes('SECRET'));assert.equal(list.items.length,1);
});
function decoder(){const images=[],timers=new Map();let serial=0;class ImageClass{constructor(){images.push(this)}set src(value){this.url=value}get src(){return this.url}}
 return {images,timers,options:{ImageClass,setTimer(fn,ms){const id=++serial;timers.set(id,{fn,ms});return id},clearTimer:id=>timers.delete(id)}}}
test('decode reads only the validated private URL and resolves after bounded valid dimensions',async()=>{
 const h=decoder(),p=decodeSavedImage(media(),h.options),img=h.images[0];assert.equal(img.url,'/api/planner/media/a');assert.equal([...h.timers.values()][0].ms,15000);Object.assign(img,{naturalWidth:1200,naturalHeight:800});img.onload();await p;assert.equal(h.timers.size,0);assert.equal(img.onload,null);assert.equal(img.onerror,null);
});
for(const [w,h] of [[0,1],[1,0],[-1,5],[1.2,4],[16385,1],[1,16385],[10000,4001],[Infinity,20]])test(`decode rejects invalid/large geometry ${w}x${h}`,async()=>{
 const d=decoder(),p=decodeSavedImage(media(),d.options),img=d.images[0];Object.assign(img,{naturalWidth:w,naturalHeight:h});img.onload();await assert.rejects(p,/groß|gelesen/);assert.equal(img.url,'');assert.equal(d.timers.size,0);
});
test('timeout and late load cannot adopt an image',async()=>{
 const h=decoder(),p=decodeSavedImage(media(),h.options),img=h.images[0],late=img.onload;[...h.timers.values()][0].fn();await assert.rejects(p,/rechtzeitig/);Object.assign(img,{naturalWidth:20,naturalHeight:20});late();assert.equal(img.url,'');assert.equal(img.onload,null);assert.equal(h.timers.size,0);
});
test('abort before or during read cancels without late settlement',async()=>{
 for(const before of [true,false]){const h=decoder(),controller=new AbortController();if(before)controller.abort();const p=decodeSavedImage(media(),{...h.options,signal:controller.signal});if(!before)controller.abort();await assert.rejects(p,/abgebrochen/);assert.equal(h.images[0].url,'');assert.equal(h.timers.size,0);assert.equal(h.images[0].onload,null);}
});
test('bad reference never constructs Image or reads data; decode failure is generic',async()=>{
 const h=decoder();await assert.rejects(decodeSavedImage(media('a',{url:'https://evil.test'}),h.options),/Ungültige/);assert.equal(h.images.length,0);const p=decodeSavedImage(media(),h.options);h.images[0].onerror({message:'SECRET'});await assert.rejects(p,e=>!e.message.includes('SECRET'));assert.equal(h.timers.size,0);
});
