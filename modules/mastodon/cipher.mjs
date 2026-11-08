const fail=code=>{throw new Error(code);};
const branded=new WeakSet();
const encoder=new TextEncoder();
function base64(bytes){return btoa(String.fromCharCode(...bytes));}
function decode(value){if(typeof value!=='string'||value.length>262144||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))fail('ENVELOPE_INVALID');const bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));if(base64(bytes)!==value)fail('ENVELOPE_INVALID');return bytes;}
export async function createMastodonCipher(source){
 if(typeof source!=='string'||source.length>8192)fail('KEYRING_REQUIRED');
 const cfg=JSON.parse(source),validId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,40}$/.test(v);
 if(!cfg||Object.keys(cfg).sort().join(',')!=='activeKeyId,keys'||!validId(cfg.activeKeyId)||!cfg.keys||Array.isArray(cfg.keys)||typeof cfg.keys!=='object')fail('KEYRING_INVALID');
 const entries=Object.entries(cfg.keys);if(entries.length<1||entries.length>4||!Object.hasOwn(cfg.keys,cfg.activeKeyId))fail('KEYRING_INVALID');
 const keys=new Map();for(const [id,value]of entries){if(!validId(id))fail('KEYRING_INVALID');const bytes=decode(value);try{if(bytes.length!==32)fail('KEYRING_INVALID');keys.set(id,await crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']));}finally{bytes.fill(0);}}
 const aad=(context,version,id)=>encoder.encode(JSON.stringify(['takt-mastodon-aggregate',1,'A256GCM',id,context,version]));
 const api=Object.freeze({async seal(context,version,value){const iv=crypto.getRandomValues(new Uint8Array(12)),plain=encoder.encode(JSON.stringify(value));try{if(plain.length>131072)fail('STORE_CAPACITY');const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(context,version,cfg.activeKeyId)},keys.get(cfg.activeKeyId),plain);return JSON.stringify({v:1,k:cfg.activeKeyId,iv:base64(iv),data:base64(new Uint8Array(data))});}finally{plain.fill(0);}},async open(context,version,source){if(typeof source!=='string'||source.length>262144)fail('ENVELOPE_INVALID');const e=JSON.parse(source);if(Object.keys(e).sort().join(',')!=='data,iv,k,v'||e.v!==1||!keys.has(e.k))fail('ENVELOPE_INVALID');const iv=decode(e.iv),data=decode(e.data);if(iv.length!==12||data.length<17)fail('ENVELOPE_INVALID');let plain;try{plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:aad(context,version,e.k)},keys.get(e.k),data));return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plain));}finally{plain?.fill(0);}}});branded.add(api);return api;
}
