import {imageOnlyPlanningAllowed} from './image-only-planning.js';
import {channelTextChecks,effectiveText} from './variants.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>value.toLocaleString('de-DE');

// Read-only projection of the same effective text and code-point limits used
// by the existing editor. This is not a save or publishing readiness check.
export function channelTextReview(post,definitions){
  const items=channelTextChecks(post,definitions).map(check=>{
    const text=effectiveText(post,check.channelId)||'';
    const excess=check.overLimit?check.count-check.limit:0;
    const imageOnly=check.empty&&!check.overLimit&&imageOnlyPlanningAllowed(post,check.channelId);
    const reason=imageOnly?'Bildbeitrag · nur Planung':check.unknown?'Kanal nicht erkannt':excess?`${number(excess)} Zeichen zu lang`:check.empty?'Text fehlt':'Textlänge passt';
    return {...check,valid:check.valid||imageOnly,imageOnly,text,source:check.custom?'Eigener Text':'Basistext',reason};
  });
  const problems=items.filter(item=>!item.valid);
  return {items,problemCount:problems.length,summary:!items.length?'Keine Kanäle ausgewählt.':problems.length?problems.map(item=>`${item.name}: ${item.reason}`).join(' · '):items.some(item=>item.imageOnly)?'Bildbeitrag · nur Planung':'Keine leeren oder zu langen Kanaltexte.'};
}

export function renderChannelTextReview(post,definitions){
  const review=channelTextReview(post,definitions);
  const summary=`<strong>Kanaltexte prüfen · ${review.items.length}</strong><span class="channel-review-summary ${review.problemCount?'warning':''}">${esc(review.summary)}</span>`;
  const items=review.items.map(item=>`<section class="channel-review-card ${item.valid?'valid':'warning'}" aria-label="${esc(item.name)}: Textprüfung"><div class="channel-review-heading"><h3>${esc(item.name)}</h3><span>${esc(item.source)}</span></div><p class="channel-review-result">${esc(item.reason)}${item.unknown?'':` · ${number(item.count)} / ${number(item.limit)} Zeichen`}</p><div class="channel-review-text" tabindex="0" role="region" aria-label="${esc(item.name)}: ${esc(item.source)}">${item.empty?'Kein sichtbarer Text.':esc(item.text)}</div>${item.unknown?'':`<button type="button" class="button subtle channel-check" data-text-target="${esc(item.channelId)}" aria-label="${esc(item.name)}-Text bearbeiten">${esc(item.name)}-Text bearbeiten</button>`}</section>`).join('');
  return {summary,items:items||'<p class="channel-review-empty">Wähle oben mindestens einen Kanal aus.</p>'};
}
