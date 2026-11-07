/** Synthetic schema-v1 data and deterministic async controls. No network or storage. */
import { WORKSPACE_POLICY } from '../../public/workspace-client.js';

export const wid = 'workspace-00000001';
export const writeId = 'operation-00000001';
export const clone = value => structuredClone(value);

export function payload(overrides = {}) {
  return {
    title: '  Unfinished title\r\n',
    tags: ['A, B', '', 'duplicate', 'duplicate', ' quote " '],
    rawTags: ' "A, B",,duplicate,duplicate,"unfinished',
    baselineRenderedTags: '"A, B",,duplicate,duplicate," quote "" "',
    text: 'Base text\r\n  with whitespace  ',
    variantTexts: { linkedin: '', instagram: 'Base text\r\n  with whitespace  ' },
    channels: ['linkedin', 'instagram'],
    date: '2026-1-',
    time: '2:',
    timeZone: ' Europe/Unfinished ',
    media: null,
    cover: null,
    activeTextTarget: 'linkedin',
    localMediaOmitted: true,
    ...overrides,
  };
}

export function mutation(overrides = {}) {
  return {
    workspaceId: wid,
    expectedRevision: 0,
    writeId,
    sourcePostId: 'post-1',
    basePlannerRevision: 7,
    payload: payload(),
    ...overrides,
  };
}

export function workspace(overrides = {}) {
  return {
    workspaceId: wid,
    revision: 1,
    state: 'active',
    writeId,
    sourcePostId: 'post-1',
    basePlannerRevision: 7,
    currentPlannerRevision: 7,
    sourceExists: true,
    createdAtMs: 1000,
    updatedAtMs: 1000,
    expiresAtMs: 1000 + WORKSPACE_POLICY.resumeWindowMs,
    resolvedMedia: null,
    mediaMetadataConflict: false,
    payload: payload(),
    ...overrides,
  };
}

export function saved(request, overrides = {}) {
  return workspace({
    workspaceId: request.workspaceId,
    revision: request.expectedRevision + 1,
    writeId: request.writeId,
    sourcePostId: request.sourcePostId,
    basePlannerRevision: request.basePlannerRevision,
    sourceExists: request.sourcePostId === null ? null : true,
    payload: clone(request.payload),
    ...overrides,
  });
}

export function discarded(request, overrides = {}) {
  return {
    workspaceId: request.workspaceId,
    revision: request.expectedRevision + 1,
    state: 'discarded',
    writeId: request.writeId,
    lastOperation: 'discard',
    updatedAtMs: 2000,
    expiresAtMs: 1000 + WORKSPACE_POLICY.resumeWindowMs,
    ...overrides,
  };
}

export function closed(request, overrides = {}) {
  return {
    workspaceId: request.workspaceId,
    currentRevision: request.expectedRevision + 1,
    state: 'discarded',
    writeId: request.writeId,
    lastOperation: 'discard',
    ...overrides,
  };
}

export function summary(w = workspace()) {
  const { payload: p, resolvedMedia, ...metadata } = w;
  return { ...metadata, title: p.title, preview: p.text.slice(0, 160) };
}

export function listing(workspaces = [summary()], total = workspaces.length) {
  return {
    schemaVersion: 1,
    policy: { ...WORKSPACE_POLICY },
    capacity: {
      active: workspaces.length,
      total,
      activeRemaining: WORKSPACE_POLICY.activeLimit - workspaces.length,
      totalRemaining: WORKSPACE_POLICY.totalLimit - total,
    },
    workspaces,
  };
}

export const jsonResponse = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
});
export const error = (status = 503, code = 'WORKSPACE_STORAGE_UNCERTAIN', extra = {}) =>
  Object.assign(new Error('Synthetic workspace failure'), { status, code }, extra);

export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

export async function settle() {
  for (let n = 0; n < 12; n++) await Promise.resolve();
}

export function timers() {
  let next = 0;
  const callbacks = new Map();
  return {
    setTimer(callback, delay) { const id = ++next; callbacks.set(id, { callback, delay }); return id; },
    clearTimer(id) { callbacks.delete(id); },
    get size() { return callbacks.size; },
    get delays() { return [...callbacks.values()].map(v => v.delay); },
    async fire() {
      const current = [...callbacks.values()];
      callbacks.clear();
      for (const { callback } of current) callback();
      await settle();
    },
  };
}
