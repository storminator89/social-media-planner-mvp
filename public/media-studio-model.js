export const IMAGE_LIMIT=2*1024*1024;
export const VIDEO_LIMIT=20*1024*1024;
export function classifyMedia(file){
 if(!file||!Number.isFinite(file.size)||file.size<=0)throw Error('Die Datei ist leer oder ungültig.');
 if(['image/jpeg','image/png','image/webp'].includes(file.type)){if(file.size>20*1024*1024)throw Error('Wähle ein Bild mit höchstens 20 MB.');return 'image';}
 if(['video/mp4','video/webm'].includes(file.type)){if(file.size>VIDEO_LIMIT)throw Error('Wähle ein Video mit höchstens 20 MB.');return 'video';}
 throw Error('Unterstützt werden JPG, PNG, WebP, MP4 und WebM.');
}
export function cropGeometry(width,height,{rotation=0,ratio=0,zoom=1,x=50,y=50}={}){
 if(!(width>0&&height>0&&width*height<=40_000_000))throw Error('Das Bild darf höchstens 40 Megapixel haben.');
 const turned=Math.abs(rotation%180)===90,w=turned?height:width,h=turned?width:height;
 const r=Number(ratio)||w/h,z=Math.min(3,Math.max(1,Number(zoom)||1));
 let sw=w,sh=w/r;if(sh>h){sh=h;sw=h*r;}sw/=z;sh/=z;
 const sx=(w-sw)*Math.min(100,Math.max(0,Number(x)||0))/100,sy=(h-sh)*Math.min(100,Math.max(0,Number(y)||0))/100;
 const scale=Math.min(1,2048/Math.max(sw,sh));
 return {w,h,sx,sy,sw,sh,width:Math.max(1,Math.round(sw*scale)),height:Math.max(1,Math.round(sh*scale))};
}
export function boundedRange(duration,start,end){
 if(!Number.isFinite(duration)||duration<=0)throw Error('Die Videodauer konnte nicht gelesen werden.');
 const a=Math.min(Math.max(0,Number(start)||0),Math.max(0,duration-.1));
 return {start:a,end:Math.min(duration,Math.max(a+.1,Number(end)||duration))};
}
export function formatDuration(seconds){if(!Number.isFinite(seconds))return '–';const n=Math.floor(Math.max(0,seconds));return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;}
