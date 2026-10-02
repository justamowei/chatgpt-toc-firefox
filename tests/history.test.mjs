import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
await mkdir('artifacts/history', { recursive: true });
for (const fixture of [false, true]) await build({ entryPoints: ['src/history.ts'], outfile: `artifacts/history/history${fixture ? '-fixture' : ''}.mjs`, bundle: true, platform: 'node', format: 'esm', define: { __FIXTURE__: String(fixture) } });
const { loadHistory, HistoryError } = await import('../artifacts/history/history.mjs');
const { loadHistory: fixtureLoad } = await import('../artifacts/history/history-fixture.mjs');
const uuid = '01234567-89ab-cdef-0123-456789abcdef', other = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const url = `https://chatgpt.com/c/${uuid}`, token = 'synthetic-token';
const msg = (id, role = 'user', text = id, extra = {}) => ({ id, author: { role }, content: { content_type: 'text', parts: [text] }, ...extra });
const page = (messages = [msg('u1'), msg('a1', 'assistant')], previous = false, cursor = null, extra = {}) => ({ conversation_id: uuid, current_node: 'a1', update_time: 1, messages, page_info: { has_previous_page: previous, start_cursor: cursor }, ...extra });
const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
const status = (code, headers = {}) => new Response('', { status: code, headers });
function queue(responses) {
  const calls = []; let index = 0;
  const fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    if (index >= responses.length) throw Error('Unexpected synthetic request');
    const value = responses[index++]; return typeof value === 'function' ? value(input, init) : value instanceof Response ? value : json(value);
  };
  return { fetch, calls };
}
async function run(responses, opts = {}) {
  const q = queue([{ accessToken: token }, ...responses]); const controller = new AbortController();
  const snapshot = await loadHistory(opts.url ?? url, controller.signal, opts.progress, { fetch: q.fetch, ...opts.deps });
  return { snapshot, calls: q.calls };
}
async function reject(responses, code, deps) {
  const q = queue([{ accessToken: token }, ...responses]);
  await assert.rejects(loadHistory(url, new AbortController().signal, undefined, { fetch: q.fetch, ...deps }), e => e instanceof HistoryError && e.code === code && e.message === `History ${code}`);
  return q.calls;
}

test('HIST-01: 200 prompts are read in exact chronological order with only fixed same-origin GETs', async () => {
  const all = Array.from({ length: 200 }, (_, i) => [msg(`u${i}`, 'user', `prompt ${i}`), msg(`a${i}`, 'assistant')]).flat();
  const latest = page(all.slice(200), true, 'older cursor', { current_node: 'a199' });
  const older = page(all.slice(0, 200), false, null, { current_node: 'a199' });
  // Cursor may be opaque but cannot contain whitespace in this deliberately strict adapter.
  latest.page_info.start_cursor = 'cursor-100';
  const progress = []; const { snapshot, calls } = await run([latest, older, latest], { progress: n => progress.push(n) });
  assert.deepEqual(snapshot.entries.map(e => e.id), Array.from({ length: 200 }, (_, i) => `u${i}`));
  assert.equal(snapshot.entries[199].text, 'prompt 199'); assert.ok(snapshot.entries.every(e => e.stable === true));
  assert.deepEqual(snapshot.messageIds, all.map(m => m.id)); assert.equal(snapshot.pages, 2); assert.equal(snapshot.exhausted, true);
  assert.equal(snapshot.screenVerified, false); assert.equal(snapshot.revisionVerified, true); assert.equal(snapshot.source, 'paginated-api');
  assert.match(snapshot.branch, /^server:[0-9a-f]{64}$/); assert.deepEqual(progress, [1, 2]);
  assert.equal(calls.length, 4); assert.match(calls[2].url, /&before=cursor-100$/);
  for (const { url: requested, init } of calls) {
    assert.equal(new URL(requested).origin, 'https://chatgpt.com'); assert.equal(init.method, 'GET'); assert.equal(init.credentials, 'same-origin');
    assert.equal(init.mode, 'same-origin'); assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store');
  }
  assert.deepEqual(Object.keys(snapshot).sort(), ['branch', 'conversation', 'entries', 'exhausted', 'messageIds', 'messages', 'pages', 'revisionVerified', 'screenVerified', 'source'].sort());
  assert.ok(!JSON.stringify(snapshot).includes(token));
});

