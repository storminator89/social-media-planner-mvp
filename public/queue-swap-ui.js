import {queueSwapEligible} from './channel-queue.js';
const previewProblems=Object.freeze({
  SWAP_INPUT_INVALID:'Zwei Beiträge wählen.',
  SWAP_UNSUPPORTED:'Nur Einzelkanal-Queue-Beiträge möglich.',
  SWAP_QUEUE_INVALID:'Queue-Termine zuerst prüfen.',
  SWAP_CHANNEL_REQUIRED:'Posting-Zeiten prüfen.',
  SWAP_POST_REQUIRED:'Zukünftigen Queue-Beitrag wählen.',
  SWAP_STATE_CHANGED:'Änderungen zuerst speichern.',
  REVISION_CONFLICT:'Planung geändert. Neu laden.',
  RELOAD_REQUIRED:'Neu laden und Termine prüfen.'
});

/** A preview is a one-use intent. Only the explicit confirmation writes. */
export function createQueueSwapUI({dialog,getState,getContext,canOpen,prepare,save,cancel,onSaved,fallbackFocus}){
  const list=dialog.querySelector('[data-swap-list]'),status=dialog.querySelector('[data-swap-status]'),confirm=dialog.querySelector('[data-swap-confirm]');
  const next=dialog.querySelector('[data-swap-preview]');
  let rows=[],selected=new Set(),channelId=null;
  const closes=[...dialog.querySelectorAll('[data-swap-close]')];
  let preview=null,source=null,context=null,opener=null,busy=false,locked=false,generation=0,owned=false,ownedPreview=null,expectedCloses=0;
  const signature=value=>JSON.stringify(value);
  const sameContext=()=>context===signature(getContext());
  const inside=element=>element===dialog||dialog.contains?.(element)||element===status||element===confirm||closes.includes(element);
  function controls(){next.hidden=!!preview;next.disabled=busy||locked||selected.size!==2;for(const input of list.querySelectorAll('input'))input.disabled=busy||locked||!queueSwapEligible(getState(),rows.find(row=>row.id===input.value),channelId)||selected.size===2&&!input.checked;confirm.disabled=busy||locked||!preview;for(const button of closes)button.disabled=busy;dialog.setAttribute('aria-busy',String(busy));}
  function discard(){const captured=ownedPreview;preview=null;ownedPreview=null;if(owned){owned=false;cancel(captured);}}
  function fail(message){discard();locked=true;status.textContent=message;controls();return false;}
  function checkState(){
    if(busy||!dialog.open)return true;
    if(locked)return false;
    if(!owned&&!rows.length)return true; // Completed or rejected previews have no intent to invalidate.
    return source===signature(getState())&&sameContext()&&canOpen()&&rows.filter(row=>selected.has(row.id)).every(row=>queueSwapEligible(getState(),row,channelId))||fail('Planung geändert. Neu laden und Termine prüfen.');
  }
  function dismiss(){
    if(busy||!dialog.open)return false;
    const restore=sameContext()&&(inside(document.activeElement)||document.activeElement===opener),target=opener?.isConnected&&!opener.disabled?opener:fallbackFocus?.();
    discard();rows=[];selected.clear();generation++;expectedCloses++;dialog.close();
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
    discard();rows=[];selected.clear();generation++;
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
      owned=false;ownedPreview=null;rows=[];selected.clear();onSaved(result);
      if(epoch===generation){status.textContent='Termine übernommen.';list.replaceChildren();}
    }catch(error){
      fail(committed?'Termine gespeichert. Ansicht neu laden.':error?.code==='REVISION_CONFLICT'?'Planung geändert. Neu laden und Termine prüfen.':'Speicherung nicht bestätigt. Neu laden und Termine prüfen.');
    }finally{
      busy=false;controls();
      if(epoch===generation&&dialog.open&&sameContext()&&inside(document.activeElement))closes[0]?.focus();
    }
  };
  next.onclick=()=>{
    if(busy||locked||!dialog.open||selected.size!==2||preview||!checkState())return;
    const postIds=rows.filter(row=>selected.has(row.id)).map(row=>row.id);
    try{
      owned=true;
      const candidate=prepare(structuredClone(getState()),{postIds,channelId});ownedPreview=candidate;
      if(!candidate?.token||candidate.channelId!==channelId||candidate.revision!==getState().revision||signature(candidate.postIds)!==signature(postIds)||candidate.entries?.length!==2)throw Error('Unvollständige Vorschau');
      for(const [index,entry] of candidate.entries.entries()){
        if(entry.postId!==postIds[index]||entry.channelId!==channelId||typeof entry.text!=='string'||entry.fromBinding?.refs?.length!==1||entry.toBinding?.refs?.length!==1)throw Error('Ungültige Vorschau');
      }
      list.replaceChildren();
      for(const entry of candidate.entries){
        const item=document.createElement('li'),title=document.createElement('strong'),text=document.createElement('p'),channel=document.createElement('p');
        title.textContent=entry.title||entry.text.split('\n')[0];text.textContent=entry.text;
        channel.textContent=getState().channels.find(c=>c.id===channelId)?.name||channelId;
        item.append(title,channel,text,timeNode('Bisher',entry.from),timeNode('Neu',entry.to));
        for(const [label,binding] of [['Bisheriger Slot',entry.fromBinding],['Neuer Slot',entry.toBinding]]){
          const ref=binding.refs[0],detail=document.createElement('p');
          if(ref.channelId!==channelId||!ref.slotId||!ref.local||!ref.timezone||!['reject','earlier','later'].includes(ref.overlapChoice)||!Number.isInteger(ref.minimumGapMinutes))throw Error('Unvollständiger Slot');
          detail.textContent=`${label}: ${ref.local.replace('T',' ')} · ${ref.timezone} · ${ref.slotId} · ${ {reject:'Eindeutige Ortszeit',earlier:'Früherer Zeitpunkt',later:'Späterer Zeitpunkt'}[ref.overlapChoice]} · Abstand ${ref.minimumGapMinutes} Min.`;
          item.append(detail);
        }
        list.append(item);
      }
      preview=candidate;status.textContent='2 Beiträge · Termine tauschen';controls();confirm.focus();
    }catch(error){
      const known=Object.hasOwn(previewProblems,error?.code);
      discard();rows=[];selected.clear();list.replaceChildren();locked=!known||error.code==='RELOAD_REQUIRED';
      status.textContent=known?previewProblems[error.code]:'Vorschau nicht bestätigt. Neu laden und Termine prüfen.';controls();
    }
  };
  return {
    get pending(){return busy;},checkState,
    open(postIds,targetChannel){
      if(busy||dialog.open||locked||!canOpen()||!Array.isArray(postIds)||postIds.length<2||new Set(postIds).size!==postIds.length||!targetChannel||targetChannel==='all')return false;
      const captured=postIds.map(id=>getState().posts.find(post=>post.id===id));
      if(captured.some(row=>!row)||captured.filter(row=>queueSwapEligible(getState(),row,targetChannel)).length<2)return false;
      generation++;opener=document.activeElement;source=signature(getState());context=signature(getContext());rows=structuredClone(captured);channelId=targetChannel;selected=new Set();list.replaceChildren();
      for(const row of rows){
        const item=document.createElement('li'),label=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span');
        input.type='checkbox';input.value=row.id;input.checked=false;
        text.textContent=`${row.title||row.text.split('\n')[0]} · ${row.scheduledAt} · ${row.timeZone}`;
        const body=document.createElement('p');body.textContent=row.variantTexts?.[channelId]??row.text;
        label.append(input,text);item.append(label,body);list.append(item);
        input.addEventListener('change',()=>{
          if(busy||locked||preview||!checkState())return;
          if(!queueSwapEligible(getState(),row,channelId)||input.checked&&selected.size===2){input.checked=false;return;}
          input.checked?selected.add(row.id):selected.delete(row.id);status.textContent=`${selected.size} von 2 ausgewählt`;controls();
        });
      }
      status.textContent='Zwei Beiträge wählen';controls();dialog.showModal();closes[0]?.focus();return true;
    }
  };
}
