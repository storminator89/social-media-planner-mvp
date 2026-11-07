# Server-side encrypted access-token lifecycle

Additive server-only component integrated into Takt 0.6. It does not provision a Site, secret, OAuth application, grant or account and makes no network request. Only LinkedIn personal connect-new is accepted. Refresh, reconnect, publish, provider revocation and HTTP token intake/export are deliberately absent.

## Evidence and limits

The Sites documentation describes a private runtime-secret environment binding, configured with the native Sites environment tools. The tool schema supports secret values and requires a new saved deployment to apply an environment revision. No such operation was performed. `TAKT_TOKEN_KEYRING_JSON` is an **operator-supplied runtime secret**, never a manifest variable, checked-in configuration, public asset or browser setting.

Cloudflare Worker WebCrypto documents AES-GCM and raw-key import, and D1 documents transactional sequential batches:

- https://developers.cloudflare.com/workers/runtime-apis/web-crypto/
- https://developers.cloudflare.com/workers/configuration/secrets/
- https://developers.cloudflare.com/d1/worker-api/d1-database/

This is application-managed authenticated encryption built on those primitives, **not a documented native per-visitor vault**. Tests run local Node WebCrypto and SQLite with a D1-compatible transactional adapter; real Sites runtime deployment, secret provisioning, cookie behavior and provider authorization have not been exercised. No production-readiness, free-tier or live-service claim follows from these tests.

## Integration contract

The modules reside in `modules/providers/`, never in public assets. Product files have only relative named imports/exports and no Node dependency. The additive `server/0005_provider_credentials.sql` follows unchanged migrations 0001–0004 through the existing transactional local migration ledger. Never replace earlier migrations. Tests use the integrated State repository and unchanged earlier migration files. Hosted migration application remains unverified.

Create a cipher with `await createTokenCipherFromRuntime(env)`. Runtime secret JSON has exactly `activeKeyId` (safe 1–40 character identifier) and `keys` (map of 1–4 safe identifiers to canonical standard-base64 32-byte AES keys). At least the active key must be present. The module never generates a key or accepts a default. Key material is imported as a nonextractable AES-256 CryptoKey. Test keys are explicitly synthetic public in-memory values only.

Create one `new CredentialStore(db,{siteId,provider:'linkedin',configFingerprint,contextFingerprint,cipher,clock})` for a callback orchestration. All configuration and owner identities are server-owned, from the same validated OAuth config and authenticated Sites Dispatch identity, not query parameters, browser JSON or arbitrary headers accepted outside the Sites boundary. `clock` is a trusted server clock returning integer epoch milliseconds.

### Begin

1. Use the existing 0004 State repository to begin an owner/browser-bound flow.
2. Hash the opaque State with SHA-256 lowercase hex.
3. `createInstallTicket(owner,{stateHash,expiresAtMs})` verifies the matching still-unclaimed State and creates a persistent fence against the unique site/owner/provider credential row. It returns `{connectionId,expectedRevision,epoch,expiresAtMs}` for internal use. Never use this DTO as a commit capability. A failure leaves only an expiring State; no token exchange is allowed.
4. Parallel starts share the same empty credential row and revision. Creation does not confirm an identity, account or grant.

### Callback and installation

1. The closed transport must claim the exact browser-/owner-/config-bound State successfully before any network exchange.
2. Its trusted `beforeExchange(attemptBinding)` hook must verify the binding, then call `getInstallTicket(owner,stateHash)` exactly once. The transaction checks the consumed State and current credential fence, writes a fresh checkout receipt and returns an opaque frozen server-memory handle. A serialized/copied handle or one from another store instance is invalid. There is no preload-before-claim path.
3. On a failed/uncertain checkout, do not exchange or retry. No second checkout after a timeout or uncertain exchange is allowed.
4. The transport must fully validate provider issuer/signature/audience/nonce, subject and userinfo agreement, grant scope, token expiry and response shape. Only its verified result may enter `commitGrant(owner,{ticket,grant,attemptBinding})`. This API is internal and is not itself an identity-token verifier.
5. `attemptBinding` is a pure-data object with exactly `{ownerId,siteId,configFingerprint,contextFingerprint,stateHash}`, generated from the same successful State claim. It must match the hidden ticket snapshot. This prevents accidental A/B flow composition; it is not a browser authorization object and its values are not proof against a compromised runtime.
6. `grant` has exactly `{accessToken,tokenType:'Bearer',subject,scopes,expiresAtMs}`. Required scope set is `openid`, `profile`, `w_member_social`. Tokens must match the same RFC 6750 bearer-token form as the transport, maximum 8192 characters, and must not be expired. Extra fields, including refresh tokens, are rejected. No ID token or refresh token is persisted.
7. Commit uses one D1 batch to update the empty credential row with revision/epoch CAS and mark its ticket committed. It rechecks the exact state, configuration, action, receipt and expiry. One successful first install wins; later attempts cannot replace it. The in-memory handle is spent before async work, including failure/uncertain outcome. Do not retry an uncertain commit. Read safe authenticated metadata to learn the current state.

