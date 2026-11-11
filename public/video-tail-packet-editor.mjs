/** Isolated, bounded VP8/(optional) Opus WebM structural finalizer. No codec decode. */
export const LIMITS = Object.freeze({
  inputBytes: 8 * 1024 * 1024, outputOverheadBytes: 256 * 1024,
  timelineNs: 16_000_000_000, lastVideoFrameDurationNs: 1_000_000_000,
  maxSide: 1280, maxPixels: 1280 * 720, elements: 30000,
  blocks: 2048, clusters: 512, tracks: 2, nesting: 8,
});
export class WebMFinalizationError extends Error {
  constructor(code, message) { super(message); this.name = 'WebMFinalizationError'; this.code = code; }
}
const fail = (code, message) => { throw new WebMFinalizationError(code, message); };
const requireThat = (ok, code, message) => { if (!ok) fail(code, message); };
const ID = Object.freeze({ EBML: 0x1a45dfa3, Segment: 0x18538067, Info: 0x1549a966,
  Tracks: 0x1654ae6b, Cluster: 0x1f43b675, SeekHead: 0x114d9b74, Cues: 0x1c53bb6b,
  Timestamp: 0xe7, SimpleBlock: 0xa3, Duration: 0x4489, Scale: 0x2ad7b1 });
const SEGMENT_IDS = new Set([ID.Info, ID.Tracks, ID.Cluster, ID.SeekHead, ID.Cues]);
function checkpoint(signal) { if (signal?.aborted) fail('ABORTED', 'Finalization was cancelled.'); }
function snapshot(input, max, signal) {
  checkpoint(signal);
  let bytes;
  if (input instanceof Uint8Array) bytes = input;
  else if (input instanceof ArrayBuffer) bytes = new Uint8Array(input);
  else fail('INVALID_INPUT', 'Use a Uint8Array or ArrayBuffer.');
  requireThat(!(typeof SharedArrayBuffer !== 'undefined' && bytes.buffer instanceof SharedArrayBuffer), 'INVALID_INPUT', 'Shared memory is unsupported.');
  requireThat(bytes.byteLength > 0 && bytes.byteLength <= max, 'BYTE_LIMIT', `Input must be nonempty and at most ${max} bytes.`);
  return new Uint8Array(bytes); // Own a stable snapshot. Never mutate the caller's bytes.
}
class Reader {
  constructor(bytes, signal) { this.b = bytes; this.signal = signal; this.count = 0; }
  vint(p, end, id = false) {
    checkpoint(this.signal);
    requireThat(p < end && this.b[p] !== 0, 'INVALID_VINT', 'Missing or invalid EBML VINT.');
    let width = 1, mask = 0x80;
    while (!(this.b[p] & mask)) { width++; mask >>= 1; }
    requireThat(width <= (id ? 4 : 8) && p + width <= end, 'INVALID_VINT', 'Truncated or overlong EBML VINT.');
    let value = BigInt(this.b[p] & (mask - 1));
    for (let i = 1; i < width; i++) value = (value << 8n) | BigInt(this.b[p + i]);
    const unknown = value === (1n << BigInt(7 * width)) - 1n;
    if (id) {
      requireThat(value !== 0n && !unknown, 'INVALID_VINT', 'Reserved EBML element ID.');
      value |= 1n << BigInt(7 * width);
    }
    return { width, value, unknown: !id && unknown };
  }
  element(p, end, depth = 0) {
    requireThat(depth <= LIMITS.nesting && ++this.count <= LIMITS.elements, 'STRUCTURE_LIMIT', 'Element or nesting limit exceeded.');
    const id = this.vint(p, end, true), size = this.vint(p + id.width, end);
    const body = p + id.width + size.width;
    requireThat(size.unknown || size.value <= BigInt(end - body), 'TRUNCATED', 'Element extends beyond its parent.');
    return { id: Number(id.value), start: p, body, end: size.unknown ? end : body + Number(size.value), unknown: size.unknown, sizeWidth: size.width };
  }
  children(e, allowed, depth, repeat = new Set()) {
    requireThat(!e.unknown, 'UNKNOWN_SIZE', 'Only Segment and Cluster may have unknown sizes.');
    const found = new Map();
    for (let p = e.body; p < e.end;) {
      const child = this.element(p, e.end, depth);
      requireThat(allowed.has(child.id), child.id === 0xbf ? 'UNSUPPORTED_CRC' : 'UNSUPPORTED_ELEMENT', `Unsupported element 0x${child.id.toString(16)}.`);
      requireThat(!child.unknown, 'UNKNOWN_SIZE', 'Unknown-sized nested element.');
      requireThat(!found.has(child.id) || repeat.has(child.id), 'DUPLICATE_ELEMENT', `Duplicate element 0x${child.id.toString(16)}.`);
      if (repeat.has(child.id)) { if (!found.has(child.id)) found.set(child.id, []); found.get(child.id).push(child); }
      else found.set(child.id, child);
      p = child.end;
    }
    return found;
  }
  uint(e, max = Number.MAX_SAFE_INTEGER) {
    const value = this.biguint(e);
    requireThat(value <= BigInt(max), 'INTEGER_LIMIT', 'Integer exceeds the supported range.');
    return Number(value);
  }
  biguint(e) {
    requireThat(e && e.end - e.body >= 1 && e.end - e.body <= 8, 'INVALID_INTEGER', 'Unsigned integer must use one to eight bytes.');
    let value = 0n;
    for (let p = e.body; p < e.end; p++) value = (value << 8n) | BigInt(this.b[p]);
    return value;
  }
  float(e) {
    requireThat(e && [4, 8].includes(e.end - e.body), 'INVALID_FLOAT', 'Float must use four or eight bytes.');
    const view = new DataView(this.b.buffer, this.b.byteOffset + e.body, e.end - e.body);
    const value = e.end - e.body === 4 ? view.getFloat32(0) : view.getFloat64(0);
    requireThat(Number.isFinite(value), 'INVALID_FLOAT', 'Non-finite float.');
    return value;
  }
  ascii(e, max = 128) {
    requireThat(e && e.end - e.body > 0 && e.end - e.body <= max, 'INVALID_STRING', 'Missing or oversized string.');
    let s = '';
    for (let p = e.body; p < e.end; p++) { requireThat(this.b[p] >= 32 && this.b[p] <= 126, 'INVALID_STRING', 'Only printable ASCII is supported.'); s += String.fromCharCode(this.b[p]); }
    return s;
  }
  raw(e) { return this.b.subarray(e.start, e.end); }
}
function required(m, id) { requireThat(m.has(id), 'MISSING_ELEMENT', `Missing element 0x${id.toString(16)}.`); return m.get(id); }
function optionalUint(r, m, id, fallback, max) { return m.has(id) ? r.uint(m.get(id), max) : fallback; }
function parseHeader(r, e) {
  requireThat(e.id === ID.EBML && !e.unknown && e.end <= 4096, 'INVALID_HEADER', 'Expected a small finite EBML header.');
  const m = r.children(e, new Set([0x4286, 0x42f7, 0x42f2, 0x42f3, 0x4282, 0x4287, 0x4285]), 1);
  for (const [id, value] of [[0x4286, 1], [0x42f7, 1], [0x42f2, 4], [0x42f3, 8]]) requireThat(r.uint(required(m, id)) === value, 'UNSUPPORTED_HEADER', 'Unsupported EBML version or VINT limits.');
  requireThat(r.ascii(required(m, 0x4282)) === 'webm', 'UNSUPPORTED_HEADER', 'DocType must be webm.');
  const version = r.uint(required(m, 0x4287)), readVersion = r.uint(required(m, 0x4285));
  requireThat(version === 4 && readVersion >= 1 && readVersion <= 2, 'UNSUPPORTED_HEADER', 'The CueRelativePosition output profile requires DocTypeVersion 4 and DocTypeReadVersion 1 or 2.');
}
function parseInfo(r, e) {
  const m = r.children(e, new Set([ID.Scale, ID.Duration, 0x4d80, 0x5741]), 2);
  const scale = r.uint(required(m, ID.Scale), 1_000_000_000);
  requireThat(scale > 0, 'INVALID_TIMING', 'TimestampScale must be positive.');
  r.ascii(required(m, 0x4d80)); r.ascii(required(m, 0x5741));
  const duration = m.has(ID.Duration) ? r.float(m.get(ID.Duration)) : null;
  requireThat(duration === null || (duration > 0 && duration * scale <= LIMITS.timelineNs), 'TIMELINE_LIMIT', 'Original Duration is outside the bounded profile.');
  return { scale, duration, fields: [...m.values()] };
}
function parseTracks(r, e) {
  const m = r.children(e, new Set([0xae]), 2, new Set([0xae]));
  const entries = m.get(0xae) || [];
  requireThat(entries.length >= 1 && entries.length <= LIMITS.tracks, 'TRACK_LIMIT', 'Expected one VP8 track and at most one Opus track.');
  const tracks = [], numbers = new Set(), uids = new Set();
  for (const entry of entries) {
    const f = r.children(entry, new Set([0xd7, 0x73c5, 0x83, 0x55ee, 0x86, 0x63a2, 0xe0, 0xe1, 0x23e383, 0x56aa, 0x56bb, 0x9c, 0xb9, 0x88]), 3);
    const number = r.uint(required(f, 0xd7), 127), uid = r.biguint(required(f, 0x73c5));
    requireThat(number > 0 && uid > 0n && !numbers.has(number) && !uids.has(uid), 'INVALID_TRACK', 'Track numbers and UIDs must be nonzero and unique.');
    numbers.add(number); uids.add(uid);
    const type = r.uint(required(f, 0x83)), codec = r.ascii(required(f, 0x86));
    const defaultDurationNs = f.has(0x23e383) ? r.uint(f.get(0x23e383), LIMITS.lastVideoFrameDurationNs) : null;
    requireThat(defaultDurationNs === null || defaultDurationNs > 0, 'INVALID_TIMING', 'DefaultDuration must be positive.');
    for (const id of [0x56aa, 0x56bb]) requireThat(optionalUint(r, f, id, 0) === 0, 'UNSUPPORTED_DELAY', 'Nonzero CodecDelay or SeekPreRoll is unsupported.');
    for (const id of [0x9c, 0xb9, 0x88]) if (f.has(id)) requireThat(r.uint(f.get(id), 1) === (id === 0x9c ? 0 : 1), 'UNSUPPORTED_TRACK', 'Unsupported track flag.');
    if (f.has(0x55ee)) requireThat(r.uint(f.get(0x55ee), 1) === 1 && type === 1, 'UNSUPPORTED_TRACK', 'Only the video BlockAddID declaration 1 is supported; BlockGroups remain unsupported.');
    const track = { number, uid: uid.toString(), type, codec, defaultDurationNs, blocks: 0, firstTimestampNs: null, lastTimestampNs: null, endNs: null };
    if (type === 1 && codec === 'V_VP8') {
      requireThat(!f.has(0xe1) && !f.has(0x63a2), 'UNSUPPORTED_TRACK', 'Unexpected VP8 audio/private metadata.');
      const v = r.children(required(f, 0xe0), new Set([0xb0, 0xba, 0x53c0, 0x55b0]), 4);
      track.width = r.uint(required(v, 0xb0), LIMITS.maxSide); track.height = r.uint(required(v, 0xba), LIMITS.maxSide);
      requireThat(track.width > 0 && track.height > 0 && track.width * track.height <= LIMITS.maxPixels, 'DIMENSION_LIMIT', 'Video dimensions exceed the bounded profile.');
      track.alphaMode = optionalUint(r, v, 0x53c0, 0, 1);
      if (v.has(0x55b0)) {
        const colour = r.children(v.get(0x55b0), new Set([0x55b1, 0x55b2, 0x55b3, 0x55b4, 0x55b5, 0x55b6, 0x55b7, 0x55b8, 0x55b9, 0x55ba, 0x55bb, 0x55bc, 0x55bd]), 5);
        for (const [id, child] of colour) r.uint(child, [0x55bc, 0x55bd].includes(id) ? 65535 : 255);
      }
    } else if (type === 2 && codec === 'A_OPUS') {
      requireThat(!f.has(0xe0) && defaultDurationNs === null, 'UNSUPPORTED_TRACK', 'Unexpected Opus video/default-duration metadata.');
      const a = r.children(required(f, 0xe1), new Set([0xb5, 0x9f, 0x6264]), 4);
      requireThat(r.float(required(a, 0xb5)) === 48000, 'UNSUPPORTED_AUDIO', 'Opus SamplingFrequency must be 48000.');
      track.channels = r.uint(required(a, 0x9f), 2);
      requireThat(track.channels >= 1, 'UNSUPPORTED_AUDIO', 'Opus must have one or two channels.');
      if (a.has(0x6264)) requireThat([16, 24, 32].includes(r.uint(a.get(0x6264))), 'UNSUPPORTED_AUDIO', 'Unsupported declared audio bit depth.');
      const p = required(f, 0x63a2), b = r.b;
      requireThat(p.end - p.body === 19 && String.fromCharCode(...b.subarray(p.body, p.body + 8)) === 'OpusHead' && b[p.body + 8] === 1 && b[p.body + 9] === track.channels && b[p.body + 18] === 0, 'UNSUPPORTED_OPUS_HEAD', 'Expected version-1 OpusHead with mapping family 0.');
      requireThat(b[p.body + 10] === 0 && b[p.body + 11] === 0, 'UNSUPPORTED_DELAY', 'Nonzero Opus pre-skip is unsupported.');
    } else fail('UNSUPPORTED_CODEC', 'Only VP8 video with optional Opus audio is supported.');
    tracks.push(track);
  }
  requireThat(tracks.filter(t => t.type === 1).length === 1 && tracks.filter(t => t.type === 2).length <= 1, 'UNSUPPORTED_TRACK', 'Expected exactly one video track and at most one audio track.');
  return tracks;
}
function opusDurationNs(b, start, end) {
  requireThat(end - start >= 2, 'INVALID_OPUS', 'Opus packet is too short.');
  const toc = b[start], config = toc >> 3, code = toc & 3;
  const frameNs = config < 12 ? [10, 20, 40, 60][config % 4] * 1e6 : config < 16 ? [10, 20][config % 2] * 1e6 : [2.5, 5, 10, 20][config % 4] * 1e6;
  let count, vbr = false, p = start + 1;
  if (code === 0) count = 1;
  else if (code === 1) count = 2;
  else if (code === 2) { count = 2; vbr = true; }
  else {
    const control = b[p++];
    requireThat((control & 0x40) === 0, 'UNSUPPORTED_OPUS_FRAMING', 'Opus packet padding is unsupported.');
    count = control & 0x3f; vbr = !!(control & 0x80);
  }
  requireThat(count >= 1 && count <= 48 && count * frameNs <= 120e6, 'INVALID_OPUS', 'Invalid Opus frame count or packet duration.');
  if (vbr) {
    let allocated = 0;
    for (let i = 0; i < count - 1; i++) {
      requireThat(p < end, 'INVALID_OPUS', 'Truncated Opus frame-size table.');
      let length = b[p++];
      if (length >= 252) { requireThat(p < end, 'INVALID_OPUS', 'Truncated two-byte Opus frame length.'); length += 4 * b[p++]; }
      // Zero-byte DTX/PLC frames are legal in the RFC but outside this frozen profile.
      requireThat(length > 0 && length <= 1275, 'UNSUPPORTED_OPUS_FRAMING', 'Empty or oversized Opus frame.');
      allocated += length;
    }
    const lastLength = end - p - allocated;
    requireThat(lastLength > 0 && lastLength <= 1275, 'INVALID_OPUS', 'Opus VBR sizes exceed packet bounds.');
  } else {
    const dataLength = end - p;
    requireThat(dataLength > 0 && dataLength % count === 0 && dataLength / count <= 1275, 'INVALID_OPUS', 'Invalid bounded CBR Opus packet framing.');
  }
  return count * frameNs;
}
function parseBlock(r, e, cluster, tracks, scale, blockNumber) {
  const v = r.vint(e.body, e.end);
  requireThat(!v.unknown && v.value >= 1n && v.value <= 127n, 'INVALID_TRACK_REFERENCE', 'Unsupported block track VINT.');
  const track = tracks.find(t => t.number === Number(v.value));
  requireThat(track && e.end - e.body >= v.width + 4, 'INVALID_BLOCK', 'Missing track or truncated block.');
  const at = e.body + v.width, relUnsigned = r.b[at] * 256 + r.b[at + 1], relative = relUnsigned >= 32768 ? relUnsigned - 65536 : relUnsigned;
  const flags = r.b[at + 2], payload = at + 3;
  requireThat((flags & 0x06) === 0, 'UNSUPPORTED_LACING', 'Laced blocks are unsupported.');
  requireThat((flags & 0x78) === 0, 'UNSUPPORTED_BLOCK_FLAGS', 'Reserved or invisible block flags are unsupported.');
  const ticks = cluster.timestamp + relative;
  requireThat(Number.isSafeInteger(ticks) && ticks >= 0 && ticks <= Math.floor(LIMITS.timelineNs / scale), 'INVALID_TIMESTAMP', 'Block timestamp is negative or outside the bounded timeline.');
  const timestampNs = ticks * scale;
  requireThat(track.lastTimestampNs === null || timestampNs > track.lastTimestampNs, 'NON_MONOTONIC_TIMESTAMP', 'Per-track timestamps must strictly increase.');
  let keyframe = false, packetDurationNs = null;
  if (track.type === 1) {
    requireThat(e.end - payload >= 3, 'INVALID_VP8', 'Truncated VP8 frame tag.');
    const tag = r.b[payload] + r.b[payload + 1] * 256 + r.b[payload + 2] * 65536;
    keyframe = (tag & 1) === 0;
    requireThat(((tag >> 1) & 7) <= 3 && (tag & 16) !== 0 && keyframe === !!(flags & 128), 'INVALID_VP8', 'VP8 version/show-frame/keyframe flag mismatch.');
    const uncompressed = keyframe ? 10 : 3;
    requireThat(e.end - payload > uncompressed && (tag >> 5) > 0 && (tag >> 5) <= e.end - payload - uncompressed, 'INVALID_VP8', 'VP8 first partition is out of bounds.');
    if (keyframe) {
      requireThat(r.b[payload + 3] === 0x9d && r.b[payload + 4] === 1 && r.b[payload + 5] === 0x2a, 'INVALID_VP8', 'Invalid VP8 keyframe signature.');
      const width = r.b[payload + 6] + r.b[payload + 7] * 256, height = r.b[payload + 8] + r.b[payload + 9] * 256;
      requireThat(width === track.width && height === track.height, 'INVALID_VP8', 'VP8 dimensions or scaling do not match the supported track.');
    }
    requireThat(track.blocks > 0 || keyframe, 'INVALID_VP8', 'The first video block must be a verified keyframe.');
  } else {
    requireThat((flags & 1) === 0, 'UNSUPPORTED_BLOCK_FLAGS', 'Discardable audio is unsupported.');
    packetDurationNs = opusDurationNs(r.b, payload, e.end);
    requireThat(timestampNs + packetDurationNs <= LIMITS.timelineNs, 'TIMELINE_LIMIT', 'Audio packet end exceeds the bounded timeline.');
    track.endNs = Math.max(track.endNs ?? 0, timestampNs + packetDurationNs);
  }
  track.blocks++;
  if (track.firstTimestampNs === null) track.firstTimestampNs = timestampNs;
  track.lastTimestampNs = timestampNs;
  return { element: e, track: track.number, ticks, timestampNs, keyframe, blockNumber, relativePosition: e.start - cluster.element.body, payload, packetDurationNs };
}
function parseIndexes(r, model) {
  const { seek, cues, top, segment, clusters, video } = model;
  requireThat(!!seek === !!cues, 'INVALID_INDEX', 'SeekHead and Cues must occur together.');
  if (!seek) return;
  requireThat(!segment.unknown && clusters.every(c => !c.element.unknown) && top[0] === seek && top.at(-1) === cues, 'INVALID_INDEX', 'Indexed profile requires finite sizes and canonical index placement.');
  const seeks = r.children(seek, new Set([0x4dbb]), 2, new Set([0x4dbb])).get(0x4dbb) || [];
  requireThat(seeks.length === 3, 'INVALID_INDEX', 'Expected exactly Info, Tracks and Cues seeks.');
  const seen = new Set();
  for (const e of seeks) {
    const f = r.children(e, new Set([0x53ab, 0x53ac]), 3);
    const idElement = required(f, 0x53ab), encoded = r.vint(idElement.body, idElement.end, true);
    requireThat(encoded.width === idElement.end - idElement.body, 'INVALID_INDEX', 'Invalid SeekID.');
    const id = Number(encoded.value), position = r.uint(required(f, 0x53ac), r.b.length), target = top.find(t => t.start - segment.body === position);
    requireThat([ID.Info, ID.Tracks, ID.Cues].includes(id) && !seen.has(id) && target?.id === id, 'INVALID_INDEX', 'Seek target is incorrect or duplicated.');
    seen.add(id);
  }
  const points = r.children(cues, new Set([0xbb]), 2, new Set([0xbb])).get(0xbb) || [];
  const expected = clusters.flatMap(c => c.blocks.filter(b => b.keyframe).map(b => ({ c, b })));
  requireThat(points.length === expected.length && points.length > 0, 'INVALID_INDEX', 'Every verified video keyframe must have exactly one cue.');
  points.forEach((point, i) => {
    const f = r.children(point, new Set([0xb3, 0xb7]), 3), p = r.children(required(f, 0xb7), new Set([0xf7, 0xf1, 0xf0, 0x5378]), 4);
    const { c, b } = expected[i];
    requireThat(r.uint(required(f, 0xb3)) === b.ticks && r.uint(required(p, 0xf7)) === video.number && r.uint(required(p, 0xf1)) === c.element.start - segment.body && r.uint(required(p, 0xf0)) === b.relativePosition && r.uint(required(p, 0x5378)) === b.blockNumber, 'INVALID_INDEX', 'Cue does not resolve to its verified video keyframe.');
  });
}
function parse(bytes, signal) {
  const r = new Reader(bytes, signal), header = r.element(0, bytes.length);
  parseHeader(r, header);
  const segment = r.element(header.end, bytes.length);
  requireThat(segment.id === ID.Segment && segment.end === bytes.length, 'INVALID_SEGMENT', 'Expected exactly one Segment through end of file.');
  const model = { r, bytes, header, segment, top: [], info: null, tracksElement: null, tracks: null, clusters: [], seek: null, cues: null, blocks: 0 };
  let p = segment.body;
  while (p < segment.end) {
    checkpoint(signal);
    const e = r.element(p, segment.end, 1);
    requireThat(SEGMENT_IDS.has(e.id), e.id === 0xbf ? 'UNSUPPORTED_CRC' : 'UNSUPPORTED_ELEMENT', `Unsupported Segment child 0x${e.id.toString(16)}.`);
    requireThat(!e.unknown || e.id === ID.Cluster, 'UNKNOWN_SIZE', 'Only Segment and Cluster may have unknown sizes.');
    model.top.push(e);
    if (e.id === ID.Info) {
      requireThat(!model.info && !model.tracks && model.clusters.length === 0, 'DUPLICATE_ELEMENT', 'Info must occur once before Tracks.');
      model.info = parseInfo(r, e); model.infoElement = e;
    } else if (e.id === ID.Tracks) {
      requireThat(model.info && !model.tracks && model.clusters.length === 0, 'DUPLICATE_ELEMENT', 'Tracks must occur once after Info and before Clusters.');
      model.tracks = parseTracks(r, e); model.tracksElement = e;
    } else if (e.id === ID.Cluster) {
      requireThat(model.tracks && !model.cues, 'INVALID_STRUCTURE', 'Clusters must follow Tracks and precede Cues.');
      requireThat(model.clusters.length < LIMITS.clusters, 'STRUCTURE_LIMIT', 'Too many Clusters.');
      const cluster = { element: e, timestamp: null, blocks: [] };
      let q = e.body;
      while (q < e.end) {
        const child = r.element(q, e.end, 2);
        // Unknown Cluster ends at a schema-level sibling, only at a parsed child boundary.
        if (e.unknown && SEGMENT_IDS.has(child.id)) { e.end = q; break; }
        requireThat(!child.unknown, 'UNKNOWN_SIZE', 'Unknown-sized Cluster child.');
        if (child.id === ID.Timestamp) {
          requireThat(cluster.timestamp === null && cluster.blocks.length === 0, 'DUPLICATE_ELEMENT', 'Cluster Timestamp must occur once before blocks.');
          cluster.timestamp = r.uint(child, Math.floor(LIMITS.timelineNs / model.info.scale));
          requireThat(!model.clusters.length || cluster.timestamp >= model.clusters.at(-1).timestamp, 'NON_MONOTONIC_TIMESTAMP', 'Cluster timestamps must not decrease.');
        } else if (child.id === ID.SimpleBlock) {
          requireThat(cluster.timestamp !== null, 'MISSING_ELEMENT', 'Cluster Timestamp must precede its blocks.');
          requireThat(++model.blocks <= LIMITS.blocks, 'STRUCTURE_LIMIT', 'Too many blocks.');
          cluster.blocks.push(parseBlock(r, child, cluster, model.tracks, model.info.scale, cluster.blocks.length + 1));
        } else fail(child.id === 0xbf ? 'UNSUPPORTED_CRC' : 'UNSUPPORTED_ELEMENT', `Unsupported Cluster child 0x${child.id.toString(16)}.`);
        q = child.end;
      }
      requireThat(cluster.timestamp !== null && cluster.blocks.length > 0, 'INVALID_CLUSTER', 'Empty or untimed Cluster.');
      model.clusters.push(cluster);
    } else if (e.id === ID.SeekHead) {
      requireThat(!model.seek && model.top.length === 1, 'INVALID_INDEX', 'SeekHead must occur once at Segment start.'); model.seek = e;
    } else if (e.id === ID.Cues) {
      requireThat(!model.cues && model.clusters.length > 0 && e.end === segment.end, 'INVALID_INDEX', 'Cues must occur once at Segment end.'); model.cues = e;
    }
    p = e.end;
  }
  requireThat(model.info && model.tracks && model.clusters.length > 0 && model.tracks.every(t => t.blocks > 0), 'MISSING_ELEMENT', 'Missing Info, Tracks, Clusters or track media.');
  model.video = model.tracks.find(t => t.type === 1);
  model.audioEndNs = Math.max(0, ...model.tracks.filter(t => t.type === 2).map(t => t.endNs));
  parseIndexes(r, model);
  checkpoint(signal);
  return model;
}
function summary(m) {
  return {
    profile: 'bounded-vp8-opus-no-padding-v1', inputBytes: m.bytes.length,
    timestampScaleNs: m.info.scale, lastVideoTimestampSeconds: m.video.lastTimestampNs / 1e9,
    lastVideoTimestampNs: m.video.lastTimestampNs, lastVideoTimestamp: m.video.lastTimestampNs / 1e9,
    originalDefaultDurationNs: m.video.defaultDurationNs,
    requiresDeclaredVideoEnd: m.video.defaultDurationNs === null,
    audioEndSeconds: m.audioEndNs / 1e9,
    originalDurationSeconds: m.info.duration === null ? null : m.info.duration * m.info.scale / 1e9,
    tracks: m.tracks.map(t => ({ ...t })),
    stats: { tracks: m.tracks.length, videoBlocks: m.video.blocks, audioBlocks: m.tracks.filter(t => t.type === 2).reduce((n, t) => n + t.blocks, 0), blocks: m.blocks,
      clusters: m.clusters.length, keyframes: m.clusters.reduce((n, c) => n + c.blocks.filter(b => b.keyframe).length, 0),
      unknownSizeClusters: m.clusters.filter(c => c.element.unknown).length, unknownSizeSegment: m.segment.unknown,
      indexed: !!m.seek, indexTargetsVerified: !!m.seek, elementsParsed: m.r.count },
  };
}
/** Read-only bounded analysis. This validates only this module's strict index profile. */
export function analyzeWebM(input, { signal } = {}) {
  return summary(parse(snapshot(input, LIMITS.inputBytes, signal), signal));
}
function join(parts, max = LIMITS.inputBytes) {
  const length = parts.reduce((sum, p) => sum + p.length, 0);
  requireThat(length <= max, 'OUT_OF_BUDGET', 'Constructed output exceeds the 8 MiB byte limit.');
  const out = new Uint8Array(length); let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}
