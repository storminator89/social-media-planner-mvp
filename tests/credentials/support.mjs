import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
import {OAuthStateRepository} from '../../modules/oauth/state-repository.mjs';
import {createTokenCipherFromRuntime} from '../../modules/providers/token-cipher.mjs';
import {CredentialStore} from '../../modules/providers/credential-store.mjs';
export const hash=value=>createHash('sha256').update(value).digest('hex');
export const opaque=()=>randomBytes(32).toString('base64url');
export const config=()=>({siteId:'test-site',provider:'linkedin',redirectUri:'https://takt.example/api/providers/linkedin/oauth/callback',scopeFingerprint:hash(JSON.stringify(['openid','profile','w_member_social'])),configFingerprint:hash('test-public-configuration'),flowVersion:'linkedin-web-preparation-v1',contextFingerprint:hash(JSON.stringify({action:'connect_new',targetConnectionId:null,appConfigVersion:'v1'}))});
// Public synthetic test bytes only. No real credential/key is generated or used.
export const keyring=(active='test1',keys=['test1'])=>({TAKT_TOKEN_KEYRING_JSON:JSON.stringify({activeKeyId:active,keys:Object.fromEntries(keys.map(id=>[id,Buffer.alloc(32,id==='test1'?1:2).toString('base64')]))})});
export const context=(overrides={})=>({siteId:'test-site',ownerId:'alice',provider:'linkedin',connectionId:'test-connection',configFingerprint:config().configFingerprint,contextFingerprint:config().contextFingerprint,...overrides});
export const metadata=(overrides={})=>({revision:1,epoch:1,subject:'verified-subject',scopes:['openid','profile','w_member_social'],expiresAtMs:2_000_000,...overrides});
export const grant=(overrides={})=>({accessToken:'synthetic-access-token-not-a-live-secret',tokenType:'Bearer',subject:'verified-subject',scopes:['openid','profile','w_member_social'],expiresAtMs:2_000_000,...overrides});
export class D1TestAdapter{
  constructor({migrate=true}={}){this.sql=new DatabaseSync(':memory:');this.sql.exec('PRAGMA foreign_keys=ON');for(const name of ['0001_planner.sql','0002_variant_inheritance.sql','0003_provider_jobs.sql','0004_oauth_state.sql'])this.sql.exec(readFileSync(new URL(`../../server/${name}`,import.meta.url),'utf8'));if(migrate)this.migrate();}
  migrate(){this.sql.exec(readFileSync(new URL('../../server/0005_provider_credentials.sql',import.meta.url),'utf8'));}
  prepare(query){const db=this.sql,adapter=this;let values=[];return{bind(...args){values=args;return this;},async all(){return{results:db.prepare(query).all(...values)};},async first(){if(adapter.beforeRead){const h=adapter.beforeRead;adapter.beforeRead=null;await h(query);}return db.prepare(query).get(...values)??null;},async run(){if(adapter.beforeRun){const h=adapter.beforeRun;adapter.beforeRun=null;await h(query);}if(adapter.failRun)throw Error('synthetic private provider detail');const r={meta:{changes:Number(db.prepare(query).run(...values).changes)}};if(adapter.unknownRun)throw Error('synthetic private provider detail');return r;},_exec(){const statement=db.prepare(query);return /^\s*SELECT/i.test(query)?{results:statement.all(...values),meta:{changes:0}}:{results:[],meta:{changes:Number(statement.run(...values).changes)}};}};}
  async batch(statements){if(this.beforeBatch){const h=this.beforeBatch;this.beforeBatch=null;await h();}this.sql.exec('BEGIN');let result;try{result=statements.map((s,i)=>{if(this.failStatement===i)throw Error('synthetic private provider detail');return s._exec();});this.sql.exec('COMMIT');}catch(error){this.sql.exec('ROLLBACK');throw error;}if(this.unknownBatch){this.unknownBatch=false;throw Error('synthetic private provider detail');}return result;}
}
export async function setup(overrides={}){
 const db=new D1TestAdapter();let now=1_000_000;const cfg=config();const clock=()=>now;const cipher=await createTokenCipherFromRuntime(keyring());const store=new CredentialStore(db,{...cfg,cipher,clock,...overrides});const stateRepo=new OAuthStateRepository(db,{...cfg,clock});
 async function begin(who='alice'){const binding=opaque();const pending=await stateRepo.begin(who,binding,{nonceFingerprint:hash(opaque())});return{...pending,binding,hash:hash(pending.state),who};}
 async function ticket(pending){return store.createInstallTicket(pending.who,{stateHash:pending.hash,expiresAtMs:pending.expiresAtMs});}
 async function checkout(pending){const claimed=await stateRepo.claim(pending.who,pending.state,pending.binding);if(!claimed)throw Error('fixture claim failed');return store.getInstallTicket(pending.who,pending.hash);}
 const binding=p=>({ownerId:p.who,siteId:cfg.siteId,configFingerprint:cfg.configFingerprint,contextFingerprint:cfg.contextFingerprint,stateHash:p.hash});
 return{db,store,stateRepo,cfg,cipher,clock,begin,ticket,checkout,binding,setNow:v=>{now=v;},getNow:()=>now};
}
