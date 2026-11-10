import {calendarTime} from './calendar-model.js';
import {zonedInstant} from './model.js';
import {scheduleLocalTime} from './workflows/posting-schedules.mjs';

export function rescheduleDay(value){
  if(typeof value!=='string'||!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value))throw Error('Gültiges Datum wählen.');
  const parsed=new Date(value+'T12:00:00Z');
  if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)throw Error('Gültiges Datum wählen.');
  return value;
}
// Proposal only. The adapter/server, never a drag payload, resolves the saved instant.
export function proposeCalendarReschedule(post,day,zone){
  rescheduleDay(day);
  const from=calendarTime(post,zone);
  if(!from)throw Error('Geplanten Beitrag wählen.');
  if(from.local.slice(0,10)===day)return {unchanged:true,from:from.local,to:from.local,calendarZone:zone};
  const to=day+'T'+from.local.slice(11,16);
  let instant,local;
  try{
    instant=zonedInstant(to,zone).toISOString();
    if(scheduleLocalTime(instant,zone)!==to)throw Error();
    local=scheduleLocalTime(instant,post.timeZone);
    if(zonedInstant(local,post.timeZone).toISOString()!==instant)throw Error();
  }catch{throw Error('Zeitumstellung: anderen Tag oder Termin im Editor wählen.');}
  return {unchanged:false,from:from.local,to,calendarZone:zone,local,timeZone:post.timeZone,scheduledInstant:null,scheduleBinding:null};
}
