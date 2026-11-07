/** Independent planning domain. No network, credentials, timers, or publishing. */
export class WorkflowError extends Error {
  constructor(code, message, detail = {}) { super(message); this.name = 'WorkflowError'; this.code = code; this.detail = detail; }
}
const fail = (code, message, detail) => { throw new WorkflowError(code, message, detail); };
const clone = value => structuredClone(value);
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

export function createPost({ id, text = '', media = [], targets = [], requireReview = false }) {
  if (!id) fail('ID_REQUIRED', 'Ein Beitragskennzeichen fehlt.');
  return { schemaVersion: 1, id, revision: 1, savedRevision: 0,
    base: { text, media: clone(media) },
    targets: targets.map(target => ({ id: target.id, channel: target.channel, overrides: {} })),
    requireReview, stage: 'draft', review: null, plan: null, deliveries: [], deletedAt: null };
}

export function resolveVariant(post, targetId) {
  const target = post.targets.find(t => t.id === targetId);
  if (!target) fail('TARGET_UNKNOWN', 'Dieser Zielkanal ist nicht vorhanden.');
  const overrides = target.overrides ?? {};
  return { targetId, channel: target.channel,
    text: own(overrides, 'text') ? overrides.text : post.base.text,
    media: clone(own(overrides, 'media') ? overrides.media : post.base.media),
    custom: own(overrides, 'text') || own(overrides, 'media') };
}

export function editPost(post, patch) {
  if (post.deletedAt) fail('POST_DELETED', 'Stelle den Beitrag zuerst wieder her.');
  const next = clone(post);
  if (own(patch, 'base')) next.base = { ...next.base, ...clone(patch.base) };
  if (own(patch, 'targets')) next.targets = clone(patch.targets);
  if (own(patch, 'requireReview')) next.requireReview = !!patch.requireReview;
  next.revision += 1;
  // A changed revision must be reviewed and planned again, never silently re-used.
  next.stage = 'draft'; next.review = null; next.plan = null;
  return next;
}

export function markSaved(post, revision) {
  if (!Number.isInteger(revision) || revision < 0 || revision > post.revision)
    fail('INVALID_REVISION', 'Ungültige Speicherbestätigung.');
  return { ...post, savedRevision: Math.max(post.savedRevision, revision) };
}

export function validatePost(post, capabilities = {}) {
  const issues = [];
  if (!post.targets.length) issues.push({ code: 'NO_TARGETS', severity: 'error', message: 'Wähle mindestens einen Kanal.' });
  const seen = new Set();
  for (const target of post.targets) {
    if (seen.has(target.id)) issues.push({ targetId: target.id, code: 'DUPLICATE_TARGET', severity: 'error', message: 'Ein Zielkanal wurde mehrfach ausgewählt.' });
    seen.add(target.id);
    const variant = resolveVariant(post, target.id);
    const rules = capabilities[target.channel];
    const add = (code, message, severity = 'error') => issues.push({ targetId: target.id, code, severity, message });
    if (!variant.text.trim() && !variant.media.length) add('EMPTY', 'Text oder Medien ergänzen.');
    if (!rules) add('RULES_UNKNOWN', 'Aktuelle Provider-Regeln sind noch nicht geprüft.', 'warning');
    // Counting is explicit: use an authoritative provider counter when available.
    const measure = rules?.countText ?? (text => Array.from(text).length);
    const length = measure(variant.text);
    if (Number.isFinite(rules?.maxText) && length > rules.maxText) add('TEXT_TOO_LONG', `Text ist ${length - rules.maxText} Zeichen zu lang.`);
    if (Number.isFinite(rules?.maxMedia) && variant.media.length > rules.maxMedia) add('TOO_MANY_MEDIA', 'Zu viele Medien für diesen Kanal.');
    if (rules?.requiresMedia && !variant.media.length) add('MEDIA_REQUIRED', 'Dieser Kanal benötigt ein Medium.');
    for (const medium of variant.media) {
      if (medium.state !== 'ready') add('MEDIA_NOT_READY', 'Ein Medium ist noch nicht verfügbar.');
      if (rules?.mediaTypes && !rules.mediaTypes.includes(medium.type)) add('MEDIA_TYPE', 'Dieses Medienformat wird nicht unterstützt.');
      if (medium.type === 'image' && !medium.alt?.trim()) add('ALT_MISSING', 'Alternativtext für das Bild ergänzen.', 'warning');
    }
  }
  return issues;
}

function requireSaved(post) {
  if (post.savedRevision !== post.revision) fail('UNSAVED', 'Speichere zuerst die aktuelle Fassung.');
}
function requireValid(post, capabilities) {
  const issues = validatePost(post, capabilities).filter(i => i.severity === 'error');
  if (issues.length) fail('VALIDATION_FAILED', 'Prüfe die markierten Kanäle.', { issues });
}

