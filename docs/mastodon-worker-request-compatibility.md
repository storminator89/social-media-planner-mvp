# Hosted Mastodon request compatibility

The shared HTTP gate constructed its Request before its transport error handler, using `redirect: error` and `cache: no-store`. Cloudflare documents error redirect mode as unsupported. Cache initialization additionally depends on the compatibility date/flag. Either construction failure could become the generic diagnostic. The exact production exception was not observed.

Hosted Kanoa now uses manual redirects and omits the cache initializer. Its native adapter requests no caching through negative `cf.cacheTtlByStatus` and fixed Cache-Control/Pragma headers. Workers-for-Platforms can ignore cf options, so this is not a verified bypass of platform caches. No compatibility flags, host settings, permissions, credentials or storage changed. Other providers retain their prior HTTP defaults.

The shared gate still requires the exact final response URL, redirected=false, rejects every 3xx, validates JSON and capability shape, limits decoded bodies, and enforces the shared deadline. A construction failure now receives a fixed non-sensitive code instead of arbitrary exception text. No retries were added.

Tests simulate native constructors rejecting both unsupported options and exercise the owner diagnostic and fixture-only explicit start. All provider responses and registration in tests are local fixtures. No live OAuth start, registration, grant, reset or revoke was performed. A signed-in owner diagnostic remains necessary to confirm production metadata retrieval.

References:
- https://developers.cloudflare.com/workers/runtime-apis/request/
- https://developers.cloudflare.com/workers/configuration/compatibility-flags/#enable-cache-no-store-http-standard-api
- https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/reference/limits/#cf-object
