import {createPostGroupsReader,renderPostGroups,filterPostGroups} from './post-groups.js';
const groups=document.querySelector('#groups'),status=document.querySelector('#status');
const filters=document.querySelector('#filters'),query=document.querySelector('#query'),state=document.querySelector('#state'),reset=document.querySelector('#reset'),count=document.querySelector('#count');
let current=null;
function render(){
 if(!current)return;
 const filtered=!!query.value.trim()||!!state.value;
 const view=filterPostGroups(current,{query:query.value,status:state.value});
 groups.innerHTML=renderPostGroups(view,{filtered});
 const total=current.posts.reduce((n,p)=>n+p.variants.length,0),shown=view.posts.reduce((n,p)=>n+p.variants.length,0);
 count.textContent=`${shown} / ${total} Kanalbeiträge`;
 reset.hidden=!filtered;
}
const reader=createPostGroupsReader({load:async()=>{const response=await fetch('/api/planner/state',{method:'GET',credentials:'same-origin',cache:'no-store',headers:{'X-Planner-Request':'1'}});if(!response.ok)throw Error('Unavailable');return response.json();},onState:event=>{
 current=null;groups.replaceChildren();count.textContent='';filters.disabled=true;
 status.textContent=event.phase==='loading'?'Wird geladen …':event.phase==='error'?'Nicht verfügbar. Bitte erneut laden.':'';
 if(event.phase==='ready'){current=event.data;filters.disabled=false;render();}
}});
query.addEventListener('input',render);
state.addEventListener('change',render);
reset.addEventListener('click',()=>{query.value='';state.value='';render();query.focus();});
document.querySelector('#refresh').addEventListener('click',()=>reader.refresh());
window.addEventListener('pagehide',()=>reader.cancel());
window.addEventListener('pageshow',event=>{if(event.persisted)void reader.refresh();});
void reader.refresh();
