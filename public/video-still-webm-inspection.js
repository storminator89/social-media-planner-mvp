/** Bounded container metadata inspection only, not a decoder.
 * inspectWebMTracks is unchanged from the synthetic capture experiment. */
const EXPORT_LIMITS = Object.freeze({outputBytes: 8 * 1024 * 1024});
export function inspectWebMTracks(input){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input),n=bytes.length;
 if(n<32||n>EXPORT_LIMITS.outputBytes)throw Error('Die Ausgabedatei ist leer oder zu groß.');
 let count=0;
 function vint(position,id=false){if(position>=n||!bytes[position])throw Error('Ungültiger EBML-Header.');let width=1,mask=128;while(!(bytes[position]&mask)){width++;mask>>=1;}if(width>(id?4:8)||position+width>n)throw Error('Ungültiger EBML-Wert.');let value=id?bytes[position]:bytes[position]&(mask-1),unknown=!id&&(bytes[position]&(mask-1))===mask-1;for(let i=1;i<width;i++){value=value*256+bytes[position+i];unknown=unknown&&bytes[position+i]===255;}if(!unknown&&!Number.isSafeInteger(value))throw Error('Zu großer EBML-Wert.');return {width,value,unknown};}
 function element(position,end){if(++count>10000)throw Error('Zu viele Container-Elemente.');const id=vint(position,true),size=vint(position+id.width),body=position+id.width+size.width;if(body>end||(!size.unknown&&size.value>end-body))throw Error('Unvollständiger WebM-Container.');return {id:id.value,body,end:size.unknown?end:body+size.value,unknown:size.unknown};}
 function children(parent){const result=[];let p=parent.body;while(p<parent.end){const child=element(p,parent.end);if(child.unknown)throw Error('Unbekannte Elementlänge an nicht unterstützter Stelle.');result.push(child);p=child.end;}return result;}
 function uint(e){if(e.end-e.body>6||e.end===e.body)throw Error('Ungültiger Track-Wert.');let result=0;for(let p=e.body;p<e.end;p++)result=result*256+bytes[p];return result;}
 const text=e=>new TextDecoder().decode(bytes.subarray(e.body,e.end));
 const header=element(0,n);if(header.id!==0x1a45dfa3||header.unknown||header.end>4108||!children(header).some(e=>e.id===0x4282&&text(e)==='webm'))throw Error('Die Ausgabe ist kein überprüfbarer WebM-Container.');
 const segment=element(header.end,n);if(segment.id!==0x18538067||segment.end!==n)throw Error('Ungültiges WebM-Segment.');
 let tracks=null,cluster=false,unknownCluster=false,info=false,p=segment.body;
 while(p<segment.end){const e=element(p,segment.end);if(e.id===0x1654ae6b){if(tracks||e.unknown)throw Error('Ungültige Track-Liste.');tracks=children(e).filter(t=>t.id===0xae).map(entry=>{const fields=children(entry),kind=fields.find(f=>f.id===0x83),codec=fields.find(f=>f.id===0x86);if(!kind||!codec)throw Error('Track-Metadaten fehlen.');const result={type:uint(kind),codec:text(codec)};const video=fields.find(f=>f.id===0xe0);if(video){const dimensions=children(video),width=dimensions.find(f=>f.id===0xb0),height=dimensions.find(f=>f.id===0xba);if(width&&height){result.width=uint(width);result.height=uint(height);}}return result;});}
  if(e.id===0x1549a966)info=true;
  if(e.id===0x1f43b675){cluster=e.end>e.body;if(e.unknown){unknownCluster=true;break;}}
  else if(e.unknown)throw Error('Nicht unterstützter WebM-Container.');
  p=e.end;
 }
 if(!info||!cluster||!tracks?.length)throw Error('WebM enthält keine vollständigen Track-/Bilddaten.');
 return {tracks,unknownCluster};
}
