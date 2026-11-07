/** Shared informational rendering. Existing readiness controllers remain authoritative. */
const PROVIDERS=new Set(['instagram','linkedin','youtube','x']);
const CALLBACKS=Object.freeze({linkedin:'/api/providers/linkedin/oauth/callback',youtube:'/api/providers/youtube/oauth/callback'});
const HELP_HOSTS=new Set(['learn.microsoft.com','developers.google.com','support.google.com','developers.facebook.com','developers.meta.com','docs.x.com','developer.x.com','www.youtube.com','console.developers.google.com']);
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const text=(value,max=1500)=>typeof value==='string'&&value.length>0&&value.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
function plain(value,keys){if(!value||Object.getPrototypeOf(value)!==Object.prototype)return false;const descriptors=Object.getOwnPropertyDescriptors(value);return Reflect.ownKeys(descriptors).length===keys.length&&keys.every(key=>{const d=descriptors[key];return d&&Object.hasOwn(d,'value')&&d.enumerable;});}
function helpURL(raw){try{const u=new URL(raw);return typeof raw==='string'&&raw===u.href&&u.protocol==='https:'&&HELP_HOSTS.has(u.hostname)&&!u.port&&!u.username&&!u.password&&!u.hash&&[...u.searchParams].every(([k,v])=>k==='hl'&&['de','en'].includes(v))&&u.searchParams.size<=1&&!/[\s\\]/.test(raw);}catch{return false;}}
function validate(data){
  if(!plain(data,['provider','title','summary','steps','callbackPath','limitations'])||!PROVIDERS.has(data.provider)||!text(data.title,80)||!text(data.summary,300)||data.callbackPath!==(CALLBACKS[data.provider]||null)||!Array.isArray(data.steps)||data.steps.length!==3||!Array.isArray(data.limitations)||data.limitations.length>8)throw new Error('Setup-Anleitung ist nicht verfügbar.');
  const ids=new Set();
  for(const s of data.steps){
    if(!plain(s,['id','title','description','details','links'])||!text(s.id,64)||!/^[a-z][a-z0-9-]*$/.test(s.id)||ids.has(s.id)||!text(s.title,100)||!text(s.description,350)||!Array.isArray(s.details)||s.details.length>8||s.details.some(d=>!text(d))||!Array.isArray(s.links)||s.links.length>6||s.links.some(l=>!plain(l,['label','url'])||!text(l.label,160)||!text(l.url,2048)||!helpURL(l.url)))throw new Error('Setup-Anleitung ist nicht verfügbar.');ids.add(s.id);
  }
  if(data.limitations.some(v=>!text(v)))throw new Error('Setup-Anleitung ist nicht verfügbar.');return data;
}
/** Display aid only. A valid address is not evidence of app registration or callback safety. */
export function setupCallbackURL(provider,siteOrigin){
  if(!PROVIDERS.has(provider))throw new Error('Unbekannter Anbieter.');
  if(!CALLBACKS[provider]||typeof siteOrigin!=='string')return null;
  try{const u=new URL(siteOrigin);if(siteOrigin!==u.origin||u.protocol!=='https:'||u.port||u.username||u.password||!u.hostname.includes('.')||u.hostname.endsWith('.localhost')||/^\d+(?:\.\d+){3}$/.test(u.hostname)||u.hostname.includes(':'))return null;return u.origin+CALLBACKS[provider];}catch{return null;}
}
export function renderProviderSetup(data,{siteOrigin=null,expandedDetails=[]}={}){
  validate(data);const callback=setupCallbackURL(data.provider,siteOrigin),open=new Set(expandedDetails),prefix=`setup-${data.provider}`;
  return `<section class="provider-setup" aria-labelledby="${prefix}-title"><h3 id="${prefix}-title">${escape(data.title)}</h3><p class="setup-summary">${escape(data.summary)}</p><ol class="setup-steps">${data.steps.map((step,index)=>{const key=`${prefix}-${step.id}`;return `<li><div class="setup-step-heading"><span aria-hidden="true">${index+1}</span><h4>${escape(step.title)}</h4></div><p>${escape(step.description)}</p>${step.details.length||step.links.length?`<details data-setup-key="${key}" ${open.has(key)?'open':''}><summary>Details zu Schritt ${index+1}</summary><div>${step.details.map(item=>`<p>${escape(item)}</p>`).join('')}${step.links.length?`<ul class="setup-links">${step.links.map(link=>`<li><a href="${escape(link.url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${escape(link.label)} <span class="sr-only">(neuer Tab)</span></a></li>`).join('')}</ul>`:''}</div></details>`:''}</li>`;}).join('')}</ol>${data.callbackPath?`<details data-setup-key="${prefix}-callback" ${open.has(`${prefix}-callback`)?'open':''}><summary>Rückkehradresse für die App</summary><div>${callback?`<label for="${prefix}-callback-value">Exakt registrieren</label><input id="${prefix}-callback-value" readonly value="${escape(callback)}" spellcheck="false" autocomplete="off"><button type="button" class="button subtle" data-provider-setup-copy="${data.provider}">Adresse kopieren</button><p>Diese Adresse allein bestätigt weder App-Registrierung noch sichere Rückkehr.</p>`:'<p>Eine lokale Vorschau hat keine gültige Live-Rückkehradresse. Öffne die ausdrücklich freigegebene private HTTPS-Site.</p>'}<p class="setup-copy-feedback" data-setup-feedback="${data.provider}" role="status" aria-live="polite"></p></div></details>`:''}${data.limitations.length?`<details data-setup-key="${prefix}-limits" ${open.has(`${prefix}-limits`)?'open':''}><summary>Was noch nicht möglich ist</summary><ul>${data.limitations.map(item=>`<li>${escape(item)}</li>`).join('')}</ul></details>`:''}<p class="setup-disclaimer">Anleitung, keine Freigabe. Der bestätigte Serverstatus entscheidet.</p></section>`;
}