### Read, disconnect and rotation

- `getMetadata(owner)` returns only `{provider,state,connectionId,revision,authEpoch,expiresAtMs,canPublish:false,canRefresh:false}`. State is `not_connected`, `identity_verified`, `expired`, `configuration_changed` or `disconnected`. A matching active envelope is authenticated internally and its plaintext discarded; unknown key or tampering throws a fixed error rather than claiming a usable link. No raw subject, scopes, access token, ciphertext, key ID or receipt is exposed. The caller must project only relevant metadata into a public DTO.
- `disconnect(owner,connectionId,expectedRevision)` performs owner-bound CAS, increments revision and epoch, clears token ciphertext/identity fields, writes a tombstone and cancels open tickets. It is local credential removal, not a provider-side revocation request. A disconnect before, during or after exchange fences older results. Connect-new does not revive the tombstone; reconnect needs a separate future design and user authorization.
- `rewrap(owner,connectionId,expectedRevision)` authenticates using an explicitly allowed old key, encrypts with the current active key and a fresh IV, then CAS-writes one new revision. It preserves subject, scopes, epoch and original token expiry; it does not refresh or prolong a provider grant. A concurrent disconnect or writer wins over the stale rotation. Unknown write outcomes are reported, never retried automatically.

## Security properties and boundaries

AES-256-GCM uses a fresh cryptographically random 96-bit IV per encryption and a 128-bit tag. Versioned canonical AAD binds site, owner, provider, connection, configuration fingerprint, action/app context fingerprint, credential revision, authorization epoch, subject, exact scopes, expiry and key ID. Decryption takes the expected context from the trusted factory and caller, not authorization from a database row. All mutable grant/context/metadata/envelope input fields are synchronously snapshotted as own data properties; accessors are rejected.

The unique credential row and immutable install ticket provide a persistent first-writer/revocation fence, not an exactly-once guarantee for provider network effects. State/tickets expire within ten minutes and normal State lifetime remains five minutes. Ticket creation cleans only that owner's expired tickets. Writes use transactional D1 batches and per-row CAS. Storage failure/uncertainty and cryptographic failures have fixed codes without raw provider/SQL error causes. There is no logger in these modules.

The runtime and operator remain trusted: a fully compromised runtime can read its secret and plaintext while in use. AEAD does not prevent full-database snapshot rollback or restore an external monotonic history. JavaScript garbage collection, copies and string lifetime mean this module does not claim guaranteed memory zeroization. It attempts to clear temporary byte buffers but cannot erase every copy. Database metadata (owner, provider subject, scopes, timestamps) is not all encrypted; it must remain private and is never included in public metadata.

Key rotation must retain the explicitly permitted old decrypt keys until all relevant rows are rewrapped and the backup/restore strategy is resolved. Do not remove old keys merely because the active key changed. Runtime-secret configuration or persistent OAuth grants require the appropriate user authorization; this component does not acquire it or perform those actions.

## Checks

Run `npm run check` and `npm test` using Node >=22.13. No installation or external dependencies are required. The tests exercise encryption/AAD substitution and tampering, missing keys, strict inputs, mutable-input snapshots, access-token bounds, key rotation, owner/site/app/action isolation, claim/checkout single use, concurrent initial installs, A/B attempt mismatch, expiry boundaries, disconnect fences, uncertain outcomes, rollback and append-only migration preservation. The integrated State repository is unchanged from reviewed 0.5.