test('HIST-02: custom GPT path works, but bad IDs, arbitrary origins and origin injection never request', async () => {
  const p = page(); assert.equal((await run([p, p], { url: `https://chatgpt.com/g/g-project-slug/c/${uuid}` })).snapshot.conversation, uuid);
  for (const invalid of [`https://evil.test/c/${uuid}`, `https://chatgpt.com/share/${uuid}`, `https://chatgpt.com/c/${uuid}/other`, 'https://chatgpt.com/c/not-a-uuid', `https://user:pass@chatgpt.com/c/${uuid}`]) {
    const q = queue([]); await assert.rejects(loadHistory(invalid, new AbortController().signal, undefined, { fetch: q.fetch }), { code: 'unsupported-url' }); assert.equal(q.calls.length, 0);
  }
  const q = queue([]); await assert.rejects(loadHistory(`http://127.0.0.1/c/${uuid}`, new AbortController().signal, undefined, { fetch: q.fetch, origin: 'http://127.0.0.1' }), { code: 'unsupported-url' }); assert.equal(q.calls.length, 0);
});

test('HIST-03: compiled fixture permits only its specified IPv4 loopback same origin', async () => {
  const p = page(), q = queue([{ access_token: token }, p, p]);
  const result = await fixtureLoad(`http://127.0.0.1:18342/c/${uuid}`, new AbortController().signal, undefined, { fetch: q.fetch, origin: 'http://127.0.0.1:18342' });
  assert.equal(result.entries.length, 1); assert.ok(q.calls.every(c => c.url.startsWith('http://127.0.0.1:18342/')));
  for (const origin of ['http://localhost:18342', 'https://evil.test', 'http://127.0.0.1/path', 'http://127.0.0.1?x=1', 'http://127.0.0.1@evil.test']) await assert.rejects(fixtureLoad(url, new AbortController().signal, undefined, { fetch: q.fetch, origin }), { code: 'unsupported-url' });
});

test('HIST-04: overlaps must be matching suffix-to-prefix; identical text with different IDs survives', async () => {
  const newest = page([msg('u2', 'user', 'same'), msg('a2', 'assistant')], true, 'before-2');
  const older = page([msg('u1', 'user', 'same'), msg('a1', 'assistant'), ...newest.messages]);
  const { snapshot } = await run([newest, older, newest]); assert.deepEqual(snapshot.entries.map(e => e.id), ['u1', 'u2']);
  await reject([newest, page([msg('a2', 'assistant'), msg('u2', 'user', 'same')])], 'schema');
  await reject([newest, page([msg('u1'), msg('u2', 'user', 'edited')])], 'changed');
});

test('HIST-05: pagination requires explicit metadata, cursors, progress, and bounded page count', async () => {
  for (const bad of [ { messages: [msg('u1')] }, page([], false), page([msg('u1')], 'false'), page([msg('u1')], true, null), page([msg('u1'), msg('u1')]), { ...page(), messages: {} } ]) await reject([bad], 'schema');
  const newest = page([msg('u2')], true, 'loop');
  await reject([newest, page([msg('u1')], true, 'loop')], 'schema');
  await reject([newest, page([msg('u2')])], 'schema');
  await reject([newest], 'limit', { limits: { maxPages: 1 } });
});

test('HIST-06: missing middle parent, reverse/changed overlaps and conversation mismatch are rejected', async () => {
  const newest = page([msg('u3', 'user', 'three', { parent_id: 'a2' })], true, 'middle');
  await reject([newest, page([msg('u1', 'user', 'one', { parent_id: null }), msg('a1', 'assistant', 'answer', { parent_id: 'u1' })])], 'schema');
  await reject([page([msg('u1')], false, null, { conversation_id: other })], 'changed');
  const latest = page([msg('u2')], true, 'older');
  await reject([latest, page([msg('u1')], false, null, { current_node: 'other-leaf' })], 'changed');
  await reject([latest, page([msg('u1')], false, null, { update_time: 2 })], 'changed');
});

test('HIST-07: head reread detects branch/content change without pretending absent revision is UI proof', async () => {
  const p = page(); await reject([p, page([msg('u1', 'user', 'changed'), msg('a1', 'assistant')])], 'changed');
  await reject([p, { ...p, update_time: 2 }], 'changed');
  const minimal = { messages: p.messages, page_info: p.page_info };
  const snapshot = (await run([minimal, minimal])).snapshot; assert.equal(snapshot.revisionVerified, false); assert.equal(snapshot.screenVerified, false);
});

