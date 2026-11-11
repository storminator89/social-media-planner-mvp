/** Original editorial scaffolds, not copied posts. Pure text, no I/O or markup. */
const rows = [
 ['announcement','Ankündigung',['Neuigkeit','Nutzen','Nächster Schritt'],['Neu: ',0,'\n\n',1,'\n\n',2]],
 ['tip','Kurzer Tipp',['Thema','Tipp','Ergebnis'],[0,': ein Tipp\n\n',1,'\n\n',2]],
 ['event','Veranstaltung',['Titel','Wann und wo','Programm','Anmeldung'],[0,'\n\n',1,'\n\n',2,'\n\n',3]],
 ['question','Frage',['Thema','Frage'],[0,'\n\n',1]],
 ['recap','Rückblick',['Anlass','Wichtigster Moment','Ausblick'],['Rückblick: ',0,'\n\n',1,'\n\n',2]],
 ['behind-scenes','Einblick',['Projekt','Einblick','Nächster Schritt'],['Ein Blick hinter die Kulissen: ',0,'\n\n',1,'\n\n',2]]
];
export const POST_TEMPLATES = Object.freeze(rows.map(([id,title,fields,parts])=>Object.freeze({id,title,fields:Object.freeze(fields),parts:Object.freeze(parts)})));
export function renderPostTemplate(id,values,{preview=false}={}){
 const template=POST_TEMPLATES.find(row=>row.id===id);
 if(!template||!Array.isArray(values)||values.length!==template.fields.length)throw Error('Vorlage neu öffnen.');
 const clean=Array.from(values,(value,i)=>{
  if(typeof value!=='string'||value.length>4000)throw Error('Feld ist zu lang.');
  const text=value.replace(/\r\n?/g,'\n').trim();
  if(!text&&!preview)throw Error('Felder ausfüllen.');
  return text||`[${template.fields[i]}]`;
 });
 const result=template.parts.map(part=>typeof part==='number'?clean[part]:part).join('');
 if(result.length>20000)throw Error('Vorlage ist zu lang.');
 return result;
}
