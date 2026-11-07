import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
export class D1TestAdapter {
  constructor({migrate=true}={}){this.sql=new DatabaseSync(':memory:');this.sql.exec('PRAGMA foreign_keys=ON;');for(const filename of ['0001_planner.sql','0002_variant_inheritance.sql'])this.sql.exec(readFileSync(new URL(`../../server/${filename}`,import.meta.url),'utf8'));if(migrate)this.migrate();}
  migrate(){this.sql.exec(readFileSync(new URL('../../server/0003_provider_jobs.sql',import.meta.url),'utf8'));}
  prepare(query){const db=this.sql;let values=[];return{bind(...args){values=args;return this;},async all(){return{results:db.prepare(query).all(...values)};},async first(){return db.prepare(query).get(...values)??null;},async run(){return{meta:{changes:Number(db.prepare(query).run(...values).changes)}};},_exec(){const statement=db.prepare(query);return /^\s*SELECT/i.test(query)?{results:statement.all(...values),meta:{changes:0}}:{results:[],meta:{changes:Number(statement.run(...values).changes)}};}};}
  async batch(statements){this.sql.exec('BEGIN');try{const result=statements.map(s=>s._exec());this.sql.exec('COMMIT');return result;}catch(error){this.sql.exec('ROLLBACK');throw error;}}
}
export function seed(db,owner='alice',{provider='instagram',body='Eigener Text',inheritsBody=false,revision=7}={}){
  db.sql.prepare('INSERT INTO planner_profiles(owner_id,revision,timezone,locale,updated_at) VALUES (?,?,?,?,?)').run(owner,revision,'Europe/Berlin','de-DE','2026-11-07T00:00:00Z');
  db.sql.prepare('INSERT INTO planner_channels(owner_id,id,platform,name) VALUES (?,?,?,?)').run(owner,'channel-1',provider,'Kanal');
  db.sql.prepare('INSERT INTO planner_posts(owner_id,id,title,body,stage,scheduled_at,timezone,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').run(owner,'post-1','Titel','Basistext','planned','2026-12-01T08:00:00.000Z','Europe/Berlin','2026-11-07T00:00:00Z','2026-11-07T00:00:00Z');
  db.sql.prepare('INSERT INTO planner_variants(owner_id,id,post_id,channel_id,body,inherits_body,format,status,scheduled_at,timezone) VALUES (?,?,?,?,?,?,?,?,?,?)').run(owner,'variant-1','post-1','channel-1',body,inheritsBody?1:0,'post','planned','2026-12-01T08:00:00.000Z','Europe/Berlin');
}
export const jobInput=()=>({postId:'post-1',variantId:'variant-1',idempotencyKey:'submit-1'});