test('HIST-08: only first plural 404 activates legacy, never access failure or unknown successful schema', async () => {
  const tree = { conversation_id: uuid, current_node: 'a1', mapping: { root: { parent: null, message: null }, u1: { parent: 'root', message: msg('user-api-id') }, a1: { parent: 'u1', message: msg('assistant-api-id', 'assistant') }, abandoned: { parent: 'root', message: msg('other-branch') } } };
  const { snapshot, calls } = await run([status(404), tree, tree]); assert.equal(snapshot.source, 'legacy-api'); assert.deepEqual(snapshot.entries.map(e => e.id), ['user-api-id']);
  assert.deepEqual(snapshot.messageIds, ['user-api-id', 'assistant-api-id']); assert.match(calls[2].url, /\/backend-api\/conversation\//);
  for (const code of [401, 403, 500]) { const requested = await reject([status(code)], code === 500 ? 'http' : 'access-denied'); assert.equal(requested.length, 2); }
  const requested = await reject([tree], 'schema'); assert.equal(requested.length, 2);
  const p = page([msg('u2')], true, 'older'); const later = await reject([p, status(404)], 'http'); assert.equal(later.length, 3);
});

test('HIST-09: legacy requires real root, rejects missing parent/cycle/duplicate API ID and changed reread', async () => {
  const tree = { current_node: 'user', mapping: { root: { parent: null, message: null }, user: { parent: 'root', message: msg('u1') } } };
  const mutations = [ t => { t.mapping.user.parent = 'missing'; }, t => { t.mapping.root.parent = 'user'; }, t => { delete t.mapping.root.parent; }, t => { t.mapping.root.message = msg('u1'); }, t => { t.mapping.user.id = 'wrong'; } ];
  for (const mutate of mutations) { const bad = structuredClone(tree); mutate(bad); await reject([status(404), bad], 'schema'); }
  const changed = structuredClone(tree); changed.mapping.user.message.content.parts = ['changed']; await reject([status(404), tree, changed], 'changed');
});

test('HIST-10: hidden/system/tool/reasoning records never become entries or navigation identities', async () => {
  const list = [msg('visible', 'user', '<img src=x onerror=alert(1)>'), msg('answer', 'assistant'), msg('system', 'system'), msg('tool', 'tool'),
    msg('hidden', 'user', 'private', { metadata: { is_visually_hidden_from_conversation: true } }), msg('zero', 'user', 'private', { weight: 0 }),
    msg('reasoning', 'assistant', 'private', { content: { content_type: 'thoughts', parts: ['private'] } }),
    msg('directed', 'assistant', 'private', { recipient: 'python' }), msg('analysis', 'assistant', 'private', { channel: 'analysis' })];
  const p = page(list); const { snapshot } = await run([p, p]);
  assert.deepEqual(snapshot.entries, [{ id: 'visible', text: '<img src=x onerror=alert(1)>', screenText: '<img src=x onerror=alert(1)>', stable: true }]);
  assert.deepEqual(snapshot.messageIds, ['visible', 'answer']); assert.deepEqual(snapshot.messages, [{ id: 'visible', role: 'user' }, { id: 'answer', role: 'assistant' }]);
  assert.ok(!JSON.stringify(snapshot).includes('private')); assert.ok(!('text' in snapshot.messages[1]));
});

test('HIST-11: attachments are explicit placeholders/names; unknown visible prompt schema fails rather than truncates', async () => {
  const image = msg('image', 'user', '', { content: { content_type: 'multimodal_text', parts: [{ content_type: 'image_asset_pointer', asset_pointer: 'not-fetched' }] } });
  const file = msg('file', 'user', '', { metadata: { attachments: [{ filename: 'file.txt' }] } });
  const p = page([image, file]); const { snapshot } = await run([p, p]);
  assert.equal(snapshot.entries[0].text, '〔附件或非文字提問〕'); assert.equal(snapshot.entries[1].text, '〔附件：file.txt〕');
  for (const patch of [ { content: { content_type: 'unknown', parts: ['x'] } }, { content: { content_type: 'text', parts: [{ text: 'x' }] } }, { author: { role: ['user'] } }, { metadata: { is_visually_hidden: 'true' } }, { id: '' }, { content: { content_type: 'text', parts: [] } } ]) await reject([page([msg('bad', 'user', 'x', patch)])], 'schema');
});

test('HIST-12: byte, aggregate, depth, text and message limits refuse oversized results without partial success', async () => {
  const p = page(); await reject([p], 'limit', { limits: { pageBytes: 30 } });
  await reject([p], 'limit', { limits: { totalBytes: 50 } });
  await reject([p], 'limit', { limits: { textChars: 1 } });
  const q = queue([{ accessToken: token }, new Response('{}', { headers: { 'Content-Type': 'application/json', 'Content-Length': '99999999' } })]);
  await assert.rejects(loadHistory(url, new AbortController().signal, undefined, { fetch: q.fetch }), { code: 'limit' });
  await reject([page([msg('u1'), msg('u2')])], 'schema', { limits: { maxMessages: 1 } });
  const deep = page(); deep.messages[0].metadata = { nest: { nest: { nest: { nest: {} } } } }; await reject([deep], 'limit', { limits: { maxDepth: 5 } });
});

test('HIST-13: cancellation settles promptly when fetch ignores abort; late responses/progress cannot apply', async () => {
  let finish; const late = new Promise(resolve => { finish = resolve; }); const q = queue([{ accessToken: token }, () => late]);
  const controller = new AbortController(), progress = []; const task = loadHistory(url, controller.signal, n => progress.push(n), { fetch: q.fetch });
  while (q.calls.length < 2) await new Promise(r => setTimeout(r, 1)); controller.abort();
  await assert.rejects(task, { code: 'aborted' }); finish(json(page())); await new Promise(r => setTimeout(r, 5));
  assert.deepEqual(progress, []); assert.equal(q.calls.length, 2); assert.equal(q.calls[1].init.signal.aborted, true);
  const already = new AbortController(); already.abort(); const nothing = queue([]); await assert.rejects(loadHistory(url, already.signal, undefined, { fetch: nothing.fetch }), { code: 'aborted' }); assert.equal(nothing.calls.length, 0);
});

test('HIST-14: per-page and total deadlines bound stuck fetch and streaming body', async () => {
  let fetchSignal; const q = queue([{ accessToken: token }, (_input, init) => { fetchSignal = init.signal; return new Promise(() => {}); }]);
  const started = performance.now(); await assert.rejects(loadHistory(url, new AbortController().signal, undefined, { fetch: q.fetch, limits: { pageMs: 20, totalMs: 100 } }), { code: 'timeout' });
  assert.ok(performance.now() - started < 500); assert.equal(fetchSignal.aborted, true);
  let cancelled = false; const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{')); }, cancel() { cancelled = true; } });
  const body = queue([{ accessToken: token }, new Response(stream, { headers: { 'Content-Type': 'application/json' } })]);
  await assert.rejects(loadHistory(url, new AbortController().signal, undefined, { fetch: body.fetch, limits: { totalMs: 20, pageMs: 100 } }), { code: 'timeout' }); assert.equal(cancelled, true);
});

test('HIST-15: 429 retry respects finite Retry-After, exhausts, and is cancellable during backoff', async () => {
  const p = page(); const { calls } = await run([status(429, { 'Retry-After': '0' }), p, p]); assert.equal(calls.length, 4);
  await reject([status(429, { 'Retry-After': '99999' })], 'rate-limit');
  await reject([status(429, { 'Retry-After': new Date(Date.now() + 120_000).toUTCString() })], 'rate-limit');
  const exhausted = await reject([status(429, { 'Retry-After': '0' }), status(429, { 'Retry-After': '0' }), status(429, { 'Retry-After': '0' })], 'rate-limit'); assert.equal(exhausted.length, 4);
  const q = queue([{ accessToken: token }, status(429, { 'Retry-After': '1' })]), controller = new AbortController();
  const task = loadHistory(url, controller.signal, undefined, { fetch: q.fetch }); while(q.calls.length < 2) await new Promise(r => setTimeout(r, 1)); await new Promise(r => setTimeout(r, 5)); controller.abort();
  await assert.rejects(task, { code: 'aborted' }); assert.equal(q.calls.length, 2);
});

test('HIST-16: session/header/redirect errors disclose no data and do not cause legacy fallback', async () => {
  for (const session of [{}, { accessToken: 'bad\r\nheader' }, { accessToken: token, access_token: 'conflicting' }]) {
    const q = queue([session]); await assert.rejects(loadHistory(url, new AbortController().signal, undefined, { fetch: q.fetch }), { code: 'access-denied' }); assert.equal(q.calls.length, 1);
  }
  const moved = json(page()); Object.defineProperty(moved, 'redirected', { value: true }); await reject([moved], 'http');
  const otherResponse = json(page()); Object.defineProperty(otherResponse, 'url', { value: 'https://evil.test/history' }); await reject([otherResponse], 'http');
  await reject([new Response('<html>not JSON</html>', { headers: { 'Content-Type': 'text/html' } })], 'schema');
});

test('HIST-17: cancellation from progress stops before further requests; no shared cache survives separate loads', async () => {
  const first = page([msg('u2')], true, 'older'), q = queue([{ accessToken: token }, first]); const controller = new AbortController();
  await assert.rejects(loadHistory(url, controller.signal, () => controller.abort(), { fetch: q.fetch }), { code: 'aborted' }); assert.equal(q.calls.length, 2);
  const p = page(); const a = (await run([p, p])).snapshot; a.entries[0].text = 'caller mutation';
  const b = (await run([p, p])).snapshot; assert.equal(b.entries[0].text, 'u1'); assert.equal(a.branch, b.branch);
});