function uintBytes(value, width = 0) {
  let n = BigInt(value);
  requireThat(n >= 0n && n < (1n << 64n), 'INTEGER_LIMIT', 'Output integer is outside uint64.');
  if (!width) { width = 1; while (n >= (1n << BigInt(8 * width))) width++; }
  requireThat(width >= 1 && width <= 8 && n < (1n << BigInt(8 * width)), 'INTEGER_LIMIT', 'Output integer does not fit.');
  const result = new Uint8Array(width);
  for (let i = width - 1; i >= 0; i--) { result[i] = Number(n & 255n); n >>= 8n; }
  return result;
}
function idBytes(id) { return uintBytes(id); }
function sizeBytes(size, preferredWidth = 0) {
  let width = preferredWidth || 1;
  while (BigInt(size) >= (1n << BigInt(7 * width)) - 1n) width++;
  requireThat(width <= 8, 'BYTE_LIMIT', 'Element size cannot be encoded.');
  return uintBytes(BigInt(size) | (1n << BigInt(7 * width)), width);
}
function element(id, body, width = 0) { return join([idBytes(id), sizeBytes(body.length, width), body]); }
function uintElement(id, value, width = 0) { return element(id, uintBytes(value, width)); }
function equalBytes(a, b, signal) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) { if ((i & 65535) === 0) checkpoint(signal); if (a[i] !== b[i]) return false; }
  return true;
}
function verifyPreservation(before, after, durationSeconds, signal) {
  requireThat(after.segment.unknown === false && after.clusters.every(c => !c.element.unknown) && after.seek && after.cues && before.blocks === after.blocks && before.clusters.length === after.clusters.length, 'INTERNAL_VERIFICATION', 'Output structure failed verification.');
  requireThat(equalBytes(before.r.raw(before.header), after.r.raw(after.header), signal) && equalBytes(before.r.raw(before.tracksElement), after.r.raw(after.tracksElement), signal), 'INTERNAL_VERIFICATION', 'Header/Tracks preservation failed.');
  const fields = m => m.info.fields.filter(e => e.id !== ID.Duration).map(e => m.r.raw(e));
  const a = fields(before), b = fields(after);
  requireThat(a.length === b.length && a.every((part, i) => equalBytes(part, b[i], signal)), 'INTERNAL_VERIFICATION', 'Info preservation failed.');
  before.clusters.forEach((c, i) => requireThat(equalBytes(before.bytes.subarray(c.element.body, c.element.end), after.bytes.subarray(after.clusters[i].element.body, after.clusters[i].element.end), signal), 'INTERNAL_VERIFICATION', 'Cluster/media preservation failed.'));
  requireThat(Math.abs(after.info.duration * after.info.scale / 1e9 - durationSeconds) <= 1e-12, 'INTERNAL_VERIFICATION', 'Written Duration mismatch.');
}
/** Adds structure/indexes; never infers a terminal video hold from cadence or wall time. */
export function finalizeWebM(input, { lastVideoFrameDurationNs, signal } = {}) {
  const bytes = snapshot(input, LIMITS.inputBytes, signal), m = parse(bytes, signal);
  requireThat(!m.seek && !m.cues, 'EXISTING_INDEX', 'Already-indexed input is not rewritten by this prototype.');
  let hold = m.video.defaultDurationNs, durationSource = 'ORIGINAL_DEFAULT_DURATION';
  if (lastVideoFrameDurationNs !== undefined) {
    requireThat(typeof lastVideoFrameDurationNs === 'number' && Number.isSafeInteger(lastVideoFrameDurationNs) && lastVideoFrameDurationNs > 0 && lastVideoFrameDurationNs <= LIMITS.lastVideoFrameDurationNs, 'INVALID_VIDEO_END', 'Declared final-frame hold must be an integer number of nanoseconds greater than zero and at most one second.');
    requireThat(hold === null || hold === lastVideoFrameDurationNs, 'END_POLICY_CONFLICT', 'Caller hold conflicts with original DefaultDuration.');
  }
  if (hold === null) {
    requireThat(lastVideoFrameDurationNs !== undefined, 'VIDEO_END_REQUIRED', 'The source has no explicit final-frame duration. Supply a deliberately chosen lastVideoFrameDurationNs; this is a new end-of-presentation policy, not a recovered source fact.');
    hold = lastVideoFrameDurationNs; durationSource = 'DECLARED_LAST_VIDEO_FRAME_DURATION';
  }
  const videoEndNs = m.video.lastTimestampNs + hold;
  requireThat(videoEndNs >= m.audioEndNs, 'END_BEFORE_AUDIO_END', 'Video end precedes the preserved audio end. Choose an explicit final hold that covers the audio; this prototype does not silently extend or cut either track.');
  const durationNs = videoEndNs;
  requireThat(durationNs > 0 && durationNs <= LIMITS.timelineNs, 'TIMELINE_LIMIT', 'Final presentation end exceeds sixteen seconds.');
  const durationSeconds = durationNs / 1e9;
  const durationPayload = new Uint8Array(8);
  new DataView(durationPayload.buffer).setFloat64(0, durationNs / m.info.scale);
  const info = element(ID.Info, join([...m.info.fields.filter(e => e.id !== ID.Duration).map(e => m.r.raw(e)), element(ID.Duration, durationPayload)]));
  const tracks = m.r.raw(m.tracksElement);
  const clusters = m.clusters.map(c => { checkpoint(signal); return element(ID.Cluster, bytes.subarray(c.element.body, c.element.end), c.element.sizeWidth); });
  const makeSeek = positions => element(ID.SeekHead, join([ID.Info, ID.Tracks, ID.Cues].map((id, i) => element(0x4dbb, join([element(0x53ab, idBytes(id)), uintElement(0x53ac, positions[i], 8)])))));
  const seekLength = makeSeek([0, 0, 0]).length, infoPosition = seekLength, tracksPosition = infoPosition + info.length;
  let nextPosition = tracksPosition + tracks.length;
  const clusterPositions = clusters.map(c => { const position = nextPosition; nextPosition += c.length; return position; });
  const cuesPosition = nextPosition, cueParts = [];
  m.clusters.forEach((c, i) => {
    for (const b of c.blocks) if (b.keyframe) {
      checkpoint(signal);
      cueParts.push(element(0xbb, join([uintElement(0xb3, b.ticks), element(0xb7, join([uintElement(0xf7, m.video.number), uintElement(0xf1, clusterPositions[i], 8), uintElement(0xf0, b.relativePosition, 8), uintElement(0x5378, b.blockNumber)]))])));
    }
  });
  const cues = element(ID.Cues, join(cueParts)), seek = makeSeek([infoPosition, tracksPosition, cuesPosition]);
  const output = join([m.r.raw(m.header), element(ID.Segment, join([seek, info, tracks, ...clusters, cues]), m.segment.sizeWidth)]);
  requireThat(output.length <= bytes.length + LIMITS.outputOverheadBytes, 'BYTE_LIMIT', 'Index overhead limit exceeded.');
  checkpoint(signal);
  const checked = parse(output, signal);
  verifyPreservation(m, checked, durationSeconds, signal);
  const warnings = [
    'Structural finalization only. No audio/video synchronization, missing encoded frames, or capture cadence is corrected.',
    'Codec payloads and timestamps are preserved, not decoded or proven safe. Browser seek/end and cross-browser acceptance require separate review.',
    'Opus preroll metadata is not added. Seeking fidelity, including decoder warm-up, remains a separate review gate.',
  ];
  if (durationSource.startsWith('DECLARED')) warnings.unshift('The final video-frame hold is caller-declared new presentation-end policy, not recovered source timing. No DefaultDuration is inserted.');
  if (m.video.alphaMode) warnings.push('Original AlphaMode metadata is preserved; alpha-plane behavior is not decoded or verified.');
  if (m.info.duration !== null) warnings.push('Original Info Duration was replaced using the supported explicit endpoint model.');
  checkpoint(signal);
  return { bytes: output, durationSeconds, durationSource, status: 'needs_review', warnings,
    stats: { ...summary(checked).stats, inputBytes: bytes.length, outputBytes: output.length, lastVideoTimestampSeconds: m.video.lastTimestampNs / 1e9,
      lastVideoFrameDurationNs: hold, videoEndSeconds: videoEndNs / 1e9, audioEndSeconds: m.audioEndNs / 1e9,
      tracksByteIdentical: true, clusterBodiesByteIdentical: true, compressedPayloadsAndTimestampsPreserved: true,
      durationSource, originalDefaultDurationNs: m.video.defaultDurationNs } };
}

