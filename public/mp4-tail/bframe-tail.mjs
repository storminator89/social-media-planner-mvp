import {simpleAVC} from './simple-avc.mjs';
import {inspectMP4Tracks} from './vendor/video-still-mp4-inspection.js';
import {inspectLargeOriginalMP4} from './vendor/composer-original-profile.js';
const LIMIT=8*1024*1024;
function fail(message='Unsupported MP4 tail profile'){throw new Error(message);}
function u32(n){if(!Number.isSafeInteger(n)||n<0||n>0xffffffff)fail('Integer range');const b=new Uint8Array(4);new DataView(b.buffer).setUint32(0,n);return b;}
const str=s=>Uint8Array.from(s,c=>c.charCodeAt(0));
function join(parts){const size=parts.reduce((n,p)=>n+p.length,0);if(size>LIMIT)fail('Output size');const b=new Uint8Array(size);let p=0;for(const a of parts){b.set(a,p);p+=a.length;}return b;}
const box=(type,...parts)=>{const data=join(parts);return join([u32(data.length+8),str(type),data]);};
const full=(type,...parts)=>box(type,u32(0),...parts);
const gcd=(a,b)=>b?gcd(b,a%b):a;
function lcm(a,b){const n=a/gcd(a,b)*b;if(!Number.isSafeInteger(n)||n>0xffffffff)fail('Timescale LCM');return n;}
function sliceKind(nal){const a=[];let zeros=0;for(let i=1;i<Math.min(nal.length,64);i++){const v=nal[i];if(zeros===2&&v===3){if(i+1>=nal.length||nal[i+1]>3)fail('NAL escape');zeros=0;continue;}a.push(v);zeros=v===0?zeros+1:0;}let pos=0;const bit=()=>{if(pos>=a.length*8)fail('Slice prefix');return(a[pos>>3]>>(7-(pos++&7)))&1;};const ue=()=>{let n=0;while(!bit())if(++n>24)fail('Slice prefix bound');let v=1;while(n--)v=v*2+bit();return v-1;};const first=ue(),kind=ue(),pps=ue();if(first!==0||kind>9||pps!==0)fail('Slice configuration');return kind%5;}
function parse(input,{trimmed=false}={}){
 if(!(input instanceof Uint8Array)||(typeof SharedArrayBuffer!=='undefined'&&input.buffer instanceof SharedArrayBuffer)||input.length<16||input.length>LIMIT)fail('Input size');
 const bytes=new Uint8Array(input),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),info=inspectLargeOriginalMP4(bytes);
 // Strict original inspector remains unchanged; this research adds only a narrow B-frame profile.
 const get=p=>view.getUint32(p),need=(p,n,z)=>{if(!Number.isSafeInteger(n)||n<0||p+n>z)fail('Truncated box');};let budget=10000;
 function boxes(a,z){const out=[];while(a<z){if(--budget<0)fail('Box count');need(a,8,z);const n=get(a),name=String.fromCharCode(...bytes.subarray(a+4,a+8));if(n<8||a+n>z)fail('Only bounded 32-bit boxes');out.push({name,p:a,data:a+8,end:a+n});a+=n;}return out;}
 const children=b=>boxes(b.data,b.end),raw=b=>bytes.slice(b.p,b.end),one=(ls,n)=>{const list=ls.filter(b=>b.name===n);if(list.length!==1)fail('Required unique '+n);return list[0];};
 const only=(ls,names)=>{if(ls.some(b=>!names.includes(b.name)))fail('Unknown structural box');};
 const tops=boxes(0,bytes.length);only(tops,['ftyp','moov','mdat','free']);const moov=one(tops,'moov'),mc=children(moov),ftyp=one(tops,'ftyp');only(mc,['mvhd','trak','udta']);
 // User metadata is deliberately omitted from derivative; never copy unknown
 // offset/timing-bearing structures into rebuilt container.
 if(ftyp.end-ftyp.data<8||(ftyp.end-ftyp.data)%4)fail('File type brands');const brand=p=>String.fromCharCode(...bytes.subarray(p,p+4));if(!['isom','mp41','mp42'].includes(brand(ftyp.data)))fail('Major brand');for(let p=ftyp.data+8;p<ftyp.end;p+=4)if(!['isom','iso2','iso6','avc1','mp41','mp42'].includes(brand(p)))fail('Compatible brand');
 const mvhd=one(mc,'mvhd');need(mvhd.data,100,mvhd.end);if(get(mvhd.data)!==0||mvhd.end-mvhd.data!==100)fail('Movie header version');const movieScale=get(mvhd.data+12),movieDuration=get(mvhd.data+16);if(!movieScale||movieScale>(trimmed?0xffffffff:1000000)||!movieDuration||movieDuration>movieScale*600)fail('Movie duration');
 const tracks=[];
 for(const trak of mc.filter(b=>b.name==='trak')){
  const tc=children(trak);only(tc,['tkhd','edts','mdia']);const tkhd=one(tc,'tkhd');need(tkhd.data,84,tkhd.end);if(bytes[tkhd.data]!==0||tkhd.end-tkhd.data!==84)fail('Track header');
  const mdia=one(tc,'mdia'),md=children(mdia);only(md,['mdhd','hdlr','minf']);const mdhd=one(md,'mdhd'),hdlr=one(md,'hdlr'),minf=one(md,'minf');need(mdhd.data,24,mdhd.end);if(get(mdhd.data)!==0||mdhd.end-mdhd.data!==24)fail('Media header');const scale=get(mdhd.data+12),duration=get(mdhd.data+16);if(!scale||scale>1000000)fail('Media scale');const handler=String.fromCharCode(...bytes.subarray(hdlr.data+8,hdlr.data+12)),type=handler==='vide'?'video':handler==='soun'?'audio':fail('Track type');
  const mi=children(minf);only(mi,[type==='video'?'vmhd':'smhd','dinf','stbl']);const mediaHeader=one(mi,type==='video'?'vmhd':'smhd');if(type==='video'?(mediaHeader.end-mediaHeader.data!==12||get(mediaHeader.data)!==1||get(mediaHeader.data+4)!==0||get(mediaHeader.data+8)!==0):(mediaHeader.end-mediaHeader.data!==8||get(mediaHeader.data)!==0||get(mediaHeader.data+4)!==0))fail('Only standard fixed-size media headers');const di=children(one(mi,'dinf'));only(di,['dref']);const dr=one(di,'dref'),refs=boxes(dr.data+8,dr.end);if(refs.length!==1||refs[0].name!=='url ')fail('Only self-contained reference');const stbl=one(mi,'stbl'),st=children(stbl);only(st,['stsd','stts','ctts','stss','stsc','stsz','stco','sgpd','sbgp']);
  const stsd=one(st,'stsd'),stts=one(st,'stts');const entries=boxes(stsd.data+8,stsd.end);if(entries.length!==1)fail('Single entry');const entry=entries[0],extras=boxes(entry.data+(type==='video'?78:28),entry.end);only(extras,type==='video'?['avcC','pasp','colr','btrt']:['esds','btrt']);if(new Set(extras.map(b=>b.name)).size!==extras.length)fail('Duplicate sample entry box');for(const b of extras.filter(b=>b.name==='btrt'))if(b.end-b.data!==12)fail('Bitrate box');
  if(type==='audio'){
   const esds=one(extras,'esds');function desc(p,z){need(p,2,z);const tag=bytes[p++];let n=0,done=false;for(let i=0;i<4;i++){need(p,1,z);const b=bytes[p++];n=n*128+(b&127);if(!(b&128)){done=true;break;}}if(!done)fail('Descriptor bound');need(p,n,z);return{tag,data:p,end:p+n};}
   const es=desc(esds.data+4,esds.end);if(es.tag!==3||es.end!==esds.end||es.end-es.data<3||bytes[es.data+2]!==0)fail('ES descriptor');const dc=desc(es.data+3,es.end);if(dc.tag!==4||dc.end-dc.data<13)fail('Decoder descriptor');const asc=desc(dc.data+13,dc.end);if(asc.tag!==5||asc.end!==dc.end)fail('Codec descriptor');const sl=desc(dc.end,es.end);if(sl.tag!==6||sl.end!==es.end||sl.end-sl.data!==1||bytes[sl.data]!==2)fail('SL descriptor');
  }
need(stts.data,8,stts.end);const nr=get(stts.data+4);if(get(stts.data)!==0||!nr||nr>(type==='video'&&info.variableFrameRate?18000:2)||stts.end-stts.data!==8+nr*8)fail('Decode runs');const deltas=[];let total=0;for(let p=stts.data+8;p<stts.end;p+=8){const n=get(p),d=get(p+4);if(!n||!d||deltas.length+n>(type==='video'?18000:28127))fail('Sample bounds');for(let i=0;i<n;i++){deltas.push(d);total+=d;}}if(total!==duration||!total)fail('Media duration mismatch');if(type==='video'&&((!info.variableFrameRate&&nr!==1)||deltas.some(d=>d*30<scale)))fail('Video cadence');
  const ctts=st.filter(b=>b.name==='ctts');let offset=0,offsets=new Array(deltas.length).fill(0);if(ctts.length){if(type!=='video'||ctts.length!==1)fail('Composition map');const c=ctts[0],count=get(c.data+4);if(get(c.data)!==0||!count||count>deltas.length||c.end-c.data!==8+count*8)fail('Only unsigned bounded CTS');offsets=[];for(let p=c.data+8;p<c.end;p+=8){const n=get(p),v=get(p+4);if(!n||offsets.length+n>deltas.length||v>8*deltas[0])fail('CTS bounds');for(let i=0;i<n;i++)offsets.push(v);}if(offsets.length!==deltas.length)fail('CTS count');offset=offsets[0];}

  const edts=one(tc,'edts'),ec=children(edts);only(ec,['elst']);const elst=one(ec,'elst');if(elst.end-elst.data!==20||get(elst.data)!==0||get(elst.data+4)!==1||get(elst.data+16)!==65536)fail('Single rate1 edit required');const mediaStart=view.getInt32(elst.data+12),segment=get(elst.data+8);if(mediaStart<0||segment!==movieDuration||get(tkhd.data+20)!==movieDuration)fail('Track edit mapping');if(type==='video'?mediaStart!==offset:mediaStart>2048)fail('Initial edit');if(info.variableFrameRate)fail('B-frame research only CFR');
  const available=BigInt(type==='video'?total:total-mediaStart),diff=available*BigInt(movieScale)-BigInt(segment)*BigInt(scale),tolerance=BigInt(scale)*BigInt(movieScale)/1000n<BigInt(scale)?BigInt(scale)*BigInt(movieScale)/1000n:BigInt(scale);if(diff < -tolerance||diff>(type==='audio'?1024n*BigInt(movieScale):(trimmed?BigInt(deltas.at(-1))*BigInt(movieScale):0n))+tolerance)fail('Source endpoint mapping');
  if(type==='audio'){const codec=inspectMP4Tracks(bytes).tracks.find(t=>t.type===2);if(codec.sampleRate!==scale)fail('AAC media clock');const entry=one(boxes(stsd.data+8,stsd.end),'mp4a');if(get(entry.data+24)!==scale*65536)fail('Audio sample entry clock');}
  const sz=one(st,'stsz'),co=one(st,'stco'),sc=one(st,'stsc');if(get(sz.data)!==0||get(sz.data+8)!==deltas.length)fail('Size table count');const constant=get(sz.data+4);if(sz.end-sz.data!==12+(constant?0:deltas.length*4))fail('Size table');const chunks=get(co.data+4);if(get(co.data)!==0||!chunks||chunks>deltas.length||co.end-co.data!==8+chunks*4)fail('Chunk table');const runs=get(sc.data+4);if(get(sc.data)!==0||!runs||runs>chunks||sc.end-sc.data!==8+runs*12)fail('Sample chunk table');const map=[];for(let p=sc.data+8;p<sc.end;p+=12){const first=get(p),count=get(p+4);if(first<1||first>chunks||(!map.length&&first!==1)||(map.length&&first<=map.at(-1).first)||!count||get(p+8)!==1)fail('Chunk map');map.push({first,count});}
  const samples=[];let run=0,tick=0;for(let i=1;i<=chunks;i++){while(run+1<map.length&&map[run+1].first<=i)run++;let pos=get(co.data+8+(i-1)*4);for(let j=0;j<map[run].count;j++){const index=samples.length;if(index>=deltas.length)fail('Sample map overflow');const size=constant||get(sz.data+12+index*4);if(!size||!tops.some(m=>m.name==='mdat'&&pos>=m.data&&pos+size<=m.end))fail('Sample outside mdat');samples.push({pos,size,dts:tick,pts:tick+offsets[index],delta:deltas[index],idr:false});tick+=deltas[index];pos+=size;}}if(samples.length!==deltas.length)fail('Missing samples');
  if(type==='video'){
   const sync=one(st,'stss');if(get(sync.data)!==0||sync.end-sync.data!==8+get(sync.data+4)*4)fail('Sync table');const syncs=[];for(let p=sync.data+8;p<sync.end;p+=4){const n=get(p);if(n<1||n>samples.length||(syncs.length&&n<=syncs.at(-1)))fail('Sync order');syncs.push(n);}
   const avcc=one(extras,'avcC'),codec=simpleAVC(bytes.subarray(avcc.data,avcc.end));const syncSet=new Set(syncs);for(const [index,sample]of samples.entries()){let p=sample.pos,hasSlice=false,idr=null;while(p<sample.pos+sample.size){need(p,4,sample.pos+sample.size);const size=get(p);p+=4;need(p,size,sample.pos+sample.size);if(!size)fail('NAL size');const type=bytes[p]&31;if(type===1||type===5){if(hasSlice)fail('Single-slice access units only');const kind=codec.check(bytes.subarray(p,p+size),sample,deltas[0]).kind;if(type===5&&kind!==2)fail('IDR not intra');if(idr!==null&&idr!==(type===5))fail('Mixed IDR slices');idr=type===5;hasSlice=true;}p+=size;}if(!hasSlice)fail('Missing slices');sample.idr=idr;if(syncSet.has(index+1)!==idr)fail('Sync flags not exact IDRs');}
   if(!samples[0].idr||!codec.summary().bCount)fail('Start IDR and B pictures required');const presentation=samples.map(s=>s.pts).sort((a,b)=>a-b);for(let i=0;i<presentation.length;i++)if(presentation[i]!==mediaStart+i*deltas[0])fail('Continuous presentation grid');
  }else{
   const sg=st.filter(b=>b.name==='sgpd'),sb=st.filter(b=>b.name==='sbgp');if(sg.length!==1||sb.length!==1)fail('Known AAC roll required');
  }
  tracks.push({type,trak,tc,tkhd,mdhd,hdlr,minf,mi,stsd,st,scale,mediaStart,offset,samples,ctts:ctts.length>0});
 }
 const video=tracks.find(t=>t.type==='video'),audio=tracks.find(t=>t.type==='audio');if(!video||tracks.length>2||video.scale<1000)fail('Track profile or terminal quantization budget');
 if((info.rotationDegrees??0)!==0)fail('B-frame research only identity orientation');return{bytes,view,raw,mvhd,ftyp,movieScale,movieDuration,tracks,video,audio,info};
}
function cutsFor(model){
 const {video,audio,movieDuration,movieScale}=model,cuts=[];let audioCursor=0;const prefixMax=[],suffixMin=[];for(let i=0;i<video.samples.length;i++)prefixMax[i]=Math.max(i?prefixMax[i-1]:-Infinity,video.samples[i].pts);for(let i=video.samples.length-1;i>=0;i--)suffixMin[i]=Math.min(i+1<video.samples.length?suffixMin[i+1]:Infinity,video.samples[i].pts);
 for(let n=1;n<video.samples.length;n++){
  if(!video.samples[n].idr)continue;
  const next=BigInt(video.samples[n].pts-video.mediaStart),last=BigInt(prefixMax[n-1]-video.mediaStart),vs=BigInt(video.scale);if(BigInt(suffixMin[n]-video.mediaStart)<next||last+BigInt(video.samples[0].delta)!==next)continue;
  let num=next,den=vs,audioCount=0;
  if(audio){const as=BigInt(audio.scale);while(audioCursor<audio.samples.length){const a=audio.samples[audioCursor],end=BigInt(a.dts+a.delta-audio.mediaStart);if(end*vs>next*as)break;audioCursor++;}audioCount=audioCursor;if(!audioCount)continue;const a=audio.samples[audioCount-1];num=BigInt(a.dts+a.delta-audio.mediaStart);den=as;}
  if(num<=0n||num*vs<=last*den||num*vs>next*den||num*BigInt(movieScale)>=BigInt(movieDuration)*den)continue;
  {
   // Complete final frame interval AND complete audio packet, never a shortened hold.
   if(num*vs!==next*den||BigInt(video.samples[0].delta)+last!==next)continue;
   const reducedDen=Number(den)/gcd(Number(num),Number(den));let scale;
   try{scale=lcm(model.movieScale,reducedDen);}catch{continue;}
   if(scale>1000000||num*BigInt(scale)%den!==0n||num*BigInt(scale)/den>0xffffffffn)continue;
  }
  cuts.push({id:`${n}:${audioCount}`,videoCount:n,audioCount,numerator:Number(num),denominator:Number(den),seconds:Number(num)/Number(den),lastVideoSeconds:Number(last)/video.scale,nextVideoSeconds:Number(next)/video.scale});
 }
 return cuts;
}
export function analyzeMP4Tail(bytes){const model=parse(bytes);return Object.freeze({cuts:cutsFor(model),width:inspectLargeOriginalMP4(bytes).width,height:inspectLargeOriginalMP4(bytes).height,sourceSeconds:model.movieDuration/model.movieScale});}
function runs(values){const out=[];for(const value of values){if(out.length&&out.at(-1)[1]===value)out.at(-1)[0]++;else out.push([1,value]);}return out;}
function patch(raw,changes){const b=new Uint8Array(raw),v=new DataView(b.buffer,b.byteOffset,b.byteLength);for(const [offset,value]of changes){if(!Number.isSafeInteger(value)||value<0||value>0xffffffff)fail('Header integer');v.setUint32(offset,value);}return b;}
export function trimMP4Tail(input,cutID,{signal}={}){
 if(signal?.aborted)fail('Aborted');if(!(input instanceof Uint8Array)||(typeof SharedArrayBuffer!=='undefined'&&input.buffer instanceof SharedArrayBuffer)||input.length>LIMIT)fail('Input size');input=new Uint8Array(input);const model=parse(input),cut=cutsFor(model).find(c=>c.id===cutID);if(!cut)fail('Choose an offered cut');
 const movieScale=lcm(model.movieScale,cut.denominator/gcd(cut.numerator,cut.denominator));if(movieScale>1000000)fail('Exact movie clock bound');
 const duration=BigInt(cut.numerator)*BigInt(movieScale)/BigInt(cut.denominator);if(duration*BigInt(cut.denominator)!==BigInt(cut.numerator)*BigInt(movieScale)||duration>0xffffffffn)fail('Exact endpoint scale');const movieDuration=Number(duration);
 const ftyp=model.raw(model.ftyp),retained=model.tracks.map(track=>({track,samples:track.samples.slice(0,track.type==='video'?cut.videoCount:cut.audioCount)}));
 const payload=[],chunks=[];let offset=ftyp.length+8;
 for(const {samples}of retained){const positions=[];for(const sample of samples){if(signal?.aborted)fail('Aborted');positions.push(offset);const bytes=input.slice(sample.pos,sample.pos+sample.size);payload.push(bytes);offset+=bytes.length;}chunks.push(positions);}
 const mdat=box('mdat',...payload),traks=[];
 for(const [index,{track:t,samples}]of retained.entries()){
  const durationTicks=samples.reduce((n,s)=>n+s.delta,0),sttsRuns=runs(samples.map(s=>s.delta));
  const stts=full('stts',u32(sttsRuns.length),...sttsRuns.flatMap(([count,delta])=>[u32(count),u32(delta)]));
  const stsc=full('stsc',u32(1),u32(1),u32(1),u32(1));
  const stsz=full('stsz',u32(0),u32(samples.length),...samples.map(s=>u32(s.size)));
  const stco=full('stco',u32(samples.length),...chunks[index].map(u32));
  const tables=[model.raw(t.stsd),stts,stsc,stsz,stco];
  if(t.type==='video'){
   const sync=samples.map((s,i)=>s.idr?i+1:0).filter(Boolean);tables.push(full('stss',u32(sync.length),...sync.map(u32)));
   if(t.ctts){const cr=runs(samples.map(s=>s.pts-s.dts));tables.push(full('ctts',u32(cr.length),...cr.flatMap(([count,value])=>[u32(count),u32(value)])));}
  }else{
   const sg=t.st.find(b=>b.name==='sgpd'),sb=t.st.find(b=>b.name==='sbgp');tables.push(model.raw(sg),patch(model.raw(sb),[[8+12,samples.length]]));
  }
  const stbl=box('stbl',...tables),minf=box('minf',...t.mi.map(b=>b.name==='stbl'?stbl:model.raw(b)));
  const mdhd=patch(model.raw(t.mdhd),[[8+16,durationTicks]]),hdlr=full('hdlr',u32(0),str(t.type==='video'?'vide':'soun'),u32(0),u32(0),u32(0),str(t.type==='video'?'VideoHandler\0':'SoundHandler\0')),mdia=box('mdia',mdhd,hdlr,minf);
  const edit=box('edts',full('elst',u32(1),u32(movieDuration),u32(t.mediaStart),u32(65536)));
  const tkhd=patch(model.raw(t.tkhd),[[8+20,movieDuration]]);traks.push(box('trak',tkhd,edit,mdia));
 }
 const mvhd=patch(model.raw(model.mvhd),[[8+12,movieScale],[8+16,movieDuration]]),output=join([ftyp,mdat,box('moov',mvhd,...traks)]);
 if(signal?.aborted)fail('Aborted');
 const check=parse(output,{trimmed:true});
 // Orientation is metadata, never a pixel transform. Preserve the exact accepted
 // track matrix, coded geometry and derived browser display geometry.
 for(const key of ['width','height','rotationDegrees','encodedWidth','encodedHeight'])if(check.info[key]!==model.info[key])fail('Roundtrip display geometry');
 for(const t of model.tracks){const out=check.tracks.find(x=>x.type===t.type);if(!out)fail('Roundtrip track');for(let i=0;i<9;i++)if(model.view.getUint32(t.tkhd.data+40+i*4)!==check.view.getUint32(out.tkhd.data+40+i*4))fail('Roundtrip display matrix');} 
 for(const {track,samples}of retained){const roundtrip=check.tracks.find(t=>t.type===track.type);if(roundtrip.samples.length!==samples.length||roundtrip.scale!==track.scale||roundtrip.mediaStart!==track.mediaStart)fail('Roundtrip timeline');for(let i=0;i<samples.length;i++){const a=samples[i],b=roundtrip.samples[i];if(a.dts!==b.dts||a.pts!==b.pts||a.delta!==b.delta||a.size!==b.size)fail('Roundtrip sample metadata');const x=input.subarray(a.pos,a.pos+a.size),y=output.subarray(b.pos,b.pos+b.size);if(x.some((v,j)=>v!==y[j]))fail('Roundtrip sample bytes');}}
 if(output.length>=input.length)fail('No physical size reduction');
 return{bytes:output,cut,sourceBytes:input.length,outputBytes:output.length,retainedVideo:cut.videoCount,retainedAudio:cut.audioCount,movieScale,movieDuration};
}
