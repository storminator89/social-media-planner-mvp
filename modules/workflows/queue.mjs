/** Editorial queue suggestions for the current Takt UI model. No timers or network. */
import { WorkflowError, resolveLocalTime, dateKeyAt } from './workflows.mjs';

const clone = value => structuredClone(value);
const fail = (code, message, detail = {}) => { throw new WorkflowError(code, message, detail); };
const localPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const integer = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;

function absoluteTime(value, label = 'Zeitpunkt') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value)))
    fail('INVALID_INSTANT', `${label}: Ein eindeutiger ISO-Zeitpunkt ist erforderlich.`);
  const civil = value.slice(0, 10), clock = value.slice(11, 19).split(':').map(Number);
  if (new Date(`${civil}T00:00:00Z`).toISOString().slice(0, 10) !== civil || clock[0] > 23 || clock[1] > 59 || (clock.length === 3 && clock[2] > 59))
    fail('INVALID_INSTANT', `${label}: Ungültiges Datum oder Uhrzeit.`);
  return Date.parse(value);
}

function localAt(epoch, timeZone) {
  const fields = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(epoch)).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  return `${fields.year}-${fields.month}-${fields.day}T${fields.hour}:${fields.minute}`;
}
function dayAfter(date, count) { return new Date(Date.parse(`${date}T00:00:00Z`) + count * 86400000).toISOString().slice(0, 10); }
function weekday(date) { return new Date(`${date}T00:00:00Z`).getUTCDay(); }
function selectedChannels(post) {
  if (typeof post?.id !== 'string' || !post.id) fail('INVALID_POST', 'Ein Beitragskennzeichen fehlt.');
  if (!Array.isArray(post?.channels) || !post.channels.length || post.channels.some(id => typeof id !== 'string' || !id)) fail('NO_CHANNELS', 'Wähle mindestens einen Kanal.');
  if (new Set(post.channels).size !== post.channels.length) fail('DUPLICATE_CHANNEL', 'Ein Kanal wurde mehrfach ausgewählt.');
  return post.channels;
}

export function normalizeQueueRules(rules) {
  if (!Array.isArray(rules) || rules.length > 20) fail('INVALID_QUEUE_RULES', 'Höchstens 20 Kanalregeln sind erlaubt.');
  const ids = new Set();
  return rules.map(rule => {
    if (!rule || typeof rule.channelId !== 'string' || !rule.channelId || ids.has(rule.channelId)) fail('INVALID_QUEUE_RULES', 'Jeder Kanal benötigt eine eindeutige Queue-Regel.');
    ids.add(rule.channelId);
    if (typeof rule.timezone !== 'string' || !rule.timezone || /^[+-]/.test(rule.timezone)) fail('INVALID_TIMEZONE', 'Wähle eine IANA-Zeitzone.');
    dateKeyAt('2026-01-01T00:00:00Z', rule.timezone);
    if (rule.paused !== undefined && typeof rule.paused !== 'boolean') fail('INVALID_QUEUE_RULES', 'Pausiert muss wahr oder falsch sein.');
    if (rule.overlapChoice !== undefined && !['earlier', 'later', 'reject'].includes(rule.overlapChoice)) fail('INVALID_QUEUE_RULES', 'Ungültige Wahl für doppelte Ortszeiten.');
    if (!Array.isArray(rule.slots) || rule.slots.length > 56) fail('INVALID_QUEUE_RULES', 'Höchstens 56 Wochen-Slots je Kanal sind erlaubt.');
    const seen = new Set();
    const slots = rule.slots.map(slot => {
      if (!slot || !integer(slot.weekday, 0, 6) || typeof slot.time !== 'string' || !timePattern.test(slot.time)) fail('INVALID_QUEUE_RULES', 'Ein Wochen-Slot benötigt einen gültigen Wochentag und eine Uhrzeit.');
      const key = `${slot.weekday}:${slot.time}`;
      if (seen.has(key)) fail('DUPLICATE_SLOT', 'Ein Wochen-Slot wurde doppelt angelegt.');
      seen.add(key); return { weekday: slot.weekday, time: slot.time };
    });
    return { channelId: rule.channelId, timezone: rule.timezone, paused: rule.paused ?? false, overlapChoice: rule.overlapChoice ?? 'reject', slots };
  });
}

