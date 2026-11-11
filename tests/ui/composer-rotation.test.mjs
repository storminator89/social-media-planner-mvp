import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {inspectComposerOriginal} from '../../public/composer-original-profile.js';import {prepareComposerVideo} from '../../public/composer-video.js';import {inspectStillSource} from '../../public/video-still-model.js';
const fixture=a=>new Uint8Array(readFileSync(new URL('../rotation/fixtures/'+a+'.mp4',import.meta.url)));
function deps(w,h){const video=new EventTarget(),created=[],revoked=[];Object.assign(video,{videoWidth:w,videoHeight:h,duration:2,pause(){},removeAttribute(){this.src='';},load(){if(this.src)queueMicrotask(()=>this.dispatchEvent(new Event('loadeddata')));}});return{video,created,revoked,document:{createElement:()=>video},URL:{createObjectURL:b=>(created.push(b),'blob:rotation'),revokeObjectURL:u=>revoked.push(u)}};}
for(const angle of [90,180,270])test(`canonical${angle} rotation accepted only with matching native displayed dimensions; original bytes retained`,async()=>{const b=fixture('rotate-'+angle),w=angle===180?1920:1080,h=angle===180?1080:1920;assert.deepEqual(inspectComposerOriginal(b,'video/mp4'),{width:w,height:h,rotationDegrees:angle,encodedWidth:1920,encodedHeight:1080,type:'video/mp4',original1080:true});assert.throws(()=>inspectStillSource(b,'video/mp4'));const d=deps(w,h),item=await prepareComposerVideo(new File([b],'rotate-'+angle+'.mp4',{type:'video/mp4'}),d);assert.deepEqual(new Uint8Array(Buffer.from(item.dataUrl.split(',')[1],'base64')),b);assert.equal(d.video.src,'');assert.deepEqual(d.revoked,['blob:rotation']);const wrong=deps(h,w);await assert.rejects(prepareComposerVideo(new File([b],'wrong.mp4',{type:'video/mp4'}),wrong));assert.deepEqual(wrong.revoked,['blob:rotation']);});
function matrix(values,{movie=false}={}){const b=fixture('corners'),p=Buffer.from(b).indexOf(movie?'mvhd':'tkhd')+4+(movie?36:40),dv=new DataView(b.buffer);values.forEach((v,i)=>dv.setInt32(p+i*4,v));return b;}
for(const [name,m]of[
 ['reflection',[-65536,0,0,0,65536,0,0,0,1073741824]],
 ['shear',[65536,100,0,0,65536,0,0,0,1073741824]],
 ['scale',[131072,0,0,0,65536,0,0,0,1073741824]],
 ['off-by-one translation',[0,-65536,0,65536,0,0,0,1920*65536+1,1073741824]],
 ['arbitrary translation',[0,-65536,0,65536,0,0,65536,0,1073741824]],
 ['perspective',[0,-65536,1,65536,0,0,0,0,1073741824]],
 ['non-unit homogeneous',[0,-65536,0,65536,0,0,0,0,536870912]],
 ['almost90',[1,-65536,0,65536,0,0,0,0,1073741824]],
])test(`reject ${name} before decoder without changing source`,async()=>{const b=matrix(m),before=b.slice(),d=deps(1080,1920);assert.throws(()=>inspectComposerOriginal(b,'video/mp4'));await assert.rejects(prepareComposerVideo(new File([b],name+'.mp4',{type:'video/mp4'}),d));assert.equal(d.created.length,0);assert.deepEqual(b,before);});
test('movie matrix rotation still rejects, preventing compounded transform',()=>assert.throws(()=>inspectComposerOriginal(matrix([0,-65536,0,65536,0,0,0,0,1073741824],{movie:true}),'video/mp4')));
test('identity asymmetric source remains accepted, including escaped slice-prefix boundary',()=>{const b=fixture('corners');assert.deepEqual(inspectComposerOriginal(b,'video/mp4'),{width:1920,height:1080,type:'video/mp4',original1080:true});assert.ok(Buffer.from(b).includes(Buffer.from([0,0,3])));});
test('rotation does not relax VFR/SPS/sample bounds',()=>{for(const name of ['stts','stco']){const b=fixture('rotate-90'),p=Buffer.from(b).indexOf(name)+4+8;new DataView(b.buffer).setUint32(p,0xffffffff);assert.throws(()=>inspectComposerOriginal(b,'video/mp4'));}});
test('bounded slice-prefix lookahead accepts real escape at artificial byte63 but rejects invalid following byte',()=>{const b=fixture('corners'),offset=21072;assert.deepEqual(Array.from(b.slice(offset+61,offset+64)),[0,0,3]);assert.ok(b[offset+64]<=3);assert.ok(inspectComposerOriginal(b,'video/mp4'));b[offset+64]=4;assert.throws(()=>inspectComposerOriginal(b,'video/mp4'));});
