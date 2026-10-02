import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
await mkdir('artifacts/dom-history',{recursive:true});
await build({entryPoints:['src/dom.ts'],outfile:'artifacts/dom-history/dom.mjs',bundle:true,platform:'node',format:'esm',define:{__FIXTURE__:'false'}});
const {DomAdapter}=await import('../artifacts/dom-history/dom.mjs');
globalThis.location={origin:'https://chatgpt.com',pathname:'/c/synthetic'};
test('FULL direction: raw and role-qualified return anchors use full chronological order',()=>{
  const adapter=new DomAdapter({context:location.origin+location.pathname,epoch:1},()=>{});
  const entries=Array.from({length:11},(_,i)=>({id:'u'+i,text:'p'+i,stable:true}));
  adapter.useHistory(entries,1,entries.flatMap((e,i)=>[e.id,'a'+i]));
  adapter.nodes=new Map([['turn-key:user:u10',{isConnected:true}]]);
  for(const id of ['u0','turn-key:user:u0','turn:user:u0','message:user:u0','turn-key:assistant:a0'])assert.equal(adapter.direction(id),'older',id);
  adapter.nodes=new Map([['turn-key:assistant:a10',{isConnected:true}]]);
  assert.equal(adapter.direction('turn-key:assistant:a0'),'older');
  assert.equal(adapter.mounted('a10'),false,'A user target must never resolve to an assistant alias');
  adapter.nodes=new Map([['turn-key:user:u0',{isConnected:true}]]);assert.equal(adapter.direction('u10'),'newer');
});
