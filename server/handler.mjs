import {handleOAuthReadiness} from '../modules/oauth/readiness-api.mjs';
import {handleProviderStatus} from '../modules/providers/status-api.mjs';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, sep, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handlePlannerRequest } from '../modules/data/api.mjs';
import { LocalDatabase, LocalBucket } from './storage.mjs';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
const LOCAL_OWNER = 'local-preview-workspace';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const SECURITY = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'" };
const errorResponse = (status, message) => new Response(JSON.stringify({ error: { code: 'LOCAL_PREVIEW_ONLY', message } }), { status, headers: { ...SECURITY, 'Content-Type': 'application/json' } });

export function createLocalHandler({ directory = join(ROOT, '.local'), publicDirectory = join(ROOT, 'public') } = {}) {
  const DB = new LocalDatabase(directory), BUCKET = new LocalBucket(join(directory, 'media'));
  return {
    close: () => DB.close(),
    async fetch(request) {
      const url = new URL(request.url);
      // The preview is a local development tool, never an Internet authentication layer.
      if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return errorResponse(421, 'Nur lokale Entwicklungsaufrufe sind erlaubt.');
      if (request.headers.get('Origin') && request.headers.get('Origin') !== url.origin) return errorResponse(403, 'Fremde Webseiten dürfen nicht auf die lokale Planung zugreifen.');
      if (request.headers.has('oai-authenticated-user-id')) return errorResponse(400, 'Besucheridentität wird im lokalen Prototyp nicht akzeptiert.');
      if (request.headers.get('Sec-Fetch-Site') === 'cross-site') return errorResponse(403, 'Fremde Webseiten dürfen nicht auf die lokale Planung zugreifen.');
      if (url.pathname.startsWith('/api/')) {
        const headers = new Headers(request.headers); headers.set('oai-authenticated-user-id', LOCAL_OWNER);
        const internal = new Request(request, { headers });
        const response = await handleOAuthReadiness(internal) ?? await handleProviderStatus(internal, { DB, BUCKET }) ?? await handlePlannerRequest(internal, { DB, BUCKET });
        if (!response) return errorResponse(404, 'Endpunkt nicht vorhanden.');
        // Keep capability labels truthful: this is disk-backed emulation, not deployed D1/R2.
        if (url.pathname === '/api/planner/state' && response.ok) {
          const data = await response.json();
          data.capabilities = { ...data.capabilities, durableStorage: 'local-sqlite', mediaStorage: 'local-files', authentication: 'none-local-demo', productionReady: false };
          return new Response(JSON.stringify(data), { status: response.status, headers: response.headers });
        }
        return response;
      }
      if (!['GET', 'HEAD'].includes(request.method)) return errorResponse(405, 'Methode nicht erlaubt.');
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); } catch { return errorResponse(400, 'Ungültiger Pfad.'); }
      const base = await realpath(publicDirectory);
      const target = resolve(base, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!target.startsWith(base + sep) || !TYPES[extname(target)]) return errorResponse(404, 'Datei nicht vorhanden.');
      try {
        const actual = await realpath(target);
        if (!actual.startsWith(base + sep)) return errorResponse(404, 'Datei nicht vorhanden.');
        return new Response(request.method === 'HEAD' ? null : await readFile(actual), { headers: { ...SECURITY, 'Content-Type': TYPES[extname(actual)] } });
      } catch (error) { if (['ENOENT', 'ENOTDIR'].includes(error.code)) return errorResponse(404, 'Datei nicht vorhanden.'); throw error; }
    }
  };
}
