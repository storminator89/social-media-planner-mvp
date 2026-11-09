/** Visual plain-text editing. The existing textarea remains the sole input.
 * No HTML conversion, Unicode faux styling, DOM parsing or persistence changes. */
export const CHANNEL_PRESENTATION=Object.freeze({
 instagram:{name:'Instagram',note:'Bildunterschrift als Klartext. Zeilenumbrüche bleiben erhalten; keine Fett- oder Kursivformatierung. Links werden hier nicht als anklickbar dargestellt.',mediaFirst:true},
 linkedin:{name:'LinkedIn',note:'Beitragstext als Klartext. Keine Artikel-Formatierung und kein HTML. Erwähnungen und Linkvorschauen werden hier nicht aufgelöst.',mediaFirst:false},
 bluesky:{name:'Bluesky',note:'Text als Klartext. Bluesky unterstützt Link-, Erwähnungs- und Hashtag-Facets; dieser Planer erzeugt daraus keine Facets. Keine Fett- oder Kursivformatierung.',mediaFirst:false},
 mastodon:{name:'Mastodon',note:'Status als Klartext für den vorhandenen Veröffentlichungsweg. Kein HTML oder Markdown. Link-, Hashtag- und Erwähnungsdarstellung bestimmt die Instanz.',mediaFirst:false}
});
export function installVisualEditor({textarea,card,modeButton}){
 modeButton.addEventListener('click',()=>{if(textarea.disabled||textarea.readOnly)return;const visual=card.dataset.mode!=='visual';card.dataset.mode=visual?'visual':'text';modeButton.textContent=visual?'Textansicht':'Visuell bearbeiten';modeButton.setAttribute('aria-pressed',String(visual));textarea.focus();});
 // Native textarea owns all typing, paste, IME and undo. No programmatic text
 // insertion or secondary history: mode changes never write value/selection.
}
export function updateVisualPresentation({channelId,header,note,preview,previewNote}){
 const info=CHANNEL_PRESENTATION[channelId];
 if(header)header.textContent=info?`${info.name} · Text bearbeiten`:'Basistext · für ausgewählte Kanäle';
 if(note)note.textContent=info?.note||'Gemeinsamer Klartext. Absätze und Zeichen werden gespeichert; kanalspezifische Darstellung siehst du rechts. Keine HTML- oder Markdownformatierung.';
 if(preview){preview.dataset.platform=channelId||'base';preview.dataset.mediaFirst=String(!!info?.mediaFirst);}
 if(previewNote)previewNote.textContent=(info?.note||'Klartext-Vorschau.')+' Unverbindliche Layoutannäherung, keine Liveansicht. Umbruch, Kürzung und Metadaten können abweichen. Speichern veröffentlicht nichts.';
}
