import {inspectMP4Tracks} from './video-still-mp4-inspection.js';
import {inspectStillSource,validateDecodedStill} from './video-still-model.js';

// Only the new >720p original-import path uses this conservative profile.
// Metadata preflight is not a payload decoder. No transformation or remux occurs.
const fail=()=>{throw Error('Dieses größere MP4 wird nicht unterstützt: nur kompatible H.264/AAC-Dateien mit 8-Bit, quadratischen Pixeln, mit unterstützter Vierteldrehung, bis 1080p und kompatibler Bildrate bis 30 Bilder/s.');};
const failVFR=()=>{const error=Error('Dieses Video mit variabler Bildrate wird hier nicht unterstützt. Original unverändert.');error.code='UNSUPPORTED_VFR';throw error;};
export const ORIGINAL_MP4_LIMITS=Object.freeze({side:1920,pixels:1920*1080,bytes:8*1024*1024,duration:600});
function inspectMP4Metadata(bytes){try{return inspectMP4Tracks(bytes);}catch{throw Error('Die Containerstruktur dieser Datei wird nicht unterstützt oder ist unvollständig.');}}
function dimensions(w,h){if(!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||w<1||h<1||w>1920||h>1920||w*h>1920*1080)fail();}

function bitReader(nal,maxBytes=nal.length){
 const rb=[];let zeros=0;for(let i=1;i<Math.min(nal.length,maxBytes);i++){const b=nal[i];if(zeros===2&&b===3){if(i+1>=nal.length||nal[i+1]>3)fail();zeros=0;continue;}rb.push(b);zeros=b===0?zeros+1:0;}
 let bit=0;const read=n=>{if(n>32||bit+n>rb.length*8)fail();let v=0;while(n--)v=v*2+((rb[bit>>3]>>(7-(bit++&7)))&1);return v;};
 const ue=()=>{let n=0;while(read(1)===0)if(++n>24)fail();return 2**n-1+read(n);};const se=()=>{const v=ue();return v&1?(v+1)/2:-v/2;};
 const trailing=()=>{if(read(1)!==1)fail();while(bit<rb.length*8)if(read(1))fail();};
 const more=()=>{if(bit>=rb.length*8)return false;for(let p=bit+1;p<rb.length*8;p++)if((rb[p>>3]>>(7-(p&7)))&1)return true;return !((rb[bit>>3]>>(7-(bit&7)))&1);};
 return{read,ue,se,trailing,more};
}
function validatePPS(nal){
 if(nal.length<2||nal.length>4096||(nal[0]&0x9f)!==8)fail();const b=bitReader(nal);
 if(b.ue()!==0||b.ue()!==0)fail();b.read(1);b.read(1);if(b.ue()!==0||b.ue()>3||b.ue()>3)fail();b.read(1);if(b.read(2)>2)fail();if(Math.abs(b.se())>26||Math.abs(b.se())>26||Math.abs(b.se())>12)fail();b.read(1);b.read(1);if(b.read(1))fail();
 if(b.more()){b.read(1);if(b.read(1)||Math.abs(b.se())>12)fail();}b.trailing();
}
function validateSlicePrefix(nal){const b=bitReader(nal,64);const first=b.ue(),kind=b.ue(),pps=b.ue();if(first>8160||kind>9||pps!==0)fail();return kind%5;}

