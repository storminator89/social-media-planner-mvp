const previewProblems=Object.freeze({
  REFLOW_EMPTY:'Keine zukünftigen Queue-Beiträge.',
  REFLOW_NO_SLOT:'Nicht genug freie Termine in 60 Tagen.',
  REFLOW_UNSUPPORTED:'Mehrkanal-Beiträge einzeln prüfen.',
  REFLOW_QUEUE_INVALID:'Queue-Termine zuerst prüfen.',
  REFLOW_CHANNEL_REQUIRED:'Posting-Zeiten prüfen.',
  REFLOW_STATE_CHANGED:'Änderungen zuerst speichern.',
  SLOT_TAKEN:'Termin bereits belegt.',
  PAST_TIME:'Zukünftige Termine wählen.',
  INVALID_BINDING:'Kanalzuordnung prüfen.',
  SCHEDULE_CHANGED:'Queue-Termine zuerst prüfen.',
  SCHEDULE_MISSING:'Queue-Termine zuerst prüfen.',
  CHANNEL_DISABLED:'Kanal zuerst aktivieren.',
  EXISTING_SCHEDULE_INVALID:'Queue-Termine zuerst prüfen.',
  REFLOW_LIMIT:'Speichergrenze erreicht.',
  INVALID_STATE:'Änderungen zuerst speichern.',
  REVISION_CONFLICT:'Planung geändert. Neu laden.',
  RELOAD_REQUIRED:'Neu laden und Termine prüfen.'
});

/** A preview is a one-use intent. Only the explicit confirmation writes. */
export function createQueueReflowUI({dialog,getState,getContext,canOpen,prepare,save,cancel,onSaved,fallbackFocus}){
  const list=dialog.querySelector('[data-reflow-list]'),status=dialog.querySelector('[data-reflow-status]'),confirm=dialog.querySelector('[data-reflow-confirm]');
  const closes=[...dialog.querySelectorAll('[data-reflow-close]')],unchanged=dialog.querySelector('[data-reflow-unchanged]');
  const heading=dialog.querySelector('[data-reflow-title]');if(heading)heading.textContent='Queue neu einplanen';
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
    if(typeof value?.instant!=='string'||typeof value.local!=='string'||typeof value.timezone!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value.instant)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value.local)||!value.timezone)throw Error('Unvollständiger Termin');
    const instant=new Date(value.instant);
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:value.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(instant);
    const part=type=>parts.find(p=>p.type===type)?.value;
    const local=`${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}`;
    if(local.slice(0,value.local.length)!==value.local)throw Error('Unstimmiger Termin');
    const offset=new Intl.DateTimeFormat('en',{timeZone:value.timezone,timeZoneName:'longOffset'}).formatToParts(instant).find(p=>p.type==='timeZoneName').value;
    const node=document.createElement('time');node.dateTime=value.instant;
    node.textContent=`${label}: ${value.local.replace('T',' ')} · ${offset} · ${value.timezone}`;return node;
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
    open(channelId){
      if(busy||dialog.open||locked||!canOpen()||!channelId)return false;
      generation++;opener=document.activeElement;source=signature(getState());context=signature(getContext());list.replaceChildren();if(unchanged)unchanged.textContent='';
      try{
        owned=true;
        const candidate=prepare(structuredClone(getState()),{channelId});ownedPreview=candidate;
        if(typeof candidate?.token!=='string'||!candidate.token||candidate.channelId!==channelId||candidate.revision!==getState().revision||!Array.isArray(candidate.entries)||!candidate.entries.length||!Number.isSafeInteger(candidate.unchanged?.fixed)||candidate.unchanged.fixed<0||!Number.isSafeInteger(candidate.unchanged?.past)||candidate.unchanged.past<0)throw Error('Unvollständige Vorschau');
        const seen=new Set();
        for(const entry of candidate.entries){
          if(typeof entry?.postId!=='string'||!entry.postId||entry.channelId!==channelId||seen.has(entry.postId)||typeof entry.text!=='string'||typeof entry.title!=='string')throw Error('Ungültige Vorschau');seen.add(entry.postId);
          const item=document.createElement('li'),title=document.createElement('strong'),text=document.createElement('p');
          title.textContent=entry.title;text.textContent=entry.text;
          item.append(title,text,timeNode('Bisher',entry.from),timeNode('Neu',entry.to));list.append(item);
        }
        if(unchanged)unchanged.textContent=`Fest: ${candidate.unchanged.fixed} · Vergangen: ${candidate.unchanged.past} · Unverändert`;
        preview=structuredClone(candidate);ownedPreview=preview;status.textContent=`${candidate.entries.length} ${candidate.entries.length===1?'Beitrag':'Beiträge'} · ${getState().channels?.find(channel=>channel.id===channelId)?.name||channelId}`;
        if(source!==signature(getState())||!sameContext())throw Error('Planung geändert');
      }catch(error){
        const known=Object.hasOwn(previewProblems,error?.code);
        discard();list.replaceChildren();if(unchanged)unchanged.textContent='';
        locked=!known||error.code==='RELOAD_REQUIRED';
        status.textContent=known?previewProblems[error.code]:'Vorschau nicht bestätigt. Neu laden und Termine prüfen.';
      }
      controls();dialog.showModal();closes[0]?.focus();return !!preview&&!locked;
    }
  };
}
