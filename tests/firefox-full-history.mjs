import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { By } from 'selenium-webdriver';
import { gzipSync } from 'node:zlib';
import { fixtureSession } from './firefox-session.mjs';
const conversation='00000000-0000-4000-8000-000000000001';
let mode='normal'; const requests=[];
function prompt(i) { return i===3?'<img src=x onerror=alert(1)> 合成字串':`完整目錄 第${i}則提問 Firefox`; }
const messages=Array.from({length:200},(_,i)=>[
  {id:'u-'+i,author:{role:'user'},content:{content_type:'text',parts:[prompt(i)]},metadata:{},create_time:i*2},
  {id:'a-'+i,author:{role:'assistant'},content:{content_type:'text',parts:['合成回答 '+i]},metadata:{},create_time:i*2+1,recipient:'all'}
]).flat();
const session=await fixtureSession(process.env.TOC_TEST_ARTIFACTS||'artifacts/firefox-full-history',{handleRequest:async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/c/')) {
    const html=(await readFile('tests/fixtures/conversation.html','utf8')).replace('/fixture.js','/full-history.js');
    res.setHeader('Set-Cookie','tocFixture=yes; SameSite=Lax; Path=/');res.setHeader('Content-Type','text/html');res.end(html);return true;
  }
  if(url.pathname==='/full-history.js'){res.setHeader('Content-Type','text/javascript');res.end(await readFile('tests/fixtures/full-history.js'));return true;}
  if(url.pathname==='/api/auth/session'){requests.push({kind:'session',cookie:req.headers.cookie?.includes('tocFixture=yes')===true});res.setHeader('Content-Type','application/json');res.end(JSON.stringify({accessToken:'synthetic-fixture-token'}));return true;}
  if(url.pathname.startsWith('/backend-api/')) {
    requests.push({kind:'history',path:url.pathname,before:url.searchParams.get('before'),turns:Number(url.searchParams.get('num_turns')),cookie:req.headers.cookie?.includes('tocFixture=yes')===true,authenticated:req.headers.authorization==='Bearer synthetic-fixture-token'});
    if(mode==='denied'){res.writeHead(403,{'Content-Type':'application/json'});res.end('{}');return true;}
    if(mode==='slow')await new Promise(r=>setTimeout(r,900));
    if(mode==='large-page') {
      const turns=Number(url.searchParams.get('num_turns')),end=url.searchParams.has('before')?Number(url.searchParams.get('before')):messages.length,start=Math.max(0,end-turns*2);
      const payload={conversation_id:conversation,current_node:'a-199',update_time:123,messages:messages.slice(start,end),page_info:{has_previous_page:start>0,has_next_page:end<messages.length,start_cursor:String(start)},...(turns===100?{padding:'x'.repeat(2*1024*1024)}:{})};
      const body=gzipSync(Buffer.from(JSON.stringify(payload)));res.writeHead(200,{'Content-Type':'application/json','Content-Encoding':'gzip','Content-Length':body.length});res.end(body);return true;
    }
    if(mode==='text-limit') {
      const list=structuredClone(messages.slice(200));list[0].content.parts=['x'.repeat(262145)];
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({conversation_id:conversation,current_node:'a-199',update_time:123,messages:list,page_info:{has_previous_page:false,start_cursor:null}}));return true;
    }
    const older=url.searchParams.has('before');
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({conversation_id:conversation,current_node:'a-199',update_time:123,messages:older?messages.slice(0,200):messages.slice(200),page_info:{has_previous_page:mode==='malformed'?true:!older,has_next_page:older||mode==='newer',start_cursor:mode==='malformed'?null:older?'start':'older-200'}}));return true;
  }
  return false;
}});
const {driver,action,artifacts}=session;
const results=[];
const evaluate=(code,...args)=>driver.executeScript(code,...args);
const state=()=>evaluate(`const h=document.getElementById('chatgpt-toc-root');return h?{history:h.dataset.history,nav:h.dataset.navigation,scope:h.shadowRoot.querySelector('#toc-scope').textContent,status:h.shadowRoot.querySelector('#toc-status').textContent,items:Array.from(h.shadowRoot.querySelectorAll('#toc-list button')).map(b=>({id:b.dataset.entryId,text:b.textContent,disabled:b.disabled}))}:null;`);
const wait=p=>driver.wait(p,10000);
async function diagnostic(){await click('#toc-diagnose');return JSON.parse(await evaluate(`return document.getElementById('chatgpt-toc-root').shadowRoot.querySelector('#toc-diagnosis').textContent;`));}
async function click(selector){const root=await(await driver.findElement(By.id('chatgpt-toc-root'))).getShadowRoot();const node=await root.findElement(By.css(selector));await evaluate('arguments[0].scrollIntoView({block:"nearest"});',node);await node.click();}
async function search(value){await evaluate(`const n=document.getElementById('chatgpt-toc-root').shadowRoot.querySelector('#toc-search');n.value=arguments[0];n.dispatchEvent(new Event('input',{bubbles:true}));`,value);}
async function test(name,run){try{const actual=await run();results.push({name,status:'PASS',actual});console.log(`${name} PASS ${JSON.stringify(actual)}`);}catch(e){results.push({name,status:'FAIL',error:e.message});throw e;}}
async function reset(){mode='normal';await driver.get(session.url.replace('/c/synthetic','/c/'+conversation));await action();await action();await wait(async()=>(await state())?.items.length===7);}
async function load(){await click('#toc-complete');await wait(async()=>(await state()).history==='loaded');}
try {
  await reset();
  await test('FULL-NATIVE-01:200-prompts-seven-mounted',async()=>{
    assert.equal(requests.length,0,'No history requests before explicit action');
    await load();const s=await state();assert.equal(s.items.length,200);assert.deepEqual(s.items.map(e=>e.id),Array.from({length:200},(_,i)=>'u-'+i));
    assert.ok(s.items.every(e=>!e.disabled));assert.match(s.scope,/伺服器分支/);assert.match(s.scope,/核對 7/);
    assert.ok(requests.every(r=>r.cookie));assert.ok(requests.filter(r=>r.kind==='history').every(r=>r.authenticated&&r.path===`/backend-api/conversations/${conversation}`));
    assert.equal(await evaluate(`return document.querySelectorAll('[data-user-message-bubble]').length;`),7);
    return {expected:200,actual:s.items.length,mounted:7,cookie:true,authenticated:true,explicitOnly:true};
  });
  await test('FULL-NATIVE-02:search-offscreen-and-safe-text',async()=>{
    await search('第0則');const s=await state();assert.deepEqual(s.items.map(e=>e.id),['u-0']);
    await search('onerror');assert.equal((await state()).items.length,1);
    assert.equal(await evaluate(`return document.getElementById('chatgpt-toc-root').shadowRoot.querySelector('#toc-list img')===null;`),true);
    await search('');return {offscreenFound:true,htmlExecuted:false};
  });
  await test('FULL-NATIVE-03:ten-distant-targets-and-retention',async()=>{
    const ids=[0,199,38,160,77,122,10,188,99,193];const located=[];
    for(const i of ids){await search('第'+i+'則');await click(`#toc-list button[data-entry-id="u-${i}"]`);await wait(async()=>(await state()).nav==='located');assert.equal(await evaluate(`return document.querySelector('[data-chatgpt-toc-highlight]')?.getAttribute('data-chatgpt-toc-highlight');`),'u-'+i);located.push(i);}
    await search('');assert.equal((await state()).items.length,200);return {targets:located,retained:200};
  });
  await test('FULL-NATIVE-04:edit-revokes-full-snapshot',async()=>{
    await evaluate('window.fullFixture.edit();');await wait(async()=>(await state()).history==='idle');assert.equal((await state()).items.length,7);assert.match((await state()).status,/撤銷/);return {staleSnapshotRevoked:true,mountedFallback:7};
  });
  await reset();
  await test('FULL-NATIVE-05:cancel-late-http',async()=>{
    mode='slow';await click('#toc-complete');await wait(async()=>(await state()).history==='loading');await click('#toc-stop');await driver.sleep(1200);
    const s=await state();assert.equal(s.history,'idle');assert.equal(s.items.length,7);assert.match(s.status,/停止/);return {lateResultApplied:false};
  });
  await test('FULL-NATIVE-06:access-and-schema-failure-preserve-mounted',async()=>{
    for(const failure of ['denied','malformed']){mode=failure;await click('#toc-complete');await wait(async()=>(await state()).history==='idle');assert.equal((await state()).items.length,7);assert.doesNotMatch((await state()).scope,/已讀取完整歷史/);}
    return {forbidden:'rejected',badCursor:'rejected',mounted:7};
  });
  await reset();
  await test('FULL-NATIVE-07:route-and-dispose-cancel',async()=>{
    mode='slow';await click('#toc-complete');await evaluate(`history.pushState({},'', '/c/00000000-0000-4000-8000-000000000002');`);await driver.sleep(1300);assert.equal((await state()).history,'idle');assert.equal((await state()).items.length,7);
    await click('#toc-complete');await click('#toc-disable');await driver.sleep(1200);assert.equal(await state(),null);return {wrongRouteApplied:false,lateAfterDispose:false};
  });
  await reset();await load();
  await test('FULL-NATIVE-08:new-prompt-invalidates',async()=>{await evaluate('window.fullFixture.append();');await wait(async()=>(await state()).history==='idle');assert.equal((await state()).items.length,8);return {newPromptInvalidation:true};});
  await reset();await load();
  await test('FULL-NATIVE-09:whole-branch-after-empty-window',async()=>{
    await evaluate('window.fullFixture.drop();');await driver.sleep(200);assert.equal((await state()).items.length,200);
    await evaluate(`const n=document.createElement('section');n.dataset.turnKey='different-branch';n.innerHTML='<div data-user-message-bubble>另一分支</div>';document.querySelector('main').append(n);`);
    await wait(async()=>(await state()).history==='idle');assert.equal((await state()).items.length,1);return {oldBranchSearchCleared:true};
  });
  await reset();
  await test('FULL-NATIVE-10:slotless-explicit-assistant-regeneration',async()=>{
    await evaluate(`window.fullFixture.freeze(true);document.querySelector('main').innerHTML='<div data-message-author-role="user" data-message-id="u-193">完整目錄 第193則提問 Firefox</div><div data-message-author-role="assistant" data-message-id="a-193">合成回答 193</div>';`);
    await wait(async()=>(await state()).items.length===1);await load();
    await evaluate(`const n=document.querySelector('[data-message-id="a-193"]');n.dataset.messageId='a-regenerated';n.textContent='重新生成';`);
    await wait(async()=>(await state()).history==='idle');assert.equal((await state()).items.length,1);return {noSlotRegenerationRevoked:true};
  });
  await reset();
  await test('FULL-NATIVE-11:pending-load-answer-change-cancels',async()=>{
    mode='slow';await click('#toc-complete');await evaluate(`document.querySelector('[data-conversation-role="assistant"]').textContent='載入中重新生成';`);await driver.sleep(1300);
    assert.equal((await state()).history,'idle');assert.equal((await state()).items.length,7);return {changedDuringLoadApplied:false};
  });
  await reset();await load();
  await test('FULL-NATIVE-12:return-to-earlier-unmounted-anchor',async()=>{
    await evaluate(`document.querySelector('main').scrollTop=0;`);await driver.sleep(200);
    await search('第199則');await click('#toc-list button[data-entry-id="u-199"]');await wait(async()=>(await state()).nav==='located');
    await click('#toc-back');await wait(async()=>await evaluate(`return document.getElementById('chatgpt-toc-root').dataset.restored==='true';`));
    assert.equal((await state()).history,'loaded');return {unmountedReturnRestored:true};
  });
  await reset();
  await test('FULL-NATIVE-13:pending-unmount-remount-keeps-change-witness',async()=>{
    mode='slow';await click('#toc-complete');await evaluate('window.fullFixture.drop();');await driver.sleep(200);
    await evaluate(`window.fullFixture.mount(193);document.querySelector('[data-conversation-role="assistant"]').textContent='卸載後重新生成';`);
    await driver.sleep(1300);assert.equal((await state()).history,'idle');assert.equal((await state()).items.length,7);
    return {pendingWitnessPreserved:true,staleSnapshotApplied:false};
  });
  await reset();
  await test('FULL-NATIVE-14:loaded-transition-retains-offscreen-answer-witness',async()=>{
    mode='slow';await click('#toc-complete');await evaluate('window.fullFixture.drop();');await driver.sleep(200);
    await wait(async()=>(await state()).history==='loaded');assert.equal((await state()).items.length,200);
    await evaluate(`window.fullFixture.mount(193);document.querySelector('[data-conversation-role="assistant"]').textContent='完整載入後重掛載的重新生成';`);
    await wait(async()=>(await state()).history==='idle');assert.equal((await state()).items.length,7);return {loadedWitnessPreserved:true};
  });
  await reset();await load();
  await test('FULL-NATIVE-15:empty-user-hydration-keeps-complete-index',async()=>{
    await evaluate(`document.querySelector('[data-user-message-bubble]').textContent='';`);await driver.sleep(250);
    assert.equal((await state()).history,'loaded');assert.equal((await state()).items.length,200);
    await evaluate(`document.querySelector('[data-user-message-bubble]').textContent='完整目錄 第193則提問 Firefox';`);await driver.sleep(250);
    assert.equal((await state()).history,'loaded');assert.equal((await state()).items.length,200);return {emptyIsUnmounted:true,completeRetained:200};
  });
  await reset();
  await test('FULL-NATIVE-16:known-newer-page-refuses-complete',async()=>{
    mode='newer';await click('#toc-complete');await wait(async()=>(await state()).history==='idle');
    assert.equal((await state()).items.length,7);assert.doesNotMatch((await state()).scope,/已讀取完整歷史/);
    return {unreadNewerPageRejected:true,mountedFallback:7};
  });
  await reset();
  await test('FULL-NATIVE-17:real-gzip-decoded-oversize-adapts-and-keeps-200',async()=>{
    mode='large-page';const from=requests.length;await load();const s=await state();assert.deepEqual(s.items.map(e=>e.id),Array.from({length:200},(_,i)=>'u-'+i));
    const calls=requests.slice(from).filter(r=>r.kind==='history');assert.deepEqual(calls.map(r=>r.turns),[100,50,50,50,50,50]);assert.deepEqual(calls.map(r=>r.before),[null,null,'300','200','100',null]);
    const d=await diagnostic();assert.equal(d.fullCount,200);assert.equal(d.mountedCount,7);assert.deepEqual(d.lastHistory,{outcome:'installed',pages:4});
    await evaluate('window.fullFixture.mount(0);');await driver.sleep(250);assert.equal((await state()).items.length,200);await search('第193則');assert.deepEqual((await state()).items.map(e=>e.id),['u-193']);await search('');
    return {sample:'synthetic-localhost-real-http-gzip',decodedHeadOverMiB:2,batches:calls.map(r=>r.turns),complete:200,mounted:7,retained:200};
  });
  await reset();
  await test('FULL-NATIVE-18:specific-text-limit-persists-after-navigation-status-refresh',async()=>{
    mode='text-limit';const from=requests.length;await click('#toc-complete');await wait(async()=>(await state()).history==='idle');assert.equal((await state()).items.length,7);assert.match((await state()).status,/單則提問字元數超出上限/);
    const d=await diagnostic();assert.equal(d.fullCount,0);assert.equal(d.lastHistory.outcome,'failed');assert.equal(d.lastHistory.limit.kind,'text-chars');assert.equal(d.lastHistory.limit.observed,262145);assert.equal(d.lastHistory.limit.maximum,262144);assert.equal(d.lastHistory.limit.stage,'head');
    assert.equal(requests.slice(from).filter(r=>r.kind==='history').length,1,'Text limits are not retried as smaller pages');
    await evaluate('window.fullFixture.mount(0);');await driver.sleep(250);await search('第0則');await click('#toc-list button[data-entry-id="turn-key:user:u-0"]');await wait(async()=>(await state()).nav==='located');
    const after=await diagnostic();assert.deepEqual(after.lastHistory,d.lastHistory);assert.ok(!JSON.stringify(after).includes('x'.repeat(100)));assert.ok(!JSON.stringify(after).includes(conversation));
    return {kind:d.lastHistory.limit.kind,observed:d.lastHistory.limit.observed,maximum:d.lastHistory.limit.maximum,sticky:true,partialInstalled:false};
  });
}catch(error){console.error(error);process.exitCode=1;await session.screenshot('full-history-fail.png').catch(()=>{});}
finally{await writeFile(resolve(artifacts,'results.json'),JSON.stringify({date:new Date().toISOString(),executor:process.env.TOC_TEST_EXECUTOR||'primary-agent',firefox:(await driver.getCapabilities()).get('browserVersion'),sample:'synthetic-200-prompts-localhost-no-real-account',build:JSON.parse(await readFile('dist/fixture/build-info.json','utf8')),results},null,2));await session.close();}
