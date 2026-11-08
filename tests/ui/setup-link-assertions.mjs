import assert from 'node:assert/strict';
const allowed=new Set([
 'https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2',
 'https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin',
 'https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow',
 'https://learn.microsoft.com/en-us/linkedin/shared/authentication/programmatic-refresh-tokens',
 'https://www.youtube.com/account_advanced',
 'https://support.google.com/youtube/answer/3250431?hl=de',
 'https://developers.google.com/identity/protocols/oauth2/web-server',
 'https://console.developers.google.com/auth/branding',
 'https://console.developers.google.com/auth/audience',
 'https://console.developers.google.com/auth/scopes',
 'https://support.google.com/cloud/answer/15549945?hl=de',
 'https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification',
 'https://docs.x.com/x-api/getting-started/pricing',
 'https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code',
 'https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login',
 'https://developers.facebook.com/documentation/instagram-platform/content-publishing'
]);
export function assertSetupHelpLinks(html){
 const tags=[...html.matchAll(/<a\b[^>]*>/g)].map(m=>m[0]);assert.ok(tags.length>0);
 for(const tag of tags){const match=tag.match(/href="([^"]+)"/);assert.ok(match);if(/^#connection-(instagram|linkedin|youtube|x|mastodon)$/.test(match[1])){assert.doesNotMatch(tag,/target=|client_id|redirect_uri/);assert.ok(html.includes(`id="${match[1].slice(1)}"`));continue;}if(match[1]==='/mastodon.html'){assert.doesNotMatch(tag,/target=|client_id|redirect_uri/);continue;}assert.ok(allowed.has(match[1]),match[1]);assert.match(tag,/target="_blank"/);assert.match(tag,/rel="noopener noreferrer"/);assert.match(tag,/referrerpolicy="no-referrer"/);}
 assert.doesNotMatch(html,/href="[^"]*(?:client_id|redirect_uri|response_type|oauth\/v2\/authorization|o\/oauth2\/v2\/auth)/);
}