/** Only an explicit click copies the derived public callback. No HTTP or OAuth. */
export function createProviderSetupActions({container,siteOrigin,visible=()=>true,writeText=globalThis.navigator?.clipboard?.writeText?.bind(globalThis.navigator.clipboard),timeoutMs=2000}={}){
  if(!container?.addEventListener||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw new Error('Ungültige Setup-Bedienung.');
  let disposed=false,generation=0;
  function feedback(provider,message){const node=container.querySelector?.(`[data-setup-feedback="${provider}"]`);if(node)node.textContent=message;}
  async function copy(provider){
    if(disposed||!visible()||!PROVIDERS.has(provider))return;
    const value=setupCallbackURL(provider,siteOrigin);if(!value)return;
    const current=++generation;
    if(typeof writeText!=='function'){feedback(provider,'Adresse bitte im Feld markieren und kopieren.');return;}
    let timer;feedback(provider,'Adresse wird kopiert.');
    try{await Promise.race([Promise.resolve().then(()=>{if(disposed||!visible()||current!==generation)throw new Error('closed');return writeText(value);}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),timeoutMs);})]);if(!disposed&&visible()&&current===generation)feedback(provider,'Rückkehradresse kopiert.');}
    catch{if(!disposed&&visible()&&current===generation)feedback(provider,'Kopieren nicht bestätigt. Adresse bei Bedarf im Feld markieren und kopieren.');}
    finally{clearTimeout(timer);}
  }
  function click(event){if(disposed||!visible())return;const target=event.target?.closest?.('[data-provider-setup-copy]');if(!target||!container.contains?.(target))return;const provider=target.dataset?.providerSetupCopy;if(!PROVIDERS.has(provider))return;event.preventDefault?.();void copy(provider);}
  container.addEventListener('click',click);
  return{invalidate(){generation++;},destroy(){disposed=true;generation++;container.removeEventListener('click',click);}};
}
