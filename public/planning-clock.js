import {calendarPosts,planningStatus} from './calendar-model.js';
import {inspectScheduleBinding,scheduleLocalTime} from './workflows/posting-schedules.mjs';

// Only display classifications and the planning zone's civil day, never a write or delivery signal.
export function planningClockKey(state,now=new Date()){
  const zone=state.settings.timezone;
  const day=scheduleLocalTime(now.toISOString(),zone).slice(0,10);
  const rows=calendarPosts(state.posts.filter(post=>post.status==='scheduled'),zone).map(post=>[
    post.id,planningStatus(post,{now,needsReview:!!post.scheduleBinding&&inspectScheduleBinding(post,state.channels).state==='needs_review'}).kind,
    !!post.calendarTime&&Date.parse(post.calendarTime.instant)<=now.getTime()
  ]).sort(([a],[b])=>a.localeCompare(b));
  return JSON.stringify({zone,day,rows});
}

/** Detect stale time-based display without ever replacing a focused row or an open editor. */
export function installPlanningClock({content,notice,message,button,focusTarget,readKey,renderedAt,isRelevant,isBlocked,refresh,
  doc=document,win=window,Observer=MutationObserver,now=()=>new Date(),setTimer=setTimeout,clearTimer=clearTimeout}){
  let baseline=null,stale=false,problem=null,timer=null,suspended=false,destroyed=false;
  const hidden=()=>doc.visibilityState==='hidden';
  const clear=()=>{if(timer!==null){clearTimer(timer);timer=null;}};
  function show(){
    // A hidden/suspended page needs no DOM changes; retain its keyboard return target.
    if(!destroyed&&(suspended||hidden()))return;
    const visible=!destroyed&&isRelevant()&&!isBlocked()&&stale;
    notice.hidden=!visible;button.disabled=!visible;
    const text=problem==='refresh'?'Die Anzeige konnte nicht aktualisiert werden. Versuche es erneut.':problem==='clock'?'Die Zeithinweise konnten nicht geprüft werden. Aktualisiere die Anzeige.':'Die Zeithinweise haben sich zwischenzeitlich geändert. Aktualisiere die Anzeige.';
    if(message.textContent!==text)message.textContent=text;
  }
  function arm(){
    clear();
    if(!destroyed&&!suspended&&!hidden()&&isRelevant())timer=setTimer(()=>{timer=null;check();},30000);
  }
  function rendered(){
    if(destroyed)return;
    try{
      const stamp=renderedAt();
      if(typeof stamp!=='string'||!/^\d+$/.test(stamp))throw Error('Missing render time');
      baseline=readKey(new Date(Number(stamp)));stale=readKey(now())!==baseline;problem=null;
    }catch{baseline=null;stale=true;problem='clock';}
    show();arm();
  }
  function check(){
    if(destroyed)return;
    if(!suspended&&!hidden()&&isRelevant()&&!isBlocked()){
      try{stale=stale||baseline===null||readKey(now())!==baseline;} // Sticky until a successful render; a timer must not hide its focused button.
      catch{stale=true;problem='clock';}
    }
    show();arm();
  }
  function update(){
    if(destroyed||suspended||hidden()||!isRelevant()||isBlocked())return;
    const left=win.scrollX,top=win.scrollY;
    const grid=content.querySelector('.week-grid'),gridLeft=grid?.scrollLeft,gridTop=grid?.scrollTop;
    try{
      refresh();
      const nextGrid=content.querySelector('.week-grid');
      if(grid&&nextGrid){nextGrid.scrollLeft=gridLeft;nextGrid.scrollTop=gridTop;}
      // Refresh is explicit. Keep the viewport stable and move focus away from a vanishing notice.
      focusTarget.focus({preventScroll:true});win.scrollTo({left,top,behavior:'instant'});
    }catch{stale=true;problem='refresh';show();}
  }
  function pause(){suspended=true;clear();show();}
  function resume(){suspended=false;check();}
  const observer=new Observer(records=>{
    if(destroyed)return;
    // A start stamp alone is not success: only actual content replacement acknowledges a render.
    if(records.some(record=>record.target===content&&record.type==='childList'))rendered();
    else check();
  });
  observer.observe(content,{childList:true});
  observer.observe(doc.body,{attributes:true,attributeFilter:['data-planner-view']});
  button.addEventListener('click',update);
  doc.addEventListener('visibilitychange',check);
  doc.addEventListener('close',check,true);
  win.addEventListener('focus',check);
  win.addEventListener('pageshow',resume);
  win.addEventListener('pagehide',pause);
  rendered();
  return {check,destroy(){
    if(destroyed)return;destroyed=true;clear();observer.disconnect();
    button.removeEventListener('click',update);doc.removeEventListener('visibilitychange',check);doc.removeEventListener('close',check,true);
    win.removeEventListener('focus',check);win.removeEventListener('pageshow',resume);win.removeEventListener('pagehide',pause);show();
  }};
}
