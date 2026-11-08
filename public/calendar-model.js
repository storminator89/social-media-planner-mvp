import { zonedInstant, isTimeZone } from './model.js';
import { scheduleLocalTime } from './workflows/posting-schedules.mjs';

// Display-only projection. Never overwrite the source time, binding or instant.
export function calendarTime(post, zone) {
  if (post.status !== 'scheduled' || !post.scheduledAt) return null;
  if (!isTimeZone(zone)) throw new Error('Ungültige Kalenderzeitzone.');
  const instant = post.scheduledInstant || zonedInstant(post.scheduledAt, post.timeZone).toISOString();
  return { instant, local: scheduleLocalTime(instant, zone), sourceLocal: post.scheduledAt, sourceZone: post.timeZone };
}
export function calendarPosts(posts, zone) {
  return posts.map(post => ({ ...post, calendarTime: calendarTime(post, zone) }))
    .sort((a, b) => (a.calendarTime?.instant || '').localeCompare(b.calendarTime?.instant || '') || a.id.localeCompare(b.id));
}
export function planningStatus(post, { needsReview = false, now = new Date() } = {}) {
  if (post.status === 'draft') return { label: 'Entwurf', kind: 'draft' };
  if (needsReview) return { label: 'Termin prüfen', kind: 'review' };
  const instant = post.calendarTime?.instant || post.scheduledInstant || (post.scheduledAt ? zonedInstant(post.scheduledAt, post.timeZone).toISOString() : null);
  if (instant && Date.parse(instant) <= now.getTime()) return { label: 'Termin vergangen', kind: 'past' };
  return { label: 'Eingeplant', kind: 'planned' };
}
export function periodSummary(posts, start, end) {
  const selected = posts.filter(p => p.calendarTime && p.calendarTime.local.slice(0, 10) >= start && p.calendarTime.local.slice(0, 10) <= end);
  return { count: selected.length, days: new Set(selected.map(p => p.calendarTime.local.slice(0, 10))).size, channels: new Set(selected.flatMap(p => p.channels)).size };
}
