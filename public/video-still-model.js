import {inspectMP4Tracks} from './video-still-mp4-inspection.js';
import {inspectWebMTracks} from './video-still-webm-inspection.js';

// A deliberately narrow container profile. This checks metadata, not arbitrary
// compressed payloads; a successful preflight is not a codec/browser promise.
export const VIDEO_STILL_LIMITS = Object.freeze({
 inputBytes: 8 * 1024 * 1024,
 sourcePixels: 1280 * 720,
 sourceSide: 1280,
 durationSeconds: 600,
 imageBytes: 20 * 1024 * 1024,
 imageSide: 2048,
 stageTimeoutMs: 15000,
});

export function validateStillSource(file) {
 if (!file || !['video/mp4', 'video/webm'].includes(file.type) ||
     !Number.isSafeInteger(file.size) || file.size < 1 || file.size > VIDEO_STILL_LIMITS.inputBytes ||
     typeof file.arrayBuffer !== 'function') {
  throw Error('Bitte eine lokale MP4- oder WebM-Datei mit höchstens 8 MiB auswählen.');
 }
 return file.type;
}

export function validateStillDimensions(width, height) {
 if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 ||
     width > VIDEO_STILL_LIMITS.sourceSide || height > VIDEO_STILL_LIMITS.sourceSide ||
     width * height > VIDEO_STILL_LIMITS.sourcePixels) {
  throw Error('Erlaubt sind höchstens 1280 Pixel je Kante und 921.600 Pixel insgesamt, zum Beispiel 1280 × 720.');
 }
 return {width, height};
}

export function inspectStillSource(input, type) {
 if (!(input instanceof Uint8Array) || input.byteLength < 1 || input.byteLength > VIDEO_STILL_LIMITS.inputBytes ||
     !['video/mp4', 'video/webm'].includes(type)) throw Error('Die Videodatei kann nicht begrenzt geprüft werden.');
 let info;
 try {
  info = type === 'video/mp4' ? inspectMP4Tracks(input) : inspectWebMTracks(input);
 } catch {
  throw Error('Die Containerstruktur dieser Datei wird nicht unterstützt oder ist unvollständig.');
 }
 const videos = info.tracks.filter(track => track.type === 1);
 const audio = info.tracks.filter(track => track.type === 2);
 const validVideo = type === 'video/mp4'
  ? /^avc[13]\.[a-f0-9]{6}$/i.test(videos[0]?.codec || '')
  : ['V_VP8', 'V_VP9'].includes(videos[0]?.codec);
 const validAudio = !audio.length || (type === 'video/mp4'
  ? audio[0].codec === 'mp4a.40.2' && audio[0].audioObjectType === 2
  : audio[0].codec === 'A_OPUS');
 if (info.unknownCluster || videos.length !== 1 || audio.length > 1 ||
     info.tracks.some(track => ![1, 2].includes(track.type)) || !validVideo || !validAudio) {
  throw Error('Unterstützt wird nur eine Videospur: MP4 mit H.264 und optional AAC-LC oder WebM mit VP8/VP9 und optional Opus; keine zusätzlichen Spuren.');
 }
 return Object.freeze({...validateStillDimensions(videos[0].width, videos[0].height), type});
}

export function validateDecodedStill(video, inspected) {
 const {width, height} = validateStillDimensions(video.videoWidth, video.videoHeight);
 if (!Number.isFinite(video.duration) || video.duration <= 0 || video.duration > VIDEO_STILL_LIMITS.durationSeconds) {
  throw Error('Die Videodauer muss lesbar sein und darf höchstens 10 Minuten betragen.');
 }
 if (!((width === inspected.width && height === inspected.height) ||
       (width === inspected.height && height === inspected.width))) {
  throw Error('Die gelesenen Bildmaße stimmen nicht mit der vorab geprüften Videospur überein.');
 }
 return {width, height};
}

export function validateStillImage(blob) {
 if (!blob || blob.type !== 'image/png' || !Number.isSafeInteger(blob.size) ||
     blob.size < 1 || blob.size > VIDEO_STILL_LIMITS.imageBytes) {
  throw Error('Das Standbild konnte nicht als PNG bis 20 MiB erzeugt werden.');
 }
 return blob;
}
