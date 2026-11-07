import {YouTubeOAuthStateRepository} from './youtube-state-repository.mjs';
import {assertYouTubeOfflineConfiguration, requireYouTubeOwner, youtubeContractSnapshot,
  youtubeRandomOpaque, youtubeHash, youtubeCodeChallenge, parseYouTubeCallback} from './youtube-contract.mjs';

/** Owns parser and matching real repository. No caller-supplied claim receipt. */
export function createOfflineYouTubeFlow(db, config, {cipher, clock = Date.now} = {}) {
  assertYouTubeOfflineConfiguration(config);
  const repository = new YouTubeOAuthStateRepository(db, {siteId:config.siteId, provider:config.provider,
    redirectUri:config.redirectUri, scopeFingerprint:config.scopeFingerprint, configFingerprint:config.configFingerprint,
    contextFingerprint:config.contextFingerprint, flowVersion:config.flowVersion, expectedChannelId:config.expectedChannelId, cipher, clock});
  return Object.freeze({
    async begin(trustedOwner, browserBinding) {
      requireYouTubeOwner(trustedOwner);
      const nonce = youtubeRandomOpaque(), pkceVerifier = youtubeRandomOpaque();
      const [nonceFingerprint, codeChallenge] = await Promise.all([youtubeHash(nonce), youtubeCodeChallenge(pkceVerifier)]);
      const attempt = await repository.begin(trustedOwner, browserBinding, {nonceFingerprint, pkceVerifier});
      return Object.freeze({state:attempt.state, nonce, codeChallenge, expiresAtMs:attempt.expiresAtMs});
    },
    async claimCallback(source) {
      const context = youtubeContractSnapshot(source, ['trustedOwner','callbackUrl','browserBinding']);
      requireYouTubeOwner(context.trustedOwner);
      const parsed = parseYouTubeCallback(config, context.callbackUrl);
      let receipt;
      try { receipt = await repository.claim(context.trustedOwner, parsed.state, context.browserBinding); }
      catch { return Object.freeze({status:'claim_outcome_unknown', connected:false}); }
      if (receipt === false) return Object.freeze({status:'invalid_attempt', connected:false});
      if (!receipt || receipt.claimed !== true || typeof receipt.nonceFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(receipt.nonceFingerprint) ||
          typeof receipt.pkceVerifier !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(receipt.pkceVerifier))
        return Object.freeze({status:'claim_outcome_unknown', connected:false});
      if (parsed.kind === 'denied') return Object.freeze({status:'provider_denied', connected:false});
      const result = {status:'code_validated_not_exchanged', connected:false, nonceFingerprint:receipt.nonceFingerprint};
      Object.defineProperties(result, {authorizationCode:{value:parsed.authorizationCode, enumerable:false}, pkceVerifier:{value:receipt.pkceVerifier, enumerable:false}});
      return Object.freeze(result);
    },
  });
}
