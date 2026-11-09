import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {VIDEO_STILL_LIMITS, validateStillSource, inspectStillSource, validateDecodedStill, validateStillDimensions, validateStillImage} from '../../public/video-still-model.js';

const mp4 = readFileSync(new URL('./fixtures/source-av.mp4', import.meta.url));
const webm = readFileSync(new URL('./fixtures/reference-av.webm', import.meta.url));

test('real synthetic container fixtures pass metadata preflight, not browser decoding', () => {
 for (const [bytes, type] of [[mp4, 'video/mp4'], [webm, 'video/webm']]) {
  assert.deepEqual(inspectStillSource(bytes, type), {width: 640, height: 360, type});
  assert.equal(validateStillSource(new File([bytes], 'synthetic', {type})), type);
 }
});

test('source type and byte size are strictly bounded before reading', () => {
 for (const type of ['', 'video/quicktime', 'video/mp4;codecs=avc1', 'image/png', 'text/html']) {
  assert.throws(() => validateStillSource(new File([mp4], 'source.mp4', {type})));
 }
 for (const size of [0, -1, Infinity, 1.2, VIDEO_STILL_LIMITS.inputBytes + 1]) {
  assert.throws(() => validateStillSource({type: 'video/mp4', size, arrayBuffer() { assert.fail('No read'); }}));
 }
 assert.throws(() => inspectStillSource(new Uint8Array(VIDEO_STILL_LIMITS.inputBytes + 1), 'video/mp4'));
});

test('truncation, wrong container/MIME and malformed structures fail closed', () => {
 for (const [bytes, type] of [[mp4, 'video/webm'], [webm, 'video/mp4'], [mp4.subarray(0, 30), 'video/mp4'], [webm.subarray(0, 30), 'video/webm']]) {
  assert.throws(() => inspectStillSource(bytes, type), /Containerstruktur/);
 }
 const bad = Buffer.from(mp4), stsd = bad.indexOf('stsd');
 bad.writeUInt32BE(0xffffffff, stsd - 4);
 assert.throws(() => inspectStillSource(bad, 'video/mp4'), /Containerstruktur/);
});

test('oversize declared dimensions are rejected before decoder resource allocation', () => {
 const huge = Buffer.from(mp4), sample = huge.indexOf('avc1', huge.indexOf('stsd'));
 assert.ok(sample > 0);
 huge.writeUInt16BE(16384, sample + 28);
 huge.writeUInt16BE(16384, sample + 30);
 assert.throws(() => inspectStillSource(huge, 'video/mp4'), /1280/);
 for (const dimensions of [[1281, 1], [1, 1281], [1280, 721], [960, 961], [0, 1], [1.5, 2], [NaN, 2]]) {
  assert.throws(() => validateStillDimensions(...dimensions));
 }
 assert.deepEqual(validateStillDimensions(720, 1280), {width: 720, height: 1280});
});

test('codec and track mutations are not accepted as a broad MP4/WebM promise', () => {
 const unsupported = Buffer.from(webm), codec = unsupported.indexOf('V_VP9');
 assert.ok(codec > 0); unsupported.write('V_AV1', codec);
 assert.throws(() => inspectStillSource(unsupported, 'video/webm'), /Videospur/);
 const unknownTrack = Buffer.from(mp4), handler = unknownTrack.indexOf('hdlr');
 unknownTrack.write('text', handler + 12);
 assert.throws(() => inspectStillSource(unknownTrack, 'video/mp4'), /Containerstruktur/);
});

test('decoded dimensions and duration are rechecked, allowing only simple orientation swap', () => {
 const info = inspectStillSource(mp4, 'video/mp4');
 for (const [videoWidth, videoHeight] of [[640, 360], [360, 640]]) assert.deepEqual(
  validateDecodedStill({videoWidth, videoHeight, duration: 3}, info), {width: videoWidth, height: videoHeight});
 for (const duration of [0, -1, Infinity, NaN, 601]) assert.throws(() => validateDecodedStill({videoWidth: 640, videoHeight: 360, duration}, info));
 for (const [videoWidth, videoHeight] of [[1920, 1080], [640, 361], [0, 0]]) assert.throws(() => validateDecodedStill({videoWidth, videoHeight, duration: 3}, info));
});

test('derived output must be a nonempty bounded PNG', () => {
 const png = new Blob(['mock encoded PNG'], {type: 'image/png'});
 assert.equal(validateStillImage(png), png);
 for (const blob of [null, new Blob([], {type: 'image/png'}), new Blob(['x'], {type: 'image/jpeg'}), {size: VIDEO_STILL_LIMITS.imageBytes + 1, type: 'image/png'}]) {
  assert.throws(() => validateStillImage(blob), /PNG/);
 }
});
