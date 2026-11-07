# LinkedIn integration completion review

Reviewed 7 November 2026 in an isolated local copy. No provider calls, real grants, runtime configuration changes, hosting changes or publication were performed.

## Outcome

The supplied implementation already includes the server-side account-linking lifecycle: authenticated start, per-attempt secure browser cookie, expiring single-use state, bound installation ticket, authorization-code exchange, RS256 signature and issuer/audience/nonce checks, matching userinfo subject, encrypted persistence, status readback and local disconnection. The built Worker already composes the native fetch transport. There was no missing server route or placeholder token installation to replace.

The missing verification layer was a configured positive lifecycle through the actual generated Worker artifact. `tests/oauth/generated-worker-linkedin.test.mjs` now exercises that artifact in a Worker-style VM with WebCrypto and fixture-only fetch, with no Node globals or network implementation. It verifies:

- Signed account linking through the built entry, ciphertext rather than plaintext persistence, replay rejection and local credential removal.
- A genuinely signed token containing the wrong nonce is rejected before userinfo and persistence.
- Another owner cannot consume the attempt, and denial consumes the legitimate attempt without exchanging a code.

Production code and existing security gates remain unchanged. These tests prove local integration against a simulated provider, not a live LinkedIn connection.

## Remaining activation prerequisites

An authorized operator must supply the exact site identity and HTTPS callback registration, approved LinkedIn application/products and personal-account target, server-only client secret, protected token encryption keyring and required database migrations. The Dispatch session must survive the provider's callback. No credentials should be entered into chat or client-side configuration.

The strict provider response contract remains a live-compatibility prerequisite: exact issuer, nonce round-trip, explicit `token_type` and explicit granted `scope` matching the requested set. Existing documentation notes that LinkedIn examples can omit token type and OAuth permits omitted unchanged scopes. No live behavior was observed here and the strict validation was not silently relaxed. If the approved application returns a different documented shape, review that specific contract before enabling it.

Reconnect, refresh, organization accounts and LinkedIn posting are intentionally unsupported in this reviewed lifecycle. Local disconnect erases stored access; it does not claim to revoke the application at LinkedIn.

## Validation

- Baseline complete suite: 1,439 passed, zero failures.
- Three new generated-Worker integration tests: passed.
- Final complete suite: 1,442 passed, zero failures or skipped tests.
- `npm run check`: all JavaScript syntax checks passed.
- `npm test` rebuilt the Worker before running the final suite.
