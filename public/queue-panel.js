import { normalizeQueueRules, suggestQueueSlots, applyQueueSuggestion } from './workflows/queue.mjs';

/** One visible, temporary weekly rule applied to all selected channels. */
export function sharedQueueRules(post, { weekdays, time }) {
  return normalizeQueueRules(post.channels.map(channelId => ({
    channelId, timezone: post.timeZone, overlapChoice: 'reject',
    slots: weekdays.map(weekday => ({ weekday, time }))
  })));
}

export function createQueuePanel({ container, getPost, getPosts, onApply, isBusy }) {
  container.innerHTML = `<summary>Freie Queue-Termine</summary>
    <p class="field-hint">Gleiche Wochen-Slots für alle gewählten Kanäle, in der Beitragszeitzone. Nur für diesen Editor, nicht gespeichert. Keine automatische Veröffentlichung.</p>
    <fieldset class="queue-days"><legend>Wochentage</legend>${[[1,'Mo'],[2,'Di'],[3,'Mi'],[4,'Do'],[5,'Fr'],[6,'Sa'],[0,'So']].map(([day,label])=>`<label><input type="checkbox" value="${day}" ${[1,3,5].includes(day)?'checked':''}><span>${label}</span></label>`).join('')}</fieldset>
    <div class="queue-options"><label>Slot-Uhrzeit<input type="time" class="queue-time" value="09:00" aria-label="Queue-Uhrzeit"></label><label>Abstand in Minuten<input type="number" class="queue-gap" min="0" max="1440" step="1" value="30" aria-label="Queue-Mindestabstand"></label></div>
    <button type="button" class="button subtle queue-search">Vorschläge suchen</button>
    <p class="queue-status field-hint" role="status" aria-live="polite"></p><div class="queue-results"></div>`;
  const find = selector => container.querySelector(selector);
  const results = find('.queue-results'), status = find('.queue-status');
  let suggestions = [];
  const settings = () => ({ weekdays: [...container.querySelectorAll('.queue-days input:checked')].map(input=>Number(input.value)), time: find('.queue-time').value });
  const gap = () => { const value=find('.queue-gap').value; if(!/^\d+$/.test(value))throw new Error('Wähle einen ganzen Mindestabstand von 0 bis 1440 Minuten.');return Number(value); };
  function invalidate() { if(!suggestions.length&&!results.childElementCount)return;suggestions=[];results.replaceChildren();status.textContent='Die Planung wurde geändert. Suche die Vorschläge erneut.'; }
  function reset() { suggestions=[];results.replaceChildren();status.textContent='Startwerte: Montag, Mittwoch und Freitag um 09:00. Bitte nach Bedarf anpassen.';container.open=false;for(const input of container.querySelectorAll('.queue-days input'))input.checked=[1,3,5].includes(Number(input.value));find('.queue-time').value='09:00';find('.queue-gap').value='30'; }
  container.addEventListener('input', invalidate);
  find('.queue-search').addEventListener('click', () => {
    if(isBusy())return;
    suggestions=[];results.replaceChildren();
    try {
      const post=getPost(), rules=sharedQueueRules(post,settings());
      const found=suggestQueueSlots({post,posts:getPosts(),rules,timezone:post.timeZone,limit:3,minimumGapMinutes:gap()});
      suggestions=found.suggestions;
      const reasons={queue_empty:'Wähle mindestens einen Wochentag.',queue_paused:'Mindestens eine Kanal-Queue ist pausiert.',no_shared_slot:'Im Suchzeitraum gibt es keinen gemeinsamen Slot.',all_occupied:'Alle passenden Slots sind belegt.',ambiguous_display_time:'Die passenden Ortszeiten sind nicht eindeutig. Wähle eine andere Uhrzeit.'};
      status.textContent=found.suggestions.length?`Nächste freie Slots in 60 Tagen. Zeitzone: ${post.timeZone}. Noch nichts übernommen oder gespeichert.`:reasons[found.reason]||'Keine Vorschläge verfügbar.';
      if(found.warnings.length)status.textContent+=' Nicht eindeutige Sommerzeit-Termine wurden ausgelassen.';
      for(const [index,suggestion] of suggestions.entries()) {
        const button=document.createElement('button');button.type='button';button.className='queue-suggestion';button.dataset.queueIndex=String(index);
        const date=new Intl.DateTimeFormat('de-DE',{timeZone:suggestion.timezone,weekday:'short',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(suggestion.instant));
        const label=document.createElement('span');label.textContent=`${date} · ${suggestion.timezone}`;const action=document.createElement('strong');action.textContent='Termin übernehmen';button.append(label,action);results.append(button);
      }
    } catch(error) { status.textContent=error.message; }
  });
  results.addEventListener('click', event => {
    const button=event.target.closest('[data-queue-index]');if(!button||isBusy())return;
    try {
      const post=getPost(), rules=sharedQueueRules(post,settings());
      const next=applyQueueSuggestion({post,posts:getPosts(),rules,suggestion:suggestions[Number(button.dataset.queueIndex)],minimumGapMinutes:gap()});
      onApply(next);suggestions=[];results.replaceChildren();status.textContent='Termin ins Formular übernommen. Erst „Im Prototyp einplanen“ speichert ihn. Als Entwurf bleibt er ohne Termin.';
    } catch(error) { invalidate();status.textContent=error.message; }
  });
  reset();return { invalidate, reset };
}
