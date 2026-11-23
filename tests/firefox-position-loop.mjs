import assert from 'node:assert/strict';
import {fixtureSession} from './firefox-session.mjs';

const {driver,url,optionsUrl,close}=await fixtureSession('artifacts/firefox-position-loop',{
  handleRequest(_req,res){
    res.setHeader('Content-Type','text/html');
    res.end('<!doctype html><meta charset="utf-8"><style>body{margin:0}#outer{height:650px;overflow:auto}main{height:600px}#viewport{height:500px;overflow:auto}.turn{height:400px}[data-user-message-bubble]{height:80px}</style>' +
      '<div id="outer"><div style="height:100px"></div><main><div id="viewport">' +
      Array.from({length:6},(_,i)=>'<section class="turn" data-turn-key="turn'+i+'"><div data-user-message-bubble data-message-id="q'+i+'">Question '+i+'</div><div data-conversation-role="assistant" data-message-id="a'+i+'">Answer '+i+'</div></section>').join('') +
      '</div></main><div style="height:1000px"></div></div><script>' +
      'const root=document.getElementById("viewport");window.testMode="styles";window.styleChanges=0;window.rebounds=0;window.moves=[];' +
      'new MutationObserver(records=>{window.styleChanges+=records.length;if(window.testMode==="styles")root.scrollTop=root.scrollHeight;}).observe(root,{attributes:true,attributeFilter:["style"],subtree:true});' +
      'root.addEventListener("scroll",()=>{window.moves.push(root.scrollTop);if(window.testMode==="persistent"&&root.scrollTop<root.scrollHeight-root.clientHeight-2)setTimeout(()=>{window.rebounds++;root.scrollTop=root.scrollHeight},80)});' +
      'root.scrollTop=root.scrollHeight;document.getElementById("outer").scrollTop=60;' +
      '</script>');
    return true;
  }
});
const js=(code,...args)=>driver.executeScript(code,...args);
const wait=(fn,label,ms=10000)=>driver.wait(fn,ms,label);
const click=selector=>js("document.getElementById('chatgpt-toc-root').shadowRoot.querySelector(arguments[0]).click()",selector);
const nav=()=>js("return document.getElementById('chatgpt-toc-root')?.dataset.navigation");
const diagnostic=async()=>{await click('#toc-diagnose');return js("return JSON.parse(document.getElementById('chatgpt-toc-root').shadowRoot.querySelector('#toc-diagnosis').textContent)");};
try{
  await driver.get(optionsUrl);
  await wait(()=>js("return (async()=>(await browser.scripting.getRegisteredContentScripts({ids:['chatgpt-toc']})).length===1)();"),'registration');
  await driver.get(url.replace('synthetic','position-loop'));
  await wait(()=>js("return !!document.getElementById('chatgpt-toc-root')"),'panel');
  await js("const t=document.getElementById('chatgpt-toc-root').shadowRoot.querySelector('.toggle');if(t.getAttribute('aria-expanded')!=='true')t.click()");
  await wait(()=>js("return document.getElementById('chatgpt-toc-root').shadowRoot.querySelectorAll('#toc-list [data-entry-id]').length===6"),'six prompts');
  await click('#toc-list [data-entry-id=q1]');
  await wait(async()=>await nav()==='located','position without changing website styles');
  let d=await diagnostic();
  assert.equal(d.navigation.lastPlacement.method,'conversation-root');
  assert.equal(d.navigation.lastPlacement.writes,1);
  assert.equal(await js("return window.styleChanges"),0);
  assert.equal(await js("return document.getElementById('outer').scrollTop"),60);
  assert.ok(await js("const r=document.getElementById('viewport'),p=r.querySelector('[data-message-id=q1]');return Math.abs(p.getBoundingClientRect().top-r.getBoundingClientRect().top-80)<3"));
  await js("window.testMode='persistent';document.getElementById('viewport').scrollTop=99999;window.moves=[]");
  await driver.sleep(250);
  await click('#toc-list [data-entry-id=q2]');
  await wait(async()=>await nav()==='loading','navigation begins');
  await wait(async()=>await nav()==='not-found','persistent rebound stops',7000);
  d=await diagnostic();
  assert.equal(d.navigation.lastPlacement.writes,2);
  assert.equal(d.navigation.lastPlacement.outcome,'unstable');
  assert.equal(d.navigation.lastPlacement.after,d.navigation.lastPlacement.before);
  assert.equal(d.navigation.lastAttempt,null,'a still-mounted target never re-enters history loading');
  const count=await js("return window.moves.length");
  await driver.sleep(1000);
  assert.equal(await js("return window.moves.length"),count,'no late retry or back-and-forth after stopping');
  console.log('PASS: a style-sensitive naturally flowing chat positions in one write without moving its outer scroll pane; persistent bottom rebound stops after two writes and has no late navigation.');
}finally{await close();}
