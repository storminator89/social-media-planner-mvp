import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderMastodonPlaceholder,renderConnections,PROVIDERS} from '../public/connections.js';
test('Mastodon is visible in accounts, links to profile setup without claiming a connection',()=>{
 const card=renderMastodonPlaceholder();
 assert.match(card,/id="connection-mastodon">Mastodon/);
 assert.match(card,/kanoa\.de/);assert.match(card,/Status nicht verfügbar/);
 assert.match(card,/Diese Freigabe erlaubt keinen Versand/);
 assert.match(card,/href="\/mastodon.html"/); assert.doesNotMatch(card,/data-.*(?:start|confirm)|oauth/);
 assert.match(renderConnections(),/id="connection-mastodon"/);
 assert.match(renderConnections({expanded:['mastodon']}),/data-provider="mastodon" open/);
 assert.equal(PROVIDERS.length,4,'Existing server status contract is preserved');
});
