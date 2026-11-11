import {normalizeMediaItems} from './media-items.mjs';
import {normalizeScheduleBinding,scheduleLocalTime,validatePostScheduleBinding} from './posting-schedules.mjs';
/** Text-first ideas and deliberate preparation. No persistence, identity, provider, or network. */
import { WorkflowError, resolveLocalTime } from './workflows.mjs';

const clone = value => structuredClone(value);
const fail = (code, message, detail = {}) => { throw new WorkflowError(code, message, detail); };
const LIMITS = Object.freeze({ title: 200, text: 20000, tags: 20, tag: 60 });
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const fold = value => value.normalize('NFC').toLocaleLowerCase('de-DE');

function text(value, label, max) {
  if (typeof value !== 'string' || value.length > max) fail('INVALID_IDEA', `${label}: maximal ${max} Zeichen.`);
  return value;
}
function nowIso(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) fail('INVALID_INSTANT', 'Ein eindeutiger Zeitpunkt ist erforderlich.');
  const clock = value.slice(11, 19).split(':').map(Number);
  if (new Date(`${value.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) !== value.slice(0, 10) || clock[0] > 23 || clock[1] > 59 || (clock.length > 2 && clock[2] > 59)) fail('INVALID_INSTANT', 'Datum oder Uhrzeit ist ungültig.');
  return new Date(value).toISOString();
}
function zone(value) {
  if (typeof value !== 'string' || !value || /^[+-]/.test(value)) fail('INVALID_TIMEZONE', 'Wähle eine IANA-Zeitzone.');
  try { new Intl.DateTimeFormat('de-DE', { timeZone: value }).format(); } catch { fail('INVALID_TIMEZONE', 'Unbekannte IANA-Zeitzone.'); }
  return value;
}
function id(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value)) fail('INVALID_IDEA_ID', 'Eine gültige Ideen-ID ist erforderlich.');
  return value;
}
function assertIdea(idea) {
  if (!idea || idea.status !== 'idea') fail('NOT_IDEA', 'Dieser Eintrag ist keine offene Idee.');
  id(idea.id);
  if(Object.hasOwn(idea,'media'))fail('INVALID_IDEA_STATE','Veraltetes Bildfeld.');
  normalizeMediaItems(idea.mediaItems);
  if (idea.scheduleBinding != null || idea.scheduledInstant != null || idea.scheduledAt !== null && idea.scheduledAt !== undefined) fail('IDEA_HAS_SCHEDULE', 'Eine Idee darf keinen vorgemerkten Termin tragen.');
  if ((idea.channels?.length ?? 0) || Object.keys(idea.variantTexts ?? {}).length || (idea.mediaItems?.length ?? 0) > 0) fail('INVALID_IDEA_STATE', 'Ideen haben noch keine Kanäle, Kanalvarianten oder Medien. Übernimm solche Inhalte als Entwurf.');
}
function validateContent({ title = '', text: body = '', tags = [] }) {
  const result = { title: text(title, 'Titel', LIMITS.title), text: text(body, 'Notiz', LIMITS.text), tags: normalizeIdeaTags(tags) };
  if (!result.title.trim() && !result.text.trim()) fail('EMPTY_IDEA', 'Ergänze einen Titel oder eine Notiz.');
  return result;
}

function preserveIdeaTags(tags = []) {
  if (!Array.isArray(tags) || tags.length > LIMITS.tags || tags.some(tag => typeof tag !== 'string' || !tag.trim() || tag.length > LIMITS.tag)) fail('INVALID_TAGS', 'Ungültige bestehende Labels.');
  return [...tags];
}

export function normalizeIdeaTags(tags = []) {
  if (!Array.isArray(tags) || tags.length > LIMITS.tags) fail('INVALID_TAGS', `Höchstens ${LIMITS.tags} Labels sind erlaubt.`);
  const result = [], seen = new Set();
  for (const tag of tags) {
    if (typeof tag !== 'string') fail('INVALID_TAGS', 'Jedes Label muss ein Text sein.');
    const value = tag.trim().normalize('NFC');
    if (!value || value.length > LIMITS.tag) fail('INVALID_TAGS', `Labels brauchen 1 bis ${LIMITS.tag} Zeichen.`);
    const key = fold(value);
    if (!seen.has(key)) { result.push(value); seen.add(key); }
  }
  return result;
}

/** A single CSV-like field. Quotes preserve existing labels containing commas or quotes. */
export function parseIdeaTags(input = '') {
  if (typeof input !== 'string' || input.length > 2500) fail('INVALID_TAGS', 'Die Label-Eingabe ist zu lang oder ungültig.');
  if (!input.trim()) return [];
  const tags = []; let value = '', quoted = false, closed = false;
  const push = () => { if (value.trim()) tags.push(value.trim()); value = ''; closed = false; };
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { value += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else value += char;
    } else if (char === ',') push();
    else if (char === '"' && !value.trim() && !closed) { value = ''; quoted = true; }
    else if (closed && char.trim()) fail('INVALID_TAGS', 'Nach einem geschlossenen Label bitte ein Komma verwenden.');
    else value += char;
  }
  if (quoted) fail('INVALID_TAGS', 'Ein Anführungszeichen im Label ist noch offen.');
  push(); return normalizeIdeaTags(tags);
}

export function formatIdeaTags(tags = []) {
  return preserveIdeaTags(tags).map(tag => /[,"\n\r]|^\s|\s$/.test(tag) ? `"${tag.replaceAll('"', '""')}"` : tag).join(', ');
}

export function createIdea({ id: ideaId, title = '', text: body = '', tags = [], timezone = 'UTC', now = new Date().toISOString() }) {
  const content = validateContent({ title, text: body, tags }), createdAt = nowIso(now);
  return { id: id(ideaId), ...content, status: 'idea', channels: [], variantTexts: {}, scheduledAt: null, scheduledInstant: null, scheduleBinding: null, timeZone: zone(timezone), mediaItems: [], cover: null, createdAt, updatedAt: createdAt };
}

export function updateIdea(idea, patch, { now = new Date().toISOString() } = {}) {
  assertIdea(idea);
  if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).some(key => !['title', 'text', 'tags'].includes(key))) fail('INVALID_IDEA_PATCH', 'Hier lassen sich nur Titel, Notiz und Labels bearbeiten.');
  const content = validateContent({ title: own(patch, 'title') ? patch.title : idea.title ?? '', text: own(patch, 'text') ? patch.text : idea.text, tags: own(patch, 'tags') ? patch.tags : idea.tags ?? [] });
  if (!own(patch, 'tags')) content.tags = preserveIdeaTags(idea.tags ?? []);
  return { ...clone(idea), ...content, updatedAt: nowIso(now) };
}

