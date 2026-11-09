/** Bounded ISO-BMFF metadata inspection, not a decoder or a sample-offset validator.
 * Accepts one avc1/avc3 video and at most one mp4a MPEG-4 AAC-LC audio track.
 * Codec strings describe configuration metadata; actual payload decoding is separate.
 */
export function inspectMP4Tracks(bytes) {
 if (!(bytes instanceof Uint8Array) || bytes.length < 16) throw Error('Invalid MP4 bytes');
 const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
 let budget = 10000;
 const fail = message => { throw Error(`Invalid MP4: ${message}`); };
 const need = (p,n,end) => { if (!Number.isSafeInteger(n) || n < 0 || p+n > end) fail('truncated box'); };
 const u32 = p => view.getUint32(p);
 const str = p => String.fromCharCode(...bytes.subarray(p,p+4));
 function boxes(start,end) {
  const out=[];
  for(let p=start;p<end;) {
   if(--budget<0) fail('box limit');
   need(p,8,end); let size=u32(p), header=8;
   const name=str(p+4);
   if(size===1) { need(p,16,end); const high=u32(p+8),low=u32(p+12); size=high*4294967296+low; header=16; }
   else if(size===0) size=end-p;
   if(!Number.isSafeInteger(size)||size<header) fail('invalid box size');
   need(p,size,end); out.push({name,start:p,data:p+header,end:p+size}); p+=size;
  }
  return out;
 }
 function one(list,name,required=true) {
  const found=list.filter(b=>b.name===name);
  if(found.length>1 || (required&&!found.length)) fail(`missing or duplicate ${name}`);
  return found[0];
 }
 function children(b) { return boxes(b.data,b.end); }
 function descriptors(start,end,depth=0) {
  if(depth>4) fail('descriptor nesting limit');
  const out=[];
  for(let p=start;p<end;) {
   if(--budget<0) fail('descriptor limit');
   const tag=bytes[p++]; let length=0,done=false;
   for(let i=0;i<4;i++) { need(p,1,end); const v=bytes[p++]; length=length*128+(v&127); if(!(v&128)){done=true;break;} }
   if(!done) fail('descriptor length'); need(p,length,end);
   out.push({tag,data:p,end:p+length}); p+=length;
  }
  return out;
 }
 function descriptor(list,tag) { const matches=list.filter(d=>d.tag===tag); if(matches.length!==1) fail('missing or duplicate codec descriptor'); return matches[0]; }
 function aac(esds) {
  need(esds.data,4,esds.end); if(u32(esds.data)!==0) fail('esds version/flags');
  const es=descriptor(descriptors(esds.data+4,esds.end),3); need(es.data,3,es.end);
  const flags=bytes[es.data+2]; let p=es.data+3;
  if(flags&128){need(p,2,es.end);p+=2;}
  if(flags&64){need(p,1,es.end);const n=bytes[p++];need(p,n,es.end);p+=n;}
  if(flags&32){need(p,2,es.end);p+=2;}
  const dc=descriptor(descriptors(p,es.end),4); need(dc.data,13,dc.end);
  if(bytes[dc.data]!==0x40 || (bytes[dc.data+1]>>2)!==5) fail('mp4a is not MPEG-4 audio');
  const asc=descriptor(descriptors(dc.data+13,dc.end),5); need(asc.data,2,asc.end);
  if(asc.end-asc.data>64)fail('AAC configuration size limit');
  let bit=asc.data*8;
  function read(n){if(bit+n>asc.end*8)fail('truncated AAC configuration');let value=0;while(n--)value=value*2+((bytes[bit>>3]>>(7-(bit++&7)))&1);return value;}
  let audioObjectType=read(5);if(audioObjectType===31)audioObjectType=32+read(6);
  const frequencyIndex=read(4);const rates=[96000,88200,64000,48000,44100,32000,24000,22050,16000,12000,11025,8000,7350];
  const sampleRate=frequencyIndex===15?read(24):rates[frequencyIndex];const channelConfiguration=read(4);
  if(!sampleRate || !channelConfiguration || channelConfiguration>7)fail('unsupported AAC configuration');
  // Only a fully inspected, ordinary AAC-LC AudioSpecificConfig is accepted.
  // Reject explicit HE-AAC/PS and unsupported GASpecificConfig/PCE variants.
  if(audioObjectType!==2)fail('unsupported AAC audio object type (AAC-LC required)');
  const frameLengthFlag=read(1),dependsOnCoreCoder=read(1),extensionFlag=read(1);
  if(frameLengthFlag||dependsOnCoreCoder||extensionFlag)fail('unsupported AAC GASpecificConfig');
  const remaining=()=>asc.end*8-bit;
  if(remaining()>=11) {
   // An absent sync extension may be represented only by zero padding.
   const sync=read(11);
   if(sync===0x2b7) {
    let extensionType=read(5);if(extensionType===31)extensionType=32+read(6);
    if(extensionType!==5)fail('unsupported AAC sync extension');
    if(read(1))fail('SBR extension is not AAC-LC');
    if(remaining()>=11) {
     const psSync=read(11);
     if(psSync===0x548){if(read(1))fail('PS extension is not AAC-LC');}
     else if(psSync!==0)fail('unsupported AAC trailing extension');
    }
   } else if(sync!==0)fail('unsupported AAC trailing extension');
  }
  // Never silently ignore unparsed nonzero bits (including truncated extensions).
  while(remaining())if(read(1))fail('unsupported AAC trailing configuration');
  return {codec:'mp4a.40.2',audioObjectType:2,sampleRate,channelConfiguration,sbrPresent:false,psPresent:false};
 }
 const top=boxes(0,bytes.length),moov=one(top,'moov'),mdats=top.filter(b=>b.name==='mdat');
 if(!mdats.some(b=>b.end>b.data))fail('missing or empty mdat');
 const trackBoxes=children(moov).filter(b=>b.name==='trak');
 if(!trackBoxes.length||trackBoxes.length>2)fail('unsupported track count');
 const tracks=[],ids=new Set();
 for(const trak of trackBoxes) {
  const tc=children(trak),tkhd=one(tc,'tkhd');need(tkhd.data,4,tkhd.end);
  const version=bytes[tkhd.data];if(version!==0&&version!==1)fail('tkhd version');
  const idOffset=tkhd.data+(version===1?20:12);need(idOffset,4,tkhd.end);const id=u32(idOffset);
  if(!id||ids.has(id))fail('duplicate or invalid track id');ids.add(id);
  const mdia=children(one(tc,'mdia')),hdlr=one(mdia,'hdlr');need(hdlr.data,12,hdlr.end);
  const handler=str(hdlr.data+8),type=handler==='vide'?1:handler==='soun'?2:0;
  if(!type || tracks.some(t=>t.type===type))fail('unknown or duplicate track type');
  const stbl=children(one(children(one(mdia,'minf')),'stbl')),stsd=one(stbl,'stsd');need(stsd.data,8,stsd.end);
  if(u32(stsd.data)!==0||u32(stsd.data+4)!==1)fail('unsupported sample descriptions');
  const entries=boxes(stsd.data+8,stsd.end);if(entries.length!==1)fail('sample description count');
  const entry=entries[0];let track={type,id,sampleEntry:entry.name};
  if(type===1) {
   if(!['avc1','avc3'].includes(entry.name))fail('video is not H.264');
   need(entry.data,78,entry.end);const width=view.getUint16(entry.data+24),height=view.getUint16(entry.data+26);
   if(!width||!height)fail('invalid video dimensions');
   const config=one(boxes(entry.data+78,entry.end),'avcC');need(config.data,7,config.end);
   if(bytes[config.data]!==1)fail('avcC version');
   const nalLengthSize=(bytes[config.data+4]&3)+1;if(nalLengthSize===3)fail('AVC NAL length size');
   let p=config.data+6;const spsCount=bytes[config.data+5]&31;
   function nalUnits(count){for(let i=0;i<count;i++){need(p,2,config.end);const n=view.getUint16(p);p+=2;if(!n)fail('empty AVC parameter set');need(p,n,config.end);p+=n;}}
   nalUnits(spsCount);need(p,1,config.end);const ppsCount=bytes[p++];nalUnits(ppsCount);
   if(entry.name==='avc1'&&(!spsCount||!ppsCount))fail('missing AVC parameter sets');
   const hex=Array.from(bytes.subarray(config.data+1,config.data+4),v=>v.toString(16).padStart(2,'0')).join('');
   track={...track,codec:`${entry.name}.${hex}`,width,height,nalLengthSize};
  } else {
   if(entry.name!=='mp4a')fail('audio is not mp4a');need(entry.data,28,entry.end);
   if(view.getUint16(entry.data+8)!==0)fail('unsupported audio sample entry version');
   const esds=one(boxes(entry.data+28,entry.end),'esds');track={...track,...aac(esds)};
  }
  tracks.push(track);
 }
 if(!tracks.some(t=>t.type===1))fail('missing video track');
 const moofs=top.filter(b=>b.name==='moof');
 let fragmentInfo;
 if(moofs.length) {
  let runs=0,samples=0;
  for(const moof of moofs) {
   const trafs=children(moof).filter(b=>b.name==='traf');if(!trafs.length)fail('empty movie fragment');
   for(const traf of trafs) {
    const list=children(traf),tfhd=one(list,'tfhd');need(tfhd.data,8,tfhd.end);
    if(bytes[tfhd.data]!==0||!ids.has(u32(tfhd.data+4)))fail('unknown fragment track');
    const flags=u32(tfhd.data)&0xffffff;
    let length=8;for(const [flag,size]of [[1,8],[2,4],[8,4],[16,4],[32,4]])if(flags&flag)length+=size;
    need(tfhd.data,length,tfhd.end);
    const truns=list.filter(b=>b.name==='trun');if(!truns.length)fail('missing fragment run');
    for(const run of truns){need(run.data,8,run.end);if(bytes[run.data]>1)fail('trun version');const f=u32(run.data)&0xffffff,count=u32(run.data+4);let stride=0;for(const flag of [256,512,1024,2048])if(f&flag)stride+=4;need(run.data,8+((f&1)?4:0)+((f&4)?4:0)+count*stride,run.end);runs++;samples+=count;}
   }
  }
  if(!samples)fail('empty fragment samples');fragmentInfo={fragmented:true,fragments:moofs.length,runs,samples};
 }
 return {tracks,...(fragmentInfo?{fragmentInfo}:{})};
}
