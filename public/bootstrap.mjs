import { CHANNELS } from './model.js';
import { createTaktStore } from './data-client/takt-adapter.mjs';

window.TaktConfig = {
  storageMode: 'server',
  timezone: 'Europe/Berlin',
  storageLabel: 'Lokal in dieser Entwicklungsumgebung gespeichert.',
  storageDescription: 'Die Planung und Bilder werden auf dem Datenträger dieser Entwicklungsumgebung gespeichert. Dies ist ein gemeinsamer lokaler Testarbeitsbereich ohne Anmeldung. Keine vertraulichen Daten eingeben. Die Daten überstehen einen Serverneustart, sind aber nicht gesichert oder geräteübergreifend verfügbar.',
  storageTitle: 'Lokaler Entwicklungsspeicher',
  environmentLabel: 'Lokaler Prototyp',
  scheduleButtonLabel: 'Im Prototyp einplanen'
};
window.TaktStore = createTaktStore({
  timezone: window.TaktConfig.timezone,
  channels: CHANNELS,
  onTimezone: timezone => { window.TaktConfig.timezone = timezone; }
});
await import('./app.js');
