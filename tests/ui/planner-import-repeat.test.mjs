import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoState} from '../../public/model.js';
import {parsePlanningExport,previewPlanningImport,applyPlanningImport} from '../../public/planner-import.js';
const post=()=>({id:'same',title:'Title',tags:['B','A'],text:'Base\nText',variantTexts:{mastodon:'',linkedin:'Base\nText'},channels:['mastodon','linkedin'],status:'draft',scheduleBinding:null,scheduledInstant:null,scheduledAt:null,timeZone:'Europe/Berlin',cover:null,media:null,createdAt:'2030-01-01T00:00:00.000Z',updatedAt:'2030-01-01T00:00:00.000Z'});
const state=()=>({...createDemoState(new Date('2030-01-01')),settings:{timezone:'Europe/Berlin'},posts:[post()]});
const incoming=p=>parsePlanningExport(JSON.stringify({...state(),posts:[p]}));
const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(freeze)}return value};
test('only server updatedAt and channel set order are ignored, without changing either input',()=>{
 const current=state();current.posts[0].updatedAt='2030-02-02T00:00:00.000Z';current.posts[0].channels.reverse();const file=incoming(post()),before=structuredClone(current);freeze(current);freeze(file);
 const preview=previewPlanningImport(current,file);assert.deepEqual(preview.duplicates,['same']);assert.deepEqual(current,before);assert.equal(preview.additions.length,0);
});
test('every authoring field, timestamp of creation, tag order and explicit inheritance remain strict',()=>{
 const mutations=[p=>p.title+='x',p=>p.text+=' ',p=>p.tags.reverse(),p=>p.tags.push('X'),p=>p.variantTexts.mastodon='text',p=>delete p.variantTexts.mastodon,p=>delete p.variantTexts.linkedin,p=>p.channels=['linkedin'],p=>p.status='scheduled',p=>p.timeZone='UTC',p=>p.createdAt='2030-01-02T00:00:00.000Z',p=>p.media={id:'image',url:'/api/planner/media/image',alt:'alt'},p=>p.cover='forms',p=>p.scheduleBinding={changed:true}];
 for(const change of mutations){const current=state();current.posts[0].updatedAt='2030-02-02T00:00:00.000Z';change(current.posts[0]);assert.throws(()=>previewPlanningImport(current,incoming(post())),undefined,change.toString());}
});
test('null and proven exact UTC agree, but no other local, zone, or millisecond difference does',()=>{
 const p={...post(),variantTexts:{},status:'scheduled',scheduledAt:'2030-01-15T12:00',scheduledInstant:null},current=state();current.posts=[{...p,scheduledInstant:'2030-01-15T11:00:00.000Z',updatedAt:'2030-02-02T00:00:00.000Z'}];
 assert.deepEqual(previewPlanningImport(current,incoming(p)).duplicates,['same']);
 for(const change of [p=>p.scheduledAt='2030-01-15T12:01',p=>p.scheduledInstant='2030-01-15T11:00:00.001Z',p=>p.timeZone='UTC']){const different=structuredClone(current);change(different.posts[0]);assert.throws(()=>previewPlanningImport(different,incoming(p)));}
});
test('identical fixed DST-fold rows do not bypass the import unique-time rule',()=>{
 const p={...post(),variantTexts:{},status:'scheduled',scheduledAt:'2030-10-27T02:30',scheduledInstant:'2030-10-27T00:30:00.000Z'},current=state();current.posts=[structuredClone(p)];assert.throws(()=>previewPlanningImport(current,incoming(p)));
});
test('updatedAt-only and channel-order-only drift still invalidate the full preview baseline',()=>{
 for(const change of [s=>s.posts[0].updatedAt='2030-02-02T00:00:00.000Z',s=>s.posts[0].channels.reverse()]){const current=state(),preview=previewPlanningImport(current,incoming({...post(),id:'new'})),later=structuredClone(current);change(later);assert.throws(()=>applyPlanningImport(later,preview),/geändert/);}
});
test('mixed duplicate plus new appends only new and keeps current record exactly',()=>{
 const current=state();current.posts[0].updatedAt='2030-02-02T00:00:00.000Z';current.posts[0].channels.reverse();const imported=parsePlanningExport(JSON.stringify({...state(),posts:[post(),{...post(),id:'new'}]})),preview=previewPlanningImport(current,imported),result=applyPlanningImport(current,preview);
 assert.deepEqual(preview.duplicates,['same']);assert.equal(preview.additions.length,1);assert.deepEqual(result.posts[0],current.posts[0]);assert.equal(result.posts[1].id,'new');
});
