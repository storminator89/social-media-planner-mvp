/** Application-managed AEAD on documented Worker WebCrypto, not a native vault.
 * Keys are supplied explicitly as a Sites runtime secret. No generation/fallback.
 * This file must remain server-only, never be served from public/ or logged. */
const handles=new WeakSet();
export class TokenStoreError extends Error{constructor(status,code){super(code);this.status=status;this.code=code;}}
export function fail(code,status=400){throw new TokenStoreError(status,code);}
export const fingerprint=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export const textId=value=>typeof value==='string'&&value.length>0&&value.length<=256&&!/[\u0000-\u001f\u007f]/.test(value);
const keyId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,40}$/.test(value);
const exact=(obj,keys)=>obj&&typeof obj==='object'&&!Array.isArray(obj)&&Object.keys(obj).sort().join('|')===[...keys].sort().join('|');
function bytesTo64(bytes){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s);}
function url64(bytes){return bytesTo64(bytes).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
function fromUrl64(value,max){if(typeof value!=='string'||value.length>max||!value.length||!/^[A-Za-z0-9_-]+$/.test(value))fail('CIPHER_INVALID');let bytes;try{bytes=Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));}catch{fail('CIPHER_INVALID');}if(url64(bytes)!==value)fail('CIPHER_INVALID');return bytes;}
export function dataSnapshot(input,keys,code){
  if(!input||Object.getPrototypeOf(input)!==Object.prototype)fail(code);
  const descriptors=Object.getOwnPropertyDescriptors(input);
  if(Reflect.ownKeys(descriptors).length!==keys.length)fail(code);
  const value={};for(const key of keys){const descriptor=descriptors[key];if(!descriptor||!Object.hasOwn(descriptor,'value')||!descriptor.enumerable)fail(code);value[key]=descriptor.value;}
  return value;
}
export function stringArraySnapshot(input,limit,code){
  if(!Array.isArray(input)||input.length>limit)fail(code);
  const descriptors=Object.getOwnPropertyDescriptors(input);if(Reflect.ownKeys(descriptors).length!==input.length+1)fail(code);
  const result=[];for(let i=0;i<input.length;i++){const d=descriptors[i];if(!d||!Object.hasOwn(d,'value')||typeof d.value!=='string')fail(code);result.push(d.value);}return result;
}
function contextSnapshot(source){
  const context=dataSnapshot(source,['siteId','ownerId','provider','connectionId','configFingerprint','contextFingerprint'],'CIPHER_CONTEXT_INVALID');
  if(!textId(context.siteId)||!textId(context.ownerId)||!textId(context.connectionId)||context.provider!=='linkedin'||!fingerprint(context.configFingerprint)||!fingerprint(context.contextFingerprint))fail('CIPHER_CONTEXT_INVALID');return context;
}
function metadataSnapshot(source){
  const meta=dataSnapshot(source,['revision','epoch','subject','scopes','expiresAtMs'],'CIPHER_METADATA_INVALID');
  meta.scopes=stringArraySnapshot(meta.scopes,20,'CIPHER_METADATA_INVALID');
  if(!Number.isSafeInteger(meta.revision)||meta.revision<1||!Number.isSafeInteger(meta.epoch)||meta.epoch<1||!textId(meta.subject)||meta.scopes.some(s=>s.length>100)||!Number.isSafeInteger(meta.expiresAtMs)||meta.expiresAtMs<0)fail('CIPHER_METADATA_INVALID');return meta;
}
function aad(ctx,meta,kid){return new TextEncoder().encode(JSON.stringify(['takt-provider-token',1,'A256GCM',kid,ctx.siteId,ctx.ownerId,ctx.provider,ctx.connectionId,ctx.configFingerprint,ctx.contextFingerprint,meta.revision,meta.epoch,meta.subject,meta.scopes,meta.expiresAtMs]));}
export function validateAccessToken(value){if(typeof value!=='string'||value.length<1||value.length>8192||!/^[A-Za-z0-9\-._~+/]+=*$/.test(value))fail('TOKEN_INVALID');return value;}
export function isTokenCipher(value){return handles.has(value);}
export async function createTokenCipherFromRuntime(env){
  // Snapshot every caller-supplied value before the first await.
  const raw=env?.TAKT_TOKEN_KEYRING_JSON;if(typeof raw!=='string'||!raw||raw.length>8192)fail('TOKEN_KEYRING_UNAVAILABLE',503);
  let cfg;try{cfg=JSON.parse(raw);}catch{fail('TOKEN_KEYRING_INVALID',503);}
  if(!exact(cfg,['activeKeyId','keys'])||!keyId(cfg.activeKeyId)||!cfg.keys||typeof cfg.keys!=='object'||Array.isArray(cfg.keys))fail('TOKEN_KEYRING_INVALID',503);
  const active=cfg.activeKeyId;const entries=Object.entries(cfg.keys);if(entries.length<1||entries.length>4||!Object.hasOwn(cfg.keys,active))fail('TOKEN_KEYRING_INVALID',503);
  const materials=entries.map(([kid,value])=>{if(!keyId(kid)||typeof value!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(value))fail('TOKEN_KEYRING_INVALID',503);let bytes;try{bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));}catch{fail('TOKEN_KEYRING_INVALID',503);}if(bytes.length!==32||bytesTo64(bytes)!==value)fail('TOKEN_KEYRING_INVALID',503);return[kid,bytes];});
  const keys=new Map();try{for(const [kid,bytes]of materials)keys.set(kid,await crypto.subtle.importKey('raw',bytes,{name:'AES-GCM'},false,['encrypt','decrypt']));}catch{fail('TOKEN_KEYRING_INVALID',503);}finally{for(const [,bytes]of materials)bytes.fill(0);}
  const api=Object.freeze({
    async seal(context,metadata,accessToken){
      const ctx=contextSnapshot(context),meta=metadataSnapshot(metadata),token=validateAccessToken(accessToken);
      const iv=crypto.getRandomValues(new Uint8Array(12));const plain=new TextEncoder().encode(JSON.stringify({accessToken:token,tokenType:'Bearer'}));
      try{const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(ctx,meta,active),tagLength:128},keys.get(active),plain);return Object.freeze({version:1,algorithm:'A256GCM',keyId:active,iv:url64(iv),ciphertext:url64(new Uint8Array(encrypted))});}catch{fail('TOKEN_ENCRYPTION_FAILED',503);}finally{plain.fill(0);}
    },
    async open(context,metadata,envelope){
      const ctx=contextSnapshot(context),meta=metadataSnapshot(metadata);
      envelope=dataSnapshot(envelope,['version','algorithm','keyId','iv','ciphertext'],'CIPHER_INVALID');
      if(!exact(envelope,['version','algorithm','keyId','iv','ciphertext'])||envelope.version!==1||envelope.algorithm!=='A256GCM'||!keyId(envelope.keyId))fail('CIPHER_INVALID');
      const kid=envelope.keyId,iv=fromUrl64(envelope.iv,16),ciphertext=fromUrl64(envelope.ciphertext,24000);if(iv.length!==12||ciphertext.length<17)fail('CIPHER_INVALID');const key=keys.get(kid);if(!key)fail('TOKEN_KEY_UNAVAILABLE',503);
      let plain;try{plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:aad(ctx,meta,kid),tagLength:128},key,ciphertext));const payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plain));if(!exact(payload,['accessToken','tokenType'])||payload.tokenType!=='Bearer')fail('CIPHER_INVALID');return validateAccessToken(payload.accessToken);}catch{fail('TOKEN_DECRYPTION_FAILED',503);}finally{plain?.fill(0);}
    }
  });handles.add(api);return api;
}
