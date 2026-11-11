import test from 'node:test';
import assert from 'node:assert/strict';
import {POST_TEMPLATES,renderPostTemplate} from '../public/post-templates.js';
import {insertSavedText} from '../public/saved-texts.js';
for(const template of POST_TEMPLATES){
 test(`${template.id}: complete original template`,()=>{const values=template.fields.map((_,i)=>`Wert ${i}`),text=renderPostTemplate(template.id,values);for(const value of values)assert.ok(text.includes(value));assert.ok(!text.includes('[Neuigkeit]'));});
 test(`${template.id}: placeholder preview cannot be committed empty`,()=>{const values=template.fields.map(()=> '');assert.match(renderPostTemplate(template.id,values,{preview:true}),/\[/);assert.throws(()=>renderPostTemplate(template.id,values));});
}
test('catalog is immutable and ids unique',()=>{assert.equal(new Set(POST_TEMPLATES.map(t=>t.id)).size,POST_TEMPLATES.length);assert.throws(()=>POST_TEMPLATES[0].fields.push('foo'));});
test('reject unknown templates, malformed fields and huge input',()=>{assert.throws(()=>renderPostTemplate('fake',[]));assert.throws(()=>renderPostTemplate('question',['a']));assert.throws(()=>renderPostTemplate('question',['a',null]));assert.throws(()=>renderPostTemplate('question',['a','x'.repeat(4001)]));});
test('treat markup and template-like input as literal text',()=>{assert.equal(renderPostTemplate('question',['<script>alert(1)</script>','${user} [Frage]']),'<script>alert(1)</script>\n\n${user} [Frage]');});
test('normalize line endings and outer whitespace only',()=>{assert.equal(renderPostTemplate('question',[' Thema ','a\r\nb\rc  ']),'Thema\n\na\nb\nc');});
test('insert at selection end without replacing selected text',()=>{const text=renderPostTemplate('question',['Thema','Frage?']);const result=insertSavedText('BEFORE SELECTED AFTER',text,15);assert.equal(result.text,'BEFORE SELECTED'+text+' AFTER');});
test('20k composer limit remains enforced',()=>{assert.throws(()=>insertSavedText('x'.repeat(19999),renderPostTemplate('question',['A','B']),0));});

test('sparse fields are rejected',()=>assert.throws(()=>renderPostTemplate('announcement',new Array(3))));