/** Remove audio, retaining every encoded video block and its exact timeline.
 * Strict existing bounded WebM profile only. No decoding, resampling or capture.
 * Requires a finite declared source duration: no guessed presentation endpoint.
 * Existing indexes are validated when present; their presence is not required.
 */
export function removeWebMAudio(input, { signal } = {}) {
  const bytes = snapshot(input, LIMITS.inputBytes, signal), m = parse(bytes, signal);
  requireThat(m.info.duration !== null && m.info.duration > 0, 'FINITE_DURATION_REQUIRED', 'A finite source presentation duration is required.');
  const endNs = m.info.duration * m.info.scale;
  requireThat(Number.isFinite(endNs) && endNs <= LIMITS.timelineNs && endNs > m.video.lastTimestampNs, 'INVALID_VIDEO_END', 'Source duration must follow the last video timestamp and fit the bounded timeline.');
  requireThat(m.tracks.some(t => t.type === 2), 'NO_AUDIO', 'This video already has no audio track.');
  const entries = m.r.children(m.tracksElement, new Set([0xae]), 2, new Set([0xae])).get(0xae);
  const videoEntry = entries.find(e => {
    const f = m.r.children(e, new Set([0xd7, 0x73c5, 0x83, 0x55ee, 0x86, 0x63a2, 0xe0, 0xe1, 0x23e383, 0x56aa, 0x56bb, 0x9c, 0xb9, 0x88]), 3);
    return m.r.uint(required(f, 0xd7)) === m.video.number;
  });
  const tracks = element(ID.Tracks, m.r.raw(videoEntry));
  // Rebuild clusters; preserve full video block bytes including flags and timestamps.
  // Audio-only clusters disappear. Old indexes cannot survive changed byte offsets.
  const clusters = m.clusters.flatMap(c => {
    checkpoint(signal);
    const blocks = c.blocks.filter(b => b.track === m.video.number);
    return blocks.length ? [element(ID.Cluster, join([uintElement(ID.Timestamp, c.timestamp), ...blocks.map(b => m.r.raw(b.element))]))] : [];
  });
  const stripped = join([m.r.raw(m.header), element(ID.Segment, join([m.r.raw(m.infoElement), tracks, ...clusters]))]);
  // Reuse the existing index writer, using the input's declared endpoint rather than guessing.
  const hold = endNs - m.video.lastTimestampNs;
  requireThat(Number.isSafeInteger(hold) && hold > 0 && hold <= LIMITS.lastVideoFrameDurationNs, 'INVALID_VIDEO_END', 'The declared source endpoint cannot be represented by this bounded finalizer.');
  const result = finalizeWebM(stripped, { lastVideoFrameDurationNs: hold, signal });
  const checked = parse(result.bytes, signal);
  const beforeBlocks = m.clusters.flatMap(c => c.blocks.filter(b => b.track === m.video.number));
  const afterBlocks = checked.clusters.flatMap(c => c.blocks);
  requireThat(checked.tracks.length === 1 && checked.audioEndNs === 0 && afterBlocks.length === beforeBlocks.length && beforeBlocks.every((b, i) => b.timestampNs === afterBlocks[i].timestampNs && equalBytes(m.r.raw(b.element), checked.r.raw(afterBlocks[i].element), signal)), 'INTERNAL_VERIFICATION', 'Video packet preservation failed.');
  requireThat(equalBytes(m.r.raw(videoEntry), checked.r.raw(checked.r.children(checked.tracksElement, new Set([0xae]), 2, new Set([0xae])).get(0xae)[0]), signal), 'INTERNAL_VERIFICATION', 'Video track preservation failed.');
  return { bytes: result.bytes, status: 'needs_review', operation: 'remove_audio', durationSeconds: endNs / 1e9,
    stats: { inputBytes: bytes.length, outputBytes: result.bytes.length, videoBlocks: afterBlocks.length, audioTracks: 0, videoPacketsAndTimestampsPreserved: true, sourceDurationPreserved: true },
    warnings: ['Only the bounded VP8/Opus WebM profile is supported.', 'Audio is intentionally removed. Video quality and timing are preserved at packet level, not certified by this structural check.', 'No trim, crop, re-encoding, MP4, Safari or production acceptance is implied.'] };
}

