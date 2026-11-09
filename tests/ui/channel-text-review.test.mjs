import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {channelTextReview,renderChannelTextReview} from '../../public/channel-text-review.js';
import {CHANNELS} from '../../public/model.js';
import {effectiveText,hasTextVariant,inheritedChannels,variantCount} from '../../public/variants.js';

const post=(extra={})=>({text:'Gemeinsamer Text',channels:['linkedin','bluesky'],variantTexts:{},...extra});
const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(freeze)}return value};
const app=readFileSync(new URL('../../public/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../../public/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../../public/channel-text-review.css',import.meta.url),'utf8');
const fn=name=>{const start=app.indexOf(`function ${name}(`),end=app.indexOf('\nfunction ',start+1);assert.ok(start>=0&&end>start);return app.slice(start,end)};

test('shows effective text and explicit source for selected channels',()=>{
 const result=channelTextReview(post({variantTexts:{bluesky:'Kurz'}}),CHANNELS);
 assert.deepEqual(result.items.map(({name,text,source})=>({name,text,source})),[{name:'LinkedIn',text:'Gemeinsamer Text',source:'Basistext'},{name:'Bluesky',text:'Kurz',source:'Eigener Text'}]);assert.equal(result.problemCount,0);
});
test('explicit empty variant remains empty instead of inheriting a good base',()=>{
 const result=channelTextReview(post({variantTexts:{bluesky:''}}),CHANNELS);
 assert.equal(result.items[1].text,'');assert.equal(result.items[1].source,'Eigener Text');assert.equal(result.items[1].reason,'Text fehlt');assert.match(result.summary,/Bluesky: Text fehlt/);
 assert.match(renderChannelTextReview(post({variantTexts:{bluesky:''}}),CHANNELS).items,/Kein sichtbarer Text/);
});
test('identical own text remains independent of later base changes',()=>{
 const p=post({variantTexts:{bluesky:'Gemeinsamer Text'}});assert.equal(channelTextReview(p,CHANNELS).items[1].source,'Eigener Text');p.text='Neue Basis';
 assert.deepEqual(channelTextReview(p,CHANNELS).items.map(x=>x.text),['Neue Basis','Gemeinsamer Text']);
});
test('deselected variants do not appear or get deleted',()=>{
 const p=post({channels:['linkedin'],variantTexts:{bluesky:'Nicht ausgewählt'}}),before=JSON.stringify(p);
 const view=renderChannelTextReview(p,CHANNELS);assert.doesNotMatch(view.items,/Bluesky|Nicht ausgewählt/);assert.equal(JSON.stringify(p),before);
});
test('unicode counting exactly matches existing code-point rules',()=>{
 const p=post({variantTexts:{bluesky:'👋'.repeat(300)}});let item=channelTextReview(p,CHANNELS).items[1];assert.equal(item.count,300);assert.equal(item.reason,'Textlänge passt');
 p.variantTexts.bluesky+='👋';item=channelTextReview(p,CHANNELS).items[1];assert.equal(item.count,301);assert.equal(item.reason,'1 Zeichen zu lang');
});
test('whitespace override has visible missing text reason without trimming input',()=>{
 const p=freeze(post({variantTexts:{bluesky:' \n\t '}})),item=channelTextReview(p,CHANNELS).items[1];assert.equal(item.text,' \n\t ');assert.equal(item.count,4);assert.equal(item.reason,'Text fehlt');
});
test('exact length limit is valid and larger overage is accurately named',()=>{
 assert.equal(channelTextReview(post({variantTexts:{bluesky:'a'.repeat(300)}}),CHANNELS).items[1].valid,true);
 assert.equal(channelTextReview(post({variantTexts:{bluesky:'a'.repeat(1000)}}),CHANNELS).items[1].reason,'700 Zeichen zu lang');
});
test('all four channels are named and every bad reason remains in closed summary',()=>{
 const result=renderChannelTextReview(post({channels:CHANNELS.map(c=>c.id),text:'x'.repeat(501),variantTexts:{linkedin:''}}),CHANNELS);
 assert.match(result.summary,/Kanaltexte prüfen · 4/);assert.match(result.summary,/LinkedIn: Text fehlt/);assert.match(result.summary,/Bluesky: 201 Zeichen zu lang/);assert.match(result.summary,/Mastodon: 1 Zeichen zu lang/);
 for(const c of CHANNELS)assert.ok(result.items.includes(c.name));
});
test('zero channels is honest and does not invent a preview or action',()=>{
 const result=renderChannelTextReview(post({channels:[]}),CHANNELS);assert.match(result.summary,/Keine Kanäle ausgewählt/);assert.match(result.items,/Wähle oben/);assert.doesNotMatch(result.items,/<button|LinkedIn|Instagram/);
});
test('unknown channel fails visibly without an edit action',()=>{
 const result=renderChannelTextReview(post({channels:['unknown']}),CHANNELS);assert.match(result.summary,/Kanal nicht erkannt/);assert.doesNotMatch(result.items,/<button|undefined|NaN/);
});
test('HTML and attribute payloads render only as escaped text',()=>{
 const id='x" onfocus="alert(1)',definitions=[{id,name:'<img src=x onerror=alert(1)>',limit:300}];
 const result=renderChannelTextReview(post({channels:[id],text:'</div><script>alert(1)</script> & "quote"'}),definitions);
 assert.doesNotMatch(result.summary+result.items,/<script|<img| onfocus="/);assert.match(result.items,/&lt;script&gt;/);assert.match(result.items,/data-text-target="x&quot; onfocus=&quot;alert\(1\)"/);
});
test('unrelated private metadata is never rendered',()=>{
 const p=post({owner:'private-owner',media:{url:'/secret-media',alt:'private-alt'},scheduledInstant:'private-instant',variantTexts:{secret:'private-orphan'}});
 const result=renderChannelTextReview(p,CHANNELS);assert.doesNotMatch(result.summary+result.items,/private-|secret-media/);
});
test('frozen posts and definitions remain unchanged through repeated renders',()=>{
 const p=freeze(post({variantTexts:{bluesky:'Eigener Text'}})),defs=freeze(structuredClone(CHANNELS)),before=JSON.stringify(p);
 for(let i=0;i<10;i++)renderChannelTextReview(p,defs);assert.equal(JSON.stringify(p),before);
});
test('paragraphs, tabs, CRLF and full long text are preserved in projection',()=>{
 const text='Erster Absatz\r\n\r\n\tZweiter Absatz '+ 'Z'.repeat(2000);const result=channelTextReview(post({text}),CHANNELS);
 assert.equal(result.items[0].text,text);assert.ok(renderChannelTextReview(post({text}),CHANNELS).items.includes(text));
});
test('only text limit success is claimed, never publishing readiness',()=>{
 const result=renderChannelTextReview(post(),CHANNELS);assert.match(result.items,/Textlänge passt/);assert.doesNotMatch(result.summary+result.items,/bereit|veröffentlicht|gepostet|gespeichert/i);
 assert.match(html,/Geprüft werden nur Text und Zeichenlimit, nicht Bilder, Termin oder Veröffentlichungszugriff/);
});
test('static native details and summary remain a single stable keyboard target',()=>{
 assert.equal((html.match(/id="channel-checks"/g)||[]).length,1);assert.match(html,/<details id="channel-checks" class="channel-text-review"><summary id="channel-review-summary">/);
 assert.match(html,/id="channel-review-items"/);assert.doesNotMatch(html,/<details id="channel-checks"[^>]*\bopen\b/);
 assert.doesNotMatch(html,/<(?:summary|details)[^>]*aria-live/);
});
test('full text scroll region is keyboard reachable and each edit action is explicit',()=>{
 const result=renderChannelTextReview(post(),CHANNELS).items;
 assert.equal((result.match(/class="channel-review-text" tabindex="0"/g)||[]).length,2);
 assert.match(result,/<button type="button" class="button subtle channel-check" data-text-target="bluesky" aria-label="Bluesky-Text bearbeiten">/);
 assert.doesNotMatch(result,/role="alert"|aria-live|contenteditable|<textarea/);
});
test('narrow layouts wrap long text and expose 44px editing controls',()=>{
 assert.match(css,/white-space:pre-wrap;overflow-wrap:anywhere/);assert.match(css,/max-height:12em;overflow:auto/);assert.match(css,/min-height:44px/);assert.match(css,/@media\(max-width:760px\)/);assert.match(css,/width:100%/);
 assert.doesNotMatch(css,/url\(|display:none|visibility:hidden/);
});
test('summary refresh preserves details open state, editor focus and inputs',()=>{
 const elements=Object.fromEntries(['.editor-label label','#variant-mode-hint','#reset-variant','#channel-review-summary','#channel-review-items','#channel-checks'].map(id=>[id,{innerHTML:'',open:true}]));
 let current=freeze(post({variantTexts:{bluesky:''}}));const before=JSON.stringify(current);
 const context={CHANNELS,activeTextTarget:'base',editorPost:()=>current,hasTextVariant,inheritedChannels,variantCount,renderChannelTextReview,$:id=>{assert.ok(elements[id],id);return elements[id]},$$:()=>[]};
 vm.runInNewContext(fn('updateVariantSummary')+';this.update=updateVariantSummary;',context);context.update();
 assert.equal(elements['#channel-checks'].open,true);assert.match(elements['#channel-review-summary'].innerHTML,/Text fehlt/);assert.equal(JSON.stringify(current),before);
 current=freeze(post({variantTexts:{bluesky:'Kurz'}}));context.activeTextTarget='bluesky';context.update();assert.equal(elements['#channel-checks'].open,true);assert.doesNotMatch(elements['#channel-review-summary'].innerHTML,/Text fehlt/);
 current=freeze(post({channels:[]}));context.activeTextTarget='base';context.update();assert.match(elements['#channel-review-summary'].innerHTML,/Keine Kanäle/);assert.equal(elements['#channel-checks'].open,true);
});
test('real delegated edit handler selects channel and focuses existing editor only',async()=>{
 const source=app.slice(app.indexOf("document.addEventListener('click',async event=>{const button"),app.indexOf("\n$('#composer-form').addEventListener"));let handler;const calls=[];
 vm.runInNewContext(source,{document:{addEventListener:(type,callback)=>{assert.equal(type,'click');handler=callback}},switchTextTarget:(...args)=>calls.push(args)});
 await handler({target:{closest:()=>({dataset:{textTarget:'bluesky'},classList:{contains:name=>name==='channel-check'}})}});
 assert.deepEqual(calls,[['bluesky',true]]);
});
test('real switch preserves inherited and empty variants without creating or saving text',()=>{
 const p=freeze(post({variantTexts:{bluesky:''}})),before=JSON.stringify(p),input={value:'',focus(){this.focused=true}},calls=[];
 const context={activeTextTarget:'base',composerBaseText:p.text,editorPost:()=>p,effectiveText,$:id=>{assert.equal(id,'#post-text');return input},renderVariantTabs:()=>calls.push('tabs'),renderPreview:id=>calls.push(id)};
 vm.runInNewContext(fn('switchTextTarget')+';this.switchTarget=switchTextTarget;',context);
 context.switchTarget('bluesky',true);assert.equal(input.value,'');assert.equal(input.focused,true);assert.equal(context.activeTextTarget,'bluesky');assert.equal(JSON.stringify(p),before);
 context.switchTarget('linkedin',true);assert.equal(input.value,p.text);assert.equal(JSON.stringify(p),before);assert.deepEqual(calls,['tabs','bluesky','tabs','linkedin']);
});
test('opening another composer resets comparison but typing and preview changes do not',()=>{
 assert.match(fn('openComposer'),/\$\('#channel-checks'\)\.open=false/);
 for(const name of ['updateVariantSummary','handleTextInput','renderPreview','switchTextTarget'])assert.doesNotMatch(fn(name),/\$\('#channel-checks'\)\.(?:open|innerHTML)\s*=/);
});
test('no network, timer or persisted field is introduced by the renderer',()=>{
 const source=readFileSync(new URL('../../public/channel-text-review.js',import.meta.url),'utf8');assert.doesNotMatch(source,/fetch\(|XMLHttpRequest|localStorage|sessionStorage|setTimeout|setInterval|\.save\(|\.publish\(/);
 assert.match(fn('updateVariantSummary'),/renderChannelTextReview\(post,CHANNELS\)/);assert.doesNotMatch(fn('updateVariantSummary'),/store\.|persist\(|\.save\(/);
});