export function ideaFingerprint(idea) {
  assertIdea(idea);
  return JSON.stringify({ id: idea.id, title: idea.title ?? '', text: idea.text, tags: idea.tags ?? [], channels: [...(idea.channels ?? [])].sort(), variantTexts: Object.entries(idea.variantTexts ?? {}).sort(([a], [b]) => a.localeCompare(b)), mediaItems: idea.mediaItems, cover: idea.cover ?? null, timeZone: idea.timeZone, updatedAt: idea.updatedAt });
}

/** Opening the composer is preparation, never a saved transition. */
export function prepareIdeaDraft(idea, { channels = [] } = {}) {
  assertIdea(idea); validateContent(idea);
  if (!Array.isArray(channels) || channels.some(channel => typeof channel !== 'string' || !channel) || new Set(channels).size !== channels.length) fail('INVALID_CHANNELS', 'Die Kanalauswahl ist ungültig.');
  return { draft: { ...clone(idea), status: 'draft', channels: [...channels], scheduledAt: null, scheduledInstant: null, scheduleBinding: null }, sourceFingerprint: ideaFingerprint(idea) };
}

/** Produces a proposed snapshot. Persist it atomically before claiming the idea was moved. */
export function commitIdeaDraft(posts, draft, { sourceFingerprint, now = new Date().toISOString(), allowedChannels } = {}) {
  if (!Array.isArray(posts) || !draft || typeof draft.id !== 'string') fail('INVALID_POSTS', 'Ungültige Beitragsdaten.');
  if(Object.hasOwn(draft,'media'))fail('INVALID_MEDIA','Veraltetes Bildfeld.');
  normalizeMediaItems(draft.mediaItems);
  const matches = posts.filter(post => post.id === draft.id);
  if (matches.length !== 1 || matches[0].status !== 'idea') fail('IDEA_CHANGED', 'Die Idee wurde inzwischen geändert, verschoben oder entfernt. Lade sie erneut.');
  const original = matches[0];
  if (ideaFingerprint(original) !== sourceFingerprint) fail('IDEA_CHANGED', 'Die Idee wurde inzwischen geändert. Deine Vorbereitung bleibt erhalten; vergleiche beide Fassungen.');
  if (!['draft', 'scheduled'].includes(draft.status)) fail('INVALID_TRANSITION', 'Eine Idee lässt sich nur als Entwurf oder Vormerkung übernehmen.');
  if (!Array.isArray(draft.channels) || (draft.status === 'scheduled' && !draft.channels.length) || draft.channels.some(channel => typeof channel !== 'string' || !channel) || new Set(draft.channels).size !== draft.channels.length) fail('CHANNEL_REQUIRED', 'Wähle mindestens einen Zielkanal.');
  if (allowedChannels && draft.channels.some(channel => !allowedChannels.includes(channel))) fail('INVALID_CHANNELS', 'Ein Zielkanal wird nicht unterstützt.');
  if (!draft.channels.length && draft.mediaItems?.length) fail('MEDIA_TARGET_REQUIRED', 'Ein Bild braucht mindestens einen Zielkanal. Wähle zuerst einen Kanal.');
  const body = text(draft.text, 'Beitragstext', LIMITS.text), variants = draft.variantTexts ?? {};
  if (!variants || typeof variants !== 'object' || Array.isArray(variants)) fail('INVALID_VARIANTS', 'Die Kanaltexte sind ungültig.');
  for (const [channel, value] of Object.entries(variants)) {
    if (!draft.channels.includes(channel)) fail('INVALID_VARIANTS', 'Ein eigener Text gehört zu keinem ausgewählten Kanal.');
    text(value, 'Kanaltext', LIMITS.text);
  }
  const hasAnyText = body.trim() || draft.channels.some(channel => own(variants, channel) && variants[channel].trim());
  if (!hasAnyText) fail('POST_TEXT_REQUIRED', 'Ergänze einen Beitragstext. Der Ideentitel wird nicht automatisch veröffentlicht.');
  const updatedAt = nowIso(now), timezone = zone(draft.timeZone ?? original.timeZone ?? 'UTC');
  if (draft.status === 'scheduled') {
    for (const channel of draft.channels) if (!(own(variants, channel) ? variants[channel] : body).trim()) fail('CHANNEL_TEXT_REQUIRED', 'Jeder vorgemerkte Kanal benötigt einen Text.', { channelId: channel });
    if (typeof draft.scheduledAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(draft.scheduledAt)) fail('SCHEDULE_REQUIRED', 'Wähle einen Termin.');
    let planned;
    if(draft.scheduleBinding!=null){const binding=normalizeScheduleBinding(draft.scheduleBinding);if(draft.scheduledInstant!==binding.instant||scheduleLocalTime(binding.instant,timezone)!==draft.scheduledAt)fail('INVALID_BINDING','Slot und Termin stimmen nicht überein.');validatePostScheduleBinding({...draft,scheduledAt:binding.instant});planned={instant:binding.instant};}
    else planned = resolveLocalTime(draft.scheduledAt.slice(0, 10), draft.scheduledAt.slice(11), timezone);
    if (Date.parse(planned.instant) <= Date.parse(updatedAt)) fail('PAST_TIME', 'Wähle einen zukünftigen Termin.');
  } else if (draft.scheduledAt != null || draft.scheduledInstant != null || draft.scheduleBinding != null) fail('DRAFT_HAS_SCHEDULE', 'Ein Entwurf darf keinen verdeckten Termin behalten.');
  // A legacy form omitting metadata must not erase title or tags.
  const title = text(own(draft, 'title') ? draft.title : original.title ?? '', 'Titel', LIMITS.title);
  const tags = preserveIdeaTags(own(draft, 'tags') ? draft.tags : original.tags ?? []);
  const replacement = { ...clone(original), ...clone(draft), title, text: body, tags, timeZone: timezone, createdAt: original.createdAt, updatedAt };
  return posts.map(post => post.id === draft.id ? replacement : clone(post));
}

