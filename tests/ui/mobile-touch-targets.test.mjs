import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../../public/interface.css',import.meta.url),'utf8');
test('mobile icon controls have explicit touch sizes',()=>{const mobile=css.slice(css.lastIndexOf('@media (max-width: 760px)'));for(const selector of ['.composer-dialog .composer-head .icon-button','.composer-dialog .edit-actions .icon-button','.period-arrows .icon-button'])assert.ok(mobile.includes(selector));for(const size of ['width: 44px','height: 44px','min-width: 44px','min-height: 44px'])assert.ok(mobile.includes(size));assert.match(mobile,/\.composer-dialog \.preview-title select\s*\{\s*font-size: 16px/);});
