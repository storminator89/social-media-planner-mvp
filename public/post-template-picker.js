import {POST_TEMPLATES,renderPostTemplate} from './post-templates.js';
export function createPostTemplatePicker({canOpen,onChoose,onClose}){
 let dialog,origin,select,fields,preview,status,apply,opened=false,drafts=new Map(),activeId=null;
 const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
 const allowed=()=>{try{return !!canOpen();}catch{return false;}};
 function values(){return [...fields.querySelectorAll('textarea')].map(input=>input.value);}
 function update(){
  status.textContent='';
  try{preview.textContent=renderPostTemplate(select.value,values(),{preview:true});renderPostTemplate(select.value,values());apply.disabled=false;}catch{apply.disabled=true;}
 }
 function choose(){
  if(activeId)drafts.set(activeId,values());
  activeId=select.value;
  fields.replaceChildren();
  const template=POST_TEMPLATES.find(row=>row.id===select.value);
  for(const [index,name] of template.fields.entries()){
   const label=el('label',name),input=el('textarea');input.id=`template-field-${index}`;input.rows=2;input.maxLength=4000;input.value=drafts.get(activeId)?.[index]||'';label.htmlFor=input.id;input.addEventListener('input',update);fields.append(label,input);
  }
  update();
 }
 function close({restoreFocus=true}={}){if(!opened)return;const previous=origin;origin=null;opened=false;if(dialog.open)dialog.close();fields.replaceChildren();drafts.clear();activeId=null;preview.textContent='';onClose?.(previous,{restoreFocus});}
 function ensure(){
  if(dialog)return;
  dialog=el('dialog');dialog.id='post-template-picker';dialog.className='saved-text-picker post-template-picker';dialog.setAttribute('aria-labelledby','post-template-title');
  const head=el('header');head.className='saved-text-head';const title=el('h2','Vorlagen');title.id='post-template-title';const label=el('label','Format');label.htmlFor='post-template-format';select=el('select');select.id='post-template-format';select.className='saved-text-search';
  for(const row of POST_TEMPLATES){const option=el('option',row.title);option.value=row.id;select.append(option);}
  head.append(title,label,select);const body=el('div');body.className='saved-text-body';fields=el('div');fields.className='post-template-fields';const section=el('section');section.className='saved-text-preview';const caption=el('strong','Vorschau');preview=el('pre');preview.className='saved-text-preview-content';section.append(caption,preview);body.append(fields,section);
  const foot=el('footer');foot.className='saved-text-footer';status=el('div');status.className='saved-text-status';status.setAttribute('role','alert');const actions=el('div');actions.className='saved-text-actions';const cancel=el('button','Abbrechen');cancel.type='button';cancel.className='button subtle';apply=el('button','Einfügen');apply.type='button';apply.className='button primary';actions.append(cancel,apply);foot.append(status,actions);dialog.append(head,body,foot);document.body.append(dialog);
  select.addEventListener('change',choose);cancel.addEventListener('click',()=>close());dialog.addEventListener('cancel',event=>{event.preventDefault();close();});dialog.addEventListener('close',()=>{if(!dialog.open&&opened)close();});
  apply.addEventListener('click',()=>{if(!opened||apply.disabled)return;try{if(!allowed())throw Error('Editor geändert. Vorlage neu öffnen.');const text=renderPostTemplate(select.value,values());if(onChoose(text,origin)!==true)throw Error('Nicht eingefügt.');close();}catch(error){status.textContent=error.message;}});
 }
 return {open(target){if(opened||!allowed())return false;ensure();origin=target;select.value=POST_TEMPLATES[0].id;choose();try{dialog.showModal();}catch{origin=null;return false;}opened=true;select.focus();return true;},close,get isOpen(){return opened;}};
}
