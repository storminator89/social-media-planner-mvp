/** Local-only preparation. No upload or mutation until every image is decoded. */
export function validateImageBatch(files,count){
 if(!Array.isArray(files)||!files.length||!Number.isInteger(count)||count<0||count+files.length>10)throw Error('Ein Beitrag erlaubt höchstens 10 Bilder.');
 for(const file of files){
  if(!['image/png','image/jpeg','image/webp'].includes(file?.type))throw Error(`${file?.name||'Bild'}: Bitte wähle ein JPG-, PNG- oder WebP-Bild.`);
  if(!Number.isFinite(file.size)||file.size<=0||file.size>2*1024*1024)throw Error(`${file.name||'Bild'}: Bitte wähle ein Bild mit höchstens 2 MB.`);
 }
}
export async function decodeComposerImage(file){
    const dataUrl=await new Promise((resolve,reject)=>{
      const reader=new FileReader();let settled=false;
      const finish=(error,abort=false)=>{if(settled)return;settled=true;clearTimeout(timer);reader.onload=null;reader.onerror=null;reader.onabort=null;if(abort){try{reader.abort?.();}catch{}}error?reject(error):resolve(reader.result);};
      const timer=setTimeout(()=>finish(Error('Das Bild konnte nicht rechtzeitig gelesen werden.'),true),15000);
      reader.onload=()=>finish();reader.onerror=()=>finish(Error('Das Bild konnte nicht gelesen werden.'));reader.onabort=()=>finish(Error('Dateiauswahl wurde abgebrochen.'));
      try{reader.readAsDataURL(file);}catch(error){finish(error);}
    });
    await new Promise((resolve,reject)=>{
      const img=new Image();let settled=false;
      const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);img.onload=null;img.onerror=null;if(error){img.src='';reject(error);}else resolve();};
      const timer=setTimeout(()=>finish(Error('Das Bild konnte nicht rechtzeitig geladen werden.')),15000);
      img.onload=()=>finish(!Number.isInteger(img.naturalWidth)||!Number.isInteger(img.naturalHeight)||img.naturalWidth<=0||img.naturalHeight<=0||img.naturalWidth>16384||img.naturalHeight>16384||img.naturalWidth*img.naturalHeight>40_000_000?Error('Dieses Bild ist zu groß oder kann nicht gelesen werden.'):null);img.onerror=()=>finish(Error('Dieses Bild konnte nicht geladen werden.'));
      try{img.src=dataUrl;}catch(error){finish(error);}
    });
 return {dataUrl,name:file.name,type:file.type,alt:''};
}
export async function prepareImageBatch(files,{count,current=()=>true,decode=decodeComposerImage}){
 const selected=Array.from(files);
 validateImageBatch(selected,count);
 const items=[];
 for(const file of selected){
  if(!current())return null;
  try{items.push(await decode(file));}catch(error){if(!current())return null;throw Error(`${file.name||'Bild'}: ${error.message||'Dieses Bild konnte nicht geladen werden.'}`);}
  if(!current())return null;
 }
 return items;
}
