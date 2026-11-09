import {findNextPostingSlots,selectPostingSlot} from './workflows/posting-schedules.mjs';

const reasons={queue_paused:'Mindestens ein Kanal ist pausiert.',queue_empty:'Für mindestens einen Kanal fehlen Wochenzeiten.',all_occupied:'Alle gemeinsamen Zeiten der nächsten 60 Tage sind belegt.',no_shared_slot:'In den nächsten 60 Tagen gibt es keinen gemeinsamen Zeitpunkt.'};
const signature=post=>JSON.stringify([post.id,post.channels,post.timeZone,post.scheduledAt,post.scheduledInstant,post.scheduleBinding]);
export function createSavedQueueController({getState,getPost,onApply,isBusy=()=>false,now=()=>new Date().toISOString(),onChange=()=>{}}){
  let proposal=null,source=null,pending=null,message='',disposed=false;
  const snapshot=()=>({proposal:proposal?structuredClone(proposal):null,pending,message});
  const emit=()=>{if(!disposed)onChange(snapshot());};
  function invalidate({force=false}={}){if(disposed)return;if(force||proposal||pending!==null){proposal=null;pending=null;source=null;message='Die Eingabe hat sich geändert. Suche erneut.';emit();}}
  function reset(){if(disposed)return;proposal=null;pending=null;source=null;message='Wähle einen freien Zeitpunkt aus deinen gespeicherten Kanalzeiten.';emit();}
  function search(){
    if(disposed||isBusy())return;
    proposal=null;pending=null;source=null;
    try{const post=getPost();proposal=findNextPostingSlots(getState(),{postId:post.id,channelIds:post.channels,displayTimezone:post.timeZone,after:now(),limit:3,horizonDays:60});source=signature(post);message=proposal.suggestions.length?`Freie gemeinsame Zeiten · ${post.timeZone}`:reasons[proposal.reason]||'Keine passenden Zeiten.';}
    catch(error){message=error.code==='SCHEDULE_MISSING'?'Richte zuerst die Posting-Zeiten der gewählten Kanäle ein.':error.message;}
    emit();
  }
  function choose(index,{confirmed=false}={}){
    if(disposed||isBusy()||!proposal||!Number.isSafeInteger(index)||index<0||index>=proposal.suggestions.length)return false;
    try{
      const post=getPost();if(signature(post)!==source)throw Error('Die Eingabe hat sich geändert. Suche erneut.');
      const selection=selectPostingSlot(getState(),proposal,proposal.suggestions[index],{now:now()});
      if(post.status==='scheduled'&&post.scheduledAt&&post.scheduledInstant!==selection.scheduledAt){
        if(!confirmed){pending=index;message='Der bisherige Termin wird erst nach deiner Bestätigung ersetzt.';emit();return false;}
        if(pending!==index)return false;
      }
      const result={...structuredClone(post),status:'scheduled',scheduledAt:selection.local,timeZone:selection.timezone,scheduledInstant:selection.scheduledAt,scheduleBinding:selection.scheduleBinding};
      onApply(result);proposal=null;pending=null;source=null;message='Termin übernommen. Erst das Einplanen speichert den Beitrag.';emit();return true;
    }catch(error){proposal=null;pending=null;source=null;message=error.message;emit();return false;}
  }
  reset();return {get snapshot(){return snapshot();},reset,invalidate,search,choose,destroy(){disposed=true;proposal=null;}};
}

export function createSavedQueuePanel({container,getState,getPost,onApply,onSettings,isBusy=()=>false,now}){
  let disposed=false;
  container.classList.add('saved-queue-panel');
  container.innerHTML='<summary>Freien Posting-Termin finden</summary><p class="field-hint">Nur gemeinsame freie Zeiten deiner gewählten Kanäle. Bestehende Termine bleiben, bis du sie bewusst ersetzt.</p><div class="queue-actions"><button type="button" class="button subtle" data-saved-queue="search">Freie Zeiten suchen</button><button type="button" class="button subtle" data-saved-queue="settings">Posting-Zeiten</button></div><p class="queue-status field-hint" role="status" aria-live="polite"></p><p class="queue-warning" hidden></p><div class="queue-results"></div><div class="queue-confirm" hidden></div>';
  const find=selector=>container.querySelector(selector);
  function render(s){
    if(disposed)return;find('.queue-status').textContent=s.message;const results=find('.queue-results');results.replaceChildren();
    const warning=find('.queue-warning');warning.hidden=!s.proposal?.warnings.length;
    warning.textContent=s.proposal?.warnings.length?'Zeiten in der Sommerzeitlücke oder der nicht gewählten doppelten Stunde wurden ausgelassen.':'';
    for(const [index,item] of (s.proposal?.suggestions||[]).entries()){
      const button=document.createElement('button');button.type='button';button.className='queue-suggestion';button.dataset.savedQueue='choose';button.dataset.index=String(index);
      const text=document.createElement('span'),detail=document.createElement('small'),action=document.createElement('strong');
      text.textContent=new Intl.DateTimeFormat('de-DE',{timeZone:item.timezone,weekday:'short',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'shortOffset'}).format(new Date(item.instant));
      detail.textContent=item.timezone;action.textContent='Termin wählen';text.append(detail);button.append(text,action);results.append(button);
    }
    const confirm=find('.queue-confirm');confirm.replaceChildren();confirm.hidden=s.pending===null;
    if(s.pending!==null){const p=document.createElement('p');p.textContent='Bisherigen Termin durch diesen Vorschlag ersetzen?';const button=document.createElement('button');button.type='button';button.className='button primary';button.dataset.savedQueue='confirm';button.dataset.index=String(s.pending);button.textContent='Termin bewusst ersetzen';confirm.append(p,button);button.focus();}
  }
  const controller=createSavedQueueController({getState,getPost,onApply,isBusy,now,onChange:render});
  const click=event=>{const button=event.target.closest('[data-saved-queue]');if(disposed||!button||isBusy())return;switch(button.dataset.savedQueue){case'search':controller.search();break;case'settings':onSettings();break;case'choose':controller.choose(Number(button.dataset.index));break;case'confirm':controller.choose(Number(button.dataset.index),{confirmed:true});break;}};
  container.addEventListener('click',click);
  return {openSearch(){if(disposed||isBusy())return false;container.open=true;controller.search();find('[data-saved-queue="search"]').focus();return true;},invalidate:controller.invalidate,reset(){controller.reset();container.open=false;},destroy(){if(disposed)return;disposed=true;controller.destroy();container.removeEventListener('click',click);}};
}
