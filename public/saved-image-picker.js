import {isSavedImage, savedImageIdentity} from './saved-images.js';

const FAILED = 'Das Bild konnte nicht übernommen werden. Die bisherige Auswahl bleibt erhalten. Bitte versuche es erneut.';
const UNAVAILABLE = 'Die gespeicherten Bilder sind gerade nicht verfügbar. Schließe die Auswahl und versuche es später erneut.';
const CHANGED = 'Dieses Bild ist in der geladenen Planung nicht mehr unverändert verfügbar. Schließe die Auswahl und öffne sie erneut.';
const PARTIAL = 'Einige Bilder können nicht verwendet werden. Prüfe Bild und Beschreibung im ursprünglichen Beitrag.';
const copyMedia = media => ({id: media.id, url: media.url, name: media.name, type: media.type, alt: media.alt});

// Read only references from the supplied loaded-post catalog. Never synthesize
// a URL or allow a fallback to an external, local, or arbitrary image source.
function readCatalog(getCatalog) {
 try {
  const catalog = getCatalog();
  if (catalog?.available !== true || !Array.isArray(catalog.items)) return {available: false, items: [], partial: false};
  const items = new Map(), blocked = new Set();
  let partial = catalog.hasUnavailableImages === true;
  for (const item of catalog.items) {
   if (!item || !isSavedImage(item.media) || !item.media.alt.trim() || item.id !== item.media.id || !Array.isArray(item.sourceTitles) ||
       !item.sourceTitles.every(title => typeof title === 'string') || !Number.isSafeInteger(item.usageCount) || item.usageCount < 1) {
    partial = true;
    if (typeof item?.id === 'string') blocked.add(item.id);
    if (typeof item?.media?.id === 'string') blocked.add(item.media.id);
    continue;
   }
   const existing = items.get(item.id);
   if (existing && savedImageIdentity(existing.media) !== savedImageIdentity(item.media)) {
    blocked.add(item.id); partial = true;
   } else if (!existing) {
    items.set(item.id, {id: item.id, media: copyMedia(item.media), sourceTitles: [...item.sourceTitles], usageCount: item.usageCount});
   }
  }
  return {available: true, items: [...items.values()].filter(item => !blocked.has(item.id)), partial};
 } catch {
  return {available: false, items: [], partial: false};
 }
}

