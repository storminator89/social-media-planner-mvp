import {normalizeScheduleBinding,scheduleLocalTime} from './workflows/posting-schedules.mjs';

const clone=value=>structuredClone(value);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const targets=(a,b)=>same([...a].sort(),[...b].sort());
const empty=()=>({scheduleBinding:null,scheduledInstant:null});
export function createEditorTiming(){
  let timing=empty(),confirmed=null,needsReplan=false;
  function open(post=null){confirmed=post?clone(post):null;timing=post?{scheduleBinding:clone(post.scheduleBinding??null),scheduledInstant:post.scheduledInstant??null}:empty();needsReplan=false;}
  function select(post){timing={scheduleBinding:normalizeScheduleBinding(post.scheduleBinding),scheduledInstant:post.scheduledInstant};needsReplan=false;}
  function manual(){timing=empty();needsReplan=false;}
  function changed(local,zone){if(!timing.scheduleBinding&&timing.scheduledInstant&&(!confirmed||local!==confirmed.scheduledAt||zone!==confirmed.timeZone))timing.scheduledInstant=null;}
  function restore(workspace,payload,{asCopy=false,source=null}={}){
    const context=payload.planning;
    const hasTime=!!payload.date||!!payload.time;
    const sameProjection=source&&source.scheduledAt===`${payload.date}T${payload.time}`&&source.timeZone===payload.timeZone&&targets(source.channels,payload.channels);
    const exactContext=context&&same(context.scheduleBinding,source?.scheduleBinding??null)&&context.scheduledInstant===(source?.scheduledInstant??null);
    confirmed=asCopy?null:source?clone(source):null;
    if(!asCopy&&sameProjection&&exactContext){timing=clone(context);delete timing.schemaVersion;needsReplan=false;return;}
    // A workspace is a recovery copy, never fresh authority for a reservation.
    timing=context?{scheduleBinding:clone(context.scheduleBinding),scheduledInstant:context.scheduledInstant}:empty();needsReplan=hasTime&&(!context||asCopy||!!context.scheduleBinding||!!context.scheduledInstant);
  }
  function forSave({status,local,zone,channels}){
    if(status!=='scheduled')return empty();
    if(needsReplan)throw Error('Wähle den Termin dieser Arbeitsfassung bewusst neu.');
    if(timing.scheduleBinding){const binding=normalizeScheduleBinding(timing.scheduleBinding);if(local!==scheduleLocalTime(binding.instant,zone)||!targets(channels,binding.refs.map(r=>r.channelId)))throw Error('Die Slot-Bindung passt nicht mehr. Wähle einen neuen Termin oder löse die Bindung.');return clone(timing);}
    changed(local,zone);return clone(timing);
  }
  return {open,select,manual,changed,restore,forSave,
    get snapshot(){return {...clone(timing),needsReplan};},
    get planning(){return {schemaVersion:1,...clone(timing)};}};
}
