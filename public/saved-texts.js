/** Read-only projection of text already in the loaded planning. No storage or I/O. */
import {hasTextVariant} from './variants.js';
const MAX_TEXT = 20000;
const statuses = {idea:'Idee', draft:'Entwurf', scheduled:'Geplant'};
const usable = text => typeof text === 'string' && text.length <= MAX_TEXT && !!text.trim();
const compact = text => String(text || '').replace(/\s+/g, ' ').trim();
const shorten = (text, limit) => text.length > limit ? text.slice(0, limit - 1) + '…' : text;
export function savedTextIdentity(item) {
 return JSON.stringify([item.postId, item.target, item.text, item.title, item.status, item.channelLabel, item.updatedAt]);
}
export function savedTextCatalog(state, definitions, {available = true} = {}) {
 if (!available || !Array.isArray(state?.posts)) return {available:false, items:[]};
 const items = [], counts = new Map();
 for (const post of state.posts) if (typeof post?.id === 'string') counts.set(post.id, (counts.get(post.id) || 0) + 1);
 for (const post of state.posts) {
  if (typeof post?.id !== 'string' || !post.id || counts.get(post.id) !== 1 || !Object.hasOwn(statuses, post.status)) continue;
  const channels = definitions.filter(channel => post.channels?.includes(channel.id));
  const title = shorten(compact(post.title) || compact(post.text) || 'Ohne Titel', 100);
  const add = (target, text, channelLabel) => {
   if (!usable(text)) return;
   items.push({id:JSON.stringify([post.id, target]), postId:post.id, target, text, title,
    status:statuses[post.status], channelLabel, updatedAt:typeof post.updatedAt === 'string' ? post.updatedAt : '',
    snippet:shorten(compact(text), 180)});
  };
  add('base', post.text, post.status === 'idea' ? 'Ideentext' : `Basistext · ${channels.map(channel => channel.name).join(', ') || 'Ohne Kanal'}`);
  if (post.status !== 'idea') for (const channel of channels) if (hasTextVariant(post, channel.id)) add(channel.id, post.variantTexts[channel.id], `${channel.name} · Eigener Text`);
 }
 items.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
 return {available:true, items};
}
export function filterSavedTexts(items, query = '') {
 const words = compact(query).toLocaleLowerCase('de').split(' ').filter(Boolean);
 return items.filter(item => {
  const haystack = [item.title, item.text, item.status, item.channelLabel].join('\n').toLocaleLowerCase('de');
  return words.every(word => haystack.includes(word));
 });
}
export function resolveSavedText(state, selected, definitions, options) {
 const catalog = savedTextCatalog(state, definitions, options);
 const current = catalog.items.find(item => item.id === selected?.id && savedTextIdentity(item) === savedTextIdentity(selected));
 if (!catalog.available || !current) throw Error('Der gespeicherte Text hat sich geändert. Öffne die Auswahl erneut.');
 return current.text;
}
export function insertSavedText(current, text, selectionEnd) {
 if (typeof current !== 'string' || !usable(text) || !Number.isSafeInteger(selectionEnd) || selectionEnd < 0 || selectionEnd > current.length) throw Error('Die Textposition ist nicht mehr verfügbar. Öffne die Auswahl erneut.');
 if (current.length + text.length > MAX_TEXT) throw Error('Zu lang: Zusammen sind höchstens 20.000 Zeichen möglich.');
 // Even a selected range is retained. Insert immediately after it, never replace.
 return {text:current.slice(0, selectionEnd) + text + current.slice(selectionEnd), start:selectionEnd, end:selectionEnd + text.length};
}
