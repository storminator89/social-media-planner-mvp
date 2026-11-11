import {prepareChannelMedia,channelMediaMatches,validateChannelMediaSelection,channelMediaRecovery} from './channel-media.js';
import {savedImageCatalog,resolveSavedImage,decodeSavedImage} from './saved-images.js';
const clone=v=>structuredClone(v);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createChannelMediaUI({dialog,getContext,channels,save,onSaved,onFailure=()=>{},decode=decodeSavedImage}){
 const content=dialog.querySelector('[data-channel-media-content]');
 let preview=null,selection=null,target=null,pending=false,decoding=false,fenced=false,error='',discard=false,copying=false,epoch=0,abort=null,returnFocus=null;
 const dirty=()=>!!preview&&JSON.stringify(selection)!==JSON.stringify(preview.channelMediaItems);
 function focus(key,index){
  const buttons=[...content.querySelectorAll('[data-channel-media-action]')];
  const enabled=button=>button&&!button.disabled;
  const action=(button,name)=>button.dataset.channelMediaAction===name;
  let target=buttons.find(button=>enabled(button)&&action(button,key)&&(index===undefined||button.dataset.index===String(index)));
  // Moving to an edge disables that direction. Stay with the moved image,
  // choosing the opposite direction or its surviving Remove control.
  if(!target&&index!==undefined){const row=buttons.filter(button=>enabled(button)&&button.dataset.index===String(index));target=row.find(button=>action(button,key==='left'?'right':key==='right'?'left':'remove'))||row.find(button=>action(button,'remove'));}
  // The final catalog item makes Add unavailable. Keep focus on the image just
  // added, or on a usable picker when removal leaves the channel empty.
  if(!target&&key==='add')target=buttons.filter(button=>enabled(button)&&action(button,'remove')).at(-1);
  if(!target&&['add','remove'].includes(key)){const picker=content.querySelector('#channel-media-image');if(enabled(picker))target=picker;}
  if(!target){const channel=content.querySelector('#channel-media-target');if(enabled(channel))target=channel;}
  if(!target)target=buttons.find(button=>enabled(button)&&action(button,'cancel'));
  target?.focus();
 }
 function render(focusAction,index){
  if(!preview)return;
  const items=selection[target],busy=pending||decoding;
  const catalog=savedImageCatalog(getContext().state).items.filter(row=>!items.some(item=>item.id===row.id));
  const name=channels.find(c=>c.id===target)?.name||target;
  content.setAttribute('aria-busy',String(busy));
  const choose=`<label for="channel-media-target">Kanal</label><select id="channel-media-target" ${busy?'disabled':''}>${preview.post.channels.map(id=>`<option value="${esc(id)}" ${id===target?'selected':''}>${esc(channels.find(c=>c.id===id)?.name||id)}</option>`).join('')}</select>`;
  const rows=items.map((item,i)=>`<li><img src="${esc(item.url)}" alt="${esc(item.alt)}"><div><strong>${i+1}. ${esc(item.name)}</strong><span>${esc(item.alt)}</span></div><div class="channel-media-row-actions"><button type="button" class="button subtle" data-channel-media-action="left" data-index="${i}" aria-label="Bild ${i+1} für ${esc(name)} nach vorne" ${busy||fenced||i===0?'disabled':''}>↑</button><button type="button" class="button subtle" data-channel-media-action="right" data-index="${i}" aria-label="Bild ${i+1} für ${esc(name)} nach hinten" ${busy||fenced||i===items.length-1?'disabled':''}>↓</button><button type="button" class="button subtle" data-channel-media-action="remove" data-index="${i}" aria-label="Bild ${i+1} für ${esc(name)} entfernen" ${busy||fenced?'disabled':''}>Entfernen</button></div></li>`).join('');
  content.innerHTML=`${error?`<p class="form-errors" role="alert">${esc(error)}</p>`:''}${discard?'<section class="channel-media-discard"><strong>Änderungen verwerfen?</strong><div><button type="button" class="button subtle" data-channel-media-action="keep">Weiter bearbeiten</button><button type="button" class="button danger" data-channel-media-action="discard">Verwerfen</button></div></section>':''}${copying?`<label for="channel-media-copy">Kopierbare Kanalmedien</label><textarea id="channel-media-copy" readonly>${esc(JSON.stringify(channelMediaRecovery(preview,selection),null,2))}</textarea><button type="button" class="button subtle" data-channel-media-action="back">Zurück</button>`:`${choose}<ol class="channel-media-list" aria-label="Bilder für ${esc(name)}">${rows}</ol>${!items.length?'<p class="field-hint">Keine Bilder</p>':''}<div class="channel-media-add"><label for="channel-media-image">Gespeichertes Bild</label><select id="channel-media-image" ${busy||fenced||items.length>=10||!catalog.length?'disabled':''}><option value="">Bild auswählen</option>${catalog.map(row=>`<option value="${esc(row.id)}">${esc(row.media.name)} · ${esc(row.media.alt.slice(0,70))}</option>`).join('')}</select><button type="button" class="button subtle" data-channel-media-action="add" ${busy||fenced||items.length>=10||!catalog.length?'disabled':''}>Hinzufügen</button></div><button type="button" class="button subtle" data-channel-media-action="all" ${busy||fenced?'disabled':''}>Diese Bilder für alle Kanäle übernehmen</button>`}<div class="channel-media-footer"><button type="button" class="button subtle" data-channel-media-action="copy" ${pending?'disabled':''}>Eingabe kopieren</button><button type="button" class="button subtle" data-channel-media-action="cancel" ${pending?'disabled':''}>Abbrechen</button><button type="button" class="button primary" data-channel-media-action="save" ${busy||fenced||!dirty()?'disabled':''}>${pending?'Speichern …':'Bilder speichern'}</button></div>`;
  if(focusAction)focus(focusAction,index);
 }
 function close({force=false}={}){if(pending&&!force)return false;if(!force&&dirty()){abort?.abort();decoding=false;discard=true;render('keep');return false;}epoch++;abort?.abort();abort=null;decoding=false;preview=null;selection=null;dialog.close();returnFocus?.isConnected&&returnFocus.focus();return true;}
 function open(){if(dialog.open||pending)return false;let candidate;try{candidate=prepareChannelMedia(getContext());}catch{return false;}epoch++;preview=candidate;selection=clone(candidate.channelMediaItems);target=candidate.post.channels[0];fenced=false;error='';discard=false;copying=false;returnFocus=document.activeElement;render();dialog.showModal();content.querySelector('#channel-media-target')?.focus();return true;}
 async function add(){
  if(pending||decoding||fenced||!preview)return;
  const id=content.querySelector('#channel-media-image').value,media=savedImageCatalog(getContext().state).items.find(row=>row.id===id)?.media;
  if(!media)return;
  const n=epoch,channel=target;abort=new AbortController();const controller=abort;decoding=true;error='';render();
  try{if(!channelMediaMatches(preview,getContext()))throw Error('Entwurf geändert. Eingabe kopieren und erneut öffnen.');const selected=resolveSavedImage(getContext().state,media);await decode(selected,{signal:controller.signal});if(n!==epoch||controller.signal.aborted||!preview)return;if(!channelMediaMatches(preview,getContext()))throw Error('Entwurf geändert. Eingabe kopieren und erneut öffnen.');resolveSavedImage(getContext().state,selected);selection[channel].push(selected);validateChannelMediaSelection(preview,selection);}
  catch(e){if(n===epoch&&!controller.signal.aborted)error=e.message||'Bild nicht übernommen.';}
  finally{if(n===epoch){decoding=false;abort=null;render('add');}}
 }
 async function commit(){
  if(pending||decoding||fenced||!preview||!dirty())return;
  if(!channelMediaMatches(preview,getContext())){error='Entwurf geändert. Eingabe kopieren und erneut öffnen.';render('copy');return;}
  let map;try{map=validateChannelMediaSelection(preview,selection);for(const items of Object.values(map))for(const item of items)resolveSavedImage(getContext().state,item);}catch(e){error=e.message;render('copy');return;}
  const n=epoch,submitted=preview;pending=true;fenced=true;error='';render();
  let saved;
  try{saved=await save(getContext().state,{postId:preview.postId,channelMediaItems:clone(map)});}
  catch(e){if(n!==epoch)return;pending=false;error=e.message||'Speicherung unklar. Neu laden und gespeicherte Bilder prüfen.';onFailure(e);render('copy');return;}
  pending=false;
  if(n!==epoch)return;
  close({force:true});onSaved(saved,submitted);
 }
 content.addEventListener('change',event=>{if(event.target.id==='channel-media-target'&&preview?.post.channels.includes(event.target.value)&&!pending&&!decoding){target=event.target.value;error='';render();content.querySelector('#channel-media-target').focus();}});
 content.addEventListener('click',event=>{
  const button=event.target.closest('[data-channel-media-action]');if(!button||button.disabled||!preview)return;
  const action=button.dataset.channelMediaAction,index=Number(button.dataset.index);
  if(action==='cancel'){close();return;}if(action==='keep'){discard=false;render('cancel');return;}if(action==='discard'){close({force:true});return;}
  if(action==='copy'){copying=true;discard=false;render();const area=content.querySelector('#channel-media-copy');area.focus();area.select();return;}if(action==='back'){copying=false;render('copy');return;}
  if(action==='save'){void commit();return;}if(action==='add'){void add();return;}
  if(pending||decoding||fenced)return;
  if(action==='all')selection=Object.fromEntries(preview.post.channels.map(id=>[id,clone(selection[target])]));
  if(action==='remove'&&Number.isInteger(index)&&index>=0&&index<selection[target].length)selection[target].splice(index,1);
  if(['left','right'].includes(action)){const to=index+(action==='left'?-1:1);if(index>=0&&to>=0&&to<selection[target].length)[selection[target][index],selection[target][to]]=[selection[target][to],selection[target][index]];}
  error='';render(action,action==='left'?index-1:action==='right'?index+1:action==='remove'?Math.min(index,selection[target].length-1):undefined);
 });
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 return {open,close,get pending(){return pending;},get hasUnsavedInput(){return pending||decoding||dirty();},get isOpen(){return dialog.open;}};
}
