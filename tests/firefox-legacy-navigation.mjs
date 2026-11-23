import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fixtureSession} from './firefox-session.mjs';

const {driver,url,optionsUrl,close}=await fixtureSession('artifacts/firefox-legacy-navigation',{
  handleRequest(_request,response){
    response.setHeader('Content-Type','text/html');
    response.end('<!doctype html><main></main>');
    return true;
  },
});
const renderer=await readFile('tests/fixtures/recovery-renderer.js','utf8');
const js=(code,...args)=>driver.executeScript(code,...args);
const wait=(check,label,timeout=20000)=>driver.wait(check,timeout,label);
const click=selector=>js("document.getElementById('chatgpt-toc-root').shadowRoot.querySelector(arguments[0]).click()",selector);
const state=()=>js("const h=document.getElementById('chatgpt-toc-root');if(!h)return null;return {nav:h.dataset.navigation,ids:[...h.shadowRoot.querySelectorAll('#toc-list [data-entry-id]')].map(b=>b.dataset.entryId),highlight:document.querySelector('[data-chatgpt-toc-highlight]')?.getAttribute('data-message-id')};");
try{
  await driver.get(optionsUrl);
  await wait(()=>js("return (async()=>(await browser.scripting.getRegisteredContentScripts({ids:['chatgpt-toc']})).length===1)();"),'registration');
  await driver.get(url.replace('synthetic','restored-navigation'));
  await js(renderer,23,'restored');
  await wait(()=>js("return !!document.getElementById('chatgpt-toc-root')"),'panel');
  await js("const t=document.getElementById('chatgpt-toc-root').shadowRoot.querySelector('.toggle');if(t.getAttribute('aria-expanded')!=='true')t.click()");
  await wait(async()=>(await state())?.ids.length===7,'seven tail prompts');
  await click('#toc-earlier');
  await wait(async()=>(await state()).ids.length===30,'collect all thirty',40000);
  await click('#toc-stop');
  assert.deepEqual((await state()).ids,Array.from({length:30},(_,i)=>'restored:u-'+i));
  const results=[];
  for(const target of [24,3,25,2]){
    await click('#toc-list [data-entry-id="restored:u-'+target+'"]');
    await wait(async()=>{const s=await state();return s.nav==='located'&&s.highlight==='restored:u-'+target;},'reach target '+target,25000);
    const position=await js("const n=document.querySelector('[data-message-id=\"restored:u-'+arguments[0]+'\"]'),r=n.closest('[data-scroll-root]'),rect=n.getBoundingClientRect(),v=r.getBoundingClientRect();return {top:rect.top-v.top,bottom:rect.bottom-v.top,viewport:r.clientHeight};",target);
    assert.ok(position.top>=-2&&position.top<100,'prompt beginning is near the top');
    assert.ok(position.bottom<=position.viewport,'prompt is fully visible');
    results.push(target);
  }
  const stats=await js("return window.anchorFixture.stats()");
  assert.ok(stats.calls.some(c=>c.direction==='older'));
  assert.ok(stats.calls.some(c=>c.direction==='newer'&&c.role==='assistant'),'forward navigation must reach the answer shell edge');
  assert.equal(stats.calls.filter(c=>c.pinned).length,0,'detached pinned tail does not skip the unknown interval');
  console.log('PASS: collected 30/30 and reached exact offscreen targets '+results.join(' -> ')+' using the restored older/user and newer/assistant shell edges.');
}finally{await close();}
