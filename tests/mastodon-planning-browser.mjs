import {chromium} from '/opt/codex/cua_node/lib/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.MASTODON_QA_BASE||'http://127.0.0.1:3249',browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
await mkdir('docs/qa/mastodon-planning',{recursive:true});const results=[];
try{for(const width of [1440,390]){
 const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),errors=[],providerWrites=[];let mode='linked';
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',route=>{const r=route.request();if(!r.url().startsWith(base+'/'))return route.abort();if(r.url().includes('/providers/mastodon/')){if(r.method()!=='GET'){providerWrites.push(r.url());return route.abort();}if(mode==='unavailable')return route.fulfill({status:503,json:{error:'fixture'}});return route.fulfill({json:r.url().includes('/oauth/')?{provider:'mastodon',instance:'https://kanoa.de',scope:'profile',canPublish:false,phase:'linked',account:'synthetic-fixture'}:{phase:'linked',canStart:false,canPublish:mode==='linked',account:'synthetic-fixture',expired:mode==='expired'}});}return route.continue();});
 await page.goto(base);await page.locator('#channel-filter option[value="mastodon"]').waitFor({state:'attached'});assert.equal(await page.locator('#planning-channel-count').textContent(),'4');await page.locator('#channel-filter').selectOption('mastodon');assert.equal(await page.locator('#channel-filter').inputValue(),'mastodon');await page.locator('.create-post').click();await page.getByLabel('Mastodon auswählen',{exact:true}).check();await page.getByLabel('Instagram auswählen',{exact:true}).uncheck();await page.locator('#post-text').fill('Synthetic Mastodon draft '+width);await page.getByText(/Separater Veröffentlichungszugriff bestätigt/).waitFor();
 assert.equal(await page.locator('#composer').evaluate(e=>e.scrollWidth<=e.clientWidth),true);
 await page.locator('#composer').screenshot({path:`docs/qa/mastodon-planning/composer-${width}.png`});
 await page.locator('#save-draft').click();await page.waitForFunction(()=>!document.querySelector('#composer').open);await page.reload();await page.locator('.create-post').waitFor();
 const state=await page.evaluate(async()=>await window.TaktStore.load());const post=state.posts.find(p=>p.text==='Synthetic Mastodon draft '+width);assert.deepEqual(post.channels,['mastodon']);
 mode='expired';await page.locator('.create-post').click();await page.getByText(/Veröffentlichungszugriff abgelaufen/).waitFor();await page.locator('[data-action="close-composer"]').click();
 mode='unavailable';await page.locator('.create-post').click();await page.getByText(/Profilstatus nicht verfügbar/).waitFor();await page.locator('[data-action="close-composer"]').click();
 assert.deepEqual(errors,[]);assert.deepEqual(providerWrites,[]);results.push({width,draftPersisted:true,linkedExpiredUnavailable:true,overflow:false,errors,providerWrites});await context.close();
}}finally{await browser.close();}await writeFile('docs/qa/mastodon-planning/browser-results.json',JSON.stringify(results,null,2));console.log(results);