function spsMetadata(nal){
 if(nal.length<5||nal.length>4096||(nal[0]&0x9f)!==7)fail();
 const rb=[];let zeros=0;
 for(let i=1;i<nal.length;i++){const b=nal[i];if(zeros===2&&b===3){if(i+1>=nal.length||nal[i+1]>3)fail();zeros=0;continue;}rb.push(b);zeros=b===0?zeros+1:0;}
 let bit=0;
 function read(n){if(n>32||bit+n>rb.length*8)fail();let v=0;while(n--)v=v*2+((rb[bit>>3]>>(7-(bit++&7)))&1);return v;}
 function ue(){let n=0;while(read(1)===0){if(++n>24)fail();}return (2**n-1)+read(n);}
 function se(){const v=ue();return v&1?(v+1)/2:-v/2;}
 const profile=read(8),constraints=read(8),level=read(8);if(![66,77,100].includes(profile)||(constraints&3)||level>40||level<10||ue()!==0)fail();
 if(profile===100){if(ue()!==1||ue()!==0||ue()!==0||read(1)||read(1))fail();}
 if(ue()>12)fail();const poc=ue();if(poc===0){if(ue()>12)fail();}else if(poc===1){read(1);se();se();const n=ue();if(n>255)fail();for(let i=0;i<n;i++)se();}else if(poc!==2)fail();
 const refs=ue();if(refs>4||read(1))fail();const mbw=ue()+1,mbh=ue()+1;if(mbw>120||mbh>120||mbw*mbh*256>1920*1088||read(1)!==1)fail();read(1);
 let left=0,right=0,top=0,bottom=0;if(read(1)){left=ue();right=ue();top=ue();bottom=ue();}
 const width=mbw*16-(left+right)*2,height=mbh*16-(top+bottom)*2;dimensions(width,height);
 if(read(1)){
  if(read(1)){const idc=read(8);if(idc===255){const a=read(16),b=read(16);if(!a||a!==b)fail();}else if(idc!==1)fail();}
  if(read(1))read(1);
  if(read(1)){read(3);read(1);if(read(1)){if(![1,2,6].includes(read(8))||![1,2,6].includes(read(8))||![1,2,6].includes(read(8)))fail();}}
  if(read(1)){if(ue()>5||ue()>5)fail();}
  if(read(1)){const units=read(32),scale=read(32),fixed=read(1);if(!units||!scale||scale/(2*units)>30)fail();}
  // HRD and custom bitstream restrictions are outside this initial profile.
  if(read(1)||read(1))fail();read(1);
  if(read(1)){read(1);if(ue()>16||ue()>16||ue()>16||ue()>16)fail();const reorder=ue(),buffer=ue();if(reorder>4||buffer>4||buffer<refs||reorder>buffer)fail();}
 }
 if(read(1)!==1)fail();while(bit<rb.length*8)if(read(1))fail();
 return {width,height,profile,level,constraints};
}