/** Experimental end-only edit: unchanged encoded prefixes, shorter final visible hold.
 * Not arbitrary trimming, retiming, or a correction of existing source A/V defects. */
function tailModel(input,signal){
 const bytes=snapshot(input,LIMITS.inputBytes,signal),m=parse(bytes,signal);
 requireThat(m.info.duration!==null,'FINITE_DURATION_REQUIRED','A finite source duration is required.');
 const sourceEndNs=m.info.duration*m.info.scale;
 requireThat(Number.isSafeInteger(sourceEndNs)&&sourceEndNs>m.video.lastTimestampNs&&sourceEndNs>=m.audioEndNs,'INVALID_SOURCE_END','The finite source endpoint must cover all original media.');
 requireThat(m.video.defaultDurationNs===null,'DEFAULT_DURATION_UNSUPPORTED','This experiment requires absent video DefaultDuration.');
 requireThat(m.tracks.some(t=>t.type===2),'AUDIO_REQUIRED','This experiment requires an original Opus track.');
 const all=m.clusters.flatMap(c=>c.blocks),video=all.filter(b=>b.track===m.video.number),audio=all.filter(b=>b.track!==m.video.number);
 const eligible=[];
 for(let i=0;i<audio.length-1;i++){
  checkpoint(signal);const cutNs=audio[i].timestampNs+audio[i].packetDurationNs;
  if(!Number.isSafeInteger(cutNs)||cutNs>=sourceEndNs||audio.some(b=>b.timestampNs<cutNs&&b.timestampNs+b.packetDurationNs>cutNs))continue;
  const keptAudio=audio.filter(b=>b.timestampNs+b.packetDurationNs<=cutNs);
  if(keptAudio.length!==i+1||audio.slice(i+1).some(b=>b.timestampNs<cutNs))continue;
  const removed=video.findIndex(b=>b.timestampNs>=cutNs);if(removed<1)continue;
  const last=video[removed-1],next=video[removed],hold=cutNs-last.timestampNs;
  if(hold<=0||hold>LIMITS.lastVideoFrameDurationNs||cutNs>next.timestampNs)continue;
  eligible.push({cutNs,cutSeconds:cutNs/1e9,lastVideoTimestampNs:last.timestampNs,nextOriginalVideoTimestampNs:next.timestampNs,terminalHoldNs:hold,videoPackets:removed,audioPackets:keptAudio.length});
 }
 return {m,sourceEndNs,all,video,audio,eligible};
}
export function analyzeTailCuts(input,{signal}={}){
 const {m,sourceEndNs,eligible}=tailModel(input,signal);
 return {profile:'experimental-vp8-opus-tail-v1',sourceDurationSeconds:sourceEndNs/1e9,sourceVideoStartNs:m.video.firstTimestampNs,sourceAudioStartNs:m.tracks.find(t=>t.type===2).firstTimestampNs,cuts:eligible};
}
export function trimWebMTail(input,{cutNs,signal}={}){
 const {m,sourceEndNs,all,eligible}=tailModel(input,signal);
 requireThat(Number.isSafeInteger(cutNs),'INVALID_CUT','Select an exact integer-nanosecond candidate.');
 const cut=eligible.find(c=>c.cutNs===cutNs);requireThat(!!cut,'UNSAFE_CUT','The requested endpoint is not an eligible complete-packet cut.');
 const keep=b=>b.track===m.video.number?b.timestampNs<cutNs:b.timestampNs+b.packetDurationNs<=cutNs;
 const expected=all.filter(keep);
 const clusters=m.clusters.flatMap(c=>{checkpoint(signal);const blocks=c.blocks.filter(keep);return blocks.length?[element(ID.Cluster,join([uintElement(ID.Timestamp,c.timestamp),...blocks.map(b=>m.r.raw(b.element))]))]:[];});
 const intermediate=join([m.r.raw(m.header),element(ID.Segment,join([m.r.raw(m.infoElement),m.r.raw(m.tracksElement),...clusters]))]);
 const result=finalizeWebM(intermediate,{lastVideoFrameDurationNs:cut.terminalHoldNs,signal});
 const checked=parse(result.bytes,signal),actual=checked.clusters.flatMap(c=>c.blocks);
 requireThat(result.bytes.length<=LIMITS.inputBytes&&checked.audioEndNs===cutNs&&checked.info.duration*checked.info.scale===cutNs,'INTERNAL_VERIFICATION','Output endpoint verification failed.');
 requireThat(equalBytes(m.r.raw(m.tracksElement),checked.r.raw(checked.tracksElement),signal)&&actual.length===expected.length&&expected.every((b,i)=>b.track===actual[i].track&&b.timestampNs===actual[i].timestampNs&&equalBytes(m.r.raw(b.element),checked.r.raw(actual[i].element),signal)),'INTERNAL_VERIFICATION','Encoded source prefix preservation failed.');
 checkpoint(signal);
 return {bytes:result.bytes,operation:'trim_tail',status:'needs_review',sourceDurationSeconds:sourceEndNs/1e9,...cut,warnings:['Only the strict <=16s VP8/Opus WebM profile is accepted.','Retained encoded packet bytes and timestamps are unchanged. Existing source timing defects remain.','The final video display hold is deliberately shortened; not every frame duration is preserved.','No leading trim, MP4, arbitrary exact cut, cross-browser support or synchronization correction is implied.']};
}
