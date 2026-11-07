import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { createLocalHandler } from './handler.mjs';

const app = createLocalHandler();
const args = process.argv.slice(2);
const portArg = args.indexOf('--port');
const port = Number(portArg >= 0 ? args[portArg + 1] : process.env.PORT || 3000);
const server = createServer(async (req, res) => {
  try {
    const request = new Request(`http://${req.headers.host || `localhost:${port}`}${req.url}`, { method: req.method, headers: req.headers, ...(['GET', 'HEAD'].includes(req.method) ? {} : { body: Readable.toWeb(req), duplex: 'half' }) });
    const response = await app.fetch(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).pipe(res); else res.end();
  } catch { res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Lokaler Speicherfehler. Bitte neu laden und prüfen.'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Takt local-only development preview: http://127.0.0.1:${port}. Shared demo owner; no production authentication or social publishing.`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { app.close(); process.exit(0); }));
