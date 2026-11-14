import {scheduleLocalTime} from './workflows/posting-schedules.mjs';

export function dateShiftProblem(post,now=Date.now()){
  if(post?.status!=='scheduled')return 'Nur geplante Beiträge';
  if(post.scheduleBinding!==null)return 'Queue-Termin bleibt gebunden';
  if(post.channels?.length!==1)return 'Nur Einzelkanal-Beiträge';
  if(!/T\d{2}:\d{2}:00\.000Z$/.test(post.scheduledInstant||''))return 'Termin mit Sekunden einzeln prüfen';
  if(!post.scheduledInstant||!Number.isFinite(Date.parse(post.scheduledInstant))||Date.parse(post.scheduledInstant)<=now)return 'Termin liegt nicht in der Zukunft';
  try{if(scheduleLocalTime(post.scheduledInstant,post.timeZone)!==post.scheduledAt)return 'Termin einzeln prüfen';}catch{return 'Termin einzeln prüfen';}
  return null;
}
export function createDateShiftUI({dialog,getState,getContext,canOpen,prepare,save,cancel,onSaved,fallbackFocus}){
  const node=key=>dialog.querySelector(`[data-shift-${key}]`),list=node('list'),status=node('status'),next=node('preview'),confirm=node('confirm'),close=node('close'),back=node('back'),offset=node('days');
  let rows=[],selected=new Set(),preview=null,owned=null,owns=false,source=null,context=null,opener=null,busy=false,locked=false,generation=0,expectedCloses=0;
  const signature=value=>JSON.stringify(value),sameContext=()=>context===signature(getContext());
  const problem=row=>dateShiftProblem(row)||(!getState().channels.find(c=>c.id===row.channels[0])?.enabled?'Kanal ist deaktiviert':null);
  const validDays=()=>/^[+-]?\d+$/.test(offset.value)&&Number.isInteger(Number(offset.value))&&Number(offset.value)!==0&&Math.abs(Number(offset.value))<=365;
  const inside=el=>el===dialog||dialog.contains?.(el);
  function controls(){
    for(const input of list.querySelectorAll('input'))input.disabled=busy||locked||!!problem(rows.find(row=>row.id===input.value))||selected.size>=50&&!input.checked;
    offset.disabled=busy||locked||!!preview;next.hidden=!!preview||busy;next.disabled=busy||locked||selected.size<2||selected.size>50||!validDays();confirm.hidden=!preview&&!busy;confirm.disabled=busy||locked||!preview;back.hidden=!preview;back.disabled=busy||locked;close.disabled=busy;dialog.setAttribute('aria-busy',String(busy));
  }
  function discard(){const captured=owned;preview=null;owned=null;if(owns){owns=false;cancel(captured);}}
  function fail(message){discard();locked=true;status.textContent=message;controls();return false;}
  function checkState(){if(busy||!dialog.open)return true;if(locked)return false;if(!rows.length&&!owns)return true;return source===signature(getState())&&sameContext()&&canOpen()&&rows.filter(row=>selected.has(row.id)).every(row=>!problem(row))||fail('Planung geändert. Neu laden und Termine prüfen.');}
  function dismiss(){
    if(busy||!dialog.open)return false;
    const restore=sameContext()&&(inside(document.activeElement)||document.activeElement===opener),target=opener?.isConnected&&!opener.disabled?opener:fallbackFocus?.();
    discard();rows=[];selected.clear();generation++;expectedCloses++;dialog.close();if(restore&&target?.isConnected&&!target.disabled)target.focus();return true;
  }
  const compactTitle=value=>{const characters=Array.from(value);return characters.length>80?characters.slice(0,79).join('')+'…':value;};
  function postText(value){
    const details=document.createElement('details'),summary=document.createElement('summary'),body=document.createElement('p');
    details.className='ui-disclosure';summary.textContent='Beitragstext';body.textContent=value;details.append(summary,body);return details;
  }
  function selection(){
    list.replaceChildren();
    for(const row of rows){
      const item=document.createElement('li'),label=document.createElement('label'),input=document.createElement('input'),title=document.createElement('strong'),detail=document.createElement('p');
      input.type='checkbox';input.value=row.id;input.checked=selected.has(row.id);
      const body=row.variantTexts?.[row.channels[0]]??row.text;title.textContent=compactTitle(row.title||row.text.split('\n')[0]);title.title=row.title||row.text.split('\n')[0];
      detail.textContent=[row.channels.map(id=>getState().channels.find(c=>c.id===id)?.name||id).join(' · '),row.scheduledAt,row.timeZone,problem(row)].filter(Boolean).join(' · ');
      label.append(input,title);item.append(label,detail,postText(body));list.append(item);
      input.addEventListener('change',()=>{if(busy||locked||preview||!checkState())return;if(problem(row)||input.checked&&selected.size>=50){input.checked=false;return;}input.checked?selected.add(row.id):selected.delete(row.id);status.textContent=`${selected.size}/50 ausgewählt`;controls();});
    }
    status.textContent=`${selected.size}/50 ausgewählt${selected.size<2?' · Mindestens 2':''}`;controls();
  }
  function timeNode(label,value){
    if(!value?.instant||!value.local||!value.timezone||scheduleLocalTime(value.instant,value.timezone)!==value.local)throw Error('Unvollständiger Termin');
    const time=document.createElement('time');time.dateTime=value.instant;time.textContent=`${label}: ${new Intl.DateTimeFormat('de-DE',{timeZone:value.timezone,day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'shortOffset'}).format(new Date(value.instant))} · ${value.timezone}`;return time;
  }
  close.onclick=dismiss;
  dialog.addEventListener('cancel',event=>{event.preventDefault();dismiss();});
  dialog.addEventListener('close',()=>{if(expectedCloses){expectedCloses--;return;}if(dialog.open||busy)return;discard();rows=[];selected.clear();generation++;});
  offset.addEventListener('input',()=>{if(busy||locked||!checkState())return;discard();selection();if(!validDays())status.textContent='Ganze Kalendertage von −365 bis 365, ohne 0';});
  back.onclick=()=>{if(busy||locked||!checkState())return;discard();selection();offset.focus();};
  next.onclick=()=>{
    if(busy||locked||preview||!dialog.open||selected.size<2||selected.size>50||!validDays()||!checkState())return;
    const postIds=rows.filter(row=>selected.has(row.id)).map(row=>row.id),days=Number(offset.value);
    try{
      owns=true;const candidate=prepare(structuredClone(getState()),{postIds,days});owned=candidate;
      if(!candidate?.token||candidate.revision!==getState().revision||candidate.days!==days||signature(candidate.postIds)!==signature(postIds)||candidate.entries?.length!==postIds.length)throw Error('Unvollständige Vorschau');
      const items=[];
      for(const [index,entry] of candidate.entries.entries()){
        const row=rows.find(row=>row.id===postIds[index]);
        if(entry.postId!==row.id||entry.channelId!==row.channels[0]||typeof entry.text!=='string'||entry.from?.instant!==row.scheduledInstant||entry.from?.timezone!==row.timeZone||entry.to?.timezone!==row.timeZone)throw Error('Ungültige Vorschau');
        const item=document.createElement('li'),title=document.createElement('strong'),channel=document.createElement('p');title.textContent=compactTitle(entry.title||entry.text.split('\n')[0]);title.title=entry.title||entry.text.split('\n')[0];channel.textContent=getState().channels.find(c=>c.id===entry.channelId)?.name||entry.channelId;item.append(title,channel,timeNode('Bisher',entry.from),timeNode('Neu',entry.to),postText(entry.text));items.push(item);
      }
      list.replaceChildren(...items);preview=candidate;status.textContent=`${postIds.length} Termine · ${days>0?'+':''}${days} Kalendertage · Alles gemeinsam speichern`;controls();confirm.focus();
    }catch(error){discard();const known=/^(SHIFT_|DST_GAP$|DST_AMBIGUOUS$|PAST_TIME$|SLOT_TAKEN$|EXISTING_SCHEDULE_INVALID$|INVALID_SCHEDULE$)/.test(error?.code||'');if(known){status.textContent=error.message;controls();status.focus();}else fail('Vorschau nicht bestätigt. Neu laden und Termine prüfen.');}
  };
  confirm.onclick=async()=>{
    if(busy||locked||!preview||!dialog.open||!checkState())return;
    if(!validDays()||preview.days!==Number(offset.value)){discard();selection();return;}
    const intended=preview,epoch=generation;preview=null;busy=true;controls();status.textContent='Termine speichern …';let committed=false;
    try{const saved=await save(structuredClone(getState()),intended);committed=true;owns=false;owned=null;rows=[];selected.clear();onSaved(saved);if(epoch===generation){list.replaceChildren();status.textContent='Termine verschoben.';}}
    catch(error){fail(committed?'Termine gespeichert. Ansicht neu laden.':error?.code==='REVISION_CONFLICT'?'Planung geändert. Neu laden und Termine prüfen.':'Speicherung nicht bestätigt. Neu laden und Termine prüfen.');}
    finally{busy=false;controls();next.hidden=true;if(epoch===generation&&dialog.open&&sameContext()&&inside(document.activeElement))close.focus();}
  };
  return {get pending(){return busy;},checkState,open(postIds){
    if(busy||locked||dialog.open||!canOpen()||!Array.isArray(postIds)||!postIds.length||new Set(postIds).size!==postIds.length)return false;
    const captured=postIds.map(id=>getState().posts.find(post=>post.id===id));if(captured.some(row=>!row))return false;
    generation++;rows=structuredClone(captured);selected=new Set();preview=null;opener=document.activeElement;source=signature(getState());context=signature(getContext());offset.value='1';selection();dialog.showModal();close.focus();return true;
  }};
}
