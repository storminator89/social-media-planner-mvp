import {CHANNELS,displayTitle,validatePost,normalizeMediaItems,effectiveMediaItems} from './model.js';
import {channelTextChecks} from './variants.js';

/** A disabled row explains its own blocker; no selected draft is ever skipped. */
export function batchDraftProblem(post,channels){
  if(post?.status!=='draft'||post.scheduledAt!==null||post.scheduledInstant!==null||post.scheduleBinding!==null)return 'Kein ungeplanter Entwurf';
  if(!post.channels.length)return 'Zuerst Kanal wählen';
  for(const id of post.channels){
    const channel=channels.find(c=>c.id===id);
    if(!channel||!channel.enabled)return 'Kanal deaktiviert';
    if(!channel.postingSchedule?.slots?.length)return 'Posting-Zeiten fehlen';
    if(channel.postingSchedule.paused)return 'Posting-Zeiten pausiert';
  }
  for(const check of channelTextChecks(post,CHANNELS))if(!check?.valid)return check?.empty?'Kanaltext fehlt':'Kanaltext prüfen';
  if(!Array.isArray(post.mediaItems)||Object.hasOwn(post,'media'))return 'Bilder prüfen';
  for(const id of post.channels){
    let media;try{media=effectiveMediaItems(post,id);normalizeMediaItems(media);}catch{return 'Bilder prüfen';}
    if(media.some(item=>!item?.alt?.trim()))return 'Alternativtext fehlt';
    if(media.some(item=>!item?.id||item.dataUrl))return 'Bild zuerst speichern';
  }
  return null;
}

