/** Read-only profile readiness. Never grants access or infers publishing rights. */
const PHASES=new Set(['recovered','recovery_pending','verification_pending','revocation_pending','revoked','not_configured','not_connected','pending','registration_outcome_unknown','authorization_outcome_unknown','exchange_outcome_unknown','declined','linked']);
export function normalizeMastodonStatus(v){
 if(!v||v.provider!=='mastodon'||v.canPublish!==false||v.scope!=='profile'||v.instance!=='https://kanoa.de'||!PHASES.has(v.phase)||typeof v.canStart!=='boolean'||v.canStart!==(['not_connected','revoked','recovered'].includes(v.phase)))throw Error('Status nicht bestätigt');
 return {phase:v.phase,verifiedAtMs:Number.isSafeInteger(v.verifiedAtMs)?v.verifiedAtMs:null};
}
export function mastodonStatusCopy({phase='idle',state=null}={}){
 if(phase==='loading')return ['Wird geprüft','unknown'];
 if(phase!=='ready'||!state)return ['Status nicht verfügbar','unknown'];
 if(state.phase==='linked')return ['Profil verbunden','linked'];
 if(state.phase==='not_configured')return ['Einrichtung erforderlich','setup'];
 if(['not_connected','revoked','recovered','declined'].includes(state.phase))return ['Nicht verbunden','neutral'];
 if(state.phase==='pending')return ['Freigabe ausstehend','approval'];
 return ['Prüfung erforderlich','error'];
}
export function createMastodonStatusReader({fetcher=globalThis.fetch.bind(globalThis),onChange=()=>{},timeoutMs=10000}={}){
 let generation=0,controller=null,snapshot={phase:'idle',state:null};
 const emit=()=>onChange(snapshot);
 return {
  get snapshot(){return snapshot;},
  async refresh(){
   const current=++generation;
   controller?.abort();
   controller=new AbortController();
   const active=controller;
   let timeout;
   snapshot={phase:'loading',state:null};emit();
   try{
    // Bound the entire read, including JSON parsing, even if abort is ignored.
    const state=await Promise.race([
     (async()=>{
      const response=await fetcher('/api/providers/mastodon/oauth/readiness',{credentials:'same-origin',cache:'no-store',redirect:'error',signal:active.signal});
      if(!response.ok||!response.headers.get('Content-Type')?.includes('application/json'))throw Error();
      return normalizeMastodonStatus(await response.json());
     })(),
     new Promise((_,reject)=>{timeout=setTimeout(()=>{active.abort();reject(Error('Status timeout'));},timeoutMs);})
    ]);
    if(current!==generation)return;
    snapshot={phase:'ready',state};
   }catch{
    if(current!==generation)return;
    snapshot={phase:'error',state:null};
   }finally{clearTimeout(timeout);}
   emit();
  },
  hide(){generation++;controller?.abort();snapshot={phase:'idle',state:null};},
  destroy(){this.hide();}
 };
}
