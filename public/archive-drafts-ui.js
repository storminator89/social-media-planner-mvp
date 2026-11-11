import {displayTitle} from './model.js';

export function archiveDraftProblem(post){
  return !post||post.status!=='draft'||post.scheduledAt!==null||post.scheduledInstant!==null||post.scheduleBinding!==null?'Kein gespeicherter Entwurf ohne Termin':null;
}
/** Explicit selection stays local. Cancel/back/staleness revoke the one-use preview. */
export function createArchiveDraftsUI({dialog,getState,getContext,canOpen,prepare,save,cancel,onSaved,fallbackFocus}){
  const list=dialog.querySelector('[data-batch-list]'),status=dialog.querySelector('[data-batch-status]'),close=dialog.querySelector('[data-batch-close]'),next=dialog.querySelector('[data-batch-preview]'),confirm=dialog.querySelector('[data-batch-confirm]'),back=dialog.querySelector('[data-batch-back]');
  let source=null,context=null,rows=[],selected=new Set(),preview=null,busy=false,locked=false,completed=false,returnFocus=null;
  const signature=value=>JSON.stringify(value);
  const channelName=id=>getState().channels.find(c=>c.id===id)?.name||id;
  const noun=count=>count===1?'Entwurf':'Entwürfe';
  function focusReturn(){const target=returnFocus?.isConnected&&!returnFocus.disabled?returnFocus:fallbackFocus?.();target?.focus();}
  function controls(){
    for(const input of list.querySelectorAll('input'))input.disabled=busy||locked||input.dataset.blocked==='true';
    close.disabled=busy;next.disabled=busy||locked||!selected.size;confirm.disabled=busy||locked||!preview;back.disabled=busy||locked;
    next.hidden=!!preview||busy;confirm.hidden=!preview&&!busy;back.hidden=!preview&&!busy;
    if(preview)confirm.textContent=`${preview.entries.length} ${noun(preview.entries.length)} archivieren`;
    dialog.setAttribute('aria-busy',String(busy));
  }
  function clearPreview(){if(preview)cancel?.(preview);preview=null;}
  function stale(){clearPreview();locked=true;status.textContent='Planung oder Filter geändert. Neu laden und Auswahl prüfen.';controls();status.focus();return false;}
  function checkState(){if(busy||completed||!dialog.open)return true;return source===signature(getState())&&context===signature(getContext())||stale();}
  function dismiss(){if(busy)return false;clearPreview();selected.clear();dialog.close();focusReturn();return true;}
  function selection(){
    list.replaceChildren();
    for(const row of rows){
      const item=document.createElement('li'),label=document.createElement('label'),input=document.createElement('input'),body=document.createElement('span'),title=document.createElement('strong'),detail=document.createElement('span');
      input.type='checkbox';input.value=row.post.id;input.checked=selected.has(row.post.id);input.dataset.blocked=String(!!row.problem);
      title.textContent=displayTitle(row.post);detail.textContent=[row.post.channels.map(channelName).join(' · '),row.problem].filter(Boolean).join(' · ');
      body.append(title,detail);label.append(input,body);item.append(label);list.append(item);
      input.addEventListener('change',()=>{if(busy||locked||!checkState())return;if(row.problem){input.checked=false;return;}clearPreview();if(input.checked)selected.add(row.post.id);else selected.delete(row.post.id);status.textContent=`${selected.size} ausgewählt`;controls();});
    }
    status.textContent=`${selected.size} ausgewählt`;controls();
  }
  function paragraph(parent,text){const p=document.createElement('p');p.textContent=text;parent.append(p);}
  function renderPreview(){
    list.replaceChildren();
    for(const entry of preview.entries){
      const item=document.createElement('li'),title=document.createElement('strong');title.textContent=entry.title||entry.text.split('\n')[0]||'Ohne Text';item.append(title);
      if(entry.tags.length){const tags=document.createElement('span');tags.textContent=entry.tags.join(' · ');item.append(tags);}
      const base=document.createElement('span');base.textContent='Basistext';item.append(base);paragraph(item,entry.text||'Kein Text');
      for(const channel of entry.channels){
        const section=document.createElement('section'),name=document.createElement('strong');name.textContent=channelName(channel.channelId);section.append(name);
        if(channel.inheritsBody){const inherited=document.createElement('span');inherited.textContent='Basistext';section.append(inherited);}else paragraph(section,channel.text||'Eigener Text: leer');
        if(channel.mediaItems.length){
          const mediaList=document.createElement('ol');mediaList.className='archive-drafts-media';
          for(const media of channel.mediaItems){
            const row=document.createElement('li');
            if(media.type.startsWith('image/')){const image=document.createElement('img');image.src=media.url;image.alt=media.alt;image.loading='lazy';row.append(image);}
            const name=document.createElement('span');name.textContent=media.name;row.append(name);paragraph(row,media.alt);mediaList.append(row);
          }
          section.append(mediaList);
        }else{const empty=document.createElement('span');empty.textContent='Keine Medien';section.append(empty);}
        item.append(section);
      }
      list.append(item);
    }
    status.textContent=`${preview.entries.length} ${noun(preview.entries.length)} ausgewählt`;controls();back.focus();
  }
  close.onclick=dismiss;
  dialog.addEventListener('cancel',event=>{event.preventDefault();dismiss();});
  dialog.addEventListener('close',()=>{if(!busy&&!dialog.open){clearPreview();selected.clear();controls();}});
  next.onclick=()=>{
    if(!dialog.open||busy||locked||!selected.size||!checkState())return;
    let candidate=null;
    try{
      const postIds=rows.filter(row=>selected.has(row.post.id)).map(row=>row.post.id);
      candidate=prepare(structuredClone(getState()),{postIds});
      if(!candidate?.entries?.length||candidate.entries.length!==postIds.length||candidate.entries.some((entry,i)=>entry.postId!==postIds[i]))throw Error('Auswahl unvollständig. Neu prüfen.');
      preview=candidate;renderPreview();
    }catch(error){if(candidate)cancel?.(candidate);preview=null;selection();status.textContent=error.message||'Auswahl konnte nicht geprüft werden.';controls();status.focus();}
  };
  back.onclick=()=>{if(!dialog.open||busy||locked||!checkState())return;clearPreview();selection();next.focus();};
  confirm.onclick=async()=>{
    if(!dialog.open||busy||locked||!preview||!checkState())return;
    const intended=preview;preview=null;busy=true;controls();status.textContent='Archivieren …';
    let committed=false;
    try{
      const result=await save(structuredClone(getState()),intended);committed=true;completed=true;
      onSaved(result);status.textContent=`${intended.entries.length} ${noun(intended.entries.length)} archiviert.`;
      list.replaceChildren();selected.clear();rows=[];
    }catch(error){locked=true;status.textContent=committed?'Entwürfe archiviert. Ansicht neu laden.':error?.code==='REVISION_CONFLICT'?'Planung inzwischen geändert. Neu laden und Archiv prüfen.':'Archivierung nicht bestätigt. Neu laden und Archiv prüfen.';
    }finally{busy=false;controls();next.hidden=true;back.hidden=true;confirm.hidden=true;close.focus();}
  };
  return {get pending(){return busy;},checkState,open(postIds){
    if(busy||dialog.open||!canOpen())return false;
    if(locked){status.textContent='Neu laden und Archiv prüfen.';returnFocus=document.activeElement;dialog.showModal();controls();close.focus();return false;}
    const state=getState();
    if(!Array.isArray(postIds)||!postIds.length||postIds.length>100||new Set(postIds).size!==postIds.length)return false;
    rows=postIds.map(id=>{const post=state.posts.find(p=>p.id===id);return {post,problem:archiveDraftProblem(post)};});
    if(rows.some(row=>!row.post))return false;
    source=signature(state);context=signature(getContext());selected=new Set();completed=false;clearPreview();returnFocus=document.activeElement;
    selection();dialog.showModal();close.focus();return true;
  }};
}
