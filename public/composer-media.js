const checkVideoMix=items=>{if(items.some(m=>['video/mp4','video/webm'].includes(m?.type))&&items.length!==1)throw Error('Ein Video oder bis zu 10 Bilder. Entferne zuerst die vorhandenen Medien.');};
/** Editor-only identities never enter persisted media records. Every mutation invalidates producer tickets. */
export function createComposerMedia({key=()=>crypto.randomUUID()}={}){
 let rows=[],selected=null,session=0,revision=0;
 const snapshot=()=>rows.map(row=>structuredClone(row.media));
 const selectedRow=()=>rows.find(row=>row.key===selected);
 return {
  reset(items=[]){if(!Array.isArray(items)||items.length>10)throw Error('Ein Beitrag erlaubt höchstens 10 Bilder.');checkVideoMix(items);rows=items.map(media=>({key:key(),media:structuredClone(media)}));selected=rows[0]?.key??null;session++;revision++;},
  checkpoint(){return {rows:structuredClone(rows),selected,session,revision};},
  rollback(checkpoint){if(checkpoint.session!==session||revision!==checkpoint.revision+1)return false;rows=checkpoint.rows;selected=checkpoint.selected;revision++;return true;},
  get items(){return snapshot();},get rows(){return rows.map(row=>({key:row.key,media:row.media}));},get selected(){return selectedRow()?.media??null;},get selectedKey(){return selected;},get index(){return rows.findIndex(row=>row.key===selected);},get length(){return rows.length;},
  select(k){if(!rows.some(row=>row.key===k))return false;selected=k;revision++;return true;},
  ticket(intent='add'){if(!['add','replace'].includes(intent))throw Error('Ungültige Bildaktion.');return {session,revision,intent,target:selected};},
  current(t){return !!t&&t.session===session&&t.revision===revision&&t.target===selected;},
  commit(t,media){if(!this.current(t))throw Error('Die Bildauswahl wurde inzwischen geändert.');if(t.intent==='add'){checkVideoMix([...snapshot(),media]);if(rows.length>=10)throw Error('Ein Beitrag erlaubt höchstens 10 Bilder.');const row={key:key(),media:structuredClone(media)};rows.push(row);selected=row.key;}else{const row=selectedRow();if(!row)throw Error('Das ausgewählte Bild fehlt.');checkVideoMix(rows.map(r=>r===row?media:r.media));row.media=structuredClone(media);}revision++;return this.selected;},
  commitMany(t,items){
   if(!this.current(t)||t.intent!=='add')throw Error('Die Bildauswahl wurde inzwischen geändert.');
   if(!Array.isArray(items)||!items.length||rows.length+items.length>10)throw Error('Ein Beitrag erlaubt höchstens 10 Bilder.');
   checkVideoMix([...snapshot(),...items]);
   // Prepare every clone and identity before touching the live selection.
   const added=items.map(media=>({key:key(),media:structuredClone(media)}));
   if(!this.current(t))throw Error('Die Bildauswahl wurde inzwischen geändert.');
   rows=[...rows,...added];selected=added[0].key;revision++;return this.selected;
  },
  updateAlt(alt){const row=selectedRow();if(!row)return;row.media={...row.media,alt};revision++;},
  remove(){const i=this.index;if(i<0)return;rows.splice(i,1);selected=rows[Math.min(i,rows.length-1)]?.key??null;revision++;},
  move(delta){const i=this.index,j=i+delta;if(i<0||j<0||j>=rows.length)return false;[rows[i],rows[j]]=[rows[j],rows[i]];revision++;return true;}
 };
}