function fingerprint(post) {
  return JSON.stringify({ id: post.id, text: post.text, channels: [...post.channels].sort(), status: post.status, scheduledAt: post.scheduledAt ?? null, timeZone: post.timeZone ?? null, media: post.media ?? null, attachments: post.attachments ?? (post.media?[post.media]:[]), variantTexts: Object.entries(post.variantTexts ?? {}).sort(([a], [b]) => a.localeCompare(b)), updatedAt: post.updatedAt ?? null });
}
function busyTimes(posts, post, channelIds) {
  if (!Array.isArray(posts)) fail('INVALID_POSTS', 'Die Beitragsliste ist ungültig.');
  return posts.filter(p => p.id !== post.id && p.status === 'scheduled' && p.channels?.some(id => channelIds.includes(id))).map(p => {
    let epoch;
    try {
      epoch = localPattern.test(p.scheduledAt ?? '')
        ? Date.parse(resolveLocalTime(p.scheduledAt.slice(0, 10), p.scheduledAt.slice(11), p.timeZone).instant)
        : absoluteTime(p.scheduledAt, 'Vorhandener Termin');
    } catch (error) { fail('INVALID_EXISTING_TIME', 'Ein vorhandener Termin ist nicht eindeutig. Prüfe ihn vor weiteren Vorschlägen.', { postId: p.id, cause: error.code }); }
    return { epoch, postId: p.id, channels: p.channels.filter(id => channelIds.includes(id)) };
  });
}
function collisions(epoch, busy, gap) {
  return busy.filter(item => item.epoch === epoch || Math.abs(item.epoch - epoch) < gap * 60000).map(item => ({ postId: item.postId, channelIds: item.channels }));
}
function ruleMatches(epoch, rule) {
  if (rule.paused) return false;
  const local = localAt(epoch, rule.timezone), date = local.slice(0, 10), time = local.slice(11);
  if (!rule.slots.some(slot => slot.weekday === weekday(date) && slot.time === time)) return false;
  try { return Date.parse(resolveLocalTime(date, time, rule.timezone, rule.overlapChoice).instant) === epoch; }
  catch { return false; }
}

/** Only slots matching every selected channel qualify for a shared-time post. */
export function suggestQueueSlots({ post, posts = [], rules, after = new Date().toISOString(), timezone = post?.timeZone ?? 'UTC', limit = 5, horizonDays = 60, minimumGapMinutes = 30 }) {
  const channelIds = selectedChannels(post), normalized = normalizeQueueRules(rules), from = absoluteTime(after);
  if (!integer(limit, 1, 100) || !integer(horizonDays, 1, 366) || !integer(minimumGapMinutes, 0, 1440)) fail('INVALID_QUEUE_OPTIONS', 'Ungültige Anzahl, Suchdauer oder Mindestabstand.');
  dateKeyAt(after, timezone);
  const active = channelIds.map(id => {
    const rule = normalized.find(r => r.channelId === id); if (!rule) fail('QUEUE_RULE_MISSING', 'Für einen ausgewählten Kanal fehlt eine Queue-Regel.', { channelId: id }); return rule;
  });
  if (active.some(r => r.paused)) return { suggestions: [], warnings: [], reason: 'queue_paused', scannedDays: 0 };
  if (active.some(r => !r.slots.length)) return { suggestions: [], warnings: [], reason: 'queue_empty', scannedDays: 0 };
  const busy = busyTimes(posts, post, channelIds), warnings = [], candidates = new Set();
  // All-channel intersection is a subset of the first queue; no need to expand every queue.
  const anchor = active[0], start = dateKeyAt(after, anchor.timezone);
  for (let day = 0; day < horizonDays; day++) {
    const date = dayAfter(start, day);
    for (const slot of anchor.slots.filter(slot => slot.weekday === weekday(date))) {
      try {
        const resolved = resolveLocalTime(date, slot.time, anchor.timezone, anchor.overlapChoice);
        const epoch = Date.parse(resolved.instant);
        if (epoch > from) candidates.add(epoch);
      } catch (error) {
        if (!['DST_GAP', 'DST_AMBIGUOUS'].includes(error.code)) throw error;
        warnings.push({ code: error.code, channelId: anchor.channelId, local: `${date}T${slot.time}`, timezone: anchor.timezone, message: error.message });
      }
    }
  }
  const shared = [...candidates].sort((a, b) => a - b).filter(epoch => active.every(rule => ruleMatches(epoch, rule)));
  let ambiguousDisplayCount = 0;
  const available = shared.filter(epoch => {
    if (collisions(epoch, busy, minimumGapMinutes).length) return false;
    const local = localAt(epoch, timezone);
    try { return Date.parse(resolveLocalTime(local.slice(0, 10), local.slice(11), timezone).instant) === epoch; }
    catch (error) {
      if (error.code !== 'DST_AMBIGUOUS') throw error;
      ambiguousDisplayCount += 1;
      warnings.push({ code: 'DISPLAY_TIME_AMBIGUOUS', local, timezone, message: 'Die aktuelle Planungsansicht kann diese doppelte Ortszeit noch nicht eindeutig speichern. Wähle eine andere Zeit oder UTC als Anzeigezone.' });
      return false;
    }
  });
  const suggestions = available.slice(0, limit).map(epoch => ({ local: localAt(epoch, timezone), timezone, instant: new Date(epoch).toISOString(), channelIds: [...channelIds], minimumGapMinutes, postFingerprint: fingerprint(post), mode: 'editorial_only' }));
  return { suggestions, warnings, reason: suggestions.length ? null : ambiguousDisplayCount ? 'ambiguous_display_time' : shared.length ? 'all_occupied' : 'no_shared_slot', scannedDays: horizonDays };
}

