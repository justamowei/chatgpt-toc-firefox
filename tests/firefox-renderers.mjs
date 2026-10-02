import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { By } from 'selenium-webdriver';
import { fixtureSession } from './firefox-session.mjs';
const session = await fixtureSession(process.env.TOC_TEST_ARTIFACTS || 'artifacts/firefox-renderers');
const { driver, url, action, artifacts } = session;
const results = [];
const evaluate = (code, ...args) => driver.executeScript(code, ...args);
const state = () => evaluate(`const h=document.getElementById('chatgpt-toc-root');return h?{nav:h.dataset.navigation,scope:h.shadowRoot.querySelector('#toc-scope').textContent,items:Array.from(h.shadowRoot.querySelectorAll('#toc-list button')).map(b=>({id:b.dataset.entryId,text:b.textContent,disabled:b.disabled}))}:null`);
const wait = predicate => driver.wait(predicate, 8000);
async function click(selector) { const root=await (await driver.findElement(By.id('chatgpt-toc-root'))).getShadowRoot(); const node=await root.findElement(By.css(selector)); await node.click(); }
async function test(name, run) {
  try { const actual = await run(); results.push({ name, status: 'PASS', actual }); console.log(`${name} PASS ${JSON.stringify(actual)}`); }
  catch (error) { results.push({ name, status: 'FAIL', error: error.message }); throw error; }
}
async function layout(kind) {
  await evaluate(`
    window.fixture.mode('mounted');const m=document.querySelector('main');m.replaceChildren();m.removeAttribute('data-fixture-branch');
    for(let i=0;i<6;i++){
      const prompt=i===4||i===5?'相同提問':'新版提問 '+i;
      const section=document.createElement('section'); section.style.cssText='min-height:320px;margin:20px;padding:20px';
      if(arguments[0]==='group'){
        section.setAttribute('data-turn-key','key-'+i);
        const bubble=document.createElement('div');bubble.setAttribute('data-user-message-bubble','');bubble.textContent=prompt;section.append(bubble);
        const controls=document.createElement('button');controls.textContent='複製編輯';section.append(controls);
        const answer=document.createElement('div');answer.setAttribute('data-conversation-role','assistant');answer.style.minHeight='180px';answer.textContent='回答 '+i;
        const sentinel=document.createElement('span');sentinel.setAttribute('data-chatgpt-agent-turn-start','');answer.prepend(sentinel);section.append(answer);
      }else{
        section.setAttribute('data-testid','conversation-turn-'+(2*i));section.setAttribute('data-turn','user');section.setAttribute('data-turn-id','turn-'+i);
        const text=document.createElement('div');text.textContent=prompt;section.append(text);
        const controls=document.createElement('button');controls.textContent='複製編輯';section.append(controls);
      }
      m.append(section);
    }
    // These are unrelated UI and an empty virtualized shell, not prompts.
    const aside=document.createElement('aside');aside.innerHTML='<div data-turn-key="sidebar"><div data-user-message-bubble>側欄</div></div>';m.append(aside);
    const form=document.createElement('form');form.innerHTML='<div data-turn-key="composer"><div data-user-message-bubble>輸入框</div></div>';m.append(form);
    const empty=document.createElement('section');empty.setAttribute('data-testid','conversation-turn-99');empty.setAttribute('data-turn','user');empty.setAttribute('data-turn-id','unmounted');m.append(empty);
  `, kind);
}
try {
  await driver.get(url); await layout('group');
  await test('NEW-01:zero-regression', async () => {
    const legacyCount = await evaluate(`return document.querySelector('main').querySelectorAll('[data-message-author-role]').length`);
    assert.equal(legacyCount, 0, 'This fixture must reproduce the old selector blind spot');
    await action(); await wait(async () => (await state())?.items.length === 6); await action();
    const s=await state(); assert.ok(s.items.every(e=>!e.disabled)); assert.ok(s.items.every(e=>!e.text.includes('複製編輯')));
    assert.deepEqual(s.items.map(e=>e.id),Array.from({length:6},(_,i)=>'turn-key:user:key-'+i));
    assert.match(s.scope,/歷史尚未完整/);
    await click('#toc-diagnose');const diagnostic=JSON.parse(await evaluate(`return document.getElementById('chatgpt-toc-root').shadowRoot.querySelector('#toc-diagnosis').textContent`));
    assert.equal(diagnostic.version,'0.1.1');assert.equal(diagnostic.collected,6);assert.ok(Object.values(diagnostic).every(v=>typeof v==='number'||v==='0.1.1'));
    return {legacy_visible_prompts:0,fixed:6,unknown_history:true,diagnostic_counts_only:true};
  });
  await test('NEW-02:target-highlight-return', async () => {
    await evaluate(`const m=document.querySelector('main'),n=m.querySelector('[data-conversation-role="assistant"]');m.scrollTop+=n.getBoundingClientRect().top-m.getBoundingClientRect().top-100;`);
    const before=await evaluate(`return document.querySelector('[data-conversation-role="assistant"]').getBoundingClientRect().top`);
    await click('#toc-list button[data-entry-id="turn-key:user:key-5"]'); await wait(async()=>(await state()).nav==='located');
    const highlight=await evaluate(`const n=document.querySelector('[data-chatgpt-toc-highlight]');return {id:n.getAttribute('data-chatgpt-toc-highlight'),outline:getComputedStyle(n).outlineWidth,legacy:n.hasAttribute('data-message-author-role')}`);
    assert.equal(highlight.id,'turn-key:user:key-5');assert.equal(highlight.outline,'3px');assert.equal(highlight.legacy,false);
    await click('#toc-back'); await wait(async()=>await evaluate(`return document.getElementById('chatgpt-toc-root').dataset.restored==='true'`));
    const error=Math.abs(await evaluate(`return document.querySelector('[data-conversation-role="assistant"]').getBoundingClientRect().top`)-before);assert.ok(error<=24);return {highlight,error};
  });
  await test('NEW-03:nested-dedup-and-attachment',async()=>{
    await evaluate(`const n=document.querySelector('[data-user-message-bubble]');n.setAttribute('data-message-author-role','user');n.setAttribute('data-message-id','real-id');const wrapper=document.createElement('div');wrapper.setAttribute('data-message-author-role','user');wrapper.setAttribute('data-message-id','real-id');n.replaceWith(wrapper);wrapper.append(n);const group=document.createElement('section');group.setAttribute('data-turn-key','attachment');group.innerHTML='<div data-user-message-bubble><img alt=""></div>';document.querySelector('main').append(group);`);
    await wait(async()=>(await state()).items.length===7);const s=await state();assert.equal(s.items.filter(e=>e.id==='real-id').length,1);assert.equal(s.items.at(-1).text,'〔附件或非文字提問〕');return {count:7,nested_duplicates:0};
  });
  await test('NEW-04:attribute-only-hydration',async()=>{
    await evaluate(`const g=document.createElement('section');g.id='hydrating';g.style.minHeight='300px';const n=document.createElement('div');n.textContent='稍後辨識';g.append(n);document.querySelector('main').append(g);`);
    await driver.sleep(250);assert.equal((await state()).items.length,7);
    await evaluate(`const g=document.getElementById('hydrating');g.setAttribute('data-turn-key','hydrated');g.firstChild.setAttribute('data-user-message-bubble','');`);
    await wait(async()=>(await state()).items.length===8);assert.equal((await state()).items.at(-1).id,'turn-key:user:hydrated');return {before:7,after:8};
  });
  await test('NEW-05:shell-renderer',async()=>{
    await layout('shell');await wait(async()=>(await state()).items.length===6&&(await state()).items[0].id==='turn:user:turn-0');
    const s=await state();assert.ok(s.items.every(e=>!e.disabled&&!e.text.includes('複製編輯')));await click('#toc-list button[data-entry-id="turn:user:turn-3"]');await wait(async()=>(await state()).nav==='located');return {count:6,located:true,empty_shells:0};
  });
  await test('NEW-06:identity-and-branch-conservatism',async()=>{
    await evaluate(`document.querySelector('[data-turn-id="turn-3"]').setAttribute('data-turn-id','replacement');`);
    await wait(async()=>(await state()).items.some(e=>e.id==='turn:user:replacement'));const root=await (await driver.findElement(By.id('chatgpt-toc-root'))).getShadowRoot();assert.equal(await (await root.findElement(By.id('toc-back'))).isEnabled(),false);
    await evaluate(`document.querySelector('[data-turn-id="turn-0"]').removeAttribute('data-turn-id');`);await wait(async()=>(await state()).items[0].disabled);
    await evaluate(`document.querySelector('[data-testid="conversation-turn-2"]').remove();`);await wait(async()=>(await state()).items.length===5);assert.ok(!(await state()).items.some(e=>e.id==='turn:user:turn-1'));return {unstable_disabled:true,unmounted_retained:false,return_invalidated:true};
  });
  await test('NEW-07:empty-sentinel-shared-wrapper',async()=>{
    await evaluate(`window.fixture.mode('mounted');const m=document.querySelector('main');m.removeAttribute('data-fixture-branch');m.innerHTML='<section data-turn-key="only-user"><div style="min-height:1600px"><div data-user-message-bubble style="height:100px">只有提問</div><span data-chatgpt-agent-turn-start></span></div></section><section data-turn-key="far-user" style="min-height:400px"><div data-user-message-bubble>遠方提問</div></section>';m.scrollTop=700;`);
    await wait(async()=>(await state()).items.length===2&&(await state()).items[0].id==='turn-key:user:only-user');
    await click('#toc-list button[data-entry-id="turn-key:user:far-user"]');await wait(async()=>(await state()).nav==='located');
    const root=await (await driver.findElement(By.id('chatgpt-toc-root'))).getShadowRoot();assert.equal(await (await root.findElement(By.id('toc-back'))).isEnabled(),false,'Empty sentinel must not turn the shared user wrapper into an assistant return anchor');
    return {phantom_assistant_anchor:false,back_disabled:true};
  });
  await test('NEW-08:empty-sentinel-shared-turn-shell',async()=>{
    await evaluate(`const m=document.querySelector('main');m.innerHTML='<section data-turn-key="shell-user"><div style="min-height:1600px"><section data-testid="conversation-turn-0" data-turn="user" data-turn-id="shell-user-id" style="height:100px">只有舊殼提問</section><span data-chatgpt-agent-turn-start></span></div></section><section data-turn-key="far-shell" style="min-height:400px"><div data-user-message-bubble>遠方提問</div></section>';m.scrollTop=700;`);
    await wait(async()=>(await state()).items.length===2&&(await state()).items[0].id==='turn-key:user:shell-user');
    await click('#toc-list button[data-entry-id="turn-key:user:far-shell"]');await wait(async()=>(await state()).nav==='located');
    const root=await (await driver.findElement(By.id('chatgpt-toc-root'))).getShadowRoot();assert.equal(await (await root.findElement(By.id('toc-back'))).isEnabled(),false,'Turn-shell user content must not supply an assistant return anchor');
    return {phantom_assistant_anchor:false,back_disabled:true};
  });
} catch(error) { console.error(error);process.exitCode=1; }
finally {const caps=await driver.getCapabilities();await writeFile(resolve(artifacts,'results.json'),JSON.stringify({date:new Date().toISOString(),executor:process.env.TOC_TEST_EXECUTOR||'primary-agent',firefox:caps.get('browserVersion'),build:JSON.parse(await readFile('dist/fixture/build-info.json','utf8')),results},null,2));await session.close();}
