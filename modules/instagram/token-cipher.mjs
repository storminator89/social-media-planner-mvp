/** Server-only, explicit runtime keyring. No generation, fallback key, or network. */
const branded=new WeakSet();
export class InstagramDataError extends Error{constructor(code,status=400){super(code);this.code=code;this.status=status;}}
export function fail(code,status=400){throw new InstagramDataError(code,status);}
export const fingerprint=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export const textId=v=>typeof v==='string'&&v.length>0&&v.length<=256&&v.trim()===v&&!/[\u0000-\u001f\u007f]/.test(v);
export const accountId=v=>typeof v==='string'&&/^[1-9][0-9]{0,30}$/.test(v);
export const integer=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
export function snapshot(source,keys,code='INPUT_INVALID'){
 try{if(!source||Object.getPrototypeOf(source)!==Object.prototype)fail(code);const descriptors=Object.getOwnPropertyDescriptors(source);if(Reflect.ownKeys(descriptors).length!==keys.length)fail(code);const out={};for(const key of keys){const d=descriptors[key];if(!d||!Object.hasOwn(d,'value')||!d.enumerable)fail(code);out[key]=d.value;}return out;}catch{fail(code);}
}
export function strings(source,limit=20,code='INPUT_INVALID'){
 try{if(!Array.isArray(source)||source.length>limit)fail(code);const d=Object.getOwnPropertyDescriptors(source);if(Reflect.ownKeys(d).length!==source.length+1)fail(code);const result=[];for(let i=0;i<source.length;i++){if(!d[i]||!Object.hasOwn(d[i],'value')||typeof d[i].value!=='string')fail(code);result.push(d[i].value);}return result;}catch{fail(code);}
}
export async function sha256(value){try{return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');}catch{fail('CRYPTO_UNAVAILABLE',503);}}
export function opaque(){return url64(crypto.getRandomValues(new Uint8Array(32)));}
export function validToken(v){return typeof v==='string'&&v.length<=8192&&/^[A-Za-z0-9\-._~+/]+=*$/.test(v);}
function binary64(b){let s='';for(const n of b)s+=String.fromCharCode(n);return btoa(s);}
function url64(b){return binary64(b).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
function decode(v,max){if(typeof v!=='string'||v.length>max||!/^[A-Za-z0-9_-]+$/.test(v))fail('ENVELOPE_INVALID');let b;try{b=Uint8Array.from(atob(v.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-v.length%4)%4)),x=>x.charCodeAt(0));}catch{fail('ENVELOPE_INVALID');}if(url64(b)!==v)fail('ENVELOPE_INVALID');return b;}
export function contextSnapshot(source){const c=snapshot(source,['siteId','ownerId','provider','configFingerprint','contextFingerprint','expectedAccountId'],'CIPHER_CONTEXT_INVALID');if(!textId(c.siteId)||!textId(c.ownerId)||c.provider!=='instagram'||!fingerprint(c.configFingerprint)||!fingerprint(c.contextFingerprint)||!accountId(c.expectedAccountId))fail('CIPHER_CONTEXT_INVALID');return c;}
function bindingSnapshot(purpose,source){
 if(purpose!=='token')fail('CIPHER_PURPOSE_INVALID');
 const b=snapshot(source,['connectionId','revision','stateHash','accountId','verifiedAtMs'],'CIPHER_BINDING_INVALID');
 if(!textId(b.connectionId)||!integer(b.revision,1)||!fingerprint(b.stateHash)||!accountId(b.accountId)||!integer(b.verifiedAtMs))fail('CIPHER_BINDING_INVALID');
 return b;
}
function valueValid(purpose,v){return purpose==='token'&&validToken(v);}
export function isInstagramCipher(v){return branded.has(v);}
export async function createInstagramCipherFromRuntime(env){
 const raw=env?.TAKT_INSTAGRAM_TOKEN_KEYRING_JSON;if(typeof raw!=='string'||!raw||raw.length>8192)fail('TOKEN_KEYRING_UNAVAILABLE',503);let cfg;try{cfg=JSON.parse(raw);}catch{fail('TOKEN_KEYRING_INVALID',503);}cfg=snapshot(cfg,['activeKeyId','keys'],'TOKEN_KEYRING_INVALID');
 const kid=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,40}$/.test(v);if(!kid(cfg.activeKeyId)||!cfg.keys||Object.getPrototypeOf(cfg.keys)!==Object.prototype)fail('TOKEN_KEYRING_INVALID',503);const active=cfg.activeKeyId,entries=Object.entries(cfg.keys);if(entries.length<1||entries.length>4||!Object.hasOwn(cfg.keys,active))fail('TOKEN_KEYRING_INVALID',503);
 const material=entries.map(([id,v])=>{if(!kid(id)||typeof v!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(v))fail('TOKEN_KEYRING_INVALID',503);let b;try{b=Uint8Array.from(atob(v),x=>x.charCodeAt(0));}catch{fail('TOKEN_KEYRING_INVALID',503);}if(b.length!==32||binary64(b)!==v)fail('TOKEN_KEYRING_INVALID',503);return[id,b];});
 const keys=new Map();try{for(const[id,b]of material)keys.set(id,await crypto.subtle.importKey('raw',b,{name:'AES-GCM'},false,['encrypt','decrypt']));}catch{fail('TOKEN_KEYRING_INVALID',503);}finally{for(const[,b]of material)b.fill(0);}
 function aad(p,c,b,id){return new TextEncoder().encode(JSON.stringify(['takt-instagram',1,'A256GCM',p,id,c,b]));}
 const api=Object.freeze({
  async seal(purpose,context,binding,value){const c=contextSnapshot(context),b=bindingSnapshot(purpose,binding);if(!valueValid(purpose,value))fail('SECRET_VALUE_INVALID');const iv=crypto.getRandomValues(new Uint8Array(12)),plain=new TextEncoder().encode(JSON.stringify({value}));try{const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(purpose,c,b,active),tagLength:128},keys.get(active),plain);return Object.freeze({version:1,algorithm:'A256GCM',keyId:active,iv:url64(iv),ciphertext:url64(new Uint8Array(data))});}catch{fail('ENCRYPTION_FAILED',503);}finally{plain.fill(0);}},
  async open(purpose,context,binding,source){const c=contextSnapshot(context),b=bindingSnapshot(purpose,binding),e=snapshot(source,['version','algorithm','keyId','iv','ciphertext'],'ENVELOPE_INVALID');if(e.version!==1||e.algorithm!=='A256GCM'||!kid(e.keyId))fail('ENVELOPE_INVALID');const iv=decode(e.iv,16),data=decode(e.ciphertext,16000);if(iv.length!==12||data.length<17)fail('ENVELOPE_INVALID');const key=keys.get(e.keyId);if(!key)fail('TOKEN_KEY_UNAVAILABLE',503);let plain;try{plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:aad(purpose,c,b,e.keyId),tagLength:128},key,data));const payload=snapshot(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plain)),['value'],'ENVELOPE_INVALID');if(!valueValid(purpose,payload.value))fail('ENVELOPE_INVALID');return payload.value;}catch{fail('DECRYPTION_FAILED',503);}finally{plain?.fill(0);}}
 });branded.add(api);return api;
}