export function createSavedImagePicker({getCatalog, canOpen = () => true, onChoose, fallbackFocus = () => {}}) {
 if (typeof getCatalog !== 'function' || typeof onChoose !== 'function') throw TypeError('getCatalog und onChoose müssen Funktionen sein.');
 let dialog = null, ui = null, opened = false, generation = 0, returnTarget = null;
 let catalog = null, selected = [], pending = null, rows = [], multiple = false, capacity = 1, onlySelected = false, showDetails = false;
 const searchKey = value => value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('de');
 const active = token => opened && token === generation;
 const allowed = () => { try { return !!canOpen(); } catch { return false; } };
 const status = message => { ui.status.textContent = message; };
 const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
 };

 function restoreFocus(target) {
  // The opener may disappear or be disabled during a composer transition.
  if (target?.isConnected && !target.disabled && !target.hidden && !target.closest?.('[inert], [hidden], dialog:not([open])')) {
   target.focus();
   if (document.activeElement === target) return;
  }
  const fallback = typeof fallbackFocus === 'function' ? fallbackFocus() : fallbackFocus;
  if (fallback?.isConnected && !fallback.disabled) fallback.focus();
 }

 function filterRows() {
  const terms = searchKey((ui.search.value || '').slice(0, 200)).trim().split(/\s+/).filter(Boolean);
  let count = 0;
  for (const row of rows) {
   const selectedRow = selected.some(item => item.id === row.item.id);
   row.button.hidden = (onlySelected && !selectedRow) || !terms.every(term => row.search.includes(term));
   if (!row.button.hidden) count++;
  }
  ui.count.textContent = `${count} / ${rows.length}`;
  ui.empty.hidden = count > 0;
  ui.empty.textContent = !catalog?.available ? UNAVAILABLE : !rows.length ? 'Keine wiederverwendbaren Bilder in den geladenen Beiträgen.' : onlySelected && !selected.length ? 'Noch kein Bild ausgewählt.' : 'Keine passenden Bilder.';
  ui.reset.hidden = !terms.length && !onlySelected;
  ui.selected.textContent = `Auswahl (${selected.length})`;
  ui.selected.setAttribute('aria-pressed', String(onlySelected));
 }

 function renderState() {
  dialog.setAttribute('aria-busy', String(!!pending));
  ui.apply.disabled = !!pending || !selected.length;
  ui.details.disabled = !!pending;
  ui.details.setAttribute('aria-pressed', String(showDetails));
  ui.search.disabled = !!pending; ui.selected.disabled = !!pending; ui.reset.disabled = !!pending;
  ui.apply.textContent = pending ? 'Bild wird übernommen …' : multiple ? `${selected.length} Bilder übernehmen` : 'Bild übernehmen';
  for (const row of rows) {
   const index = selected.findIndex(item => item.id === row.item.id);
   row.button.disabled = !!pending || (multiple && index < 0 && selected.length >= capacity);
   row.button.setAttribute('aria-pressed', String(index >= 0));
   row.metadata.hidden = !showDetails;
   row.mark.textContent = index >= 0 ? (multiple ? String(index + 1) : 'Ausgewählt') : 'Auswählen';
  }
  filterRows();
 }

 function renderCatalog() {
  rows = [];
  ui.list.replaceChildren();
  ui.notice.hidden = !catalog.partial;
  ui.notice.textContent = catalog.partial ? PARTIAL : '';
  ui.empty.hidden = catalog.available && catalog.items.length > 0;
  ui.empty.textContent = !catalog.available ? UNAVAILABLE : 'Keine wiederverwendbaren Bilder in den geladenen Beiträgen.';
  for (const item of catalog.items) {
   const card = element('button', 'saved-image-card');
   card.type = 'button';
   card.dataset.savedImageId = item.id;
   card.setAttribute('aria-pressed', 'false');
   card.setAttribute('aria-label', `${item.media.name || 'Bild ohne Dateinamen'}: ${item.media.alt}`);
   const preview = element('span', 'saved-image-thumbnail');
   const image = element('img');
   image.alt = ''; // The card's accessible name includes the image description.
   image.loading = 'lazy'; image.decoding = 'async'; image.draggable = false;
   const failed = element('span', 'saved-image-preview-failed', 'Vorschau nicht verfügbar');
   failed.hidden = true;
   image.addEventListener('error', () => { image.hidden = true; failed.hidden = false; });
   image.src = item.media.url; // isSavedImage has checked this exact private URL.
   preview.append(image, failed);
   const details = element('span', 'saved-image-details');
   details.append(element('strong', 'saved-image-name', item.media.name || 'Bild ohne Dateinamen'));
   const metadata = element('span', 'saved-image-metadata');
   metadata.hidden = !showDetails;
   metadata.append(element('span', 'saved-image-source', item.sourceTitles.length ? `Aus: ${item.sourceTitles.slice(0,2).join(' · ')}${item.sourceTitles.length>2?' · …':''}` : 'Aus einem geladenen Beitrag'));
   metadata.append(element('span', 'saved-image-usage', item.usageCount === 1 ? 'In 1 Beitrag verwendet' : `In ${item.usageCount} Beiträgen verwendet`));
   metadata.append(element('span', 'saved-image-alt', item.media.alt ? `Bildbeschreibung: ${item.media.alt}` : 'Keine Bildbeschreibung gespeichert'));
   details.append(metadata);
   const mark = element('span', 'saved-image-mark', 'Auswählen');
   details.append(mark);
   card.append(preview, details);
   const token = generation;
   card.addEventListener('click', () => {
    if (!active(token) || pending || card.hidden || card.disabled) return;
    const index = selected.findIndex(value => value.id === item.id);
    if (multiple) {
     if (index >= 0) selected.splice(index, 1);
     else if (selected.length < capacity) selected.push(item);
    } else selected = [item];
    const focusedCard = document.activeElement === card;
    status(multiple ? `${selected.length} Bilder ausgewählt.` : 'Bild ausgewählt.');
    renderState();
    if (card.hidden && focusedCard) ui.selected.focus();
   });
   rows.push({item, button: card, mark, metadata, search: searchKey([item.media.name, item.media.alt, ...item.sourceTitles].join(' '))});
   ui.list.append(card);
  }
  renderState();
 }

 function dismiss({force = false} = {}) {
  // Closing is always permitted, including during adoption. force is accepted
  // for the same teardown API as the other editor surfaces, not a cancel lock.
  if (!opened && !force) return true;
  const target = returnTarget;
  returnTarget = null;
  opened = false;
  generation++;
  const adoption = pending;
  pending = null;
  selected = [];
  adoption?.abort();
  if (dialog?.open) dialog.close();
  if (ui) {
   rows = []; ui.list.replaceChildren(); renderState(); status('');
  }
  if (target) restoreFocus(target);
  return true;
 }

 async function apply() {
  if (!opened || pending || !selected.length) return;
  if (!allowed()) { status('Der Editor ist gerade beschäftigt. Bitte versuche es gleich erneut.'); return; }
  const current = readCatalog(getCatalog);
  if (!current.available) { status(UNAVAILABLE); return; }
  const chosen = selected.map(value => current.items.find(item => item.id === value.id && savedImageIdentity(item.media) === savedImageIdentity(value.media)));
  if (chosen.some(item => !item)) { status(CHANGED); return; }
  const token = generation, controller = new AbortController();
  pending = controller;
  status('Das gespeicherte Bild wird geprüft …'); renderState();
  try {
   const accepted = await onChoose(multiple ? chosen.map(item => copyMedia(item.media)) : copyMedia(chosen[0].media), {signal: controller.signal});
   if (!active(token) || controller.signal.aborted) return;
   if (accepted !== true) throw Error('Selection was not adopted.');
   // The parent's own adoption may set its busy flag. Do not call canOpen here.
   pending = null;
   dismiss();
  } catch {
   if (!active(token) || controller.signal.aborted) return;
   controller.abort();
   status(FAILED);
  } finally {
   if (active(token)) {
    pending = null; renderState(); ui.apply.focus();
   }
  }
 }

 function ensureDialog() {
  if (dialog) return;
  dialog = element('dialog', 'saved-image-picker');
  dialog.id = 'saved-image-picker';
  dialog.setAttribute('aria-labelledby', 'saved-image-picker-title');
  dialog.setAttribute('aria-describedby', 'saved-image-picker-intro');
  const header = element('header', 'saved-image-head');
  const title = element('h2', '', 'Bild aus der Planung wählen');
  title.id = 'saved-image-picker-title'; title.tabIndex = -1;
  const intro = element('p', '', 'Wähle ein gespeichertes Bild aus den geladenen Beiträgen. Es wird erst mit „Bild übernehmen“ in deinen aktuellen Beitrag übernommen.');
  intro.id = 'saved-image-picker-intro'; intro.className = 'sr-only';
  const toolbar = element('div', 'saved-image-toolbar');
  const search = element('input', 'saved-image-search');
  search.type = 'search'; search.id = 'saved-image-search'; search.maxLength = 200;
  search.placeholder = 'Bilder suchen'; search.setAttribute('aria-label', 'Bilder nach Name, Beschreibung oder Beitrag suchen');
  const selectedFilter = element('button', 'button subtle', 'Auswahl (0)');
  selectedFilter.type = 'button'; selectedFilter.dataset.savedImageAction = 'selection'; selectedFilter.setAttribute('aria-pressed', 'false');
  const reset = element('button', 'button subtle', 'Zurücksetzen');
  reset.type = 'button'; reset.dataset.savedImageAction = 'reset'; reset.hidden = true;
  const count = element('span', 'saved-image-count'); count.setAttribute('role', 'status'); count.setAttribute('aria-live', 'polite');
  count.setAttribute('aria-label', 'Gefundene Bilder / verfügbare Bilder');
  const detailsToggle = element('button', 'button subtle', 'Bilddetails');
  detailsToggle.type = 'button'; detailsToggle.dataset.savedImageAction = 'details'; detailsToggle.setAttribute('aria-pressed', 'false');
  toolbar.append(search, selectedFilter, detailsToggle, reset, count);
  header.append(title, intro, toolbar);
  const body = element('div', 'saved-image-body');
  const notice = element('p', 'saved-image-notice');
  const empty = element('p', 'saved-image-empty');
  const list = element('div', 'saved-image-list');
  list.setAttribute('role', 'group'); list.setAttribute('aria-label', 'Gespeicherte Bilder zur Auswahl');
  body.append(notice, empty, list);
  const footer = element('footer', 'saved-image-footer');
  const statusNode = element('p', 'saved-image-status');
  statusNode.setAttribute('role', 'status'); statusNode.setAttribute('aria-live', 'polite'); statusNode.setAttribute('aria-atomic', 'true');
  const actions = element('div', 'saved-image-actions');
  const cancel = element('button', 'button subtle', 'Abbrechen');
  cancel.type = 'button'; cancel.dataset.savedImageAction = 'cancel';
  const applyButton = element('button', 'button primary', 'Bild übernehmen');
  applyButton.type = 'button'; applyButton.dataset.savedImageAction = 'apply';
  actions.append(cancel, applyButton); footer.append(statusNode, actions);
  dialog.append(header, body, footer);
  ui = {title, intro, notice, empty, list, search, details: detailsToggle, selected: selectedFilter, reset, count, status: statusNode, cancel, apply: applyButton};
  detailsToggle.addEventListener('click', () => { if (opened && !pending) { showDetails = !showDetails; renderState(); } });
  search.addEventListener('input', () => { if (opened && !pending) filterRows(); });
  selectedFilter.addEventListener('click', () => { if (opened && !pending) { onlySelected = !onlySelected; filterRows(); } });
  reset.addEventListener('click', () => { if (opened && !pending) { search.value = ''; onlySelected = false; filterRows(); search.focus(); } });
  cancel.addEventListener('click', () => dismiss());
  applyButton.addEventListener('click', apply);
  dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss(); });
  // A native external close also cancels work. Ignore a queued old close event
  // if this same dialog has already reopened in a newer generation.
  dialog.addEventListener('close', () => { if (!dialog.open && opened) dismiss(); });
  for (const name of ['dragover', 'drop']) dialog.addEventListener(name, event => event.preventDefault());
  document.body.append(dialog);
 }

 return {
  open({intent = 'replace', remaining = 1} = {}) {
   if (opened || !allowed()) return false;
   multiple = intent === 'add';
   capacity = multiple && Number.isInteger(remaining) ? Math.max(0, Math.min(10, remaining)) : 1;
   ensureDialog();
   ui.title.textContent = multiple ? 'Bilder aus der Planung wählen' : 'Bild aus der Planung wählen';
   ui.intro.textContent = multiple ? 'Wähle gespeicherte Bilder aus den geladenen Beiträgen.' : 'Wähle ein gespeichertes Bild aus den geladenen Beiträgen. Es wird erst mit „Bild übernehmen“ in deinen aktuellen Beitrag übernommen.';
   returnTarget = document.activeElement;
   generation++;
   catalog = readCatalog(getCatalog);
   selected = []; pending = null; onlySelected = false; showDetails = false; ui.search.value = '';
   status(''); renderCatalog();
   try { dialog.showModal(); } catch { returnTarget = null; ui.list.replaceChildren(); rows = []; return false; }
   opened = true;
   ui.title.focus();
   return true;
  },
  close: dismiss,
  get isOpen() { return opened; },
 };
}
