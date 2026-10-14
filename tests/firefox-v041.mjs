import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';
import {fixtureSession} from './firefox-session.mjs';

const session=await fixtureSession('artifacts/firefox-v041');
const {driver,artifacts}=session,results=[];
const git=(...args)=>{const r=spawnSync('git',['-c','safe.directory='+process.cwd().replaceAll('\\','/'),...args],{encoding:'utf8',windowsHide:true});if(r.status!==0)throw Error(r.stderr);return r.stdout;};
const baseline=git('show','v0.4.0:src/dom.ts');
async function compile(old){const r=await build({stdin:{contents:"import {IndexStore} from './src/core';import {DomAdapter} from './src/dom';window.eligibilityHarness={IndexStore,DomAdapter};",resolveDir:resolve('.')},bundle:true,write:false,format:'iife',platform:'browser',target:'firefox140',define:{__FIXTURE__:'true',__REVISION__:JSON.stringify('test-only')},plugins:old?[{name:'baseline-dom',setup(b){b.onLoad({filter:/[\\/]src[\\/]dom\.ts$/},()=>({contents:baseline,loader:'ts'}));}}]:[]});return r.outputFiles[0].text;}
const codes={old:await compile(true),current:await compile(false)};
async function scenario(source,mode){
 await driver.get(session.url);await driver.wait(()=>driver.executeScript('return !!document.getElementById("chatgpt-toc-root")'),10000);
 await driver.executeScript("document.getElementById('chatgpt-toc-root').shadowRoot.getElementById('toc-disable').click()");
 await driver.executeScript(codes[source]);
 return driver.executeScript(`return (async()=>{
  const {IndexStore,DomAdapter}=window.eligibilityHarness;
  document.body.innerHTML='<div data-scroll-root style="width:900px;height:500px;overflow:auto;position:relative"><main style="height:4000px;position:relative"></main></div>';
  const root=document.querySelector('[data-scroll-root]'),main=document.querySelector('main');
  const ys={a:500,b:1500,c:2500,x:3300,y:3400},store=new IndexStore();let adapter,timer;
  const paint=ids=>{main.replaceChildren();for(const id of ids){const shell=document.createElement('section');shell.dataset.turn='user';shell.dataset.turnId=id;shell.dataset.testid='conversation-turn-'+id;shell.style.cssText='position:absolute;top:'+ys[id]+'px;height:100px;width:800px';const body=document.createElement('div');body.dataset.messageAuthorRole='user';body.dataset.messageId=id;body.textContent='Local prompt '+id;body.style.height='80px';shell.append(body);main.append(shell);}};
  const refresh=()=>{store.merge(adapter.read());adapter.remember();};adapter=new DomAdapter(store,refresh);
  paint(['a','b']);refresh();paint(['b','c']);refresh();
  store.merge({context:store.context,branch:store.branch,entries:[{id:'x',text:'Local prompt x',stable:true},{id:'y',text:'Local prompt y',stable:true}]});
  if(arguments[0]==='sparse'){paint(['a','c']);refresh();}
  if(arguments[0]==='gap'){adapter.dispose();adapter=new DomAdapter(store,refresh);paint(['a']);refresh();}
  if(arguments[0]==='unseen'){adapter.dispose();adapter=new DomAdapter(store,refresh);}
  paint(['c']);root.scrollTop=2500;refresh();
  if(arguments[0]==='other-anchor'){paint(['x','y']);root.scrollTop=3300;refresh();}
  if(arguments[0]==='width')root.style.width='1000px';
  if(arguments[0]==='ambiguous')store.merge({context:store.context,branch:store.branch,entries:[{id:'a',text:'Local prompt a',stable:true},{id:'z',text:'Local prompt z',stable:true}]});
  const ignoreDirect=arguments[0]==='miss';
  let scrollEvents=0;root.addEventListener('scroll',()=>{scrollEvents++;clearTimeout(timer);timer=setTimeout(()=>paint(!ignoreDirect&&root.scrollTop<1200?['a','b']:['c']),40);});
  const estimateBeforeNavigation=adapter.geometry.estimate('a',[{id:'c',y:2500}],['a','b','c'],root.clientWidth);
  adapter.begin();const controller=new AbortController();const start=performance.now();
  const loaded=await adapter.load('older',controller.signal,1800,'a');
  const located=loaded&&await adapter.locate('a',controller.signal);
  const diagnostic=adapter.diagnostic(),highlight=document.querySelector('[data-chatgpt-toc-highlight]')?.getAttribute('data-toc-located')??null;
  const result={globalOrdered:store.ordered,segments:store.segments.map(s=>({ordered:s.ordered,count:s.ids.length})),estimateBeforeNavigation,loaded,located,highlight,scrollEvents,elapsedMs:Math.round(performance.now()-start),diagnostic,fallbackMessage:adapter.fastFallbackMessage};
  controller.abort();clearTimeout(timer);adapter.dispose();return result;
 })();`,mode);
}
async function test(name,fn){try{const actual=await fn();results.push({name,status:'PASS',actual});console.log(name+' PASS '+JSON.stringify(actual));}catch(e){results.push({name,status:'FAIL',error:String(e)});throw e;}}
try{
 await test('UNRELATED ordered component: original gate walks; patch jumps and verifies exact target',async()=>{
  const before=await scenario('old','gate'),after=await scenario('current','gate');
  assert.equal(before.globalOrdered,false);assert.equal(before.estimateBeforeNavigation,500);assert.equal(before.diagnostic.fast.attempts,0);assert.equal(before.loaded,false);
  assert.equal(after.globalOrdered,false);assert.equal(after.diagnostic.fast.attempts,1);assert.equal(after.diagnostic.fast.result,'mounted');assert.equal(after.diagnostic.fast.eligibility.targetSegmentOrdered,true);assert.equal(after.highlight,'a');assert.equal(after.located,true);
  return {before,after};
 });
 await test('SPARSE mounted a,c cannot replace ordered a,b,c successor; old loses chain, patch jumps',async()=>{
  const before=await scenario('old','sparse'),after=await scenario('current','sparse');assert.equal(before.estimateBeforeNavigation,null);assert.equal(after.estimateBeforeNavigation,500);assert.equal(before.diagnostic.fast.attempts,0);assert.equal(after.diagnostic.fast.attempts,1);assert.equal(after.highlight,'a');return {before,after};
 });
 for(const [mode,reason] of [['gap','span-gap'],['unseen','target-not-observed'],['width','width-changed'],['ambiguous','target-order-unconfirmed']]){
  await test(mode.toUpperCase()+' reports rejection and never invents a direct position',async()=>{const r=await scenario('current',mode);assert.equal(r.diagnostic.fast.attempts,0);assert.equal(r.diagnostic.fast.skipReason,reason);assert.equal(r.highlight,null);return r;});
 }
 await test('OTHER segment anchors cannot supply a shortcut across unconfirmed group order',async()=>{
  const r=await scenario('current','other-anchor');assert.equal(r.diagnostic.fast.attempts,0);assert.equal(r.diagnostic.fast.skipReason,'span-gap');assert.equal(r.diagnostic.fast.eligibility.mountedAnchors,0);assert.equal(r.diagnostic.fast.lastAttempt,null);assert.equal(r.highlight,null);return r;
 });
 await test('MISS retains the direct attempt after walking updates lastAttempt',async()=>{
  const r=await scenario('current','miss');assert.equal(r.diagnostic.fast.result,'miss');assert.equal(r.diagnostic.fast.attempts,1);assert.equal(r.diagnostic.fast.fallbacks,1);assert.equal(r.diagnostic.fast.lastAttempt.method,'observed-span-jump');assert.equal(r.diagnostic.lastAttempt.method,'mounted-edge-anchor');assert.equal(r.fallbackMessage,'直接跳轉後目標未掛載');assert.equal(r.highlight,null);return r;
 });
}catch(e){console.error(e);process.exitCode=1;await session.screenshot('failure.png').catch(()=>{});}
finally{const caps=await driver.getCapabilities();await writeFile(resolve(artifacts,'results.json'),JSON.stringify({suite:'v0.4.1 eligibility regression on isolated Firefox localhost; not ChatGPT LIVE',firefox:caps.get('browserVersion'),results},null,2));await session.close();}
