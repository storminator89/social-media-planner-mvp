/** Bounded container checks, not a codec decoder, malware scanner or transcoder. */
import {PlannerError,LIMITS} from './domain.mjs';
export const MEDIA_TYPES=Object.freeze(['image/png','image/jpeg','image/gif','image/webp','video/mp4','video/webm']);
export function validateMedia(content,mime){
 const b=content, n=b.byteLength, view=new DataView(b.buffer,b.byteOffset,n);
 const at=(s,p=0)=>p>=0&&p+s.length<=n&&[...s].every((c,i)=>b[p+i]===c.charCodeAt(0));
 const u32=p=>view.getUint32(p), le32=p=>view.getUint32(p,true);
 const dimensions=(w,h)=>w>0&&h>0&&w<=16384&&h<=16384&&w*h<=40000000;
 let ok=false;
 if(!MEDIA_TYPES.includes(mime))throw new PlannerError(415,'UNSUPPORTED_MEDIA','Erlaubt sind PNG, JPEG, GIF, WebP, MP4 und WebM.');
 if(n>LIMITS.uploadBytes)throw new PlannerError(413,'PAYLOAD_TOO_LARGE','Die Datei ist zu groß.');
 try {
  if(mime==='image/png'&&n>=45&&at('\x89PNG\r\n\x1a\n')){
   let p=8,first=true,data=false,end=false;
   while(p+12<=n){const size=u32(p);if(size>n-p-12)break;const type=p+4;if(first&&!(size===13&&at('IHDR',type)&&dimensions(u32(p+8),u32(p+12))))break;first=false;
    if(at('IDAT',type)&&size>0)data=true;p+=size+12;if(at('IEND',type)){end=size===0&&p===n;break;}}
   ok=!first&&data&&end;
  }else if(mime==='image/jpeg'&&n>=12&&b[0]===255&&b[1]===216&&b[n-2]===255&&b[n-1]===217){
   let p=2,frame=false;
   while(p<n-2){if(b[p++]!==255)break;while(b[p]===255)p++;const marker=b[p++];if(marker===0xda){ok=frame;break;}if(marker===0xd8||marker===0xd9||marker===0||marker>=0xd0&&marker<=0xd7)break;
    const size=view.getUint16(p);if(size<2||p+size>n)break;if([0xc0,0xc1,0xc2].includes(marker)&&size>=8)frame=dimensions(view.getUint16(p+5),view.getUint16(p+3));p+=size;}
  }else if(mime==='image/gif'&&n>=14&&(at('GIF87a')||at('GIF89a'))){
   const width=view.getUint16(6,true),height=view.getUint16(8,true);
   if(dimensions(width,height)){
    let p=13+((b[10]&128)?3*(2**((b[10]&7)+1)):0),images=0,valid=true;
    const subblocks=()=>{let total=0;while(p<n){const size=b[p++];if(!size)return total;if(p+size>n)return -1;total+=size;p+=size;}return -1;};
    while(valid&&p<n){const marker=b[p++];if(marker===0x3b){ok=images>0&&p===n;break;}
     if(marker===0x21){if(p>=n)break;p++;valid=subblocks()>=0;}
     else if(marker===0x2c){if(p+9>n)break;const left=view.getUint16(p,true),top=view.getUint16(p+2,true),w=view.getUint16(p+4,true),h=view.getUint16(p+6,true),packed=b[p+8];p+=9;
      if(!dimensions(w,h)||left+w>width||top+h>height)break;if(packed&128)p+=3*(2**((packed&7)+1));if(p>=n||b[p]<2||b[p]>8)break;p++;if(subblocks()<=0)break;images++;
     }else valid=false;
    }
   }
  }else if(mime==='image/webp'&&n>=30&&at('RIFF')&&at('WEBP',8)&&le32(4)===n-8){
   let p=12,frame=false;while(p+8<=n){const size=le32(p+4);if(size>n-p-8)break;if((at('VP8 ',p)||at('VP8L',p))&&size>=5)frame=true;p+=8+size+(size%2);}ok=frame&&p===n;
  }else if(mime==='video/mp4'&&n>=32){
   let p=0,ftyp=false,moov=false,mdat=false;while(p+8<=n){let size=u32(p);if(size===0)size=n-p;const type=p+4;if(size<8||size>n-p)break;if(p===0&&at('ftyp',type)&&size>=16)ftyp=true;if(at('moov',type)&&size>8)moov=true;if(at('mdat',type)&&size>8)mdat=true;p+=size;}ok=ftyp&&moov&&mdat&&p===n;
  }else if(mime==='video/webm'&&n>=20&&at('\x1a\x45\xdf\xa3')){
   // Parse bounded EBML elements, including Segment's VINT, rather than
   // searching for magic strings inside arbitrary header payloads.
   const vint=(p,id=false)=>{if(p>=n||b[p]===0)return null;let width=1,mask=128;while(!(b[p]&mask)){width++;mask>>=1;}if(width>(id?4:8)||p+width>n)return null;let value=id?b[p]:b[p]&(mask-1),unknown=!id&&(b[p]&(mask-1))===mask-1;for(let i=1;i<width;i++){value=value*256+b[p+i];unknown=unknown&&b[p+i]===255;}if(!unknown&&!Number.isSafeInteger(value))return null;return {width,value,unknown};};
   const element=(p,end)=>{const id=vint(p,true);if(!id)return null;const size=vint(p+id.width);if(!size)return null;const body=p+id.width+size.width;if(body>end||(!size.unknown&&size.value>end-body))return null;return {id:id.value,body,end:size.unknown?end:body+size.value,unknown:size.unknown};};
   const header=element(0,n);if(header&&!header.unknown&&header.end<=4108){let p=header.body,doc=false,valid=true;
    while(p<header.end){const e=element(p,header.end);if(!e||e.unknown){valid=false;break;}if(e.id===0x4282)doc=e.end-e.body===4&&at('webm',e.body);p=e.end;}
    const segment=element(header.end,n);if(valid&&doc&&segment?.id===0x18538067&&segment.end===n){let p=segment.body,tracks=false,cluster=false,info=false;
     while(p<segment.end){const e=element(p,segment.end);if(!e||e.unknown){valid=false;break;}if(e.id===0x1654ae6b&&e.end>e.body)tracks=true;if(e.id===0x1f43b675&&e.end>e.body)cluster=true;if(e.id===0x1549a966&&e.end>e.body)info=true;p=e.end;}
     ok=valid&&p===n&&tracks&&cluster&&info;
    }
   }
  }
 }catch{ok=false;}
 if(!ok)throw new PlannerError(415,'INVALID_MEDIA','Dateiinhalt oder Container ist ungültig oder wird nicht unterstützt. Bitte exportiere die Datei erneut.');
 return {mimeType:mime,byteSize:n};
}
