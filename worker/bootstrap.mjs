import {CHANNELS} from './model.js';
import {createTaktStore} from './data-client/takt-adapter.mjs';
window.TaktConfig={
  storageMode:'server',storageLabel:'Server-Speicher',storageTitle:'Geschützter Planer',
  storageDescription:'Planung und Bilder werden für deine Sites-Identität auf dem Server gespeichert. Es ist kein Social-Media-Konto verbunden. Termine lösen keinen Versand aus.',
  environmentLabel:'Planung ohne automatischen Versand',scheduleButtonLabel:'In Planung speichern',timezone:'Europe/Berlin'
};
window.TaktStore=createTaktStore({timezone:window.TaktConfig.timezone,channels:CHANNELS,onTimezone:zone=>{window.TaktConfig.timezone=zone;}});
await import('./app.js');
