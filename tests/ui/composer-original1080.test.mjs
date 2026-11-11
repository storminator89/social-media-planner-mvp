import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {inspectComposerOriginal,inspectLargeOriginalMP4,validateDecodedOriginal} from '../../public/composer-original-profile.js';
import {inspectStillSource} from '../../public/video-still-model.js';import {prepareComposerVideo} from '../../public/composer-video.js';
const fixture=n=>new Uint8Array(readFileSync(new URL('../original1080/fixtures/'+n+'.mp4',import.meta.url)));
const land=fixture('landscape'),portrait=fixture('portrait');
function patch(name,offset,value,size=4){const b=land.slice(),i=Buffer.from(b).indexOf(name,name==='avc1'?Buffer.from(b).indexOf('stsd'):0)+4+offset;assert.ok(i>4);const d=new DataView(b.buffer);if(size===4)d.setUint32(i,value);else if(size===2)d.setUint16(i,value);else d.setUint8(i,value);return b;}
function deps(w=1920,h=1080,{event='loadeddata',duration=2}={}){const video=new EventTarget(),revoked=[],created=[];let paused=0;Object.assign(video,{videoWidth:w,videoHeight:h,duration,pause(){paused++;},removeAttribute(){this.src='';},load(){if(this.src&&event)queueMicrotask(()=>this.dispatchEvent(new Event(event)));}});return{video,created,revoked,get paused(){return paused;},document:{createElement:()=>video},URL:{createObjectURL:b=>(created.push(b),'blob:original'),revokeObjectURL:u=>revoked.push(u)}};}
for(const [name,b,w,h]of[['landscape',land,1920,1080],['portrait',portrait,1080,1920]])test(`${name} bounded original only; unchanged bytes; decoder teardown before return`,async()=>{const info=inspectComposerOriginal(b,'video/mp4');assert.deepEqual(info,{width:w,height:h,type:'video/mp4',original1080:true});assert.throws(()=>inspectStillSource(b,'video/mp4'));const d=deps(w,h);const result=await prepareComposerVideo(new File([b],name+'.mp4',{type:'video/mp4'}),d);assert.deepEqual(new Uint8Array(Buffer.from(result.dataUrl.split(',')[1],'base64')),b);assert.equal(d.paused,1);assert.equal(d.video.src,'');assert.deepEqual(d.revoked,['blob:original']);});
for(const [label,b]of[
 ['rotation matrix',patch('tkhd',40,0)],['scaled track',patch('tkhd',76,1280*65536)],
 ['non-square pasp',patch('pasp',0,2)],['stsd geometry contradiction',patch('avc1',24,1280,2)],
 ['HEVC sample entry',(()=>{const b=land.slice(),p=Buffer.from(b).indexOf('avc1',Buffer.from(b).indexOf('stsd'));b.set(Buffer.from('hvc1'),p);return b;})()],
 ['too high decode rate',patch('stts',12,128)],['huge sample count',patch('stts',8,0xffffffff)],
 ['VFR presentation cadence',patch('ctts',12,1025)],['external reference',patch('url ',0,0)],
 ['outside mdat offset',patch('stco',8,0xffffffff)],['invalid sample extent',patch('stsz',12,0xffffffff)],
 ['edit rebasing',patch('elst',12,0)],['non-LC AAC',patch('esds',0,1)],
 ['truncated file',land.slice(0,land.length-100)],['declared oversized box',patch('moov',-8,0xffffffff)],
])test(`larger profile rejects ${label} before any decoder`,async()=>{assert.throws(()=>inspectComposerOriginal(b,'video/mp4'));const d=deps();await assert.rejects(prepareComposerVideo(new File([b],'bad.mp4',{type:'video/mp4'}),d));assert.equal(d.created.length,0);});
test('SPS higher bitdepth/profile and SEI replacement reject',()=>{for(const kind of ['profile','hdr-sei']){const b=land.slice();if(kind==='profile'){const p=Buffer.from(b).indexOf('avcC')+4;b[p+1]=110;}else{const p=Buffer.from(b).indexOf(Buffer.from([6,5,255]));assert.ok(p>0);b[p+1]=137;}assert.throws(()=>inspectLargeOriginalMP4(b));}});
test('bounds guard precedes parsing even if file arrayBuffer lies',async()=>{const d=deps();await assert.rejects(prepareComposerVideo({name:'x.mp4',type:'video/mp4',size:1,arrayBuffer:async()=>new ArrayBuffer(8*1024*1024+1)},d));assert.equal(d.created.length,0);});
test('existing720 MP4 path unchanged',()=>{const b=new Uint8Array(readFileSync(new URL('../video-still/fixtures/source-av.mp4',import.meta.url)));assert.deepEqual(inspectComposerOriginal(b,'video/mp4'),inspectStillSource(b,'video/mp4'));});
test('new profile rejects swapped/different decoded dimensions and invalid duration',async()=>{for(const d of [deps(1080,1920),deps(1280,720),deps(1920,1080,{duration:601}),deps(1920,1080,{duration:Infinity}),deps(1920,1080,{event:'error'})]){await assert.rejects(prepareComposerVideo(new File([land],'x.mp4',{type:'video/mp4'}),d));assert.equal(d.revoked.length,1);}});
test('abort/stale during file read produces no video',async()=>{for(const mode of ['abort','stale']){let finish;const controller=new AbortController();let current=true;const d=deps(),job=prepareComposerVideo({type:'video/mp4',size:land.length,arrayBuffer:()=>new Promise(r=>finish=r)},{...d,signal:controller.signal,current:()=>current});await Promise.resolve();if(mode==='abort')controller.abort();else current=false;finish(land.buffer);assert.equal(await job,null);assert.equal(d.created.length,0);}});
test('abort during decode releases decoder and never adopts',async()=>{const d=deps(1920,1080,{event:null}),controller=new AbortController();const job=prepareComposerVideo(new File([land],'x.mp4',{type:'video/mp4'}),{...d,signal:controller.signal});while(!d.created.length)await new Promise(r=>setTimeout(r,0));controller.abort();await assert.rejects(job,/abgebrochen/);assert.equal(d.video.src,'');assert.equal(d.revoked.length,1);});
test('repeated same-file preparation preserves hashes and releases every temporary URL',async()=>{const d=deps(),file=new File([land],'same.mp4',{type:'video/mp4'});assert.deepEqual(await prepareComposerVideo(file,d),await prepareComposerVideo(file,d));assert.equal(d.created.length,2);assert.equal(d.revoked.length,2);});
function patchLast(name,offset,value){const b=land.slice(),p=Buffer.from(b).lastIndexOf(name)+4+offset;assert.ok(p>4);new DataView(b.buffer).setUint32(p,value);return b;}
for(const [label,b]of[
 ['audio external dref',patchLast('url ',0,0)],['audio outside owned mdat',patchLast('stco',8,0xffffffff)],
 ['audio oversized sample',patchLast('stsz',12,0xffffffff)],['audio too many samples',patchLast('stts',8,0xffffffff)],
 ['audio arbitrary roll group',patchLast('sgpd',4,0x61626364)],['audio unsupported edit',patchLast('elst',16,0)],
 ['movie rotation',patch('mvhd',36,0)],['ctts unsigned overflow',patch('ctts',12,0xffffffff)],
 ['huge decode delta',patch('stts',12,0xffffffff)],
])test(`expanded scope rejects ${label}`,()=>assert.throws(()=>inspectComposerOriginal(b,'video/mp4')));
test('PPS/SPS IDs and slice PPS ID must refer to inspected configuration',()=>{
 const pps=land.slice(),av=Buffer.from(pps).indexOf('avcC')+4,dv=new DataView(pps.buffer);let p=av+6;p+=2+dv.getUint16(p);assert.equal(pps[p++],1);p+=2;pps[p+1]&=127;assert.throws(()=>inspectLargeOriginalMP4(pps));
});
