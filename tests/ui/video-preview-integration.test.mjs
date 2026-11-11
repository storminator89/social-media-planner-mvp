import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {videoContext} from './video-context.mjs';
import {createComposerMedia} from '../../public/composer-media.js';
import {CHANNELS,characterCount} from '../../public/model.js';
import {effectiveText,hasTextVariant,inheritedChannels} from '../../public/variants.js';
import {updateVisualPresentation} from '../../public/visual-editor.js';
const app=readFileSync(new URL('../../public/app.js',import.meta.url),'utf8');
const actual=name=>{const start=app.indexOf(`function ${name}(`),end=app.indexOf('\nfunction ',start+1);assert.ok(start>=0);return app.slice(start,end);};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const media={id:'video',url:'/api/planner/media/video',type:'video/mp4',name:'Original <clip>.mp4',alt:'A & B'};
function harness(){
 const fields=new Map();let video=null,replacements=0;
 const $=id=>{if(id==='#preview-cover video')return video;if(!fields.has(id))fields.set(id,{value:'',dataset:{},classList:{toggle(){}},set innerHTML(value){this.html=value;if(id==='#preview-channel')this.value=/value="([^"]*)"/.exec(value)?.[1]||'';if(id==='#preview-cover'){replacements++;video=value.includes('<video ')?{currentTime:0,attributes:{},setAttribute(name,value){this.attributes[name]=value;}}:null;}},get innerHTML(){return this.html;}});return fields.get(id);};
 const post={channels:['instagram'],text:'Draft',variantTexts:{}};
 const context={...videoContext(),composerImages:createComposerMedia(),updateDraftSplitAvailability(){},CHANNELS,characterCount,editorPost:()=>post,$,hasTextVariant,effectiveText,inheritedChannels,updateVisualPresentation,queuePanel:null,activeTextTarget:'base',composerBaseText:post.text,composerMedia:{...media},composerCover:null,esc,renderTimingStatus(){},updateVariantSummary(){},workspaceRestoring:false,saving:false,workspaceUI:null};
 vm.createContext(context);vm.runInContext(app.split('\n').find(line=>line.startsWith('const mediaSource=')),context);vm.runInContext(actual('cover')+'\n'+actual('renderPreview'),context);
 return {context,$,get video(){return video;},get replacements(){return replacements;}};
}
test('actual cover is noninteractive in card/agenda and playable only when explicitly requested',()=>{
 const {context}=harness();for(const extra of ['', 'agenda-cover']){const html=context.cover({mediaItems:[media]},extra);assert.doesNotMatch(html,/<(?:video|button|a)\b|\bcontrols\b/);assert.match(html,/role="img"/);assert.match(html,/Video · Original &lt;clip&gt;\.mp4/);assert.match(html,/aria-label="A &amp; B"/);}
 const playable=context.cover({mediaItems:[media]},'',true);assert.match(playable,/<video[^>]+controls playsinline/);assert.match(playable,/src="\/api\/planner\/media\/video"/);
 // The two clickable list renderers must not opt into the playable branch.
 assert.doesNotMatch(actual('postCard'),/cover\([^)]*,[^)]*,\s*true\)/);assert.doesNotMatch(actual('renderAgenda'),/cover\([^)]*,[^)]*,\s*true\)/);
});
test('actual renderPreview keeps controls/player position while updating description safely',()=>{
 const h=harness();h.context.renderPreview();assert.match(h.$('#preview-cover').innerHTML,/<video[^>]+controls/);const player=h.video;player.currentTime=3.5;
 h.context.composerMedia.alt='<new description & text>';h.context.renderPreview();assert.equal(h.replacements,1);assert.equal(h.video,player);assert.equal(player.currentTime,3.5);assert.equal(player.attributes['aria-label'],'<new description & text>');
 h.context.composerMedia.alt='';h.context.renderPreview();assert.equal(player.attributes['aria-label'],media.name);assert.equal(h.replacements,1);
 h.context.composerMedia={...media,id:'other',url:'/api/planner/media/other'};h.context.renderPreview();assert.equal(h.replacements,2);assert.notEqual(h.video,player);
});
for(const type of ['video/webm','video/mp4'])test('tail adoption reaches actual renderPreview workspace capture exactly once as local omission: '+type,()=>{
 const h=harness(),c=h.context;c.composerImages.reset([media]);c.composerMedia=c.composerImages.selected;c.composerGeneration=1;c.composerVariantTexts={};c.composerCover=null;c.composerMissingMedia=false;c.composerTiming={planning:{kind:'manual'}};c.composerLabelState={title:'Keep',tags:[]};c.currentComposerRawTags=()=>'';c.structuredClone=structuredClone;c.$$=()=>[{value:'instagram'}];h.$('#composer').open=true;c.renderMediaEditor=()=>{};
 c.videoTailTarget={session:1,ticket:c.composerImages.ticket('replace'),identity:JSON.stringify(c.composerMedia),checkpoint:c.composerImages.checkpoint(),cover:null,missing:false};const captures=[];c.workspaceUI={captureChanged(){captures.push(c.captureWorkspacePayload());}};
 vm.runInContext(actual('captureWorkspacePayload')+'\n'+actual('applyVideoTail'),c);
 const replacement={type,name:type==='video/mp4'?'trim.mp4':'trim.webm',alt:'x'.repeat(2000),dataUrl:type==='video/mp4'?'data:video/mp4;base64,AAAAFGZ0eXBpc29tAAAAAGlzb20=':'data:video/webm;base64,GkXfow=='};c.applyVideoTail(replacement);
 assert.equal(captures.length,1);assert.equal(captures[0].schemaVersion,3);assert.deepEqual(JSON.parse(JSON.stringify(captures[0].mediaItems)),[{kind:'local_omitted',name:replacement.name,type:replacement.type,alt:replacement.alt}]);assert.equal(captures[0].mediaItems[0].id,undefined);assert.equal(captures[0].mediaItems[0].dataUrl,undefined);c.videoPreviewURLs.clear();
});