export function createDraftBatchUI({dialog,getState,getContext,canOpen,prepare,save,onSaved,fallbackFocus}){
  const list=dialog.querySelector('[data-batch-list]'),status=dialog.querySelector('[data-batch-status]'),close=dialog.querySelector('[data-batch-close]'),next=dialog.querySelector('[data-batch-preview]'),confirm=dialog.querySelector('[data-batch-confirm]'),back=dialog.querySelector('[data-batch-back]');
  let source=null,context=null,rows=[],selected=new Set(),preview=null,busy=false,locked=false,returnFocus=null;
  const signature=value=>JSON.stringify(value);
  function focusReturn(){const target=returnFocus?.isConnected&&!returnFocus.disabled?returnFocus:fallbackFocus?.();target?.focus();}
  function controls(){
    const count=selected.size;
    for(const input of list.querySelectorAll('input'))input.disabled=busy||locked||input.dataset.blocked==='true';
    close.disabled=busy;next.disabled=busy||locked||!count;confirm.disabled=busy||locked||!preview;back.disabled=busy||locked;
    next.hidden=!!preview||busy;confirm.hidden=!preview&&!busy;back.hidden=!preview&&!busy;
    dialog.setAttribute('aria-busy',String(busy));
  }
  function stale(){preview=null;locked=true;status.textContent='Planung geändert. Neu laden und Termine prüfen.';controls();status.focus();return false;}
  function checkState(){if(busy||!dialog.open)return true;return source===signature(getState())&&context===signature(getContext())||stale();}
  function dismiss(){if(busy)return false;preview=null;selected.clear();dialog.close();focusReturn();return true;}
  function selection(){
    list.replaceChildren();
    for(const row of rows){
      const item=document.createElement('li'),label=document.createElement('label'),input=document.createElement('input'),body=document.createElement('span'),title=document.createElement('strong'),detail=document.createElement('span');
      input.type='checkbox';input.value=row.post.id;input.checked=selected.has(row.post.id);input.dataset.blocked=String(!!row.problem);input.disabled=!!row.problem;
      title.textContent=displayTitle(row.post);detail.textContent=[row.post.channels.map(id=>getState().channels.find(c=>c.id===id)?.name||id).join(' · '),row.problem].filter(Boolean).join(' · ');
      body.append(title,detail);label.append(input,body);item.append(label);list.append(item);
      input.addEventListener('change',()=>{if(busy||locked||!checkState())return;if(row.problem){input.checked=false;return;}if(input.checked)selected.add(row.post.id);else selected.delete(row.post.id);status.textContent=`${selected.size} ausgewählt`;controls();});
    }
    status.textContent=`${selected.size} ausgewählt`;controls();
  }
  close.onclick=dismiss;
  dialog.addEventListener('cancel',event=>{event.preventDefault();dismiss();});
  dialog.addEventListener('close',()=>{if(!busy&&!dialog.open){preview=null;selected.clear();}});
  next.onclick=()=>{
    if(busy||locked||!selected.size||!checkState())return;
    try{
      // Visible list order, not checkbox-click order, defines the displayed batch.
      const postIds=rows.filter(row=>selected.has(row.post.id)).map(row=>row.post.id);
      const candidate=prepare(structuredClone(getState()),{postIds});
      if(!candidate?.entries?.length||candidate.entries.length!==postIds.length||candidate.entries.some((entry,i)=>entry.postId!==postIds[i]))throw Error('Terminvorschau unvollständig. Neu prüfen.');
      for(const entry of candidate.entries){
        const post=getState().posts.find(p=>p.id===entry.postId);
        // The normal editor's scheduled-text and media checks still apply.
        const errors=validatePost({...post,status:'scheduled',scheduledAt:entry.local,scheduledInstant:entry.instant,timeZone:entry.timezone,scheduleBinding:null});
        if(errors.length)throw Error(errors.join(' '));
      }
      preview=candidate;list.replaceChildren();
      for(const entry of preview.entries){
        const item=document.createElement('li'),title=document.createElement('strong'),text=document.createElement('p'),time=document.createElement('time'),channel=document.createElement('span');
        title.textContent=entry.title||entry.text.split('\n')[0];text.textContent=entry.text;time.dateTime=entry.instant;
        const date=new Intl.DateTimeFormat('de-DE',{timeZone:entry.timezone,day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'shortOffset'}).format(new Date(entry.instant));
        time.textContent=`${date} · ${entry.timezone}`;
        item.append(title,time);
        for(const variant of entry.channels||[{channelId:entry.channelId,text:entry.text}]){
          const channel=document.createElement('span'),text=document.createElement('p');
          channel.textContent=getState().channels.find(c=>c.id===variant.channelId)?.name||variant.channelId;text.textContent=variant.text;
          item.append(channel,text);
        }
        list.append(item);
      }
      status.textContent=`${preview.entries.length} ${preview.entries.length===1?'Entwurf':'Entwürfe'} · Nur Planung`;controls();back.focus();
    }catch(error){preview=null;status.textContent=error.message||'Keine Termine gefunden.';controls();status.focus();}
  };
  back.onclick=()=>{if(busy||locked||!checkState())return;preview=null;selection();next.focus();};
  confirm.onclick=async()=>{
    if(busy||locked||!preview||!checkState())return;
    const intended=preview;preview=null;busy=true;controls();status.textContent='Termine speichern …';
    let committed=false;
    try{
      const result=await save(structuredClone(getState()),intended);committed=true;
      onSaved(result);status.textContent=`${intended.entries.length} ${intended.entries.length===1?'Entwurf eingeplant.':'Entwürfe eingeplant.'}`;
      list.replaceChildren();selected.clear();rows=[];
    }catch(error){
      locked=true;
      status.textContent=committed?'Termine gespeichert. Ansicht neu laden.':error?.code==='REVISION_CONFLICT'?'Planung inzwischen geändert. Neu laden und Termine prüfen.':'Speicherung nicht bestätigt. Neu laden und Termine prüfen.';
    }finally{busy=false;controls();next.hidden=true;back.hidden=true;confirm.hidden=true;close.focus();}
  };
  return {
    get pending(){return busy;},
    checkState,
    open(postIds){
      if(busy||dialog.open||!canOpen())return false;
      if(locked){status.textContent='Neu laden und Termine prüfen.';returnFocus=document.activeElement;if(!dialog.open)dialog.showModal();controls();close.focus();return false;}
      const state=getState();
      if(!Array.isArray(postIds)||!postIds.length||new Set(postIds).size!==postIds.length)return false;
      rows=postIds.map(id=>{const post=state.posts.find(p=>p.id===id);return {post,problem:batchDraftProblem(post,state.channels)};});
      if(rows.some(row=>!row.post))return false;
      source=signature(state);context=signature(getContext());selected=new Set();preview=null;returnFocus=document.activeElement;
      selection();if(!dialog.open)dialog.showModal();close.focus();return true;
    }
  };
}
