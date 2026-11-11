// Research-only short-term DPB, POC0, reference-B and MMCO1 profile.
const fail=m=>{throw Error('B-frame profile: '+m);};
function bits(nal){let rb=[],zeros=0;for(let i=1;i<Math.min(nal.length,1024);i++){const x=nal[i];if(zeros===2&&x===3){if(i+1===nal.length||nal[i+1]>3)fail('escape');zeros=0;continue;}rb.push(x);zeros=x===0?zeros+1:0;}let p=0;const read=n=>{if(n>32||p+n>rb.length*8)fail('truncated header');let x=0;while(n--)x=x*2+((rb[p>>3]>>(7-(p++&7)))&1);return x;};const ue=()=>{let n=0;while(!read(1)){if(++n>20)fail('integer');}return 2**n-1+read(n);};const se=()=>{const n=ue();return n&1?(n+1)/2:-n/2;};return{read,ue,se,align(){while(p%8)if(read(1)!==1)fail('CABAC alignment');}};}
export function referenceAVC(avcc){
 const v=new DataView(avcc.buffer,avcc.byteOffset,avcc.byteLength);let p=6;if(avcc[0]!==1||(avcc[4]&3)!==3||(avcc[5]&31)!==1)fail('configuration');const n=v.getUint16(p);p+=2;const s=bits(avcc.subarray(p,p+n));p+=n;const profile=s.read(8);s.read(8);s.read(8);if(s.ue()!==0)fail('SPS id');if(profile===100){if(s.ue()!==1||s.ue()!==0||s.ue()!==0||s.read(1)||s.read(1))fail('SPS features');}else if(![66,77].includes(profile))fail('profile');const frameBits=s.ue()+4;if(frameBits>16||s.ue()!==0)fail('POC type');const pocBits=s.ue()+4;if(pocBits>16)fail('POC bits');const refs=s.ue();if(!refs||refs>4||s.read(1))fail('reference bound');s.ue();s.ue();if(s.read(1)!==1)fail('interlaced');
 if(avcc[p++]!==1)fail('PPS count');const pn=v.getUint16(p);p+=2;const q=bits(avcc.subarray(p,p+pn));if(q.ue()!==0||q.ue()!==0)fail('PPS id');const entropy=q.read(1);if(q.read(1)||q.ue()!==0)fail('picture fields/groups');const l0=q.ue()+1,l1=q.ue()+1,weightedP=q.read(1),weightedB=q.read(2);if(l0>4||l1>4||![0,2].includes(weightedB))fail('prediction mode');const initialQP=26+q.se();q.se();q.se();const deblocking=q.read(1);q.read(1);if(q.read(1))fail('redundant picture');
 let prevLSB=0,prevMSB=0,lastRefFrame=0,origin=null,maxPTS=-Infinity,bCount=0,wraps=0,sequence=0,dpb=[],removed=0,modifications=0;
 const maxPOC=2**pocBits,maxFrame=2**frameBits;
 function lists(kind,poc,frame){
  const pool=dpb.map(r=>({...r,pic:r.frame>frame?r.frame-maxFrame:r.frame}));
  if(kind===0)return [pool.toSorted((a,b)=>b.pic-a.pic),[]];
  const lower=pool.filter(r=>r.poc<poc).toSorted((a,b)=>b.poc-a.poc),higher=pool.filter(r=>r.poc>poc).toSorted((a,b)=>a.poc-b.poc);
  if(lower.length+higher.length!==pool.length)fail('Duplicate reference POC');
  const a=[...lower,...higher],b=[...higher,...lower];if(b.length>1&&a.every((r,i)=>r.index===b[i].index))[b[0],b[1]]=[b[1],b[0]];return[a,b];
 }
 function modify(b,list,frame,active){
  if(!b.read(1))return list;let pred=frame,index=0;
  for(let count=0;count<=8;count++){
   const op=b.ue();if(op===3)return list;if(![0,1].includes(op)||count===8||index>=active)fail('Reference list operation');
   const diff=b.ue()+1;if(diff>maxFrame)fail('Reference list distance');pred=op===0?(pred-diff+maxFrame)%maxFrame:(pred+diff)%maxFrame;
   const pic=pred>frame?pred-maxFrame:pred,target=dpb.find(r=>(r.frame>frame?r.frame-maxFrame:r.frame)===pic);if(!target)fail('Missing list reference');
   const entry={...target,pic};list=[...list.slice(0,index),entry,...list.slice(index).filter(r=>r.index!==entry.index)];index++;modifications++;
  }fail('Missing list terminator');
 }
 function weights(b,active){
  const luma=b.ue(),chroma=b.ue();if(luma>7||chroma>7)fail('Weight denominator');
  for(let i=0;i<active;i++){if(b.read(1)){const w=b.se(),o=b.se();if(w< -128||w>127||o< -128||o>127)fail('Luma weights');}if(b.read(1))for(let j=0;j<2;j++){const w=b.se(),o=b.se();if(w< -128||w>127||o< -128||o>127)fail('Chroma weights');}}
 }
 return{check(nal,sample,delta){
  const b=bits(nal),idr=(nal[0]&31)===5,ref=(nal[0]>>5)&3,index=sequence++;
  if(b.ue()!==0)fail('Multiple slices');const rawKind=b.ue(),kind=rawKind%5;if(rawKind>9||![0,1,2].includes(kind)||b.ue()!==0)fail('Slice type/id');
  const frame=b.read(frameBits);if(idr){if(b.ue()>65535)fail('IDR picture id');if(kind!==2||!ref||frame!==0)fail('IDR syntax');}else if(kind===2||kind===0&&!ref)fail('Non-IDR I/nonreference P');
  const lsb=b.read(pocBits);let msb;
  if(idr){if(lsb!==0)fail('IDR POC');if(origin!==null&&sample.pts!==maxPTS+delta)fail('IDR presentation gap/overlap');origin=sample.pts;prevLSB=prevMSB=0;lastRefFrame=0;msb=0;dpb=[];}
  else{if(frame!==(lastRefFrame+1)%maxFrame)fail('Frame number');msb=lsb<prevLSB&&prevLSB-lsb>=maxPOC/2?prevMSB+maxPOC:lsb>prevLSB&&lsb-prevLSB>maxPOC/2?prevMSB-maxPOC:prevMSB;if(msb>prevMSB)wraps++;}
  const poc=msb+lsb;if(poc<0||poc%2||origin===null||sample.pts!==origin+poc/2*delta)fail('POC/CTS mapping');
  if(kind===1)b.read(1);let a=l0,c=l1;if(kind!==2&&b.read(1)){a=b.ue()+1;if(kind===1)c=b.ue()+1;}if(a>4||c>4)fail('Active references');
  const dependencies=[];
  if(kind!==2){let [list0,list1]=lists(kind,poc,frame);list0=modify(b,list0,frame,a);if(kind===1)list1=modify(b,list1,frame,c);
   for(const [list,count]of [[list0,a],...(kind===1?[[list1,c]]:[])]){if(list.length<count)fail('Missing active references');for(const r of list.slice(0,count)){if(r.index>=index||!dpb.some(x=>x.index===r.index))fail('Reference not previously decoded');dependencies.push(r.index);}}
   if(kind===0&&weightedP)weights(b,a);
  }
  if(ref){
   if(idr){if(b.read(1)||b.read(1))fail('IDR suppresses prior output or long-term reference');}
   else if(b.read(1)){
    let terminated=false;for(let count=0;count<=4;count++){const op=b.ue();if(op===0){terminated=true;break;}if(op!==1||count===4)fail('Only MMCO1');const diff=b.ue()+1;if(diff>maxFrame)fail('MMCO distance');const target=frame-diff,j=dpb.findIndex(r=>(r.frame>frame?r.frame-maxFrame:r.frame)===target);if(j<0)fail('MMCO missing target');dpb.splice(j,1);removed++;}if(!terminated)fail('MMCO terminator');
   }else if(dpb.length>=refs){let oldest=0;for(let i=1;i<dpb.length;i++)if((dpb[i].frame>frame?dpb[i].frame-maxFrame:dpb[i].frame)<(dpb[oldest].frame>frame?dpb[oldest].frame-maxFrame:dpb[oldest].frame))oldest=i;dpb.splice(oldest,1);}
  }
  if(entropy&&kind!==2&&b.ue()>2)fail('CABAC init');const qp=initialQP+b.se();if(qp<0||qp>51)fail('Slice QP');if(deblocking){const disabled=b.ue();if(disabled>2)fail('Deblocking');if(disabled!==1&&(Math.abs(b.se())>6||Math.abs(b.se())>6))fail('Deblocking offsets');}if(entropy)b.align();
  maxPTS=Math.max(maxPTS,sample.pts);if(ref){if(dpb.some(r=>r.frame===frame))fail('Duplicate reference frame number');dpb.push({index,frame,poc});if(dpb.length>refs)fail('DPB bound');prevLSB=lsb;prevMSB=msb;lastRefFrame=frame;}if(kind===1)bCount++;
  return{idr,kind,poc,dependencies,dpb:dpb.map(r=>({...r}))};
 },summary(){return{bCount,wraps,removed,modifications};}};
}
