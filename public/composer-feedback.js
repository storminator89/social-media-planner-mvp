/** Bring a rendered error summary into view without changing validation or data. */
export function focusComposerErrors(element,details){
 if(!element||element.hidden||!element.textContent?.trim())return false;
 if(details?.errors&&details?.post)element.innerHTML=renderComposerErrorItems(details.errors,details.post);
 element.focus({preventScroll:true});
 element.scrollIntoView({block:'start',inline:'nearest',behavior:'instant'});
 return true;
}

import {CHANNELS} from './model.js';
import {channelTextChecks} from './variants.js';
const escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/** Enhance only exact, known validation failures. Unknown failures remain intact. */
export function composerErrorItems(errors,post){
 const actions=new Map();
 actions.set('Schreibe zuerst einen Beitrag.',{label:'Text ergänzen',target:'base'});
 actions.set('Wähle mindestens einen Kanal.',{label:'Kanal wählen',focus:'channels'});
 actions.set('Wähle einen Zeitpunkt in der Zukunft.',{label:'Zukünftigen Termin wählen',focus:'date'});
 if(post.status==='scheduled')for(const check of channelTextChecks(post,CHANNELS)){
  if(check.unknown)continue;
  if(check.empty)actions.set(`${check.name}: Ergänze einen Beitragstext.`,{label:`${check.name}: Text ergänzen`,target:check.channelId});
  if(check.overLimit)actions.set(`${check.name}: maximal ${check.limit.toLocaleString('de-DE')} Zeichen (${check.count.toLocaleString('de-DE')} vorhanden).`,{label:`${check.name}: ${(check.count-check.limit).toLocaleString('de-DE')} Zeichen kürzen`,target:check.channelId});
 }
 return errors.map(message=>({message,...actions.get(message)}));
}
export function renderComposerErrorItems(errors,post){
 return `<ul class="composer-error-links">${composerErrorItems(errors,post).map(item=>`<li>${item.target||item.focus?`<button type="button" class="composer-error-link${item.target?' channel-check':''}" ${item.target?`data-text-target="${escapeHTML(item.target)}"`:`data-composer-focus="${escapeHTML(item.focus)}"`}>${escapeHTML(item.label)}</button>`:escapeHTML(item.message)}</li>`).join('')}</ul>`;
}
