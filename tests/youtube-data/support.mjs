import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
import {YouTubeOAuthStateRepository} from '../../modules/oauth/youtube-state-repository.mjs';
import {createYouTubeCipherFromRuntime} from '../../modules/providers/youtube-cipher.mjs';
import {YouTubeCredentialStore} from '../../modules/providers/youtube-credential-store.mjs';
export const hash=value=>createHash('sha256').update(value).digest('hex');
export const opaque=()=>randomBytes(32).toString('base64url');
export const config=()=>{
 const scopeFingerprint=hash(JSON.stringify(['openid','https://www.googleapis.com/auth/youtube.upload','https://www.googleapis.com/auth/youtube.readonly']));
 const fields={provider:'youtube',flowVersion:'youtube-web-pkce-v1',siteId:'test-site',siteOrigin:'https://takt.example',clientId:'123456-test.apps.googleusercontent.com',redirectUri:'https://takt.example/api/providers/youtube/oauth/callback',expectedChannelId:'UCabcdefghijklmnopqrstuv',issuer:'https://accounts.google.com',scopeFingerprint};
 const context={action:'connect_new',targetConnectionId:null,appConfigVersion:'v1',expectedChannelId:fields.expectedChannelId};
 return {...fields,configFingerprint:hash(JSON.stringify(fields)),contextFingerprint:hash(JSON.stringify(context))};
};
// Public synthetic test bytes only. No real credential/key is generated or used.
export const keyring=(active='test1',keys=['test1'])=>({TAKT_TOKEN_KEYRING_JSON:JSON.stringify({activeKeyId:active,keys:Object.fromEntries(keys.map(id=>[id,Buffer.alloc(32,id==='test1'?1:2).toString('base64')]))})});
export const context=(overrides={})=>({siteId:'test-site',ownerId:'alice',provider:'youtube',connectionId:'test-connection',configFingerprint:config().configFingerprint,contextFingerprint:config().contextFingerprint,...overrides});
export const metadata=(overrides={})=>({revision:1,epoch:1,subject:'verified-subject',channelId:'UCabcdefghijklmnopqrstuv',scopes:['openid','https://www.googleapis.com/auth/youtube.upload','https://www.googleapis.com/auth/youtube.readonly'],expiresAtMs:2_000_000,...overrides});
export const grant=(overrides={})=>({accessToken:'synthetic-access-token-not-a-live-secret',tokenType:'Bearer',subject:'verified-subject',channelId:'UCabcdefghijklmnopqrstuv',scopes:['openid','https://www.googleapis.com/auth/youtube.upload','https://www.googleapis.com/auth/youtube.readonly'],expiresAtMs:2_000_000,...overrides});
export class D1TestAdapter{
  constructor({migrate=true}={}){this.sql=new DatabaseSync(':memory:');this.sql.exec('PRAGMA foreign_keys=ON');for(const name of ['0001_planner.sql','0002_variant_inheritance.sql','0003_provider_jobs.sql','0004_oauth_state.sql','0005_provider_credentials.sql'])this.sql.exec(readFileSync(new URL(`../../server/${name}`,import.meta.url),'utf8'));if(migrate)this.migrate();}
  migrate(){this.sql.exec(readFileSync(new URL('../../server/0006_youtube_lifecycle.sql',import.meta.url),'utf8'));}
  prepare(query){const db=this.sql,adapter=this;let values=[];return{bind(...args){values=args;return this;},async all(){return{results:db.prepare(query).all(...values)};},async first(){if(adapter.beforeRead){const h=adapter.beforeRead;adapter.beforeRead=null;await h(query);}return db.prepare(query).get(...values)??null;},async run(){if(adapter.beforeRun){const h=adapter.beforeRun;adapter.beforeRun=null;await h(query);}if(adapter.failRun)throw Error('synthetic private provider detail');const r={meta:{changes:Number(db.prepare(query).run(...values).changes)}};if(adapter.unknownRun)throw Error('synthetic private provider detail');return r;},_exec(){const statement=db.prepare(query);return /^\s*SELECT/i.test(query)?{results:statement.all(...values),meta:{changes:0}}:{results:[],meta:{changes:Number(statement.run(...values).changes)}};}};}
  async batch(statements){if(this.beforeBatch){const h=this.beforeBatch;this.beforeBatch=null;await h();}this.sql.exec('BEGIN');let result;try{result=statements.map((s,i)=>{if(this.failStatement===i)throw Error('synthetic private provider detail');return s._exec();});this.sql.exec('COMMIT');}catch(error){this.sql.exec('ROLLBACK');throw error;}if(this.unknownBatch){this.unknownBatch=false;throw Error('synthetic private provider detail');}return result;}
}
export async function setup(overrides={}){
 const db=new D1TestAdapter();let now=1_000_000;const cfg=config();const clock=()=>now;const cipher=await createYouTubeCipherFromRuntime(keyring());const store=new YouTubeCredentialStore(db,{...cfg,cipher,clock,...overrides});const stateRepo=new YouTubeOAuthStateRepository(db,{...cfg,cipher,clock});
 async function begin(who='alice'){const binding=opaque(),pkceVerifier=opaque();const pending=await stateRepo.begin(who,binding,{nonceFingerprint:hash(opaque()),pkceVerifier});return{...pending,pkceVerifier,binding,hash:hash(pending.state),who};}
 async function ticket(pending){return store.createInstallTicket(pending.who,{stateHash:pending.hash,expiresAtMs:pending.expiresAtMs});}
 async function checkout(pending){const claimed=await stateRepo.claim(pending.who,pending.state,pending.binding);if(!claimed)throw Error('fixture claim failed');return store.getInstallTicket(pending.who,pending.hash);}
 const binding=p=>({ownerId:p.who,siteId:cfg.siteId,configFingerprint:cfg.configFingerprint,contextFingerprint:cfg.contextFingerprint,stateHash:p.hash,expectedChannelId:cfg.expectedChannelId});
 return{db,store,stateRepo,cfg,cipher,clock,begin,ticket,checkout,binding,setNow:v=>{now=v;},getNow:()=>now};
}
