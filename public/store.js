import { STORAGE_KEY, createDemoState, normalizeState } from './model.js';
/** Override window.TaktStore before app.js for a server-backed implementation.
 * async load(): State|null; async save(state:State): void.
 * Credentials and authorization belong on the server, never in this store. */
export const browserStore = {
  async load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : null;
  },
  async save(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state)));
  }
};
export async function loadInitialState(store = browserStore) {
  const state = await store.load();
  return state ? normalizeState(state) : createDemoState();
}
