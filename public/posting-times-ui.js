import {createPostingTimesController,emptyPostingSchedule} from './posting-times-controller.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const weekdays=[[1,'Montag'],[2,'Dienstag'],[3,'Mittwoch'],[4,'Donnerstag'],[5,'Freitag'],[6,'Samstag'],[0,'Sonntag']];
export function postingScheduleSummary(schedule){return !schedule?'Noch keine Zeiten':schedule.paused?'Pausiert':!schedule.slots.length?'Keine Wochenzeiten':`${schedule.slots.length} ${schedule.slots.length===1?'Wochenzeit':'Wochenzeiten'} · ${schedule.timezone}`;}
export function postingTimesStatus(s){
  if(s.busy)return 'Wird gespeichert …';
  if(s.message)return s.message;
  if(s.dirty)return 'Noch nicht gespeichert.';
  if(!s.draft)return 'Noch keine Zeiten eingerichtet.';
  if(!s.draft.slots.length)return s.draft.paused?'Vorschläge pausiert. Keine Wochenzeiten eingerichtet.':'Gespeicherter Stand · keine Wochenzeiten.';
  return s.draft.paused?'Gespeicherter Stand · Vorschläge pausiert.':'Gespeicherter Stand.';
}
export function createPostingTimesUI({dialog,openButton,getState,saveState,isBusy=()=>false,onSaved=()=>{}}) {
  let disposed=false,returnFocus=null,guardReturnFocus=null,pendingClose=false,pendingChannel=null,lastChannel=null;
  const controller=createPostingTimesController({getState,saveState,onChange:updateStatus});
  const find=selector=>dialog.querySelector(selector);
  const selectZones=selected=>[...new Set([selected,'UTC','Europe/Berlin',...(Intl.supportedValuesOf?.('timeZone')||[])])].sort();
  function render(){
    if(disposed)return;const s=controller.snapshot;if(!s.open)return;
    const selected=s.channels.find(c=>c.id===s.channelId),d=s.draft||emptyPostingSchedule(getState().settings.timezone);
    dialog.innerHTML=`<header class="posting-times-head"><div><span class="eyebrow">DEIN WOCHENRHYTHMUS</span><h2 id="posting-times-title" tabindex="-1">Posting-Zeiten</h2></div><button type="button" class="icon-button" data-times="close" aria-label="Posting-Zeiten schließen">×</button></header>
      <div class="posting-times-body"><p class="field-hint">Wiederkehrende Zeiten je Kanal. Beiträge wählst du später bewusst aus.</p>
      <div class="times-settings-grid"><label class="times-field">Kanal<select data-times-field="channel">${s.channels.map(c=>`<option value="${esc(c.id)}" ${c.id===s.channelId?'selected':''}>${esc(c.name)} · ${esc(postingScheduleSummary(c.postingSchedule))}</option>`).join('')}</select></label>
      <label class="times-field">Zeitzone<select data-times-field="timezone">${selectZones(d.timezone).map(z=>`<option ${z===d.timezone?'selected':''}>${esc(z)}</option>`).join('')}</select></label></div>
      <div data-times-guard hidden role="alert"></div>
      <div class="times-section-heading"><h3>Wöchentliche Posting-Zeiten</h3>${d.slots.length?'<button type="button" class="button subtle" data-times="add">+ Zeit hinzufügen</button>':''}</div>
      <div class="times-slots">${d.slots.map((slot,i)=>`<div class="times-slot" data-slot="${esc(slot.id)}"><label><span class="times-slot-label">Wochentag ${i+1}</span><select data-slot-field="weekday">${weekdays.map(([day,label])=>`<option value="${day}" ${day===slot.weekday?'selected':''}>${label}</option>`).join('')}</select></label><label><span class="times-slot-label">Uhrzeit ${i+1}</span><input type="time" value="${esc(slot.time)}" data-slot-field="time"></label><button type="button" class="times-remove" data-times="remove" aria-label="Wochenzeit ${i+1} entfernen">×</button></div>`).join('')||'<div class="times-empty"><span class="times-empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2"/></svg></span><h4>Noch keine Posting-Zeiten</h4><p>Lege deine ersten wöchentlichen Zeiten fest. Beiträge wählst du später bewusst aus.</p><button type="button" class="button primary" data-times="add">+ Erste Zeit hinzufügen</button></div>'}</div>
      <label class="times-pause"><input type="checkbox" data-times-field="paused" ${d.paused?'checked':''}><span>Neue Vorschläge pausieren<small>Bestehende Termine bleiben unverändert.</small></span></label>
      <details class="times-advanced"><summary>Abstand & Zeitumstellung</summary><label class="times-field">Mindestabstand je Kanal (Minuten)<input type="number" min="0" max="1440" step="1" data-times-field="minimumGapMinutes" value="${esc(d.minimumGapMinutes)}"></label><label class="times-field">Doppelte Stunde im Herbst<select data-times-field="overlapChoice"><option value="reject" ${d.overlapChoice==='reject'?'selected':''}>Überspringen (empfohlen)</option><option value="earlier" ${d.overlapChoice==='earlier'?'selected':''}>Erstes Vorkommen</option><option value="later" ${d.overlapChoice==='later'?'selected':''}>Zweites Vorkommen</option></select></label><p class="field-hint">Nicht existierende Zeiten im Frühjahr werden übersprungen. Eine Pause oder Regeländerung verschiebt keine Beiträge.</p><button type="button" class="button subtle" data-times="clear">Zeiten dieses Kanals entfernen</button></details>
      <div data-times-confirm hidden class="times-warning" role="status"></div><div data-times-error class="form-errors" role="alert" hidden></div>
      <div data-times-copy-wrap hidden><label for="times-copy">Deine Zeiten zum Kopieren</label><textarea id="times-copy" readonly rows="7"></textarea></div>
      <p class="times-boundary">Nur Planung. Keine automatische Veröffentlichung.</p></div>
      <footer class="posting-times-footer"><p data-times-status class="times-status" role="status" aria-live="polite"></p><div class="times-footer-actions"><button type="button" class="button subtle" data-times="close">Schließen</button><button type="button" class="button primary" data-times="save">Zeiten speichern</button></div></footer>`;
    updateStatus();
  }
  function updateStatus(){
    if(disposed||!dialog.open&&!controller.snapshot.open)return;
    const s=controller.snapshot,status=find('[data-times-status]');if(!status)return;
    status.textContent=postingTimesStatus(s);
    const error=find('[data-times-error]');error.hidden=!s.error;error.textContent=s.error;
    const confirm=find('[data-times-confirm]');confirm.hidden=!s.confirmation;
    confirm.textContent=s.confirmation?`${s.confirmation.affected.length} ${s.confirmation.affected.length===1?'bestehender Termin passt':'bestehende Termine passen'} danach nicht mehr zu diesen Regeln. Die Uhrzeiten bleiben unverändert.`:'';
    for(const control of dialog.querySelectorAll('button,input,select'))control.disabled=s.busy||(s.blocked&&!['close'].includes(control.dataset.times));
    find('[data-times="save"]').disabled=s.busy||s.blocked||!s.dirty;
    find('[data-times="save"]').textContent=s.confirmation?'Trotzdem Zeiten speichern':'Zeiten speichern';
    find('[data-times-copy-wrap]').hidden=!s.blocked;if(s.blocked)find('#times-copy').value=controller.exportDraft();
    dialog.setAttribute('aria-busy',String(s.busy));
  }
  function guard(channel=null){guardReturnFocus=document.activeElement;pendingClose=channel===null;pendingChannel=channel;const el=find('[data-times-guard]');el.hidden=false;el.innerHTML='<p>Deine Änderungen sind noch nicht gespeichert.</p><div class="times-guard-actions"><button type="button" class="button subtle" data-times="keep">Weiter bearbeiten</button><button type="button" class="button subtle" data-times="discard">Änderungen verwerfen</button></div>';find('[data-times="keep"]').focus();}
  function close(){if(disposed||controller.snapshot.busy)return;if(!controller.close()){guard();return;}dialog.close();if(returnFocus?.isConnected)returnFocus.focus();}
  function open(channelId=null){
    if(disposed||isBusy())return false;
    const state=getState(),id=channelId||(state.channels.some(c=>c.id===lastChannel)?lastChannel:null)||state.channels.find(c=>c.postingSchedule)?.id||state.channels[0]?.id;if(!id)return false;
    if(dialog.open){find('#posting-times-title')?.focus();return true;}
    try{if(!controller.open(id))return false;}catch{return false;}
    lastChannel=id;returnFocus=document.activeElement;render();dialog.showModal();find('#posting-times-title').focus();return true;
  }
  async function click(event){
    const button=event.target.closest('[data-times]');if(disposed||!button||controller.snapshot.busy)return;
    const action=button.dataset.times;
    if(action==='close'){close();return;}
    if(action==='keep'){find('[data-times-guard]').hidden=true;pendingClose=false;pendingChannel=null;(guardReturnFocus?.isConnected?guardReturnFocus:find('[data-times-field="channel"]'))?.focus();guardReturnFocus=null;return;}
    if(action==='discard'){controller.close({discard:true});if(pendingClose){dialog.close();returnFocus?.isConnected&&returnFocus.focus();}else if(pendingChannel){controller.open(pendingChannel);lastChannel=pendingChannel;render();}pendingClose=false;pendingChannel=null;return;}
    if(controller.snapshot.blocked||isBusy())return;
    if(action==='add'){controller.addSlot();render();find('.times-slot:last-child input')?.focus();}
    if(action==='remove'){const id=button.closest('[data-slot]').dataset.slot;controller.removeSlot(id);render();find('[data-times="add"]').focus();}
    if(action==='clear'){controller.clear();render();find('[data-times="add"]').focus();}
    if(action==='save'){const success=await controller.save({confirmed:!!controller.snapshot.confirmation});if(disposed)return;if(success){onSaved();render();find('[data-times="close"]').focus();}else if(controller.snapshot.confirmation)find('[data-times-confirm]').scrollIntoView({block:'nearest'});}
  }
  function change(event){
    if(disposed||controller.snapshot.busy||controller.snapshot.blocked)return;
    const field=event.target.dataset.timesField,slot=event.target.dataset.slotField;
    if(field==='channel'){const id=event.target.value;if(controller.snapshot.dirty){event.target.value=controller.snapshot.channelId;guard(id);}else{controller.open(id);lastChannel=id;render();find('[data-times-field="channel"]').focus();}return;}
    if(field){controller.patch({[field]:field==='paused'?event.target.checked:field==='minimumGapMinutes'?Number(event.target.value===''?NaN:event.target.value):event.target.value});}
    if(slot){controller.updateSlot(event.target.closest('[data-slot]').dataset.slot,{[slot]:slot==='weekday'?Number(event.target.value):event.target.value});}
  }
  const cancel=event=>{event.preventDefault();close();},entry=()=>open();
  dialog.addEventListener('click',click);dialog.addEventListener('input',change);dialog.addEventListener('change',change);dialog.addEventListener('cancel',cancel);openButton.addEventListener('click',entry);
  return {open,get dirty(){return controller.snapshot.dirty;},get busy(){return controller.snapshot.busy;},destroy(){if(disposed)return;disposed=true;controller.destroy();dialog.removeEventListener('click',click);dialog.removeEventListener('input',change);dialog.removeEventListener('change',change);dialog.removeEventListener('cancel',cancel);openButton.removeEventListener('click',entry);}};
}
