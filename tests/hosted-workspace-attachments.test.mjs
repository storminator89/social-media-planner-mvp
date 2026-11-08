import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
const directory=new URL('../drizzle/',import.meta.url);
const journal=JSON.parse(readFileSync(new URL('meta/_journal.json',directory),'utf8'));
function apply(db,entries){for(const entry of entries){const sql=readFileSync(new URL(entry.tag+'.sql',directory),'utf8');for(const statement of sql.split('--> statement-breakpoint'))if(statement.trim())db.exec(statement);}}
function database(t){const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec('PRAGMA foreign_keys=ON');return db;}
function seed(db,state='active'){
 for(const owner of ['alice','bob']){db.prepare("INSERT INTO planner_profiles(owner_id,revision,updated_at) VALUES(?,0,'2026-11-08')").run(owner);for(const id of ['first','second','free'])db.prepare('INSERT INTO planner_media VALUES(?,?,?,?,?,?,?,?)').run(owner,id,owner+'/'+id,'fixture.png','image/png',12,'Alt','2026-11-08');}
 db.prepare(`INSERT INTO planner_editor_workspaces(site_id,owner_id,workspace_id,revision,state,payload_json,media_id,last_operation,created_at_ms,updated_at_ms,expires_at_ms) VALUES('site','alice','workspace',1,?,?,'first','save',1,1,2)`).run(state,JSON.stringify({media:{id:'first'},attachments:[{id:'first'},{id:'second'}]}));
}
test('hosted journal covers complete ordered migration sequence including attachment guards',t=>{
 const db=database(t),entries=journal.entries;
 assert.equal(entries.length,11);assert.deepEqual(entries.map(e=>e.idx),Array.from({length:11},(_,i)=>i));
 assert.deepEqual(entries.map(e=>e.tag+'.sql').sort(),readdirSync(directory).filter(n=>/^\d+_.*\.sql$/.test(n)).sort());
 assert.ok(entries.every((e,i)=>e.breakpoints===true&&(!i||e.when>entries[i-1].when)));
 apply(db,entries);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='trigger' AND name LIKE 'workspace_attachment_media_%'").get().n,2);
 const local=readFileSync(new URL('../server/0014_workspace_attachments.sql',import.meta.url),'utf8');
 assert.equal(readFileSync(new URL('0011_workspace_attachments.sql',directory),'utf8').replace('--> statement-breakpoint\n',''),local);
});
for(const state of ['active','discarded','expired'])test(`hosted additive upgrade preserves ${state} workspace and protects secondary owned attachments`,t=>{
 const db=database(t);apply(db,journal.entries.slice(0,-1));seed(db,state);
 const before=db.prepare('SELECT * FROM planner_editor_workspaces').get();apply(db,journal.entries.slice(-1));assert.deepEqual(db.prepare('SELECT * FROM planner_editor_workspaces').get(),before);
 assert.throws(()=>db.prepare("DELETE FROM planner_media WHERE owner_id='alice' AND id='second'").run(),/workspace attachment is retained/);
 assert.throws(()=>db.prepare("UPDATE planner_media SET id='renamed' WHERE owner_id='alice' AND id='second'").run(),/workspace attachment is retained/);
 assert.throws(()=>db.prepare("UPDATE planner_media SET owner_id='charlie' WHERE owner_id='alice' AND id='second'").run(),/workspace attachment is retained/);
 assert.equal(db.prepare("DELETE FROM planner_media WHERE owner_id='bob' AND id='second'").run().changes,1);
 assert.equal(db.prepare("DELETE FROM planner_media WHERE owner_id='alice' AND id='free'").run().changes,1);
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
});
