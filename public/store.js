import { normalizeState } from './model.js';
/** This integrated edition requires the explicit revision-checked server adapter.
 * No localStorage fallback or implicit migration of old browser-only drafts.
 * Credentials and authorization belong on the server, never in this module. */
const unavailable=()=>new Error('Der serverseitige Speicheradapter fehlt. Diese Version unterstützt keinen Browser-only-Speicher. Vorhandene Browserdaten wurden nicht gelesen oder verändert.');
export const browserStore = {
  async load() { throw unavailable(); },
  async save() { throw unavailable(); }
};
export async function loadInitialState(store = browserStore) {
  const state = await store.load();
  if(!state)throw new Error('Der Speicher hat keinen gültigen Planungszustand geliefert. Es wurden keine Beispieldaten angelegt.');
  return normalizeState(state);
}