/** Editorial transitions only. This is NOT authorization enforcement. */
export function transitionPost(post, action, context = {}) {
  const next = clone(post);
  if (action.type === 'restore') { next.deletedAt = null; return next; }
  if (post.deletedAt) fail('POST_DELETED', 'Stelle den Beitrag zuerst wieder her.');
  if (action.type === 'trash') { next.deletedAt = context.now ?? new Date().toISOString(); return next; }
  requireSaved(post);
  if (action.type === 'request_review') {
    requireValid(post, context.capabilities);
    next.stage = 'in_review'; next.review = { status: 'pending', revision: post.revision }; next.plan = null;
  } else if (action.type === 'approve') {
    if (post.stage !== 'in_review' || post.review?.revision !== post.revision)
      fail('REVIEW_STALE', 'Die aktuelle Fassung muss zuerst zur Prüfung eingereicht werden.');
    if (!context.reviewerId) fail('REVIEWER_REQUIRED', 'Eine prüfende Person fehlt.');
    next.stage = 'approved'; next.review = { status: 'approved', revision: post.revision, reviewerId: context.reviewerId };
  } else if (action.type === 'request_changes') {
    if (post.stage !== 'in_review') fail('NOT_IN_REVIEW', 'Der Beitrag ist nicht in Prüfung.');
    if (!action.reason?.trim()) fail('REASON_REQUIRED', 'Beschreibe die gewünschte Änderung.');
    next.stage = 'draft'; next.review = { status: 'changes_requested', revision: post.revision, reason: action.reason.trim() };
  } else if (action.type === 'plan') {
    requireValid(post, context.capabilities);
    if (post.requireReview && (post.review?.status !== 'approved' || post.review.revision !== post.revision))
      fail('APPROVAL_REQUIRED', 'Die aktuelle Fassung braucht eine Freigabe.');
    const resolved = resolveLocalTime(action.date, action.time, action.timeZone, action.disambiguation);
    const now = context.now ? Date.parse(context.now) : Date.now();
    if (!Number.isFinite(now)) fail('INVALID_NOW', 'Die aktuelle Zeit ist ungültig.');
    if (Date.parse(resolved.instant) <= now) fail('PAST_TIME', 'Wähle einen zukünftigen Zeitpunkt.');
    next.stage = 'planned';
    next.plan = { ...resolved, date: action.date, time: action.time, timeZone: action.timeZone, revision: post.revision, mode: 'editorial_only' };
  } else if (action.type === 'unplan') {
    next.plan = null; next.stage = post.review?.status === 'approved' ? 'approved' : 'draft';
  } else fail('ACTION_UNKNOWN', 'Unbekannte Aktion.');
  return next;
}

const formatters = new Map();
function formatter(timeZone) {
  if (!formatters.has(timeZone)) {
    try { formatters.set(timeZone, new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })); }
    catch { fail('INVALID_TIMEZONE', 'Wähle eine gültige IANA-Zeitzone.'); }
  }
  return formatters.get(timeZone);
}
function partsAt(epoch, timeZone) {
  return Object.fromEntries(formatter(timeZone).formatToParts(new Date(epoch)).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
}
function validateCivil(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) fail('INVALID_LOCAL_TIME', 'Datum und Uhrzeit sind ungültig.');
  const [y, m, d] = date.split('-').map(Number), [h, min] = time.split(':').map(Number);
  if (y < 1000 || y > 9999 || m < 1 || m > 12 || h > 23 || min > 59) fail('INVALID_LOCAL_TIME', 'Datum und Uhrzeit sind ungültig.');
  const epoch = Date.UTC(y, m - 1, d, h, min);
  if (new Date(epoch).toISOString().slice(0, 10) !== date) fail('INVALID_LOCAL_TIME', 'Dieses Datum existiert nicht.');
  return epoch;
}

export function dateKeyAt(instant, timeZone) {
  const epoch = typeof instant === 'number' ? instant : Date.parse(instant);
  if (!Number.isFinite(epoch)) fail('INVALID_INSTANT', 'Der Zeitpunkt ist ungültig.');
  const p = partsAt(epoch, timeZone); return `${p.year}-${p.month}-${p.day}`;
}

/** Minute-precision future civil time resolver. Gaps reject; folds require a choice. */
export function resolveLocalTime(date, time, timeZone, disambiguation) {
  const naive = validateCivil(date, time);
  formatter(timeZone);
  const offsets = new Set();
  for (let hour = -48; hour <= 48; hour += 6) {
    const probe = naive + hour * 3600000, p = partsAt(probe, timeZone);
    offsets.add(Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - probe);
  }
  const candidates = [...offsets].map(offset => naive - offset).filter(epoch => {
    const p = partsAt(epoch, timeZone);
    return `${p.year}-${p.month}-${p.day}` === date && `${p.hour}:${p.minute}` === time;
  }).sort((a, b) => a - b).map(epoch => new Date(epoch).toISOString());
  if (!candidates.length) fail('DST_GAP', 'Diese Uhrzeit existiert wegen der Zeitumstellung nicht. Wähle eine andere Zeit.');
  if (candidates.length > 1 && !['earlier', 'later'].includes(disambiguation))
    fail('DST_AMBIGUOUS', 'Diese Uhrzeit kommt zweimal vor. Wähle die erste oder zweite Uhrzeit.', { candidates });
  return { instant: disambiguation === 'later' ? candidates.at(-1) : candidates[0], ambiguous: candidates.length > 1, disambiguation: candidates.length > 1 ? disambiguation : null };
}

