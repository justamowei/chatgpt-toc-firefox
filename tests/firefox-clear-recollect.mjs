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
      // Retained route surfaces remain laid out outside the horizontal viewport.
      for(let i=0;i<5;i++){
        const main=document.createElement('main');
        main.style.cssText='position:fixed;left:-3000px;top:0;width:800px;height:600px';
        const scroll=document.createElement('div');
        scroll.style.cssText='height:500px;overflow:auto';
        const copy=group.cloneNode(true);copy.removeAttribute('id');copy.style.cssText='position:relative;height:10000px';
        scroll.append(copy);main.append(scroll);document.body.prepend(main);scroll.scrollTop=9500;
      }
      viewport.addEventListener('scroll',()=>{
        if(!window.rebound)return;window.rebound=false;
        setTimeout(()=>{window.rebounds=(window.rebounds||0)+1;viewport.scrollTop=9500},350);
      });
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
  await js("window.upwardMoves=[document.getElementById('viewport').scrollTop];document.getElementById('viewport').addEventListener('scroll',()=>window.upwardMoves.push(document.getElementById('viewport').scrollTop));");
  await click('#toc-earlier');
  await wait(async()=>(await state()).ids.length===20,'recollect all 20 from a cleared tail',25000);
  assert.deepEqual((await state()).ids,Array.from({length:20},(_,i)=>'q'+i));
  await click('#toc-stop');
  const upwardMoves=await js("return window.upwardMoves");
  assert.ok(upwardMoves.every((top,index)=>index===0||top<=upwardMoves[index-1]+2),'collection only moves upward in this stable layout');
  for(const target of [16,2,18]){
    await click('#toc-list [data-entry-id=q'+target+']');
    await wait(()=>js("return document.querySelector('[data-chatgpt-toc-highlight]')?.getAttribute('data-message-id')===arguments[0];",'q'+target),'exact offscreen target '+target,18000);
    const position=await js("const root=document.getElementById('viewport'),node=root.querySelector('[data-message-id=\"q'+arguments[0]+'\"]');return {top:root.scrollTop,y:node.getBoundingClientRect().top-root.getBoundingClientRect().top,page:document.scrollingElement.scrollTop};",target);
    assert.ok(position.top>0,'target must not jump to the page head');
    assert.ok(Math.abs(position.y-80)<=3,'align the actual target bubble');
    assert.equal(position.page,0,'only move the conversation viewport');
  }
  assert.equal(await js("return document.querySelectorAll('main').length"),6);
  await js("window.rebound=true;document.getElementById('viewport').querySelector('[data-message-id=q17]').style.scrollMarginTop='900px'");
  await click('#toc-list [data-entry-id=q17]');
  await wait(()=>js("const h=document.getElementById('chatgpt-toc-root');return h.dataset.navigation==='located' && document.querySelector('[data-chatgpt-toc-highlight]')?.getAttribute('data-message-id')==='q17' && window.rebounds===1;"),'recover a delayed return to the bottom',18000);
  await driver.sleep(650);
  const stable=await js("const root=document.getElementById('viewport'),node=root.querySelector('[data-message-id=q17]');return {y:node?.getBoundingClientRect().top-root.getBoundingClientRect().top,top:root.scrollTop};");
  assert.ok(Math.abs(stable.y-80)<=3,'success must remain at the exact prompt after the rebound');
  assert.ok(stable.top<9500);
  await js("const root=document.getElementById('viewport'),group=document.getElementById('group'),far=document.createElement('section');far.style.top='1500px';far.innerHTML='<div data-user-message-bubble data-message-id=q3>Question 3</div>';group.append(far);window.longJumpMoves=[];root.addEventListener('scroll',()=>window.longJumpMoves.push(root.scrollTop));");
  await driver.sleep(250);
  await click('#toc-list [data-entry-id=q1]');
  await wait(()=>js("const h=document.getElementById('chatgpt-toc-root');return h.dataset.navigation==='located'&&document.querySelector('[data-chatgpt-toc-highlight]')?.getAttribute('data-message-id')==='q1';"),'use the distant mounted prompt',18000);
  const longMoves=await js("return window.longJumpMoves");
  assert.ok(longMoves[0]<2000,'first move must choose q3 far above the current mounted window');
  console.log('PASS: hidden labels ignored, nested viewport recovered with no accepted turns, reused route nodes restored, clear/recollect gets all 20, distant jumps hit exact bubbles, and a delayed bottom rebound recovers with six retained mains; collection stays upward and navigation uses the most distant mounted approach prompt.');
} catch(error) { console.error(JSON.stringify({state:await state(),diagnostic:await diagnostic()})); throw error; } finally { await close(); }