export function filterIdeas(posts, { query = '', tag = '', sort = 'updated_desc' } = {}) {
  if (!Array.isArray(posts) || typeof query !== 'string' || typeof tag !== 'string' || !['updated_desc', 'created_desc', 'title_asc'].includes(sort)) fail('INVALID_IDEA_FILTER', 'Ungültiger Ideenfilter.');
  const words = fold(query).trim().split(/\s+/).filter(Boolean), label = fold(tag.trim());
  const filtered = posts.filter(post => post.status === 'idea').filter(idea => {
    if (label && !(idea.tags ?? []).some(value => fold(value.trim()) === label)) return false;
    const haystack = fold([idea.title ?? '', idea.text ?? '', ...(idea.tags ?? [])].join('\n'));
    return words.every(word => haystack.includes(word));
  });
  const title = idea => (idea.title?.trim() || idea.text?.trim().split('\n')[0] || '').normalize('NFC');
  return filtered.sort((a, b) => {
    const comparison = sort === 'title_asc' ? title(a).localeCompare(title(b), 'de-DE') : (Date.parse(sort === 'updated_desc' ? b.updatedAt : b.createdAt) || 0) - (Date.parse(sort === 'updated_desc' ? a.updatedAt : a.createdAt) || 0);
    return comparison || String(a.id).localeCompare(String(b.id));
  });
}

export function ideaLabelCounts(posts) {
  const counts = new Map();
  for (const idea of posts.filter(post => post.status === 'idea')) {
    for (const tag of normalizeIdeaTags(idea.tags ?? [])) {
      const key = fold(tag), previous = counts.get(key);
      counts.set(key, { label: previous?.label ?? tag, count: (previous?.count ?? 0) + 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'de-DE'));
}
