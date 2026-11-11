import {filterSavedTexts, savedTextIdentity} from './saved-texts.js';

/** Synchronous, local text choice. A selection is not an application. */
export function createSavedTextPicker({getCatalog, canOpen, onChoose, onClose}) {
 let dialog, ui, catalog, selected = null, opened = false, generation = 0, target = null;
 const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
 };
 const read = () => {
  try { const value = getCatalog(); return value?.available === true && Array.isArray(value.items) ? value : {available:false,items:[]}; }
  catch { return {available:false,items:[]}; }
 };
 const allowed = () => { try { return !!canOpen(); } catch { return false; } };
 function render() {
  const token = generation;
  const items = filterSavedTexts(catalog.items, ui.search.value);
  // Filtering hides and clears a choice rather than retaining an invisible apply.
  if (selected && !items.some(item => item.id === selected.id)) selected = null;
  ui.list.replaceChildren();
  for (const item of items) {
   const card = element('button', 'saved-text-card'); card.type = 'button';
   card.dataset.savedTextId = item.id;
   card.setAttribute('aria-pressed', String(selected?.id === item.id));
   card.append(element('strong', 'saved-text-source', item.title), element('span', 'saved-text-meta', `${item.status} · ${item.channelLabel}`), element('span', 'saved-text-snippet', item.snippet));
   card.addEventListener('click', () => {
    if (!opened || generation !== token || !allowed()) return;
    selected = item; ui.status.textContent = '';
    // Keep the clicked card/focus in place while updating selection and preview.
    for (const row of ui.list.children) row.setAttribute('aria-pressed', String(row.dataset.savedTextId === item.id));
    renderSelection();
   });
   ui.list.append(card);
  }
  ui.empty.hidden = !!items.length;
  ui.empty.textContent = !catalog.available ? 'Gespeicherte Texte sind gerade nicht verfügbar.' : catalog.items.length ? 'Keine passenden Texte.' : 'Noch keine gespeicherten Texte.';
  ui.count.textContent = `${items.length} ${items.length === 1 ? 'Text' : 'Texte'}`;
  renderSelection();
 }
 function renderSelection() {
  ui.preview.hidden = !selected;
  ui.previewTitle.textContent = selected ? `${selected.title} · ${selected.channelLabel}` : '';
  // Render the same line endings the textarea will insert; keep selected raw.
  ui.previewText.textContent = (selected?.text || '').replace(/\r\n?/g, '\n');
  ui.apply.disabled = !selected;
 }
 function close({restoreFocus = true, applied = false} = {}) {
  if (!opened) return;
  const origin = target; target = null; opened = false; generation++; selected = null;
  if (dialog.open) dialog.close();
  ui.list.replaceChildren(); ui.previewText.textContent = ''; ui.apply.disabled = true;
  onClose?.(origin, {restoreFocus, applied});
 }
 function apply() {
  if (!opened || !selected) return;
  if (!allowed()) { ui.status.textContent = 'Der Editor ist gerade beschäftigt. Öffne die Auswahl erneut.'; return; }
  const current = read();
  const chosen = current.items.find(item => item.id === selected.id && savedTextIdentity(item) === savedTextIdentity(selected));
  if (!current.available || !chosen) { ui.status.textContent = 'Der gespeicherte Text hat sich geändert. Öffne die Auswahl erneut.'; return; }
  try {
   // No awaiting: the composer validates and applies in this same event turn.
   if (onChoose(chosen, target) !== true) throw Error('Der Text wurde nicht eingefügt. Öffne die Auswahl erneut.');
   close({applied:true});
  } catch (error) { ui.status.textContent = error?.message || 'Der Text konnte nicht eingefügt werden.'; }
 }
 function ensureDialog() {
  if (dialog) return;
  dialog = element('dialog', 'saved-text-picker'); dialog.id = 'saved-text-picker';
  dialog.setAttribute('aria-labelledby', 'saved-text-title');
  dialog.setAttribute('aria-describedby', 'saved-text-destination');
  const head = element('header', 'saved-text-head');
  const title = element('h2', '', 'Text übernehmen'); title.id = 'saved-text-title';
  const destination = element('div', 'saved-text-destination'); destination.id = 'saved-text-destination';
  const label = element('label', '', 'Gespeicherte Texte suchen'); label.htmlFor = 'saved-text-search';
  const search = element('input', 'saved-text-search'); search.id = 'saved-text-search'; search.type = 'search'; search.placeholder = 'Text, Titel oder Kanal';
  head.append(title, destination, label, search);
  const body = element('div', 'saved-text-body');
  const count = element('div', 'saved-text-count'); count.setAttribute('role', 'status');
  const empty = element('div', 'saved-text-empty');
  const list = element('div', 'saved-text-list'); list.setAttribute('role', 'group'); list.setAttribute('aria-label', 'Gespeicherte Ideen und Beiträge');
  const preview = element('section', 'saved-text-preview'); preview.setAttribute('aria-label', 'Ausgewählter Text');
  const previewTitle = element('strong', 'saved-text-preview-title');
  const previewText = element('pre', 'saved-text-preview-content'); previewText.tabIndex = 0;
  preview.append(previewTitle, previewText); body.append(count, empty, list, preview);
  const footer = element('footer', 'saved-text-footer');
  const status = element('div', 'saved-text-status'); status.setAttribute('role', 'alert'); status.setAttribute('aria-atomic', 'true');
  const actions = element('div', 'saved-text-actions');
  const cancel = element('button', 'button subtle', 'Abbrechen'); cancel.type = 'button'; cancel.dataset.savedTextAction = 'cancel';
  const applyButton = element('button', 'button primary', 'Text einfügen'); applyButton.type = 'button'; applyButton.dataset.savedTextAction = 'apply';
  actions.append(cancel, applyButton); footer.append(status, actions); dialog.append(head, body, footer);
  ui = {search, count, empty, list, destination, preview, previewTitle, previewText, status, apply:applyButton};
  search.addEventListener('input', () => { ui.status.textContent = ''; render(); });
  cancel.addEventListener('click', () => close()); applyButton.addEventListener('click', apply);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  // A queued close from an earlier session must not dismiss a reopened picker.
  dialog.addEventListener('close', () => { if (!dialog.open && opened) close(); });
  document.body.append(dialog);
 }
 return {
  open(origin) {
   if (opened || !allowed()) return false;
   ensureDialog(); generation++; target = origin; selected = null; catalog = read();
   ui.search.value = ''; ui.status.textContent = ''; ui.destination.textContent = origin.label;
   render();
   try { dialog.showModal(); } catch { target = null; ui.list.replaceChildren(); return false; }
   opened = true; ui.search.focus(); return true;
  },
  close,
  get isOpen() { return opened; }
 };
}
