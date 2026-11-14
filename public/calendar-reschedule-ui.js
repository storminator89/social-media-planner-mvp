import {calendarTime} from './calendar-model.js';
import {proposeCalendarReschedule,rescheduleDay} from './calendar-reschedule.js';

export const CALENDAR_DRAG_TYPE='application/x-takt-calendar-post';
export function createCalendarRescheduler({container,dialog,getContext,getPost,isBusy,onApply,onError,fallbackFocus=()=>null,token=()=>crypto.randomUUID(),now=()=>Date.now()}){
  const find=selector=>dialog.querySelector(selector),date=find('[data-reschedule-date]'),error=find('[data-reschedule-error]'),confirm=find('[data-reschedule-confirm]');
  let pending=null,drag=null,hover=null,suppressUntil=0,disposed=false,generation=0;
  const document=dialog.ownerDocument||container.ownerDocument;
  const visible=element=>!!element?.isConnected&&container.contains(element)&&element.getClientRects().length>0;
  function clearHover(){hover?.classList.remove('calendar-drop-target');hover=null;}
  function capture(element){
    if(disposed||dialog.open||isBusy()||!visible(element))return null;
    const context=getContext(),post=getPost(element.dataset.calendarPost||element.dataset.reschedulePost);
    if(context.view!=='calendar'||!post||post.status!=='scheduled')return null;
    return {element,context:JSON.stringify(context),post:JSON.stringify(post),id:post.id,zone:context.zone};
  }
  function current(source){
    if(disposed||!source||isBusy()||!visible(source.element)||JSON.stringify(getContext())!==source.context||JSON.stringify(getPost(source.id))!==source.post)throw Error('Kalender geändert. Beitrag erneut wählen.');
    return getPost(source.id);
  }
  function focusable(element){
    if(!element?.isConnected||element.disabled||element.hidden||element.closest?.('[inert], [hidden], dialog:not([open])')||!element.getClientRects().length)return false;
    const visibility=document?.defaultView?.getComputedStyle(element).visibility;
    return visibility!=='hidden'&&visibility!=='collapse';
  }
  function restoreFocus(source,expectedGeneration=generation){
    const allowed=()=>!disposed&&generation===expectedGeneration&&!dialog.open&&!document?.querySelector('dialog[open]');
    if(!source||!allowed())return;
    if(visible(source.element)&&focusable(source.element)){source.element.focus();if(!document||document.activeElement===source.element)return;}
    const fallback=fallbackFocus();
    if(allowed()&&focusable(fallback))fallback.focus();
  }
  function close({focus=true}={}){if(!pending&&!dialog.open)return;const source=pending,closedGeneration=++generation;pending=null;if(dialog.open)dialog.close();if(focus)restoreFocus(source,closedGeneration);}
  function show(source,day){
    const post=current(source),original=calendarTime(post,source.zone);pending=source;generation++;
    date.value=day||original.local.slice(0,10);date.setAttribute('aria-label',`Neuer Tag · ${source.zone}`);
    find('[data-reschedule-original]').textContent=original.local.replace('T',' · ')+' · '+source.zone;
    find('[data-reschedule-binding]').hidden=!post.scheduleBinding;
    confirm.textContent='Im Editor prüfen';
    error.hidden=true;error.textContent='';if(!dialog.open)dialog.showModal();date.focus();
  }
  function apply(source,day,{releaseBinding=false}={}){
    const post=current(source),proposal=proposeCalendarReschedule(post,day,source.zone);
    if(proposal.unchanged){close({focus:false});restoreFocus(source);return true;}
    if(post.scheduleBinding&&!releaseBinding){show(source,day);return false;}
    // Consume the intent before opening the editor. Double clicks and late drops cannot replay it.
    const appliedGeneration=++generation;pending=null;drag=null;clearHover();if(dialog.open)dialog.close();restoreFocus(source,appliedGeneration);
    onApply(post,proposal);return true;
  }
  function fail(message){if(dialog.open){error.textContent=message;error.hidden=false;error.focus();}else onError(message);}
  const click=event=>{
    if(disposed)return;
    if(now()<suppressUntil){event.preventDefault();event.stopImmediatePropagation();return;}
    const button=event.target.closest('[data-reschedule-post]');if(!button||!container.contains(button))return;
    event.preventDefault();event.stopImmediatePropagation();
    try{const source=capture(button);if(source)show(source);}catch(e){fail(e.message);}
  };
  const start=event=>{
    const element=event.target.closest('[data-calendar-post]');if(!element||!container.contains(element))return;
    try{const source=capture(element);if(!source||!event.dataTransfer){event.preventDefault();return;}
      drag={source,key:token(),targets:new Map([...container.querySelectorAll('[data-calendar-day]')].filter(visible).map(el=>[el,el.dataset.calendarDay]))};
      event.dataTransfer.clearData();event.dataTransfer.setData(CALENDAR_DRAG_TYPE,drag.key);event.dataTransfer.effectAllowed='move';suppressUntil=now()+300;
    }catch{drag=null;event.preventDefault();}
  };
  function target(event){
    if(!drag||!event.dataTransfer||![...event.dataTransfer.types].includes(CALENDAR_DRAG_TYPE)||[...event.dataTransfer.types].some(t=>t!==CALENDAR_DRAG_TYPE))return null;
    const el=event.target.closest('[data-calendar-day]');if(!visible(el)||drag.targets.get(el)!==el.dataset.calendarDay)return null;
    try{current(drag.source);rescheduleDay(el.dataset.calendarDay);return el;}catch{return null;}
  }
  const over=event=>{const el=target(event);clearHover();if(!el)return;event.preventDefault();event.dataTransfer.dropEffect='move';hover=el;hover.classList.add('calendar-drop-target');};
  const drop=event=>{
    const el=target(event);if(!el)return;
    const active=drag;drag=null;clearHover();suppressUntil=now()+300;
    if(event.dataTransfer.getData(CALENDAR_DRAG_TYPE)!==active.key)return;
    event.preventDefault();event.stopPropagation();
    try{apply(active.source,el.dataset.calendarDay);}catch(e){try{show(active.source,el.dataset.calendarDay);}catch{}fail(e.message);}
  };
  const end=()=>{drag=null;clearHover();suppressUntil=now()+300;};
  const submit=event=>{event.preventDefault();if(!dialog.open||!pending)return;try{apply(pending,date.value,{releaseBinding:true});}catch(e){fail(e.message);}};
  const cancel=event=>{event.preventDefault();close();};
  const dismiss=event=>{if(event.target.closest('[data-reschedule-close]'))close();};
  container.addEventListener('click',click,true);container.addEventListener('dragstart',start);container.addEventListener('dragover',over);container.addEventListener('drop',drop);container.addEventListener('dragend',end);
  dialog.addEventListener('submit',submit);dialog.addEventListener('cancel',cancel);dialog.addEventListener('click',dismiss);
  return {destroy(){if(disposed)return;disposed=true;generation++;close({focus:false});end();container.removeEventListener('click',click,true);for(const [type,fn] of [['dragstart',start],['dragover',over],['drop',drop],['dragend',end]])container.removeEventListener(type,fn);for(const [type,fn] of [['submit',submit],['cancel',cancel],['click',dismiss]])dialog.removeEventListener(type,fn);}};
}
