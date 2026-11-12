import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../../public/index.html',import.meta.url),'utf8');
const controls=html.match(/<div class="media-controls">([\s\S]*?)<\/div><p id="channel-media-lock"/)[1];
test('saved image reuse is a direct composer action, outside the batch disclosure',()=>{
 assert.equal((html.match(/id="choose-saved-image"/g)||[]).length,1);
 assert.ok(controls.indexOf('id="choose-saved-image"')<controls.indexOf('<details'));
 assert.match(controls,/id="choose-saved-image"[^>]*>Gespeicherte Bilder<\/button>/);
});
test('compact labels retain accessible action names and guarded IDs',()=>{
 assert.match(controls,/id="add-media"[^>]*aria-label="Bild hinzufügen"/);
 assert.match(controls,/id="add-video"[^>]*aria-label="Video hinzufügen"/);
 assert.match(controls,/<summary>Mehrere Bilder<\/summary>/);
 assert.match(controls,/id="add-media-batch"/);
 assert.match(controls,/id="media-files"[^>]*multiple hidden/);
});
test('drop hint stays concise while file restrictions and total remain visible',()=>{
 assert.match(html,/Bilder ablegen · JPG, PNG, WebP · max\. 2 MB je Bild/);
 assert.match(html,/id="media-total"[^>]*>0 \/ 10 Bilder/);
 assert.match(html,/id="composer-file-drop-error"[^>]*role="alert"/);
 assert.match(html,/id="channel-media-lock"[^>]*role="status"/);
});
