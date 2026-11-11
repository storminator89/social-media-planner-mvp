import test from 'node:test';
import assert from 'node:assert/strict';
import {savedTextCatalog,filterSavedTexts,resolveSavedText,insertSavedText} from '../../public/saved-texts.js';
const definitions=[{id:'linkedin',name:'LinkedIn'},{id:'mastodon',name:'Mastodon'}];
const post=(id,extra={})=>({id,status:'draft',title:'Titel '+id,text:'Gespeicherter Text',variantTexts:{},channels:['linkedin','mastodon'],updatedAt:'2027-01-01',...extra});
const catalog=(posts,options)=>savedTextCatalog({posts},definitions,options);
const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(freeze)}return value};
test('pure catalog projects saved ideas, base and explicit channel text with accurate provenance',()=>{
 const posts=freeze([post('idea',{status:'idea',title:'Meine Idee',text:' Notiz\n\nzweiter Absatz ',channels:[],variantTexts:{mastodon:'not a post'}}),post('p',{variantTexts:{mastodon:'Eigene Fassung'}})]),before=structuredClone(posts),result=catalog(posts);
 assert.equal(result.available,true);assert.equal(result.items.length,3);assert.deepEqual(posts,before);
 assert.equal(result.items[0].text,' Notiz\n\nzweiter Absatz ');assert.equal(result.items[0].status,'Idee');assert.equal(result.items[0].channelLabel,'Ideentext');
 assert.equal(result.items[1].channelLabel,'Basistext · LinkedIn, Mastodon');assert.equal(result.items[2].channelLabel,'Mastodon · Eigener Text');assert.equal(result.items[2].text,'Eigene Fassung');
 result.items[0].title='local';assert.equal(posts[0].title,'Meine Idee');
});
test('does not invent inherited channel entries or deduplicate explicit identical text',()=>{
 const items=catalog([post('p',{variantTexts:{mastodon:'Gespeicherter Text'}})]).items;
 assert.equal(items.length,2);assert.deepEqual(items.map(x=>x.target),['base','mastodon']);
});
test('empty explicit variant remains empty and is not offered or replaced by its base text',()=>{
 const items=catalog([post('p',{variantTexts:{mastodon:''}})]).items;
 assert.equal(items.length,1);assert.equal(items[0].target,'base');
});
test('empty/invalid/unknown/duplicate sources are excluded and unavailable is not empty',()=>{
 for(const text of ['', ' \n\t',null,5,'x'.repeat(20001)])assert.equal(catalog([post('p',{text})]).items.length,0);
 assert.equal(catalog([post('p',{status:'published'})]).items.length,0);
 assert.equal(catalog([post('p'),post('p')]).items.length,0);
 assert.deepEqual(catalog([post('p')],{available:false}),{available:false,items:[]});
 assert.deepEqual(savedTextCatalog(null,definitions),{available:false,items:[]});
 assert.deepEqual(catalog([]),{available:true,items:[]});
});
test('stable order is newest first; search includes exact full text/title/status/channel, no tags or remote lookups',()=>{
 const items=catalog([post('a',{text:'Anfang '+'x'.repeat(250)+' Nadel',updatedAt:'2027-01-01'}),post('b',{status:'scheduled',title:'Garten',updatedAt:'2027-02-02',tags:['SECRET']})]).items;
 assert.equal(items[0].postId,'b');assert.equal(filterSavedTexts(items,'garten geplant LINKEDIN')[0].postId,'b');
 assert.equal(filterSavedTexts(items,'nadel')[0].postId,'a');assert.equal(filterSavedTexts(items,'SECRET').length,0);
 assert.ok(items[1].snippet.length<=180);assert.ok(!items[1].snippet.includes('Nadel'));
});
test('exact source text including whitespace/emoji/markup survives projection and resolve without other metadata',()=>{
 const posts=[post('p',{title:'<img onerror=bad>',text:'  <script>😀</script>\n\n',privateField:'SECRET',media:{id:'private'}})],item=catalog(posts).items[0];
 assert.equal(item.text,posts[0].text);assert.equal(resolveSavedText({posts},item,definitions),posts[0].text);
 assert.ok(!JSON.stringify(item).includes('SECRET'));assert.equal(item.media,undefined);
});
test('changed/deleted/unavailable source is rejected instead of applying stale preview',()=>{
 for(const change of [posts=>posts.splice(0),posts=>posts[0].text='new',posts=>posts[0].title='new',posts=>posts[0].status='idea',posts=>posts[0].channels=[],posts=>posts[0].updatedAt='new']){
  const posts=[post('p')],item=catalog(posts).items[0];change(posts);assert.throws(()=>resolveSavedText({posts},item,definitions),/geändert/);
 }
 const posts=[post('p')],item=catalog(posts).items[0];assert.throws(()=>resolveSavedText({posts},item,definitions,{available:false}),/geändert/);
});
test('changed or removed explicit variant is rejected without falling back to base',()=>{
 for(const change of [p=>delete p.variantTexts.mastodon,p=>p.variantTexts.mastodon='',p=>p.variantTexts.mastodon='new',p=>p.channels=['linkedin']]){
  const p=post('p',{variantTexts:{mastodon:'Variant'}}),item=catalog([p]).items[1];change(p);assert.throws(()=>resolveSavedText({posts:[p]},item,definitions));
 }
});
test('insertion preserves every existing character and uses captured selectionEnd with no replacement',()=>{
 for(const end of [0,2,5]){const result=insertSavedText('ABCDE',' x\n😀 ',end);assert.equal(result.text,'ABCDE'.slice(0,end)+' x\n😀 '+'ABCDE'.slice(end));assert.equal(result.start,end);assert.equal(result.end,end+6);}
 assert.deepEqual(insertSavedText('','Hallo',0),{text:'Hallo',start:0,end:5});
});
test('insertion respects 20k code-unit boundary and rejects bad positions/empty sources without truncation',()=>{
 assert.equal(insertSavedText('x'.repeat(19999),'y',19999).text.length,20000);
 assert.throws(()=>insertSavedText('x'.repeat(20000),'y',0),/20.000/);
 for(const end of [-1,4,1.5,NaN,null])assert.throws(()=>insertSavedText('abc','x',end));
 assert.throws(()=>insertSavedText('abc',' ',1));
});