export function monthGrid(year, month, weekStartsOn = 1) {
  if (!Number.isInteger(year) || year < 1000 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12 || ![0, 1].includes(weekStartsOn)) fail('INVALID_MONTH', 'Ungültiger Kalendermonat.');
  const first = Date.UTC(year, month - 1, 1), weekday = new Date(first).getUTCDay();
  const offset = (weekday - weekStartsOn + 7) % 7;
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(first + (i - offset) * 86400000);
    return { date: date.toISOString().slice(0, 10), inMonth: date.getUTCMonth() === month - 1 };
  });
}

/** Explicitly separate backend support from a usable local editorial plan. */
export function publishingEligibility(post, { capabilities = {}, accounts = {}, executorReady = false } = {}) {
  const reasons = [];
  if (post.savedRevision !== post.revision) reasons.push('UNSAVED');
  if (post.deletedAt) reasons.push('POST_DELETED');
  if (post.requireReview && (post.review?.status !== 'approved' || post.review.revision !== post.revision)) reasons.push('APPROVAL_REQUIRED');
  if (validatePost(post, capabilities).some(i => i.severity === 'error')) reasons.push('VALIDATION_FAILED');
  if (!executorReady) reasons.push('PUBLISHER_UNAVAILABLE');
  for (const target of post.targets) {
    if (!accounts[target.id]?.connected) reasons.push(`ACCOUNT_NOT_CONNECTED:${target.id}`);
    if (capabilities[target.channel]?.publishingVerified !== true) reasons.push(`PROVIDER_NOT_VERIFIED:${target.channel}`);
  }
  return { eligible: reasons.length === 0, reasons };
}

export function summarizeDelivery(results) {
  if (!results.length) return 'not_sent';
  const all = status => results.every(r => r.status === status);
  if (all('published')) return 'published';
  if (results.some(r => r.status === 'unknown')) return 'needs_reconciliation';
  if (results.some(r => ['queued', 'sending'].includes(r.status))) return 'in_progress';
  if (results.some(r => r.status === 'published')) return 'partially_published';
  if (all('failed')) return 'failed';
  return 'not_sent';
}

export function retryableTargets(results) {
  // Unknown outcomes must be reconciled first, to avoid duplicate external posts.
  return results.filter(r => r.status === 'failed' && r.retryable === true).map(r => r.targetId);
}

/** Serialize saves, retain latest snapshot after failure, never claim unacknowledged persistence. */
export function createAutosaver(write, onState = () => {}) {
  let latest = null, version = 0, saved = 0, running = null, state = { status: 'idle', revision: 0, savedRevision: 0, error: null };
  const emit = (status, error = null) => { state = { status, revision: version, savedRevision: saved, error }; onState({ ...state }); };
  async function drain() {
    while (saved < version) {
      const revision = version, snapshot = clone(latest); emit('saving');
      try { await write(snapshot, revision); saved = revision; }
      catch (error) { emit('error', error); throw error; }
    }
    emit('saved');
  }
  return {
    update(snapshot) { latest = clone(snapshot); version += 1; emit('dirty'); return version; },
    flush() {
      if (!running) running = drain().finally(() => { running = null; });
      return running;
    },
    getState() { return { ...state }; },
    hasUnsavedChanges() { return saved < version; }
  };
}

/** Local storage adapter. Errors remain visible; caller decides export/retry/reset. */
export function createLocalStore(storage, key = 'social-planner:v1') {
  return {
    load() {
      const raw = storage.getItem(key);
      if (raw === null) return { schemaVersion: 1, posts: [] };
      let data;
      try { data = JSON.parse(raw); } catch { fail('STORAGE_CORRUPT', 'Gespeicherte Daten sind beschädigt. Exportiere sie vor einem Zurücksetzen.'); }
      if (data?.schemaVersion !== 1 || !Array.isArray(data.posts)) fail('STORAGE_SCHEMA', 'Dieses Speicherformat wird nicht unterstützt.');
      return data;
    },
    save(data) {
      if (data?.schemaVersion !== 1 || !Array.isArray(data.posts)) fail('STORAGE_SCHEMA', 'Dieses Speicherformat wird nicht unterstützt.');
      storage.setItem(key, JSON.stringify(data)); // Quota/security exceptions deliberately propagate.
      return { saved: true, scope: 'this_browser' };
    },
    exportRaw() { return storage.getItem(key); }
  };
}
