const previewProblems=Object.freeze({
  PRIORITY_UNCHANGED:'Bereits an erster Queue-Position.',
  PRIORITY_UNSUPPORTED:'Nur Einzelkanal-Queue-Beiträge möglich.',
  PRIORITY_QUEUE_INVALID:'Queue-Termine zuerst prüfen.',
  PRIORITY_CHANNEL_REQUIRED:'Posting-Zeiten prüfen.',
  PRIORITY_POST_REQUIRED:'Zukünftigen Queue-Beitrag wählen.',
  PRIORITY_STATE_CHANGED:'Änderungen zuerst speichern.',
  REVISION_CONFLICT:'Planung geändert. Neu laden.',
  RELOAD_REQUIRED:'Neu laden und Termine prüfen.'
});

/** A preview is a one-use intent. Only the explicit confirmation writes. */
export function createQueuePriorityUI({dialog,getState,getContext,canOpen,prepare,save,cancel,onSaved,fallbackFocus}){
  const list=dialog.querySelector('[data-priority-list]'),status=dialog.querySelector('[data-priority-status]'),confirm=dialog.querySelector('[data-priority-confirm]');
  const closes=[...dialog.querySelectorAll('[data-priority-close]')];
  let preview=null,source=null,context=null,opener=null,busy=false,locked=false,generation=0,owned=false,ownedPreview=null,expectedCloses=0;
  const signature=value=>JSON.stringify(value);
  const sameContext=()=>context===signature(getContext());
  const inside=element=>element===dialog||dialog.contains?.(element)||element===status||element===confirm||closes.includes(element);
  function controls(){confirm.disabled=busy||locked||!preview;for(const button of closes)button.disabled=busy;dialog.setAttribute('aria-busy',String(busy));}
  function discard(){const captured=ownedPreview;preview=null;ownedPreview=null;if(owned){owned=false;cancel(captured);}}
  function fail(message){discard();locked=true;status.textContent=message;controls();return false;}
  function checkState(){
    if(busy||!dialog.open)return true;
    if(locked)return false;
    if(!owned)return true; // Completed or rejected previews have no intent to invalidate.
    return source===signature(getState())&&sameContext()&&canOpen()||fail('Planung geändert. Neu laden und Termine prüfen.');
  }
  function dismiss(){
    if(busy||!dialog.open)return false;
    const restore=sameContext()&&(inside(document.activeElement)||document.activeElement===opener),target=opener?.isConnected&&!opener.disabled?opener:fallbackFocus?.();
    discard();generation++;expectedCloses++;dialog.close();
    // Restore synchronously: queued native close events must never steal focus.
    if(restore&&target?.isConnected&&!target.disabled)target.focus();
    return true;
  }
  for(const button of closes){button.textContent='Abbrechen';button.onclick=dismiss;}
  confirm.textContent='Termine übernehmen';
  dialog.addEventListener('cancel',event=>{event.preventDefault();dismiss();});
  dialog.addEventListener('close',()=>{
    if(expectedCloses){expectedCloses--;return;}
    if(dialog.open)return; // An older queued event cannot discard a newer preview.
    if(busy)return;
    discard();generation++;
  });
  function timeNode(label,value){
    if(!value?.instant||!value.local||!value.timezone)throw Error('Unvollständiger Termin');
    const node=document.createElement('time');node.dateTime=value.instant;
    const date=new Intl.DateTimeFormat('de-DE',{timeZone:value.timezone,day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'shortOffset'}).format(new Date(value.instant));
    node.textContent=`${label}: ${date} · ${value.timezone}`;return node;
  }
  confirm.onclick=async()=>{
    if(busy||locked||!preview||!dialog.open||!checkState())return;
    const intended=preview,epoch=generation;preview=null;busy=true;controls();status.textContent='Termine speichern …';
    let committed=false;
    try{
      const result=await save(structuredClone(getState()),intended);committed=true;
      owned=false;ownedPreview=null;onSaved(result);
      if(epoch===generation){status.textContent='Termine übernommen.';list.replaceChildren();}
    }catch(error){
      fail(committed?'Termine gespeichert. Ansicht neu laden.':error?.code==='REVISION_CONFLICT'?'Planung geändert. Neu laden und Termine prüfen.':'Speicherung nicht bestätigt. Neu laden und Termine prüfen.');
    }finally{
      busy=false;controls();
      if(epoch===generation&&dialog.open&&sameContext()&&inside(document.activeElement))closes[0]?.focus();
    }
  };
  return {
    get pending(){return busy;},checkState,
    open(postId,channelId){
      if(busy||dialog.open||locked||!canOpen()||!postId||!channelId)return false;
      generation++;opener=document.activeElement;source=signature(getState());context=signature(getContext());list.replaceChildren();
      try{
        owned=true;
        const candidate=prepare(structuredClone(getState()),{postId,channelId});ownedPreview=candidate;
        if(!candidate?.token||candidate.postId!==postId||candidate.channelId!==channelId||candidate.revision!==getState().revision||!candidate.entries?.length||!candidate.entries.some(e=>e.postId===postId&&e.channelId===channelId))throw Error('Unvollständige Vorschau');
        const seen=new Set();
        for(const entry of candidate.entries){
          if(!entry.postId||entry.channelId!==channelId||seen.has(entry.postId)||typeof entry.text!=='string')throw Error('Ungültige Vorschau');seen.add(entry.postId);
          const item=document.createElement('li'),title=document.createElement('strong'),text=document.createElement('p');
          title.textContent=entry.title||entry.text.split('\n')[0];text.textContent=entry.text;
          item.append(title,text,timeNode('Bisher',entry.from),timeNode('Neu',entry.to));list.append(item);
        }
        preview=candidate;status.textContent=`${candidate.entries.length} ${candidate.entries.length===1?'Beitrag':'Beiträge'}`;
        if(source!==signature(getState())||!sameContext())throw Error('Planung geändert');
      }catch(error){
        const known=Object.hasOwn(previewProblems,error?.code);
        discard();list.replaceChildren();
        locked=!known||error.code==='RELOAD_REQUIRED';
        status.textContent=known?previewProblems[error.code]:'Vorschau nicht bestätigt. Neu laden und Termine prüfen.';
      }
      controls();dialog.showModal();closes[0]?.focus();return !!preview&&!locked;
    }
  };
}
