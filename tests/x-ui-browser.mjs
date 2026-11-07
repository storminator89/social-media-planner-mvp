// Local Chromium QA. Only the X readiness endpoint is mocked for enabled states.
// All external requests are blocked; no grants, provider requests or posts.
import {chromium} from '/opt/codex/cua_node/lib/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const base=process.env.X_UI_BASE||'http://127.0.0.1:3217';
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const results=[];
try{for(const width of [1440,390]){
 const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),errors=[],writes=[],external=[];
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',route=>{const r=route.request();if(!r.url().startsWith(base+'/')){external.push(r.url());return route.abort();}if(r.method()!=='GET')writes.push(r.url());return route.continue();});
 await page.goto(base+'/#connections');
 await page.locator('.x-connection-card').waitFor();
 await page.getByText('Verbinden noch nicht verfügbar',{exact:true}).waitFor();
 assert.equal(await page.locator('[data-x-action="start"]').isDisabled(),true);
 assert.equal(await page.locator('.x-connection-card').evaluate(e=>e.scrollWidth<=e.clientWidth),true);
 await page.locator('.x-connection-card > details > summary').click();
 await page.locator('[data-connection-refresh]').click();
 await page.getByText('Verbinden noch nicht verfügbar',{exact:true}).waitFor();
 assert.equal(await page.locator('.x-connection-card > details').getAttribute('open'),'');
 await page.locator('.x-connection-card').screenshot({path:`docs/qa/x-ui/closed-${width}.png`});
 let stage='not_connected',renewals=0;
 const fixture=()=>({schemaVersion:1,provider:'x',stage,connected:stage==='linked',canPublish:false,canStart:stage==='not_connected',canRefresh:stage==='linked',canDisconnect:['linked','disconnected','outcome_unknown'].includes(stage)&&stage!=='disconnected',connection:stage==='not_connected'?null:{id:'fixture_connection',revision:1,expiresAtMs:stage==='disconnected'?null:Date.now()+60000},blockerCodes:['PUBLISHING_DISABLED']});
 await context.route('**/api/providers/x/oauth/readiness',r=>r.fulfill({json:fixture()}));
 await context.route('**/api/providers/x/refresh',r=>{renewals++;stage='outcome_unknown';return r.fulfill({status:503,json:{error:'fixture uncertainty'}});});
 await page.locator('[data-connection-refresh]').click();await page.locator('[data-x-action="start"]:enabled').waitFor();
 await page.locator('[data-x-action="start"]').click();assert.equal(await page.locator('[data-x-cancel]').evaluate(e=>e===document.activeElement),true);
 await page.keyboard.press('Escape');assert.equal(await page.locator('[data-x-action="start"]').evaluate(e=>e===document.activeElement),true);
 await page.locator('[data-x-action="start"]').click();await page.locator('[data-x-cancel]').click();assert.equal(await page.locator('[data-x-confirm]').count(),0);
 stage='linked';await page.locator('[data-connection-refresh]').click();await page.locator('[data-x-action="renew"]:enabled').waitFor();
 await page.locator('[data-x-action="renew"]').click();await page.locator('[data-x-confirm="renew"]').click();await page.getByText('Ausgang unklar',{exact:true}).waitFor();assert.equal(renewals,1);assert.equal(await page.locator('[data-x-action="renew"]').count(),0);
 await page.locator('[data-x-action="disconnect"]').click();await page.locator('.x-connection-card').screenshot({path:`docs/qa/x-ui/confirm-${width}.png`});await page.keyboard.press('Escape');
 await page.locator('.connections-footer [data-view="calendar"]').click();
 await page.locator(width===390?'.mobile-nav [data-view="connections"]':'.sidebar [data-view="connections"]').click();await page.getByText('Ausgang unklar',{exact:true}).waitFor();
 assert.equal(await page.locator('.x-connection-card').evaluate(e=>e.scrollWidth<=e.clientWidth),true);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.equal(writes.length,0);results.push({width,passed:true,checks:['real local closed readiness','disabled connect','expanded help retained','confirm focus','Escape/cancel restores focus','single mocked refresh with uncertain readback','navigation rechecks','no overflow','no external requests or real writes']});await context.close();
}await writeFile('docs/qa/x-ui/browser-results.json',JSON.stringify(results,null,2));console.log(results);}finally{await browser.close();}