function inspectLargeMP4(bytes){
 if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>ORIGINAL_MP4_LIMITS.bytes)fail();
 const info=inspectMP4Metadata(bytes),video=info.tracks.find(t=>t.type===1);dimensions(video.width,video.height);
 if(info.fragmentInfo||video.sampleEntry!=='avc1'||info.tracks.some(t=>t.type===2&&(t.channelConfiguration>2||t.sampleRate>48000)))fail();
 const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let budget=10000;
 function boxes(start,end){const out=[];for(let p=start;p<end;){if(--budget<0||p+8>end)fail();let size=dv.getUint32(p),head=8;const name=String.fromCharCode(...bytes.subarray(p+4,p+8));if(size===1){if(p+16>end)fail();size=dv.getUint32(p+8)*4294967296+dv.getUint32(p+12);head=16;}else if(size===0)size=end-p;if(!Number.isSafeInteger(size)||size<head||p+size>end)fail();out.push({name,data:p+head,end:p+size});p+=size;}return out;}
 function one(list,name){const a=list.filter(b=>b.name===name);if(a.length!==1)fail();return a[0];}
 function children(b){return boxes(b.data,b.end);}
 function need(p,n,end){if(p+n>end)fail();}
 let rotationDegrees=0,variableFrameRate=false;const timingTracks=[];
 const moov=one(boxes(0,bytes.length),'moov'),sampleRanges=[];
 const mvhd=one(children(moov),'mvhd'),mversion=bytes[mvhd.data];if(mversion>1)fail();const mm=mvhd.data+(mversion===1?48:36);need(mm,36,mvhd.end);for(const [i,v] of [65536,0,0,0,65536,0,0,0,1073741824].entries())if(dv.getInt32(mm+i*4)!==v)fail();
 for(const trak of children(moov).filter(b=>b.name==='trak')){
  const tc=children(trak);if(tc.some(b=>!['tkhd','edts','mdia'].includes(b.name)))fail();const mdia=children(one(tc,'mdia')),hdlr=one(mdia,'hdlr');need(hdlr.data,12,hdlr.end);if(dv.getUint32(hdlr.data+8)!==0x76696465){
  if(mdia.some(b=>!['mdhd','hdlr','minf'].includes(b.name)))fail();
  const amdia=mdia,aminf=children(one(amdia,'minf')),astbl=children(one(aminf,'stbl'));
  if(astbl.some(b=>!['stsd','stts','stsc','stsz','stco','co64','sgpd','sbgp'].includes(b.name)))fail();
  const astsd=one(astbl,'stsd'),ae=one(boxes(astsd.data+8,astsd.end),'mp4a');if(dv.getUint16(ae.data+6)!==1)fail();
  const adref=one(children(one(aminf,'dinf')),'dref');need(adref.data,8,adref.end);if(dv.getUint32(adref.data)!==0||dv.getUint32(adref.data+4)!==1)fail();const au=one(boxes(adref.data+8,adref.end),'url ');if(au.end-au.data!==4||dv.getUint32(au.data)!==1)fail();
  const amdhd=one(amdia,'mdhd'),av=bytes[amdhd.data];if(av>1)fail();const atp=amdhd.data+(av===1?20:12);need(atp,4,amdhd.end);const ats=dv.getUint32(atp);if(ats<7350||ats>48000)fail();
  const astts=one(astbl,'stts');need(astts.data,8,astts.end);const anr=dv.getUint32(astts.data+4);if(dv.getUint32(astts.data)!==0||!anr||anr>2||astts.end-astts.data!==8+anr*8)fail();let acount=0,aduration=0;
  for(let p=astts.data+8;p<astts.end;p+=8){const n=dv.getUint32(p),d=dv.getUint32(p+4);if(!n||!d||d>1024||(p<astts.end-8&&d!==1024)||(d!==1024&&n!==1))fail();acount+=n;aduration+=n*d;}if(acount>28127||aduration/ats>601)fail();
  const groups=astbl.filter(b=>['sgpd','sbgp'].includes(b.name));if(groups.length){const g=one(groups,'sgpd'),m=one(groups,'sbgp');if(g.end-g.data!==18||dv.getUint32(g.data)!==0x01000000||dv.getUint32(g.data+4)!==0x726f6c6c||dv.getUint32(g.data+8)!==2||dv.getUint32(g.data+12)!==1||dv.getInt16(g.data+16)!==-1||m.end-m.data!==20||dv.getUint32(m.data)!==0||dv.getUint32(m.data+4)!==0x726f6c6c||dv.getUint32(m.data+8)!==1||dv.getUint32(m.data+12)!==acount||dv.getUint32(m.data+16)!==1)fail();}
  if(astbl.some(b=>['ctts','senc','saiz','saio'].includes(b.name)))fail();
  const aedts=tc.filter(b=>b.name==='edts');if(aedts.length>1)fail();if(aedts.length){const e=one(children(aedts[0]),'elst');if(e.end-e.data!==20||dv.getUint32(e.data)!==0||dv.getUint32(e.data+4)!==1||dv.getInt32(e.data+12)<0||dv.getInt32(e.data+12)>2048||dv.getUint32(e.data+16)!==65536)fail();}
  timingTracks.push({type:'audio',tc,mdhd:amdhd,timescale:ats,total:aduration,codecRate:info.tracks.find(t=>t.type===2).sampleRate,entryRate:dv.getUint32(ae.data+24)});
  const az=one(astbl,'stsz');need(az.data,12,az.end);if(dv.getUint32(az.data)!==0||dv.getUint32(az.data+8)!==acount)fail();const asize=dv.getUint32(az.data+4);if(az.end-az.data!==12+(asize?0:acount*4))fail();
  const acs=astbl.filter(b=>['stco','co64'].includes(b.name));if(acs.length!==1)fail();const ac=acs[0];need(ac.data,8,ac.end);const anc=dv.getUint32(ac.data+4),astride=ac.name==='co64'?8:4;if(dv.getUint32(ac.data)!==0||!anc||anc>acount||ac.end-ac.data!==8+anc*astride)fail();
  const asc=one(astbl,'stsc');need(asc.data,8,asc.end);const ar=dv.getUint32(asc.data+4);if(dv.getUint32(asc.data)!==0||!ar||ar>anc||asc.end-asc.data!==8+ar*12)fail();const ars=[];for(let p=asc.data+8;p<asc.end;p+=12){const first=dv.getUint32(p),samples=dv.getUint32(p+4);if(first<1||first>anc||(!ars.length&&first!==1)||(ars.length&&first<=ars.at(-1).first)||!samples||samples>acount||dv.getUint32(p+8)!==1)fail();ars.push({first,samples});}
  const mdat=boxes(0,bytes.length).filter(b=>b.name==='mdat');let ai=0,ari=0,alast=0;
  for(let i=1;i<=anc;i++){while(ari+1<ars.length&&ars[ari+1].first<=i)ari++;const p=ac.data+8+(i-1)*astride;let offset=astride===4?dv.getUint32(p):dv.getUint32(p)*4294967296+dv.getUint32(p+4);if(!Number.isSafeInteger(offset)||offset<alast)fail();for(let j=0;j<ars[ari].samples;j++){if(ai>=acount)fail();const size=asize||dv.getUint32(az.data+12+ai*4),end=offset+size;if(!size||size>8192||!mdat.some(m=>offset>=m.data&&end<=m.end))fail();sampleRanges.push([offset,end]);offset=end;alast=end;ai++;}}if(ai!==acount)fail();
  continue;

}
  const tk=one(tc,'tkhd'),version=bytes[tk.data];if(version>1)fail();const matrix=tk.data+(version===1?52:40);need(matrix,44,tk.end);
  // Matrix values are exact fixed-point integers. Only pure rotations around
  // origin, or exact dimension-derived translations of the full visible rectangle.
  // Never normalize arbitrary translation/reflection/scaling/perspective.
  const matrices=[
   [0,[65536,0,0,0,65536,0,0,0,1073741824]],
   [90,[0,-65536,0,65536,0,0,0,0,1073741824]],
   [180,[-65536,0,0,0,-65536,0,0,0,1073741824]],
   [270,[0,65536,0,-65536,0,0,0,0,1073741824]],
  ];
  // W/H are subsequently checked against tkhd and SPS-cropped sample geometry.
  // Use visible dimensions, never padded coded dimensions or swapped output axes.
  const translated=matrices.filter(([angle])=>angle!==0).map(([angle,values])=>{
   const v=[...values];v[6]=(angle===180?video.width:angle===270?video.height:0)*65536;
   v[7]=(angle===90?video.width:angle===180?video.height:0)*65536;return [angle,v];
  });
  const rotation=[...matrices,...translated].find(([,values])=>values.every((value,i)=>dv.getInt32(matrix+i*4)===value));if(!rotation)fail();rotationDegrees=rotation[0];
  if(dv.getUint32(matrix+36)!==video.width*65536||dv.getUint32(matrix+40)!==video.height*65536)fail();
  if(mdia.some(b=>!['mdhd','hdlr','minf'].includes(b.name)))fail();
  const stbl=children(one(children(one(mdia,'minf')),'stbl'));if(stbl.some(b=>!['stsd','stts','ctts','stss','stsc','stsz','stco','co64'].includes(b.name)))fail();const stsd=one(stbl,'stsd'),entry=one(boxes(stsd.data+8,stsd.end),'avc1'),extras=boxes(entry.data+78,entry.end);
  for(const ex of extras){if(!['avcC','pasp','btrt','colr'].includes(ex.name))fail();if(ex.name==='pasp'){need(ex.data,8,ex.end);const a=dv.getUint32(ex.data),b=dv.getUint32(ex.data+4);if(ex.end-ex.data!==8||!a||a!==b)fail();}if(ex.name==='colr'){const n=dv.getUint32(ex.data);if(![0x6e636c78,0x6e636c63].includes(n)||ex.end-ex.data!==(n===0x6e636c78?11:10))fail();for(let p=ex.data+4;p<ex.data+10;p+=2)if(![1,2,6].includes(dv.getUint16(p)))fail();}}
  if(extras.filter(x=>x.name==='pasp').length>1||extras.filter(x=>x.name==='colr').length>1)fail();
  const avcc=one(extras,'avcC');let p=avcc.data;if((bytes[p+4]&255)!==255||(bytes[p+5]&255)!==225)fail();p+=6;need(p,2,avcc.end);const length=dv.getUint16(p);p+=2;need(p,length,avcc.end);const sps=spsMetadata(bytes.subarray(p,p+length));if(sps.width!==video.width||sps.height!==video.height||sps.constraints!==bytes[avcc.data+2]||sps.profile!==bytes[avcc.data+1]||sps.level!==bytes[avcc.data+3])fail();p+=length;need(p,3,avcc.end);if(bytes[p++]!==1)fail();const plen=dv.getUint16(p);p+=2;need(p,plen,avcc.end);if(!plen||(bytes[p]&0x9f)!==8)fail();validatePPS(bytes.subarray(p,p+plen));p+=plen;
  if(p!==avcc.end){if(sps.profile!==100||avcc.end-p!==4||bytes[p]!==253||bytes[p+1]!==248||bytes[p+2]!==248||bytes[p+3]!==0)fail();}
  const mdhd=one(mdia,'mdhd'),mv=bytes[mdhd.data];if(mv>1)fail();const ts=mdhd.data+(mv===1?20:12);need(ts,4,mdhd.end);const timescale=dv.getUint32(ts);
  const stts=one(stbl,'stts');need(stts.data,8,stts.end);const timingRunCount=dv.getUint32(stts.data+4);
  if(dv.getUint32(stts.data)!==0||!timingRunCount||timingRunCount>18000||stts.end-stts.data!==8+timingRunCount*8||!timescale||timescale>1000000)fail();
  const deltas=[],dts=[];let totalTicks=0,delta=0;
  for(let p=stts.data+8;p<stts.end;p+=8){const n=dv.getUint32(p),d=dv.getUint32(p+4);if(!n||!d||d>1000000||d*30<timescale||deltas.length+n>18000)fail();delta=Math.max(delta,d);for(let i=0;i<n;i++){dts.push(totalTicks);deltas.push(d);totalTicks+=d;if(totalTicks>600*timescale)fail();}}
  const count=deltas.length;variableFrameRate=deltas.some(d=>d!==deltas[0]);
  // This first VFR profile excludes reordering. No decode-duration assumptions
  // are made for B-frame VFR; the established CFR/B-frame route stays intact.
  if(!variableFrameRate&&timingRunCount!==1)fail();
  const offsets=new Float64Array(count),cttsList=stbl.filter(b=>b.name==='ctts');
  if(cttsList.length>1)fail();
  if(cttsList.length){const c=cttsList[0];need(c.data,8,c.end);const version=bytes[c.data],runs=dv.getUint32(c.data+4);if(version>1||(dv.getUint32(c.data)&0xffffff)||runs>count||c.end-c.data!==8+runs*8)fail();let i=0;for(let p=c.data+8;p<c.end;p+=8){const n=dv.getUint32(p),offset=version?dv.getInt32(p+4):dv.getUint32(p+4);if(!n||i+n>count||Math.abs(offset)>8*delta)fail();offsets.fill(offset,i,i+n);i+=n;}if(i!==count)fail();}
  if(variableFrameRate&&(offsets[0]<0||offsets.some(o=>o!==offsets[0])))failVFR();
  const pts=Array.from(offsets,(o,i)=>dts[i]+o).sort((a,b)=>a-b);
  for(let i=1;i<count;i++){const step=pts[i]-pts[i-1];if(step<=0||step*30<timescale||(!variableFrameRate&&step!==delta))fail();}
  if(variableFrameRate){for(let i=1;i<count;i++)if(pts[i-1]+deltas[i-1]!==pts[i])fail();}
  timingTracks.push({type:'video',tc,mdhd,timescale,total:totalTicks,start:pts[0]});
  const edtsList=tc.filter(b=>b.name==='edts');if(edtsList.length>1)fail();
  if(edtsList.length){const e=one(children(edtsList[0]),'elst');if(e.end-e.data!==20||dv.getUint32(e.data)!==0||dv.getUint32(e.data+4)!==1||dv.getInt32(e.data+12)!==pts[0]||dv.getUint32(e.data+16)!==65536)fail();}
  else if(pts[0]!==0)fail();
  // Enumerate bounded owned samples to reject in-band configuration changes,
  // unsupported SEI (including HDR), external references and unsafe ranges.
  const dinf=one(children(one(mdia,'minf')),'dinf'),dref=one(children(dinf),'dref');need(dref.data,8,dref.end);
  if(dv.getUint32(dref.data)!==0||dv.getUint32(dref.data+4)!==1)fail();const url=one(boxes(dref.data+8,dref.end),'url ');if(url.end-url.data!==4||dv.getUint32(url.data)!==1||dv.getUint16(entry.data+6)!==1)fail();
  const sizes=one(stbl,'stsz');need(sizes.data,12,sizes.end);if(dv.getUint32(sizes.data)!==0||dv.getUint32(sizes.data+8)!==count)fail();const constant=dv.getUint32(sizes.data+4);if(sizes.end-sizes.data!==12+(constant?0:count*4))fail();
  const chunks=stbl.filter(b=>['stco','co64'].includes(b.name));if(chunks.length!==1)fail();const co=chunks[0];need(co.data,8,co.end);const nc=dv.getUint32(co.data+4),stride=co.name==='co64'?8:4;if(dv.getUint32(co.data)!==0||!nc||nc>count||co.end-co.data!==8+nc*stride)fail();
  const sc=one(stbl,'stsc');need(sc.data,8,sc.end);const nr=dv.getUint32(sc.data+4);if(dv.getUint32(sc.data)!==0||!nr||nr>nc||sc.end-sc.data!==8+nr*12)fail();const runs=[];for(let p=sc.data+8;p<sc.end;p+=12){const first=dv.getUint32(p),samples=dv.getUint32(p+4);if(first<1||first>nc||(!runs.length&&first!==1)||(runs.length&&first<=runs.at(-1).first)||!samples||samples>count||dv.getUint32(p+8)!==1)fail();runs.push({first,samples});}
  const mdats=boxes(0,bytes.length).filter(b=>b.name==='mdat');let sample=0,run=0,lastEnd=0,nalBudget=200000;
  for(let i=1;i<=nc;i++){
   while(run+1<runs.length&&runs[run+1].first<=i)run++;
   const cp=co.data+8+(i-1)*stride;let offset=stride===4?dv.getUint32(cp):dv.getUint32(cp)*4294967296+dv.getUint32(cp+4);
   if(!Number.isSafeInteger(offset)||offset<lastEnd)fail();
   for(let j=0;j<runs[run].samples;j++){
    if(sample>=count)fail();const size=constant||dv.getUint32(sizes.data+12+sample*4),end=offset+size;
    if(!size||!mdats.some(m=>offset>=m.data&&end<=m.end))fail();let p=offset,hasSlice=false;
    while(p<end){if(--nalBudget<0)fail();need(p,4,end);const n=dv.getUint32(p);p+=4;need(p,n,end);if(!n||(bytes[p]&128))fail();const type=bytes[p]&31;
     if(type===1||type===5){const kind=validateSlicePrefix(bytes.subarray(p,p+n));if(variableFrameRate&&kind===1)failVFR();hasSlice=true;}
     else if(type===6){
      if(n>65536)fail();
      // Only encoder user-data SEI is accepted, never color/HDR/dynamic metadata.
      const rb=[];let zero=0;for(let k=p+1;k<p+n;k++){const b=bytes[k];if(zero===2&&b===3){if(k+1>=p+n||bytes[k+1]>3)fail();zero=0;continue;}rb.push(b);zero=b===0?zero+1:0;}
      let k=0;while(k<rb.length-1){let kind=0,len=0;while(rb[k]===255){kind+=255;k++;if(k>=rb.length)fail();}kind+=rb[k++];while(rb[k]===255){len+=255;k++;if(k>=rb.length)fail();}len+=rb[k++];if(kind!==5||len<16||k+len>=rb.length)fail();k+=len;}if(k!==rb.length-1||rb[k]!==128)fail();
     }else if(type!==9)fail();p+=n;
    }
    if(!hasSlice)fail();sampleRanges.push([offset,end]);lastEnd=end;offset=end;sample++;
   }
  }
  if(sample!==count)fail();

 }
 // Additional exact mapping checks apply only to the newly supported VFR
 // subset. Original timestamps and decoder priming are never changed.
 if(variableFrameRate){
  const readTime=(box,kind)=>{const v=bytes[box.data];if(v>1||(dv.getUint32(box.data)&0xffffff))failVFR();const p=box.data+(v===1?20:12);need(p,v===1?12:8,box.end);const scale=dv.getUint32(p),duration=v===1?(BigInt(dv.getUint32(p+4))<<32n)+BigInt(dv.getUint32(p+8)):BigInt(dv.getUint32(p+4));if(!scale||scale>1000000||duration<=0n||duration>BigInt(scale)*(kind==='audio'?601n:600n))failVFR();return{scale:BigInt(scale),duration};};
  const movie=readTime(mvhd,'movie');
  for(const track of timingTracks){
   if(track.type==='audio'&&(track.timescale!==track.codecRate||track.entryRate!==track.codecRate*65536))failVFR();
   const media=readTime(track.mdhd,track.type);if(media.scale!==BigInt(track.timescale)||media.duration!==BigInt(track.total))failVFR();
   const tk=one(track.tc,'tkhd'),v=bytes[tk.data];if(v>1)failVFR();const p=tk.data+(v===1?28:20);need(p,v===1?8:4,tk.end);const trackDuration=v===1?(BigInt(dv.getUint32(p))<<32n)+BigInt(dv.getUint32(p+4)):BigInt(dv.getUint32(p));if(trackDuration!==movie.duration)failVFR();
   const edits=track.tc.filter(b=>b.name==='edts');let start=0n,segment=trackDuration;
   if(edits.length){const e=one(children(edits[0]),'elst');if(e.end-e.data!==20||dv.getUint32(e.data)!==0||dv.getUint32(e.data+4)!==1||dv.getUint32(e.data+16)!==65536)failVFR();start=BigInt(dv.getInt32(e.data+12));segment=BigInt(dv.getUint32(e.data+8));}
   if(segment!==movie.duration||start<0n||start>=media.duration||(track.type==='video'?start!==BigInt(track.start):start>2048n))failVFR();
   const difference=(media.duration-(track.type==='audio'?start:0n))*movie.scale-segment*media.scale;
   // At most one movie tick AND one millisecond of quantization; audio may retain one AAC packet of
   // terminal padding. No independent per-track rebase or gap is introduced.
   const allowance=track.type==='audio'?1024n*movie.scale:0n;
   const millisecond=media.scale*movie.scale/1000n,tolerance=millisecond<media.scale?millisecond:media.scale;
   if(difference < -tolerance||difference>allowance+tolerance)failVFR();
  }
 }
 sampleRanges.sort((a,b)=>a[0]-b[0]);for(let i=1;i<sampleRanges.length;i++)if(sampleRanges[i][0]<sampleRanges[i-1][1])fail();
 const swapped=rotationDegrees===90||rotationDegrees===270;
 return Object.freeze({width:swapped?video.height:video.width,height:swapped?video.width:video.height,...(variableFrameRate?{variableFrameRate:true}:{}),...(rotationDegrees?{rotationDegrees,encodedWidth:video.width,encodedHeight:video.height}:{}),type:'video/mp4',original1080:true});
}
export function inspectLargeOriginalMP4(bytes){try{return inspectLargeMP4(bytes);}catch(error){if(error?.code==='UNSUPPORTED_VFR')throw error;fail();}}
export function inspectComposerOriginal(bytes,type){
 if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>ORIGINAL_MP4_LIMITS.bytes)fail();
 if(type!=='video/mp4')return inspectStillSource(bytes,type);
 // Preserve established <=720p acceptance and validation without changing it.
 const info=inspectMP4Metadata(bytes),v=info.tracks.find(t=>t.type===1);
 if(v.width<=1280&&v.height<=1280&&v.width*v.height<=1280*720)return inspectStillSource(bytes,type);
 return inspectLargeOriginalMP4(bytes);
}
export function validateDecodedOriginal(video,info){
 if(!info.original1080)return validateDecodedStill(video,info);
 dimensions(video.videoWidth,video.videoHeight);
 if(video.videoWidth!==info.width||video.videoHeight!==info.height)throw Error('Die dekodierten Bildmaße stimmen nicht mit der geprüften Videospur überein.');
 if(!Number.isFinite(video.duration)||video.duration<=0||video.duration>600)throw Error('Die Videodauer muss lesbar sein und darf höchstens 10 Minuten betragen.');
 return {width:video.videoWidth,height:video.videoHeight};
}
