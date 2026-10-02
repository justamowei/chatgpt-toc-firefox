import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
await mkdir('artifacts/full-index', { recursive: true });
await build({ entryPoints: ['src/full-index.ts'], outfile: 'artifacts/full-index/full-index.mjs', bundle: true, platform: 'node', format: 'esm' });
const { FullHistoryIndex } = await import('../artifacts/full-index/full-index.mjs');
const history = { conversation: 'fixture', branch: 'server-path', exhausted: true, entries: Array.from({length: 200}, (_, i) => ({id: `u-${i}`, text: `提問 ${i} 完整搜尋`, stable: true})) };
const observation = (start = 193, end = 200, context = '/c/fixture') => ({context, branch: null, entries: history.entries.slice(start, end).map(e=>({...e, id: `turn-key:user:${e.id}`}))});
test('FULL: 200 prompts remain searchable through disjoint seven-prompt DOM windows', () => {
  const index = new FullHistoryIndex(); assert.equal(index.install(history, observation()), true);
  assert.equal(index.entries().length, 200); assert.equal(index.matched, 7);
  assert.deepEqual(index.search('提問 0').map(e=>e.id), ['u-0']);
  const revision=index.revision;
  assert.equal(index.observe(observation(0, 7)), false);
  assert.equal(index.entries().length,200); assert.equal(index.revision,revision);
  assert.equal(index.observe({...observation(), entries: []}), false);
  assert.equal(index.entries().length,200); assert.equal(index.binding,'unconfirmed');
});
test('FULL: exact case-sensitive content, subset order, new prompt, route and explicit invalidation revoke snapshot', () => {
  for(const mutate of [
    o=>({...o,entries:o.entries.map((e,i)=>i===0?{...e,text:e.text+' 增加文字'}:e)}),
    o=>({...o,entries:[...o.entries].reverse()}),
    o=>({...o,entries:[...o.entries,{id:'u-new',text:'新的提問',stable:true}]}),
    o=>({...o,context:'/c/other'}),
    o=>({...o,invalidated:true})
  ]) {
    const index=new FullHistoryIndex();index.install(history,observation());
    assert.equal(index.observe(mutate(observation())),true);assert.equal(index.snapshot,null);
  }
});
test('FULL: opaque identities do not assert branch identity or enable server navigation', () => {
  const index=new FullHistoryIndex(); assert.equal(index.install(history,{...observation(),entries:[{id:'opaque-key',text:'提問 193 完整搜尋',stable:true}]}),true);
  assert.equal(index.entries().length,200);assert.ok(index.entries().every(e=>!e.stable));assert.equal(index.binding,'unconfirmed');
});
test('FULL: whitespace rendering is tolerated, text-only similarity never supplies an identity', () => {
  const index=new FullHistoryIndex();assert.equal(index.install(history,{...observation(0,1),entries:[{id:'message:user:u-0',text:'提問   0\n完整搜尋',stable:true}]}),true);
  assert.equal(index.binding,'subset-matched');assert.equal(index.observe({ ...observation(), entries:[{id:'turn:user:different',text:history.entries[0].text,stable:true}] }),true);
  assert.equal(index.snapshot,null);
});
test('FULL: an empty virtual interval followed by completely new IDs revokes a formerly bound branch', () => {
  const index=new FullHistoryIndex();index.install(history,observation());
  assert.equal(index.observe({...observation(),entries:[]}),false);
  assert.equal(index.observe({...observation(),entries:[{id:'turn-key:user:new-branch',text:'另一分支',stable:true}]}),true);
  assert.equal(index.snapshot,null);assert.deepEqual(index.search('完整搜尋'),[]);
});
test('FULL: assistant regeneration with an explicit new message ID invalidates a slotless renderer', () => {
  const index=new FullHistoryIndex();const source={...history,messages:history.entries.flatMap(e=>[{id:e.id,role:'user'},{id:'a-'+e.id,role:'assistant'}])};
  const before={...observation(0,1),messages:[{id:'u-0',role:'user',apiId:'u-0'},{id:'a-u-0',role:'assistant',apiId:'a-u-0'}]};
  assert.equal(index.install(source,before),true);
  assert.equal(index.observe({...before,messages:[before.messages[0],{id:'a-regenerated',role:'assistant',apiId:'a-regenerated'}]}),true);
  assert.equal(index.snapshot,null);
});
test('FULL: attachment index labels do not make the same API prompt contradict the text-only DOM bubble', () => {
  const index=new FullHistoryIndex();
  const source={...history,entries:[{id:'file-user',text:'分析文件\n\n〔附件：file.txt〕',screenText:'分析文件',stable:true}]};
  assert.equal(index.install(source,{...observation(),entries:[{id:'file-user',text:'分析文件',stable:true}]}),true);
  assert.equal(index.search('file.txt').length,1);
  assert.equal(index.observe({...observation(),entries:[{id:'file-user',text:'分析文件增加內容',stable:true}]}),true);
});
