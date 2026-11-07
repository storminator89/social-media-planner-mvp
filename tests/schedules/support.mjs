import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
export class D1TestAdapter {
  constructor({through=8}={}){this.sql=new DatabaseSync(':memory:');this.sql.exec('PRAGMA foreign_keys = ON;');for(const [number,file] of [[1,'0001_planner.sql'],[2,'0002_variant_inheritance.sql'],[8,'0008_posting_schedules.sql']])if(through>=number)this.sql.exec(readFileSync(new URL('../../server/'+file,import.meta.url),'utf8'));}

  prepare(sql){const db=this;let values=[];return{bind(...args){values=args;return this;},async all(){return{results:db.sql.prepare(sql).all(...values)};},async first(){return db.sql.prepare(sql).get(...values)??null;},async run(){return{meta:{changes:db.sql.prepare(sql).run(...values).changes}};},_exec(){const stmt=db.sql.prepare(sql);if(/^SELECT/i.test(sql))return{results:stmt.all(...values),meta:{changes:0}};return{results:[],meta:{changes:stmt.run(...values).changes}};}};}
  async batch(statements){this.sql.exec('BEGIN');try{const results=statements.map(s=>s._exec());this.sql.exec('COMMIT');return results;}catch(error){this.sql.exec('ROLLBACK');throw error;}}
}
export class R2TestAdapter {
  data=new Map();
  async put(key,value,opts){this.data.set(key,{value:new Uint8Array(value),opts});return{key,size:value.byteLength,etag:'fixture-etag'};}
  async get(key){const item=this.data.get(key);return item?{body:new Blob([item.value]).stream()}:null;}
  async delete(key){this.data.delete(key);}
}
export const fixture=()=>({schemaVersion:3,revision:0,settings:{timezone:'Europe/Berlin',locale:'de-DE'},channels:[{id:'instagram',platform:'instagram',name:'Instagram',color:'#aabbcc',postingSchedule:null}],posts:[{id:'post-1',scheduleBinding:null,title:'Start',body:'Hallo Welt',stage:'planned',cover:'sunrise',scheduledAt:'2026-11-09T09:00:00+01:00',timezone:'Europe/Berlin',variants:[{id:'variant-1',channelId:'instagram',body:'Eigener Kanaltext',inheritsBody:false,status:'planned',format:'post',mediaIds:[]}]}]});
export function request(path='/state',{owner='alice',method='GET',body,headers={}}={}){return new Request('https://planner.example/api/planner'+path,{method,headers:{...(owner?{'oai-authenticated-user-id':owner}:{}),'X-Planner-Request':'1',...(body&&typeof body==='object'&&!(body instanceof Uint8Array)?{'Content-Type':'application/json'}:{}),...headers},body:body instanceof Uint8Array?body:body?JSON.stringify(body):undefined});}
export const png=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
