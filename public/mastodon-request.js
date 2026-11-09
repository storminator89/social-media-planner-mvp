/** One deadline covers transport and body parsing; abort is not proof of non-execution. */
export async function boundedMastodonRequest(url,options={}, {json=true,timeoutMs=8000}={}){
 const controller=new AbortController();let timer,removeAbort=()=>{};
 const aborted=new Promise((_,reject)=>{const stop=()=>{controller.abort();reject(Object.assign(Error('Anfrage abgebrochen.'),{name:'AbortError'}));};if(options.signal?.aborted)stop();else if(options.signal){options.signal.addEventListener('abort',stop,{once:true});removeAbort=()=>options.signal.removeEventListener('abort',stop);}});
 try{return await Promise.race([
  (async()=>{if(controller.signal.aborted)throw Object.assign(Error('Anfrage abgebrochen.'),{name:'AbortError'});const response=await fetch(url,{...options,signal:controller.signal});const value=json?await response.json():null;return{response,value};})(),
  aborted,
  new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Object.assign(Error('Zeitlimit erreicht.'),{name:'TimeoutError'}));},timeoutMs);})
 ]);}finally{clearTimeout(timer);removeAbort();controller.abort();}
}
