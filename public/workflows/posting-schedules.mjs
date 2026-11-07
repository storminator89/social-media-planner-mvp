/** Persistent editorial posting schedules. Pure logic; never publishes or starts timers. */
import { WorkflowError, resolveLocalTime, dateKeyAt } from './workflows.mjs';

const clone = value => structuredClone(value);
// Hashes and canonical identities must not depend on browser/server locale.
const compareCodeUnits = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const fail = (code, message, detail = {}) => { throw new WorkflowError(code, message, detail); };
const isInt = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const localPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
function exactKeys(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(value, key))) fail(code, 'Unbekannte oder fehlende Felder im Planungsformat.');
}
function validId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value)) fail('INVALID_SCHEDULE', 'Ein gültiges Kennzeichen fehlt.');
  return value;
}
function validZone(value) {
  if (typeof value !== 'string' || !value || /^[+-]/.test(value)) fail('INVALID_TIMEZONE', 'Wähle eine IANA-Zeitzone.');
  dateKeyAt('2026-01-01T00:00:00Z', value); return value;
}
function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) fail('INVALID_INSTANT', 'Ein eindeutiger ISO-Zeitpunkt ist erforderlich.');
  const clock = value.slice(11, 19).split(':').map(Number);
  if (new Date(`${value.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) !== value.slice(0, 10) || clock[0] > 23 || clock[1] > 59 || (clock.length > 2 && clock[2] > 59)) fail('INVALID_INSTANT', 'Datum oder Uhrzeit ist ungültig.');
  return new Date(value).toISOString();
}
const formatters = new Map();
export function scheduleLocalTime(value, timezone) {
  const canonical = instant(value); validZone(timezone);
  if (!formatters.has(timezone)) formatters.set(timezone, new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }));
  const p = Object.fromEntries(formatters.get(timezone).formatToParts(new Date(canonical)).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
const weekday = local => new Date(`${local.slice(0, 10)}T00:00:00Z`).getUTCDay();
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
/** Private restore proof only; every canonical field except updatedAt is bound. */
export async function scheduleRestoreDigest(post) {
  const value = clone(post); delete value.updatedAt;
  value.variants.sort((a, b) => compareCodeUnits(a.id, b.id));
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(value)));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function checkRevision(snapshot, expected) {
  if (!isInt(snapshot?.revision, 0, Number.MAX_SAFE_INTEGER) || !isInt(expected, 0, Number.MAX_SAFE_INTEGER)) fail('REVISION_REQUIRED', 'Eine bestätigte Planungsrevision ist erforderlich.');
  if (snapshot.revision !== expected) fail('REVISION_CONFLICT', 'Der Planer wurde inzwischen geändert. Lade die aktuelle Fassung, ohne deinen Entwurf zu verwerfen.');
}

export function normalizePostingSchedule(value) {
  if (value === null) return null;
  exactKeys(value, ['schemaVersion', 'timezone', 'paused', 'minimumGapMinutes', 'overlapChoice', 'slots'], 'INVALID_SCHEDULE');
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== 1) fail('INVALID_SCHEDULE', 'Unbekanntes Format der Posting-Zeiten.');
  if (typeof value.paused !== 'boolean' || !isInt(value.minimumGapMinutes, 0, 1440) || !['reject', 'earlier', 'later'].includes(value.overlapChoice)) fail('INVALID_SCHEDULE', 'Pause, Mindestabstand oder Zeitumstellungsregel ist ungültig.');
  if (!Array.isArray(value.slots) || value.slots.length > 56) fail('INVALID_SCHEDULE', 'Höchstens 56 Wochen-Slots sind erlaubt.');
  const ids = new Set(), occurrences = new Set();
  const slots = value.slots.map(slot => {
    exactKeys(slot, ['id', 'weekday', 'time'], 'INVALID_SCHEDULE');
    const id = validId(slot?.id);
    if (!isInt(slot.weekday, 0, 6) || typeof slot.time !== 'string' || !timePattern.test(slot.time)) fail('INVALID_SCHEDULE', 'Ein Wochen-Slot benötigt Wochentag und gültige Uhrzeit.');
    const occurrence = `${slot.weekday}:${slot.time}`;
    if (ids.has(id) || occurrences.has(occurrence)) fail('DUPLICATE_SLOT', 'Ein Wochen-Slot oder Kennzeichen wurde doppelt angelegt.');
    ids.add(id); occurrences.add(occurrence); return { id, weekday: slot.weekday, time: slot.time };
  }).sort((a, b) => a.weekday - b.weekday || compareCodeUnits(a.time, b.time) || compareCodeUnits(a.id, b.id));
  return { schemaVersion: 1, timezone: validZone(value.timezone), paused: value.paused, minimumGapMinutes: value.minimumGapMinutes, overlapChoice: value.overlapChoice, slots };
}

export function normalizeScheduleBinding(value) {
  if (value === null) return null;
  exactKeys(value, ['schemaVersion', 'mode', 'instant', 'selectedAt', 'sourceRevision', 'refs'], 'INVALID_BINDING');
  if (!value || value.schemaVersion !== 1 || value.mode !== 'queue' || !isInt(value.sourceRevision, 0, Number.MAX_SAFE_INTEGER) || !Array.isArray(value.refs) || !value.refs.length || value.refs.length > 20) fail('INVALID_BINDING', 'Ungültige Queue-Bindung.');
  const chosen = instant(value.instant), seen = new Set();
  const refs = value.refs.map(ref => {
    exactKeys(ref, ['channelId', 'slotId', 'local', 'timezone', 'overlapChoice', 'minimumGapMinutes'], 'INVALID_BINDING');
    const channelId = validId(ref?.channelId), slotId = validId(ref.slotId), timezone = validZone(ref.timezone);
    if (seen.has(channelId) || !localPattern.test(ref.local ?? '') || !['reject', 'earlier', 'later'].includes(ref.overlapChoice) || !isInt(ref.minimumGapMinutes, 0, 1440)) fail('INVALID_BINDING', 'Ungültige oder doppelte Queue-Referenz.');
    seen.add(channelId);
    const resolved = resolveLocalTime(ref.local.slice(0, 10), ref.local.slice(11), timezone, ref.overlapChoice);
    if (resolved.instant !== chosen) fail('INVALID_BINDING', 'Die Kanal-Slots verweisen nicht auf denselben Zeitpunkt.');
    return { channelId, slotId, local: ref.local, timezone, overlapChoice: ref.overlapChoice, minimumGapMinutes: ref.minimumGapMinutes };
  }).sort((a, b) => compareCodeUnits(a.channelId, b.channelId));
  return { schemaVersion: 1, mode: 'queue', instant: chosen, selectedAt: instant(value.selectedAt), sourceRevision: value.sourceRevision, refs };
}

function targetIds(post) {
  const channels = post.channelIds ?? post.channels ?? post.variants?.map(variant => variant.channelId) ?? [];
  if (!Array.isArray(channels) || channels.some(channel => typeof channel !== 'string') || new Set(channels).size !== channels.length) fail('INVALID_TARGETS', 'Die Zielkanäle sind ungültig.');
  return channels;
}
function isPlanned(post) { return post.stage === 'planned' || post.status === 'scheduled'; }
function postInstant(post) {
  if (!isPlanned(post)) return null;
  if (localPattern.test(post.scheduledAt ?? '')) {
    const timezone = post.timeZone ?? post.timezone;
    if (post.scheduledInstant != null) {
      const canonical = instant(post.scheduledInstant);
      if (scheduleLocalTime(canonical, timezone) !== post.scheduledAt) fail('INVALID_INSTANT', 'Die gespeicherte Ortszeit stimmt nicht mit ihrem UTC-Zeitpunkt überein.');
      return canonical;
    }
    if (post.scheduleBinding) {
      const binding = normalizeScheduleBinding(post.scheduleBinding);
      if (scheduleLocalTime(binding.instant, timezone) !== post.scheduledAt) fail('INVALID_BINDING', 'Die Ortszeit stimmt nicht mit der Queue-Bindung überein.');
      return binding.instant;
    }
    return resolveLocalTime(post.scheduledAt.slice(0, 10), post.scheduledAt.slice(11), timezone).instant;
  }
  return instant(post.scheduledAt);
}
function scheduleFor(channels, channelId) {
  const channel = channels.find(item => item.id === channelId);
  if (!channel) fail('CHANNEL_MISSING', 'Ein Zielkanal existiert nicht mehr.', { channelId });
  if (channel.enabled === false) fail('CHANNEL_DISABLED', 'Ein Zielkanal ist deaktiviert.', { channelId });
  if (!channel.postingSchedule) fail('SCHEDULE_MISSING', 'Für einen Zielkanal fehlen gespeicherte Posting-Zeiten.', { channelId });
  return normalizePostingSchedule(channel.postingSchedule);
}
function refFor(channelId, schedule, chosen) {
  if (schedule.paused) return null;
  const local = scheduleLocalTime(chosen, schedule.timezone);
  const slot = schedule.slots.find(slot => slot.weekday === weekday(local) && slot.time === local.slice(11));
  if (!slot) return null;
  try {
    if (resolveLocalTime(local.slice(0, 10), local.slice(11), schedule.timezone, schedule.overlapChoice).instant !== chosen) return null;
  } catch (error) { if (['DST_GAP', 'DST_AMBIGUOUS'].includes(error.code)) return null; throw error; }
  return { channelId, slotId: slot.id, local, timezone: schedule.timezone, overlapChoice: schedule.overlapChoice, minimumGapMinutes: schedule.minimumGapMinutes };
}
function postEvents(post) {
  if (Array.isArray(post.variants)) {
    return post.variants.filter(variant => variant.status === 'planned' || (variant.status == null && isPlanned(post))).map(variant => ({ postId: post.id, channels: [variant.channelId], epoch: Date.parse(instant(variant.scheduledAt ?? post.scheduledAt)) }));
  }
  return isPlanned(post) ? [{ postId: post.id, channels: targetIds(post), epoch: Date.parse(postInstant(post)) }] : [];
}
function busyEvents(posts, postId, channels) {
  const result = [];
  for (const post of posts) {
    if (post.id === postId) continue;
    const common = targetIds(post).filter(id => channels.includes(id));
    if (!common.length) continue;
    try { for (const event of postEvents(post)) { const shared = event.channels.filter(id => channels.includes(id)); if (shared.length) result.push({ ...event, channels: shared }); } }
    catch (error) { fail('EXISTING_SCHEDULE_INVALID', 'Ein vorhandener Termin ist nicht eindeutig. Prüfe ihn vor einer neuen Queue-Auswahl.', { postId: post.id, cause: error.code }); }
  }
  return result;
}
function conflictsAt(chosen, events, schedules) {
  const epoch = Date.parse(chosen), conflicts = [];
  for (const event of events) for (const channelId of event.channels) {
    const gap = schedules.get(channelId).minimumGapMinutes * 60000;
    if (epoch === event.epoch || Math.abs(epoch - event.epoch) < gap) conflicts.push({ postId: event.postId, channelId });
  }
  return conflicts;
}

/** Supports API snapshots (UTC posts/variants) and UI snapshots with channel metadata. */
export function findNextPostingSlots(snapshot, { postId, channelIds, after = new Date().toISOString(), displayTimezone = 'UTC', limit = 5, horizonDays = 60 } = {}) {
  checkRevision(snapshot, snapshot?.revision); validId(postId);
  if (!Array.isArray(channelIds) || !channelIds.length || channelIds.length > 20 || new Set(channelIds).size !== channelIds.length) fail('CHANNEL_REQUIRED', 'Wähle eindeutige Zielkanäle.');
  channelIds.forEach(validId);
  if (!Array.isArray(snapshot.channels) || !Array.isArray(snapshot.posts) || !isInt(limit, 1, 100) || !isInt(horizonDays, 1, 366)) fail('INVALID_SNAPSHOT', 'Ungültige Planungsdaten oder Suchgrenzen.');
  const from = instant(after); validZone(displayTimezone);
  const schedules = new Map(channelIds.map(id => [id, scheduleFor(snapshot.channels, id)]));
  const base = { postId, channelIds: [...channelIds], expectedRevision: snapshot.revision, displayTimezone, scheduleSnapshot: [...schedules].map(([channelId, schedule]) => ({ channelId, schedule })) };
  if ([...schedules.values()].some(schedule => schedule.paused)) return { ...base, suggestions: [], warnings: [], reason: 'queue_paused' };
  if ([...schedules.values()].some(schedule => !schedule.slots.length)) return { ...base, suggestions: [], warnings: [], reason: 'queue_empty' };
  const events = busyEvents(snapshot.posts, postId, channelIds), anchor = schedules.get(channelIds[0]);
  const start = dateKeyAt(from, anchor.timezone), candidates = new Set(), warnings = [];
  for (let day = 0; day < horizonDays; day++) {
    const date = new Date(Date.parse(`${start}T00:00:00Z`) + day * 86400000).toISOString().slice(0, 10);
    for (const slot of anchor.slots.filter(slot => slot.weekday === weekday(date))) {
      try {
        const chosen = resolveLocalTime(date, slot.time, anchor.timezone, anchor.overlapChoice).instant;
        if (Date.parse(chosen) > Date.parse(from)) candidates.add(chosen);
      } catch (error) {
        if (!['DST_GAP', 'DST_AMBIGUOUS'].includes(error.code)) throw error;
        warnings.push({ code: error.code, channelId: channelIds[0], slotId: slot.id, local: `${date}T${slot.time}`, timezone: anchor.timezone });
      }
    }
  }
  let commonCount = 0; const suggestions = [];
  for (const chosen of [...candidates].sort()) {
    const refs = channelIds.map(channelId => refFor(channelId, schedules.get(channelId), chosen));
    if (refs.some(ref => !ref)) continue;
    commonCount++;
    if (conflictsAt(chosen, events, schedules).length) continue;
    suggestions.push({ instant: chosen, local: scheduleLocalTime(chosen, displayTimezone), timezone: displayTimezone, refs });
    if (suggestions.length === limit) break;
  }
  return { ...base, suggestions, warnings, reason: suggestions.length ? null : commonCount ? 'all_occupied' : 'no_shared_slot', horizonDays };
}

/** Rechecks selection; returns planning data to persist with the SAME expected revision. */
export function selectPostingSlot(snapshot, proposal, chosen, { now = new Date().toISOString() } = {}) {
  checkRevision(snapshot, proposal?.expectedRevision);
  if (!proposal.suggestions?.some(suggestion => equal(suggestion, chosen))) fail('SELECTION_REQUIRED', 'Wähle einen tatsächlich angezeigten Terminvorschlag.');
  const selectedAt = instant(now), current = new Map(proposal.channelIds.map(id => [id, scheduleFor(snapshot.channels, id)]));
  validZone(chosen.timezone);
  if (chosen.timezone !== proposal.displayTimezone || scheduleLocalTime(chosen.instant, chosen.timezone) !== chosen.local) fail('INVALID_SELECTION', 'Ortszeit und Zeitzone des Vorschlags passen nicht zum Zeitpunkt.');
  if (!equal(proposal.scheduleSnapshot, [...current].map(([channelId, schedule]) => ({ channelId, schedule })))) fail('SCHEDULE_CHANGED', 'Die Posting-Zeiten wurden geändert. Suche die Vorschläge erneut.');
  if (Date.parse(chosen.instant) <= Date.parse(selectedAt)) fail('PAST_TIME', 'Dieser Vorschlag ist inzwischen verstrichen.');
  const events = busyEvents(snapshot.posts, proposal.postId, proposal.channelIds);
  const conflicts = conflictsAt(chosen.instant, events, current);
  if (conflicts.length) fail('SLOT_TAKEN', 'Dieser Slot ist inzwischen belegt.', { conflicts });
  const refs = proposal.channelIds.map(channelId => refFor(channelId, current.get(channelId), chosen.instant));
  if (refs.some(ref => !ref) || !equal(refs, chosen.refs)) fail('SCHEDULE_CHANGED', 'Dieser Vorschlag passt nicht mehr zu den Posting-Zeiten.');
  const binding = normalizeScheduleBinding({ schemaVersion: 1, mode: 'queue', instant: chosen.instant, selectedAt, sourceRevision: snapshot.revision, refs });
  return { postId: proposal.postId, channelIds: [...proposal.channelIds], expectedRevision: snapshot.revision, scheduledAt: binding.instant, timezone: chosen.timezone, local: chosen.local, scheduleBinding: binding };
}

/** A diagnostic only. Changed settings never move a stored instant automatically. */
export function inspectScheduleBinding(post, channels) {
  if (!post.scheduleBinding) return { mode: isPlanned(post) ? 'fixed' : 'unplanned', state: 'unchanged', reasons: [] };
  let binding;
  try { binding = normalizeScheduleBinding(post.scheduleBinding); }
  catch (error) { return { mode: 'queue', state: 'needs_review', reasons: [error.code ?? 'INVALID_BINDING'] }; }
  const reasons = [];
  if (!isPlanned(post)) reasons.push('POST_NOT_PLANNED');
  if (!equal([...targetIds(post)].sort(), binding.refs.map(ref => ref.channelId).sort())) reasons.push('TARGETS_CHANGED');
  try { if (postInstant(post) !== binding.instant) reasons.push('INSTANT_CHANGED'); } catch { reasons.push('INSTANT_CHANGED'); }
  for (const ref of binding.refs) {
    try {
      const schedule = scheduleFor(channels, ref.channelId);
      const current = refFor(ref.channelId, schedule, binding.instant);
      if (!current || !equal(current, ref)) reasons.push(`RULE_CHANGED:${ref.channelId}`);
    } catch (error) { reasons.push(`${error.code}:${ref.channelId}`); }
  }
  return { mode: 'queue', state: reasons.length ? 'needs_review' : 'current', reasons, instant: binding.instant };
}

/** Preview a schedule edit without changing posts, revision, or persistence. */
export function replacePostingSchedule(snapshot, { channelId, postingSchedule, expectedRevision } = {}) {
  checkRevision(snapshot, expectedRevision); validId(channelId);
  if (!snapshot.channels.some(channel => channel.id === channelId)) fail('CHANNEL_MISSING', 'Dieser Kanal existiert nicht mehr.');
  const normalized = normalizePostingSchedule(postingSchedule), next = clone(snapshot);
  next.channels = next.channels.map(channel => channel.id === channelId ? { ...channel, postingSchedule: normalized } : channel);
  const affected = next.posts.filter(post => post.scheduleBinding?.refs?.some(ref => ref.channelId === channelId)).map(post => ({ postId: post.id, ...inspectScheduleBinding(post, next.channels) })).filter(result => result.state === 'needs_review');
  return { snapshot: next, expectedRevision, affected };
}

/** Detach only after an explicit user action. Result remains at the same instant. */
export function detachQueueBinding(post, { confirmed = false } = {}) {
  if (!post.scheduleBinding) return clone(post);
  if (!confirmed) fail('DETACH_CONFIRMATION_REQUIRED', 'Bestätige, dass dieser Termin unabhängig von den Posting-Zeiten werden soll.');
  return { ...clone(post), scheduleBinding: null };
}

/** Server-side boundary check for canonical UTC posts. Does not imply publishing permission. */
export function validatePostScheduleBinding(post) {
  if (!Object.hasOwn(post, 'scheduleBinding')) fail('BINDING_REQUIRED', 'Die Queue-Bindung muss ausdrücklich angegeben werden.');
  if (post.scheduleBinding === null) return null;
  const binding = normalizeScheduleBinding(post.scheduleBinding);
  if (!isPlanned(post) || instant(post.scheduledAt) !== binding.instant || !equal([...targetIds(post)].sort(), binding.refs.map(ref => ref.channelId).sort())) fail('INVALID_BINDING', 'Queue-Bindung, Zielkanäle und vorgemerkter Zeitpunkt müssen übereinstimmen.');
  return binding;
}

/** Validate only new/rebound queue choices against the final CAS snapshot. */
export function validateScheduleChanges(next, previous, now = new Date().toISOString(), { verifiedRestoreIds = [] } = {}) {
  checkRevision(previous, next.revision);
  const currentTime = instant(now);
  for (const post of next.posts) {
    const binding = validatePostScheduleBinding(post);
    if (!binding) continue;
    const before = previous.posts.find(item => item.id === post.id);
    if (!before && verifiedRestoreIds.includes(post.id)) {
      const channels = binding.refs.map(ref => ref.channelId);
      const originalRules = new Map(binding.refs.map(ref => [ref.channelId, { minimumGapMinutes: ref.minimumGapMinutes }]));
      const conflicts = conflictsAt(binding.instant, busyEvents(next.posts, post.id, channels), originalRules);
      if (conflicts.length) fail('SLOT_TAKEN', 'Der ursprüngliche Queue-Termin ist inzwischen belegt.');
      continue;
    }
    if (before?.scheduleBinding && equal(before.scheduleBinding, binding)) {
      // Rule edits may grandfather existing appointments, but a new/moved fixed
      // appointment cannot silently occupy an existing queue reservation.
      const oldRules = new Map(binding.refs.map(ref => [ref.channelId, { minimumGapMinutes: ref.minimumGapMinutes }]));
      const relevant = binding.refs.map(ref => ref.channelId), oldEvents = busyEvents(previous.posts, post.id, relevant);
      const newEvents = busyEvents(next.posts, post.id, relevant).filter(event => !oldEvents.some(old => old.postId === event.postId && old.epoch === event.epoch && equal([...old.channels].sort(), [...event.channels].sort())));
      const conflicts = conflictsAt(binding.instant, newEvents, oldRules);
      if (conflicts.length) fail('SLOT_TAKEN', 'Ein neuer oder verschobener Beitrag kollidiert mit einer bestehenden Queue-Vormerkung.', { conflicts });
      continue;
    }
    if (binding.sourceRevision !== next.revision) fail('REVISION_CONFLICT', 'Die Queue-Auswahl stammt aus einer älteren Planungsrevision.');
    if (Date.parse(binding.instant) <= Date.parse(currentTime)) fail('PAST_TIME', 'Der ausgewählte Queue-Termin liegt inzwischen in der Vergangenheit.');
    const state = inspectScheduleBinding(post, next.channels);
    if (state.state !== 'current') fail('SCHEDULE_CHANGED', 'Die neue Queue-Auswahl passt nicht zu den gespeicherten Posting-Zeiten.', { reasons: state.reasons });
    const channelIds = targetIds(post), schedules = new Map(channelIds.map(id => [id, scheduleFor(next.channels, id)]));
    const conflicts = conflictsAt(binding.instant, busyEvents(next.posts, post.id, channelIds), schedules);
    if (conflicts.length) fail('SLOT_TAKEN', 'Die neue Queue-Auswahl kollidiert mit einem anderen vorgemerkten Beitrag.', { conflicts });
  }
  return true;
}
