import { normalizePostingSchedule, replacePostingSchedule } from './workflows/posting-schedules.mjs';

const copy = value => structuredClone(value);
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
export function emptyPostingSchedule(timezone = 'UTC') {
  return {schemaVersion:1,timezone,paused:false,minimumGapMinutes:0,overlapChoice:'reject',slots:[]};
}

/** A local edit session. Only an explicit save invokes persistence, never retries. */
export function createPostingTimesController({getState,saveState,onChange=()=>{},newId=()=>crypto.randomUUID()}) {
  let disposed=false, generation=0, base=null, channelId=null, draft=null, original=null;
  let busy=false, blocked=false, error='', message='', confirmation=null;
  const dirty=()=>base!==null&&!same(draft,original);
  const snapshot=()=>({open:base!==null,channelId,draft:copy(draft),dirty:dirty(),busy,blocked,error,message,confirmation:copy(confirmation),channels:copy(base?.channels||[])});
  const emit=()=>{if(!disposed)onChange(snapshot());};
  function open(id) {
    if(disposed||busy)return false;
    if(dirty())return false;
    const state=getState(), channel=state.channels?.find(c=>c.id===id);
    if(state.schemaVersion!==2||!Number.isSafeInteger(state.revision)||!channel)throw Error('Lade zuerst einen bestätigten Planungsstand.');
    base=copy(state);channelId=id;original=copy(channel.postingSchedule);draft=copy(original);
    blocked=false;error='';message='';confirmation=null;generation++;emit();return true;
  }
  function patch(fields) {
    if(disposed||busy||blocked||!base)return false;
    draft={...(draft||emptyPostingSchedule(base.settings.timezone)),...copy(fields)};
    error='';message='';confirmation=null;emit();return true;
  }
  function addSlot() {
    if(disposed||busy||blocked||!base)return;
    const value=draft||emptyPostingSchedule(base.settings.timezone);
    if(value.slots.length>=56){error='Höchstens 56 Wochenzeiten pro Kanal.';emit();return;}
    patch({...value,slots:[...value.slots,{id:newId(),weekday:1,time:'09:00'}]});
  }
  function updateSlot(id,fields) {if(draft)patch({slots:draft.slots.map(slot=>slot.id===id?{...slot,...copy(fields),id:slot.id}:slot)});}
  function removeSlot(id) {if(draft)patch({slots:draft.slots.filter(slot=>slot.id!==id)});}
  function clear(){if(disposed||busy||blocked||!base)return;draft=null;error='';message='';confirmation=null;emit();}
  function close({discard=false}={}) {
    if(disposed||busy||dirty()&&!discard)return false;
    generation++;base=null;draft=null;original=null;channelId=null;confirmation=null;emit();return true;
  }
  async function save({confirmed=false}={}) {
    if(disposed||busy||blocked||!base||!dirty())return false;
    let proposal;
    try {
      if(getState().revision!==base.revision)throw Object.assign(Error('Die Planung wurde inzwischen geändert. Kopiere deine Zeiten vor dem Neuladen.'),{code:'REVISION_CONFLICT'});
      proposal=replacePostingSchedule(base,{channelId,postingSchedule:normalizePostingSchedule(draft),expectedRevision:base.revision});
    } catch(e) {error=e.message;if(e.code==='REVISION_CONFLICT')blocked=true;emit();return false;}
    if(proposal.affected.length&&!confirmed){confirmation={affected:proposal.affected.map(x=>x.postId)};emit();return false;}
    // A confirmation applies only to the currently displayed draft and base revision.
    if(proposal.affected.length&&(!confirmation||!same(confirmation.affected,proposal.affected.map(x=>x.postId))))return false;
    busy=true;error='';message='';const epoch=generation;emit();
    try {
      const saved=await saveState(copy(proposal.snapshot));
      if(disposed||epoch!==generation)return false;
      const channel=saved?.channels?.find(c=>c.id===channelId);
      if(saved?.schemaVersion!==2||!Number.isSafeInteger(saved.revision)||saved.revision!==base.revision+1||!channel||!same(normalizePostingSchedule(channel.postingSchedule),normalizePostingSchedule(draft)))throw Error('Die Speicherbestätigung ist nicht eindeutig.');
      base=copy(saved);original=copy(channel.postingSchedule);draft=copy(original);confirmation=null;
      message=proposal.affected.length?`Zeiten gespeichert. ${proposal.affected.length} ${proposal.affected.length===1?'Termin bleibt':'Termine bleiben'} zur Prüfung markiert.`:'Zeiten gespeichert. Bestehende Termine bleiben unverändert.';
      return true;
    } catch(e) {
      if(disposed||epoch!==generation)return false;
      blocked=true;confirmation=null;
      error=(e.status===409||e.code==='CONFLICT'||e.code==='REVISION_CONFLICT')?'Speicherkonflikt. Deine Zeiten bleiben hier. Kopiere sie vor dem Neuladen.':'Speichern nicht bestätigt. Keine automatische Wiederholung. Kopiere deine Zeiten und lade die Planung neu.';
      return false;
    } finally {if(!disposed&&epoch===generation){busy=false;emit();}}
  }
  return {get snapshot(){return snapshot();},open,patch,addSlot,updateSlot,removeSlot,clear,close,save,
    exportDraft:()=>JSON.stringify({channelId,postingSchedule:draft},null,2),
    destroy(){if(disposed)return;disposed=true;generation++;base=null;}};
}
