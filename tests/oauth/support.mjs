import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
export const hash=value=>createHash('sha256').update(value).digest('hex');
export const opaque=()=>randomBytes(32).toString('base64url');
export const nonceFingerprint=()=>hash(opaque());
export const config=()=>({siteId:'test-site',provider:'linkedin',redirectUri:'https://takt.example/oauth/linkedin/callback',scopeFingerprint:hash(JSON.stringify(['openid','profile','w_member_social'])),configFingerprint:hash('test-public-configuration'),flowVersion:'linkedin-web-preparation-v1',contextFingerprint:hash(JSON.stringify({action:'connect_new',targetConnectionId:null,appConfigVersion:'v1'}))});
export class D1TestAdapter{
  constructor({migrate=true}={}){this.sql=new DatabaseSync(':memory:');this.sql.exec('PRAGMA foreign_keys=ON');for(const name of ['0001_planner.sql','0002_variant_inheritance.sql','0003_provider_jobs.sql'])this.sql.exec(readFileSync(new URL(`../../server/${name}`,import.meta.url),'utf8'));if(migrate)this.migrate();}
  migrate(){this.sql.exec(readFileSync(new URL('../../server/0004_oauth_state.sql',import.meta.url),'utf8'));}
  prepare(query){const db=this.sql;let values=[];return{bind(...args){values=args;return this;},async all(){return{results:db.prepare(query).all(...values)};},async first(){return db.prepare(query).get(...values)??null;},async run(){return{meta:{changes:Number(db.prepare(query).run(...values).changes)}};},_exec(){const statement=db.prepare(query);return /^\s*SELECT/i.test(query)?{results:statement.all(...values),meta:{changes:0}}:{results:[],meta:{changes:Number(statement.run(...values).changes)}};}};}
  async batch(statements){this.sql.exec('BEGIN');try{const results=statements.map(s=>s._exec());this.sql.exec('COMMIT');return results;}catch(error){this.sql.exec('ROLLBACK');throw error;}}
}
