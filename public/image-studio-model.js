export const IMAGE_LIMIT=2*1024*1024;
export const MEDIA_LOAD_TIMEOUT_MS=15000;
export function classifyMedia(file){
 if(!file||!Number.isFinite(file.size)||file.size<=0)throw Error('Die Datei ist leer oder ungültig.');
 if(['image/jpeg','image/png','image/webp'].includes(file.type)){if(file.size>20*1024*1024)throw Error('Wähle ein Bild mit höchstens 20 MB.');return 'image';}
 throw Error('Unterstützt werden JPG, PNG und WebP.');
}
export function cropGeometry(width,height,{rotation=0,ratio=0,zoom=1,x=50,y=50,outputWidth='',outputHeight=''}={}){
 if(!(width>0&&height>0&&width*height<=40_000_000))throw Error('Das Bild darf höchstens 40 Megapixel haben.');
 const turned=Math.abs(rotation%180)===90,w=turned?height:width,h=turned?width:height;
 const custom=ratio==='custom',ow=Number(outputWidth),oh=Number(outputHeight);
 if(custom&&(!Number.isInteger(ow)||!Number.isInteger(oh)||ow<1||oh<1||ow>2048||oh>2048))throw Error('Breite und Höhe müssen ganze Zahlen von 1 bis 2048 px sein.');
 const r=custom?ow/oh:Number(ratio)||w/h,z=Math.min(3,Math.max(1,Number(zoom)||1));
 let sw=w,sh=w/r;if(sh>h){sh=h;sw=h*r;}sw/=z;sh/=z;
 // Allow only floating-point roundoff, never material enlargement of a crop.
 if(custom&&(ow>sw+1e-9||oh>sh+1e-9))throw Error('Der Ausschnitt ist zu klein. Wähle weniger Pixel oder weniger Zoom.');
 const sx=(w-sw)*Math.min(100,Math.max(0,Number(x)||0))/100,sy=(h-sh)*Math.min(100,Math.max(0,Number(y)||0))/100;
 const scale=Math.min(1,2048/Math.max(sw,sh));
 return {w,h,sx,sy,sw,sh,width:custom?ow:Math.max(1,Math.round(sw*scale)),height:custom?oh:Math.max(1,Math.round(sh*scale))};
}
// Fit uses a ratio canvas enclosing the native image, bounded to 2048 per axis.
// Custom sizes are exact. Blank space may grow, but image pixels never do.
// Rounded canvas dimensions do not distort the image: one uniform scale is used.
export function fitGeometry(width,height,{rotation=0,ratio=0,outputWidth='',outputHeight=''}={}){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||width*height>40_000_000)throw Error('Das Bild darf höchstens 40 Megapixel haben.');
 const turned=Math.abs(rotation%180)===90,w=turned?height:width,h=turned?width:height;
 const custom=ratio==='custom',ow=Number(outputWidth),oh=Number(outputHeight);
 if(custom&&(!Number.isInteger(ow)||!Number.isInteger(oh)||ow<1||oh<1||ow>2048||oh>2048))throw Error('Breite und Höhe müssen ganze Zahlen von 1 bis 2048 px sein.');
 const r=custom?ow/oh:Number(ratio)||w/h;
 if(!Number.isFinite(r)||r<=0)throw Error('Ungültiges Seitenverhältnis.');
 let cw=Math.max(w,h*r),ch=cw/r;
 const bound=Math.min(1,2048/Math.max(cw,ch));
 const outputW=custom?ow:Math.max(1,Math.round(cw*bound)),outputH=custom?oh:Math.max(1,Math.round(ch*bound));
 const scale=Math.min(1,outputW/w,outputH/h),drawWidth=w*scale,drawHeight=h*scale;
 return {w,h,sx:0,sy:0,sw:w,sh:h,width:outputW,height:outputH,scale,dx:(outputW-drawWidth)/2,dy:(outputH-drawHeight)/2,drawWidth,drawHeight};
}
// Canvas-only text layout: the very same pixels are previewed and exported.
export function textOverlayLayout(ctx,width,height,{text='',size=6,y=75,align='center',tone='light',background=true}={}){
 const content=String(text).slice(0,280).replace(/\r\n?/g,'\n');
 if(!content.trim())return null;
 if(Math.min(width,height)<32)throw Error('Für Text muss das Bild mindestens 32 px breit und hoch sein.');
 const padding=Math.max(1,Math.round(Math.min(width,height)*.035));
 const maxWidth=Math.max(1,width-padding*4),maxHeight=Math.max(1,height-padding*4);
 let fontSize=Math.max(1,Math.round(Math.min(width,height)*Math.min(15,Math.max(3,Number(size)||6))/100)),lines,lineHeight;
 function wrap(){
  ctx.font=`700 ${fontSize}px system-ui, sans-serif`;
  const result=[];
  for(const paragraph of content.split('\n')){
   if(!paragraph){result.push('');continue;}
   let line='';
   for(const word of paragraph.split(/(\s+)/)){
    if(!word)continue;
    if(ctx.measureText(line+word).width<=maxWidth){line+=word;continue;}
    if(line.trim()){result.push(line.trimEnd());line='';}
    let rest=word.trimStart();
    for(const char of Array.from(rest)){
     if(line&&ctx.measureText(line+char).width>maxWidth){result.push(line);line=char;}else line+=char;
    }
   }
   result.push(line);
  }
  return result;
 }
 do{lines=wrap();lineHeight=Math.max(1,Math.ceil(fontSize*1.25));if(lines.length*lineHeight<=maxHeight||fontSize<=1)break;fontSize--;}while(fontSize>=1);
 if(lines.length*lineHeight>maxHeight)throw Error('Der Text passt nicht vollständig ins Bild. Verwende weniger Text oder Zeilen.');
 const boxHeight=Math.min(height-padding*2,lines.length*lineHeight+padding*2),boxWidth=width-padding*2;
 const top=padding+Math.max(0,height-padding*2-boxHeight)*Math.min(100,Math.max(0,Number(y)||0))/100;
 const alignment=['left','center','right'].includes(align)?align:'center';
 return {lines,fontSize,lineHeight,padding,box:{x:padding,y:top,width:boxWidth,height:boxHeight},x:alignment==='left'?padding*2:alignment==='right'?width-padding*2:width/2,align:alignment,foreground:tone==='dark'?'#17131d':'#ffffff',background:background?(tone==='dark'?'rgba(255,255,255,.85)':'rgba(23,19,29,.78)'):null};
}
export function paintTextOverlay(ctx,width,height,options){
 const layout=textOverlayLayout(ctx,width,height,options);if(!layout)return null;
 ctx.save();ctx.filter='none';
 if(layout.background){ctx.fillStyle=layout.background;ctx.fillRect(layout.box.x,layout.box.y,layout.box.width,layout.box.height);}
 ctx.font=`700 ${layout.fontSize}px system-ui, sans-serif`;ctx.textAlign=layout.align;ctx.textBaseline='top';ctx.fillStyle=layout.foreground;
 for(const [index,line]of layout.lines.entries())ctx.fillText(line,layout.x,layout.box.y+layout.padding+index*layout.lineHeight);
 ctx.restore();return layout;
}
export function createEditHistory(limit=50){
 let entries=[],index=-1,group=null;
 const copy=value=>structuredClone(value),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 return {clear(){entries=[];index=-1;group=null;},reset(value){entries=[copy(value)];index=0;group=null;},push(value,key=null){if(index>=0&&same(entries[index],value)){if(key===null)group=null;return;}if(key!==null&&group===key&&index===entries.length-1){entries[index]=copy(value);return;}entries=entries.slice(0,index+1);entries.push(copy(value));if(entries.length>limit)entries.shift();index=entries.length-1;group=key;},undo(){group=null;if(index>0)index--;return copy(entries[index]);},redo(){group=null;if(index<entries.length-1)index++;return copy(entries[index]);},get canUndo(){return index>0;},get canRedo(){return index<entries.length-1;}};
}

export function editedImageName(name,format='jpeg'){if(!['jpeg','png'].includes(format))throw Error('Ungültiges Ausgabeformat.');const stem=String(name??'bild').replace(/\.[^.]*$/,'').replace(/[\\/:*?"<>|\u0000-\u001f\u007f-\u009f]/g,' ').trim();return Array.from(stem||'bild').slice(0,100).join('')+'-bearbeitet.'+(format==='png'?'png':'jpg');}
