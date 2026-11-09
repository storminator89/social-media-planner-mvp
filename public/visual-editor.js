/** Visual plain-text editing. The existing textarea remains the sole input.
 * No HTML conversion, Unicode faux styling, DOM parsing or persistence changes. */
export const CHANNEL_PRESENTATION=Object.freeze({
 instagram:{name:'Instagram',note:'Klartext mit Absätzen. Kein Fett/Kursiv; Links hier nicht anklickbar.',mediaFirst:true},
 linkedin:{name:'LinkedIn',note:'Klartext, kein HTML/Artikelformat. Erwähnungen und Linkvorschauen werden nicht aufgelöst.',mediaFirst:false},
 bluesky:{name:'Bluesky',note:'Klartext. Keine Link-, Erwähnungs- oder Hashtag-Facets, kein Fett/Kursiv.',mediaFirst:false},
 mastodon:{name:'Mastodon',note:'Klartext, kein HTML/Markdown. Links, Hashtags und Erwähnungen stellt die Instanz dar.',mediaFirst:false}
});
export function installVisualEditor({textarea,card,modeButton}){
 modeButton.addEventListener('click',()=>{if(textarea.disabled||textarea.readOnly)return;const visual=card.dataset.mode!=='visual';card.dataset.mode=visual?'visual':'text';modeButton.textContent=visual?'Textansicht':'Visuell bearbeiten';modeButton.setAttribute('aria-pressed',String(visual));textarea.focus();});
 // Native textarea owns all typing, paste, IME and undo. No programmatic text
 // insertion or secondary history: mode changes never write value/selection.
}
export function updateVisualPresentation({channelId,header,note,preview,previewNote}){
 const info=CHANNEL_PRESENTATION[channelId];
 if(header)header.textContent=info?info.name:'Basistext';
 if(note)note.textContent=info?.note||'Klartext · keine Formatierung.';
 if(preview){preview.dataset.platform=channelId||'base';preview.dataset.mediaFirst=String(!!info?.mediaFirst);}
 if(previewNote)previewNote.textContent='Keine Liveansicht · Darstellung kann abweichen · kein Versand.';
}
