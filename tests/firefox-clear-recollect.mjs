import assert from 'node:assert/strict';
import { fixtureSession } from './firefox-session.mjs';

const { driver, url, optionsUrl, close } = await fixtureSession('artifacts/firefox-clear-recollect', {
  handleRequest(_request, response) {
    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html><meta charset="utf-8"><style>
      body{margin:0;height:100vh;overflow:hidden}main{height:600px}
      #viewport{height:500px;overflow:auto;overflow-anchor:none}#group{position:relative;height:10000px}
      section{position:absolute;height:500px;left:0;right:0}
      [data-user-message-bubble]{height:80px}#hidden-copy{display:none}
      </style><main><div id="viewport"><div id="group" data-turn-key="shared"></div></div>
      <div id="hidden-copy"><div data-user-message-bubble data-message-id="hidden-label">你說：</div></div></main>
      <script>
      const viewport=document.getElementById('viewport'), group=document.getElementById('group');
      let timer;
      function render(){
        const start=Math.max(0,Math.min(17,Math.floor(viewport.scrollTop/500)-1));
        group.replaceChildren();
        for(let i=start;i<Math.min(20,start+4);i++){
          const section=document.createElement('section');section.style.top=(i*500)+'px';
          section.innerHTML='<h5 data-conversation-role="user">你說：</h5><div data-user-message-bubble data-message-id="q'+i+'">Question '+i+'</div><div data-conversation-role="assistant" data-message-id="a'+i+'" style="height:380px">Answer '+i+'</div>';
          group.append(section);
        }
      }
      viewport.addEventListener('scroll',()=>{clearTimeout(timer);timer=setTimeout(render,90)});
      viewport.scrollTop=9500;render();
      </script>`);
    return true;
  },
});
const js=(code,...args)=>driver.executeScript(code,...args);
const wait=(check,message,timeout=15000)=>driver.wait(check,timeout,message);
const state=()=>js("const h=document.getElementById('chatgpt-toc-root');if(!h)return null;const s=h.shadowRoot;return {nav:h.dataset.navigation,ids:[...s.querySelectorAll('#toc-list [data-entry-id]')].map(b=>b.dataset.entryId),status:s.querySelector('#toc-status').textContent};");
const click=selector=>js("document.getElementById('chatgpt-toc-root').shadowRoot.querySelector(arguments[0]).click();",selector);
const diagnostic=async()=>{
  await click('#toc-diagnose');
  return js("return JSON.parse(document.getElementById('chatgpt-toc-root').shadowRoot.querySelector('#toc-diagnosis').textContent);");
};
try {
  await driver.get(optionsUrl);
  await wait(()=>js("return (async()=>(await browser.scripting.getRegisteredContentScripts({ids:['chatgpt-toc']})).length===1)();"),'registration');
  await driver.get(url);
  await wait(async()=>!!await state(),'panel');
  await js("const t=document.getElementById('chatgpt-toc-root').shadowRoot.querySelector('.toggle');if(t.getAttribute('aria-expanded')!=='true')t.click();");
  await wait(async()=>(await state()).ids.includes('q19'),'initial mounted prompts');
  assert.ok(!(await state()).ids.includes('hidden-label'),'ignore renderer copies hidden by CSS');
  await driver.sleep(500);
  const route=await js("return location.pathname");
  await js("history.pushState({},'', '/c/other');dispatchEvent(new PopStateEvent('popstate'));");
  await wait(async()=>(await diagnostic()).navigation.prompts.parsed===0,'previous-route nodes filtered');
  assert.equal((await diagnostic()).navigation.scroll.tag,'DIV','raw turns retain their actual nested scroll viewport');
  await js("history.pushState({},'',arguments[0]);dispatchEvent(new PopStateEvent('popstate'));",route);
  await wait(async()=>(await diagnostic()).mounted>=3,'cached original nodes accepted when returning to their route');
  await click('#toc-clear-page');
  await wait(async()=>(await state()).status.includes('已清除本頁目錄'),'page cleared');
  await click('#toc-earlier');
  await wait(async()=>(await state()).ids.length===20,'recollect all 20 from a cleared tail',25000);
  assert.deepEqual((await state()).ids,Array.from({length:20},(_,i)=>'q'+i));
  await click('#toc-stop');
  for(const target of [16,2,18]){
    await click('#toc-list [data-entry-id=q'+target+']');
    await wait(()=>js("return document.querySelector('[data-chatgpt-toc-highlight]')?.getAttribute('data-message-id')===arguments[0];",'q'+target),'exact offscreen target '+target,18000);
    const position=await js("const root=document.getElementById('viewport'),node=document.querySelector('[data-message-id=\"q'+arguments[0]+'\"]');return {top:root.scrollTop,y:node.getBoundingClientRect().top-root.getBoundingClientRect().top,page:document.scrollingElement.scrollTop};",target);
    assert.ok(position.top>0,'target must not jump to the page head');
    assert.ok(Math.abs(position.y)<=3,'align the actual target bubble');
    assert.equal(position.page,0,'only move the conversation viewport');
  }
  console.log('PASS: hidden labels ignored, nested viewport recovered with no accepted turns, reused route nodes restored, clear/recollect gets all 20, and distant jumps hit exact bubbles.');
} catch(error) { console.error(JSON.stringify({state:await state(),diagnostic:await diagnostic()})); throw error; } finally { await close(); }
