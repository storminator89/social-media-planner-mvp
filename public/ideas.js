/** UI metadata helpers. Ideas are a real editorial stage, never publishing jobs. */
export function normalizeEditorialMetadata(post){
  const title=post.title??'';const tags=post.tags??[];
  if(typeof title!=='string'||title.length>200)throw new Error('Ein Titel darf höchstens 200 Zeichen enthalten.');
  if(!Array.isArray(tags)||tags.length>20||tags.some(t=>typeof t!=='string'||!t.trim()||t.length>60))throw new Error('Verwende höchstens 20 Labels mit jeweils 1 bis 60 Zeichen.');
  return {title,tags:[...tags]};
}
export function ideaTitle(idea){return idea.title?.trim()||idea.text.trim().split('\n')[0].slice(0,100)||'Neue Idee';}
export function ideaMatches(idea,query='',tag='all'){
  const needle=query.trim().toLocaleLowerCase('de');
  return idea.status==='idea'&&(tag==='all'||idea.tags?.includes(tag))&&(!needle||[idea.title,idea.text,...(idea.tags||[])].join('\n').toLocaleLowerCase('de').includes(needle));
}
export function validateIdea(idea){
  const errors=[];
  if(!idea.title?.trim()&&!idea.text?.trim())errors.push('Halte einen Titel oder eine Notiz fest.');
  if(typeof idea.text!=='string'||idea.text.length>20000)errors.push('Die Notiz darf höchstens 20.000 Zeichen enthalten.');
  try{normalizeEditorialMetadata(idea)}catch(error){errors.push(error.message)}
  if(idea.status!=='idea'||idea.channels?.length||Object.keys(idea.variantTexts||{}).length||idea.scheduledAt||idea.media||idea.attachments?.length||idea.cover)errors.push('Eine Idee hat noch keine Kanäle, Bilder oder Termine.');
  return errors;
}
