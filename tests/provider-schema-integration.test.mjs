import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdirSync,readFileSync} from 'node:fs';
test('combined explicit provider migrations have unique ordered numbers and compatible schemas',t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec('PRAGMA foreign_keys=ON');
 const directory=new URL('../server/',import.meta.url),names=readdirSync(directory).filter(n=>/^\d{4}_.*\.sql$/.test(n)).sort();
 assert.equal(names.length,11);assert.deepEqual(names.map(n=>Number(n.slice(0,4))),Array.from({length:11},(_,i)=>i+1));
 for(const name of names)db.exec(readFileSync(new URL(name,directory),'utf8'));
 for(const name of ['x_oauth_aggregates','planner_instagram_vault','planner_youtube_uploads'])assert.ok(db.prepare('SELECT name FROM sqlite_master WHERE type=? AND name=?').get('table',name));
 assert.ok(db.prepare('PRAGMA table_info(planner_youtube_uploads)').all().some(c=>c.name==='policy_ack'));
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
});