/** Use only after explicit selection; rechecks rules, time and occupancy, and returns a copy. */
export function applyQueueSuggestion({ post, posts = [], rules, suggestion, now = new Date().toISOString(), minimumGapMinutes = 30 }) {
  if(post.scheduleBinding)fail('PERSISTED_QUEUE_BINDING','Dieser Beitrag hat gespeicherte Posting-Zeiten. Nutze deren Vorschläge oder löse die Bindung ausdrücklich.');
  const channelIds = selectedChannels(post), normalized = normalizeQueueRules(rules);
  if (!suggestion || suggestion.mode !== 'editorial_only' || suggestion.postFingerprint !== fingerprint(post)) fail('SUGGESTION_STALE', 'Der Beitrag wurde geändert. Lade die Terminvorschläge erneut.');
  if (!Array.isArray(suggestion.channelIds) || JSON.stringify([...suggestion.channelIds].sort()) !== JSON.stringify([...channelIds].sort())) fail('SUGGESTION_STALE', 'Die Zielkanäle wurden geändert.');
  if (!integer(minimumGapMinutes, 0, 1440)) fail('INVALID_QUEUE_OPTIONS', 'Ungültiger Mindestabstand.');
  if (suggestion.minimumGapMinutes !== minimumGapMinutes) fail('QUEUE_RULE_CHANGED', 'Der Mindestabstand wurde geändert. Lade die Vorschläge erneut.');
  const epoch = absoluteTime(suggestion.instant), current = absoluteTime(now);
  if (epoch <= current) fail('PAST_TIME', 'Dieser Vorschlag liegt inzwischen in der Vergangenheit.');
  if (localAt(epoch, suggestion.timezone) !== suggestion.local) fail('INVALID_SUGGESTION', 'Zeitpunkt und Zeitzone des Vorschlags passen nicht zusammen.');
  // Current simple Takt format does not persist a repeated-hour disambiguation field.
  // Reject that projection rather than silently lose the selected UTC instant.
  const checked = resolveLocalTime(suggestion.local.slice(0, 10), suggestion.local.slice(11), suggestion.timezone);
  if (Date.parse(checked.instant) !== epoch) fail('INVALID_SUGGESTION', 'Der vorgeschlagene Zeitpunkt ist nicht eindeutig darstellbar.');
  if (!channelIds.every(id => { const rule = normalized.find(r => r.channelId === id); return rule && ruleMatches(epoch, rule); })) fail('QUEUE_RULE_CHANGED', 'Die Queue-Regeln wurden geändert. Lade die Vorschläge erneut.');
  const conflicts = collisions(epoch, busyTimes(posts, post, channelIds), suggestion.minimumGapMinutes);
  if (conflicts.length) fail('SLOT_TAKEN', 'Dieser Termin ist inzwischen belegt. Wähle einen anderen Vorschlag.', { conflicts });
  return { ...clone(post), status: 'scheduled', scheduledAt: suggestion.local, scheduledInstant: null, scheduleBinding: null, timeZone: suggestion.timezone, updatedAt: new Date(current).toISOString() };
}

/** Duplicates preserve content, including channel overrides, but never old schedule or evidence. */
export function duplicateTaktDraft(post, { id, now = new Date().toISOString() }) {
  if (typeof id !== 'string' || !id || id === post.id) fail('NEW_ID_REQUIRED', 'Die Kopie benötigt eine neue ID.');
  const current = new Date(absoluteTime(now)).toISOString();
  const draft = { id, text: String(post.text ?? ''), channels: [...selectedChannels(post)], status: 'draft', scheduledAt: null, scheduledInstant: null, scheduleBinding: null, timeZone: post.timeZone ?? 'UTC', cover: post.cover ?? null, media: clone(post.media ?? null), ...(Object.hasOwn(post,'attachments')?{attachments:clone(post.attachments)}:{}), createdAt: current, updatedAt: current };
  if (post.variantTexts !== undefined) draft.variantTexts = clone(post.variantTexts);
  if (post.title !== undefined) draft.title = post.title;
  if (post.tags !== undefined) draft.tags = clone(post.tags);
  return draft;
}
