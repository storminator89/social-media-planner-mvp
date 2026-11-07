import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {createYouTubeCipherFromRuntime} from '../../modules/providers/youtube-cipher.mjs';
export async function fixtureCipher() {
  return createYouTubeCipherFromRuntime({TAKT_TOKEN_KEYRING_JSON:JSON.stringify({activeKeyId:'fixture',keys:{fixture:randomBytes(32).toString('base64')}})});
}
export class D1TestAdapter {
  constructor() {
    this.sql = new DatabaseSync(':memory:'); this.sql.exec('PRAGMA foreign_keys=ON');
    this.sql.exec(readFileSync(new URL('../../server/0006_youtube_lifecycle.sql',import.meta.url),'utf8'));
  }
  prepare(query) {
    const db=this.sql; let values=[];
    return {bind(...args){values=args;return this;},async all(){return {results:db.prepare(query).all(...values)};},
      async first(){return db.prepare(query).get(...values)??null;},async run(){return {meta:{changes:Number(db.prepare(query).run(...values).changes)}};},
      _exec(){
        const statement=db.prepare(query);
        return /^\s*SELECT/i.test(query) ? {results:statement.all(...values),meta:{changes:0}}
          : {results:[],meta:{changes:Number(statement.run(...values).changes)}};
      }};
  }
  async batch(statements) {
    this.sql.exec('BEGIN');try{const results=statements.map(s=>s._exec());this.sql.exec('COMMIT');return results;}catch(error){this.sql.exec('ROLLBACK');throw error;}
  }
}
