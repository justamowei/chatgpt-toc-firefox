import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {By, Key} from 'selenium-webdriver';
import {fixtureSession} from './firefox-session.mjs';
const session=await fixtureSession(process.env.TOC_TEST_ARTIFACTS || 'artifacts/firefox-v032');
const {driver, artifacts}=session, results=[];
const evaluate=(code,...args)=>driver.executeScript(code,...args);
const state=()=>evaluate(`const h=document.getElementById('chatgpt-toc-root'),s=h?.shadowRoot;if(!s)return null;return {expanded:s.querySelector('.toggle').getAttribute('aria-expanded'),rows:s.querySelectorAll('#toc-list button').length,archived:s.querySelectorAll('#toc-list .archived').length,marks:s.querySelectorAll('.mark').length,scope:s.querySelector('#toc-scope').textContent,status:s.querySelector('#toc-status').textContent,nav:h.dataset.navigation,busy:s.querySelector('#toc-list').getAttribute('aria-busy')};`);
const wait=p=>driver.wait(p,20000);
async function click(selector){const s=await(await driver.findElement(By.id('chatgpt-toc-root'))).getShadowRoot();await(await s.findElement(By.css(selector))).click();}
async function test(name,run){const actual=await run();results.push({name,status:'PASS',actual});console.log(name+' PASS '+JSON.stringify(actual));}
async function mount(ids){await evaluate(`const m=document.querySelector('main');m.replaceChildren();for(const i of arguments[0]){const a=document.createElement('article');a.dataset.testid='conversation-turn-'+i*2;for(const role of ['user','assistant']){const b=document.createElement('div');b.dataset.messageAuthorRole=role;b.dataset.messageId='branch-A:'+ (role==='user'?'u':'a')+'-'+i;b.textContent=i<20?(role==='user'?fixturePrompts[i]:'合成回答 '+i+'。這個頁面沒有真實聊天、帳號或網路歷史 API。'):'v032 '+role+' '+i;a.append(b);}m.append(a);}`,ids);}
try{
  // installAddon resolves before Firefox's asynchronous onInstalled handler.
  // Wait for registration through the extension's own options document; this
  // neither changes preferences nor performs a toolbar/manual enable action.
  await driver.get(session.optionsUrl);
  await driver.wait(async()=> await evaluate(`return (async()=> (await browser.scripting.getRegisteredContentScripts({ids:['chatgpt-toc']})).length===1)();`),20000);
  await driver.get(session.url);
  await test('V032-01 default automatic startup without toolbar action',async()=>{await wait(async()=>!!await state());const s=await state();assert.equal(s.marks,20);assert.equal(s.expanded,'false');return s;});
  // Capture the synthetic prompt text before replacing its window.
  await evaluate(`window.fixturePrompts=[...document.querySelectorAll('[data-message-author-role=user]')].map(n=>n.textContent);`);
  await test('V032-02 cached list toggles retain nodes and list scroll',async()=>{
    await mount(Array.from({length:600},(_,i)=>i));await wait(async()=> (await state()).scope.includes('600 則'));
    await mount([111,112,113,114,115,116]);await wait(async()=> (await state()).marks===6);
    await click('.toggle');await wait(async()=> (await state()).rows===600 && (await state()).busy==='false');
    await evaluate(`const s=document.getElementById('chatgpt-toc-root').shadowRoot;window.keptRow=s.querySelector('#toc-list button');s.querySelector('#toc-list').scrollTop=150;window.listScroll=s.querySelector('#toc-list').scrollTop;window.listMutations=0;window.listObserver=new MutationObserver(records=>window.listMutations+=records.filter(r=>r.type==='childList').length);window.listObserver.observe(s.querySelector('#toc-list'),{childList:true,subtree:true});`);
    for(let i=0;i<10;i++){await click('.toggle');await click('.toggle');}
    const actual=await evaluate(`const s=document.getElementById('chatgpt-toc-root').shadowRoot;window.listObserver.disconnect();return {sameRow:window.keptRow===s.querySelector('#toc-list button'),scroll:window.listScroll===s.querySelector('#toc-list').scrollTop,mutations:window.listMutations};`);
    assert.deepEqual(actual,{sameRow:true,scroll:true,mutations:0});await session.screenshot('expanded-600-mounted-six.png');return actual;
  });
  await test('V032-03 Alt and Shift+O preserve a running collection; Stop cancels',async()=>{
    await click('#toc-earlier');await wait(async()=> (await state()).nav==='loading');
    await evaluate('document.activeElement?.blur();');await driver.actions().keyDown(Key.ALT).keyUp(Key.ALT).perform();assert.equal((await state()).nav,'loading');
    await driver.actions().keyDown(Key.SHIFT).sendKeys('o').keyUp(Key.SHIFT).perform();assert.equal((await state()).nav,'loading');assert.equal((await state()).expanded,'true');
    await click('#toc-stop');await wait(async()=> (await state()).nav==='cancelled');return {altKeepsLoading:true,shiftOKeepsLoading:true,explicitStop:true};
  });
  await test('V032-04 F5 restores offscreen records from real extension storage',async()=>{
    await driver.wait(async()=>{const value=await evaluate(`return document.getElementById('chatgpt-toc-root').shadowRoot.querySelector('#toc-scope').textContent;`);return value.includes('600 則');},20000);
    // The UI exposes only a local save status, never storage payloads to the page.
    await wait(async()=> (await state()).scope.includes('已儲存'));
    await driver.navigate().refresh();await wait(async()=> (await state())?.scope.includes('600 則'));
    if((await state()).expanded!=='true')await click('.toggle');await wait(async()=> (await state()).rows===600);
    const s=await state();assert.equal(s.marks,20);await session.screenshot('after-refresh-cache-600-mounted-20.png');return s;
  });
  await test('V032-05 unknown branch retains 600 searchable records and promotes later exact mounts without duplicates',async()=>{
    await evaluate(`document.querySelector('main').removeAttribute('data-fixture-branch');`);
    await wait(async()=> (await state()).scope.includes('未完整核對') && (await state()).scope.includes('已儲存'));
    await driver.navigate().refresh();await wait(async()=> (await state())?.scope.includes('600 則'));
    if((await state()).expanded!=='true')await click('.toggle');await wait(async()=> (await state()).rows===600 && (await state()).archived===0);
    await evaluate(`window.fixturePrompts=[...document.querySelectorAll('[data-message-author-role=user]')].map(n=>n.textContent);`);
    await mount([111,112,113,114,115,116]);await wait(async()=> (await state()).rows===600 && (await state()).archived===0 && (await state()).marks===6);
    const s=await state();assert.equal(s.rows+s.archived,600);assert.equal(s.marks,6);await session.screenshot('restored-unverified-600.png');return s;
  });
  await test('V032-06 different conversation does not inherit cached prompts',async()=>{
    await driver.get(session.url.replace('/c/synthetic','/c/other-v032'));await wait(async()=>!!await state());await wait(async()=> (await state()).scope.includes('20 則'));
    if((await state()).expanded!=='true')await click('.toggle');await wait(async()=> (await state()).rows===20);assert.equal((await state()).archived,0);return await state();
  });
  await test('V032-07 second ChatGPT-matched page starts automatically',async()=>{
    await driver.switchTo().newWindow('tab');await driver.get(session.url.replace('/c/synthetic','/c/second-v032'));await wait(async()=>!!await state());assert.equal((await state()).marks,20);return await state();
  });
}catch(error){results.push({name:'failure',status:'FAIL',error:String(error)});console.error(error);await session.screenshot('failure.png').catch(()=>{});process.exitCode=1;}
finally{await writeFile(resolve(artifacts,'results.json'),JSON.stringify({source:'Native Firefox isolated addon localhost fixture; not ChatGPT LIVE',firefox:(await driver.getCapabilities()).get('browserVersion'),build:JSON.parse(await readFile('dist/fixture/build-info.json','utf8')),results},null,2));await session.close();}
