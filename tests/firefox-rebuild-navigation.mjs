import assert from 'node:assert/strict';
import { fixtureSession } from './firefox-session.mjs';
const { driver, url, optionsUrl, close } = await fixtureSession('artifacts/firefox-rebuild-navigation', {
  handleRequest(_req, res) {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html><meta charset="utf-8"><style>section{height:700px}main{height:500px;overflow:auto}</style>
      <main style="display:none"><section data-turn-key="hidden"><div data-user-message-bubble data-message-id="q2">Hidden duplicate</div></section></main>
      <main id="live">${[0,1,2,3].map(i=>`<section data-turn-key="k${i}"><div data-user-message-bubble data-message-id="q${i}">Question ${i}</div></section>`).join('')}</main>
      <script>
        const main=document.getElementById('live');
        main.addEventListener('scroll',()=>{
          if(!window.armed || window.scheduled || main.scrollTop<100) return;
          window.scheduled=true;window.original=document.querySelector('[data-message-id="q2"]:not(main[style] *)');
          setTimeout(()=>{
            main.innerHTML=main.innerHTML;
            for(const section of main.querySelectorAll('section')) section.style.height='900px';
            main.scrollTop=main.scrollHeight;window.rebuilt=true;
          },500);
        });
      </script>`);
    return true;
  },
});
const js=(s,...args)=>driver.executeScript(s,...args);
const wait=fn=>driver.wait(fn,12000);
const click=s=>js("document.getElementById('chatgpt-toc-root').shadowRoot.querySelector(arguments[0]).click()",s);
try {
  await driver.get(optionsUrl);
  await wait(()=>js("return (async()=>(await browser.scripting.getRegisteredContentScripts({ids:['chatgpt-toc']})).length===1)()"));
  await driver.get(url);
  await wait(()=>js("return !!document.getElementById('chatgpt-toc-root')"));
  await js("const t=document.getElementById('chatgpt-toc-root').shadowRoot.querySelector('.toggle');if(t.getAttribute('aria-expanded')!=='true')t.click()");
  await wait(()=>js("return document.getElementById('chatgpt-toc-root').shadowRoot.querySelectorAll('#toc-list [data-entry-id]').length===4"));
  assert.equal(await js("return document.getElementById('chatgpt-toc-root').shadowRoot.querySelector('#toc-list').textContent.includes('Hidden duplicate')"),false);
  await js("window.armed=true");
  await click('#toc-list [data-entry-id="q2"]');
  await driver.sleep(450);
  assert.notEqual(await js("return document.getElementById('chatgpt-toc-root').dataset.navigation"),'located','must not finish before delayed rebuild');
  await wait(()=>js("return window.rebuilt===true"));
  await wait(()=>js("return document.getElementById('chatgpt-toc-root').dataset.navigation==='located'"));
  const result=await js("const n=document.querySelector('#live [data-message-id=q2]');return {top:n.getBoundingClientRect().top,root:document.getElementById('live').getBoundingClientRect().top,highlight:n.getAttribute('data-toc-located'),replaced:n!==window.original}");
  assert.equal(result.replaced,true);assert.equal(result.highlight,'q2');assert.ok(Math.abs(result.top-result.root)<4,JSON.stringify(result));
  await js("const old=document.getElementById('live');old.style.display='none';history.pushState({},'', '/c/other');const next=document.createElement('main');next.innerHTML='<section data-turn-key=next><div data-user-message-bubble data-message-id=next>Next conversation</div></section>';document.body.append(next)");
  await wait(()=>js("return document.getElementById('chatgpt-toc-root').shadowRoot.querySelector('#toc-list [data-entry-id=next]')!==null"));
  assert.deepEqual(await js("return [...document.getElementById('chatgpt-toc-root').shadowRoot.querySelectorAll('#toc-list [data-entry-id]')].map(n=>n.dataset.entryId)"),['next']);
  console.log('PASS: hidden duplicate excluded; delayed rebuild replaces target and returns to bottom; navigation reacquires and aligns target before success; route switch indexes only displayed conversation.');
} finally { await close(); }
