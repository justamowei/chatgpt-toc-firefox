(() => {
  if (window !== window.top || document.getElementById('toc-live-recorder')) return;
  const host = document.createElement('div'); host.id = 'toc-live-recorder';
  const sh = host.attachShadow({mode: 'open'});
  sh.innerHTML = `<style>:host{position:fixed;bottom:12px;left:12px;z-index:2147483647;font:13px system-ui;color:#172033}section{background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;padding:10px;box-shadow:0 3px 14px #0002;max-width:290px}button{margin:5px 5px 0 0;padding:6px 9px;border:1px solid #cbd5e1;border-radius:6px;background:white;color:inherit;cursor:pointer}p{margin:0 0 5px}small{display:block;color:#475569}</style><section><p>Firefox 實測記錄器</p><small>只記錄掛載、滾動與目錄診斷。最長 10 分鐘。</small><button id="start">開始記錄</button><button id="end" disabled>停止記錄</button><button id="save" disabled>下載紀錄</button><p id="status" role="status">尚未記錄</p></section>`;
  document.documentElement.append(host);
  const start = sh.getElementById('start'), end = sh.getElementById('end'), save = sh.getElementById('save'), status = sh.getElementById('status');
  let trace = null, timer = null, began = 0, route = '', lastDiagnostic = 0, diagnostic = null;
  let aliases = new Map(), nodes = new WeakMap(), serial = 0, scrolls = 0, mutations = {records:0, added:0, removed:0};
  let listeningShadow = null;
  const shellSelector = '[data-testid^="conversation-turn-"], [data-turn-id][data-turn], [data-turn-key]';
  const number = n => Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
  function nodeId(node) { if (!nodes.has(node)) nodes.set(node, ++serial); return nodes.get(node); }
  function alias(key) { if (!key) return null; if (!aliases.has(key)) aliases.set(key, aliases.size + 1); return aliases.get(key); }
  function numericFields(value, names) { const out = {}; for (const key of names) if (typeof value?.[key] === 'number') out[key] = number(value[key]); return out; }
  function diagnosticSample(toc) {
    const pre = toc?.querySelector('#toc-diagnosis'), button = toc?.querySelector('#toc-diagnose');
    if (!pre || !button) return null;
    // Use the existing local diagnostic action; restore its UI after sampling.
    const hidden = pre.hidden, oldText = pre.textContent;
    try {
      button.click(); const d = JSON.parse(pre.textContent), nav = d.navigation, attempt = nav?.lastAttempt, boundary = attempt?.boundary;
      const out = numericFields(d, ['collected','observed','mounted','quarantined','main','legacyRole','turnShell','turnKey','userBubble','conversationRole','agentStart']);
      if (/^\d+\.\d+\.\d+$/.test(d.version)) out.version = d.version;
      if (/^\d{4}-\d{2}-\d{2}-v\d+$/.test(d.revision)) out.revision = d.revision;
      out.scroll = numericFields(nav?.scroll, ['client','width','height','top']);
      out.collection = ['head','done'].includes(nav?.collection) ? nav.collection : null;
      out.attempt = numericFields(attempt, ['before','requested','after','heightBefore','heightAfter','scrollEvents']);
      if (['mounted-edge-anchor','wait-for-mounted-anchor'].includes(attempt?.method)) out.attempt.method = attempt.method;
      if (typeof attempt?.replaced === 'boolean') out.attempt.replaced = attempt.replaced;
      if (boundary) { out.boundary = numericFields(boundary,['stableMs','probes']); for (const key of ['physical','loading','rendering','confirmed']) if (typeof boundary[key] === 'boolean') out.boundary[key] = boundary[key]; }
      return out;
    } catch { return {unavailable:true}; }
    finally { pre.textContent = oldText; pre.hidden = hidden; }
  }
  function shells() {
    const main = document.querySelector('main'); if (!main) return [];
    return [...main.querySelectorAll(shellSelector)].filter(n => !n.closest('aside,nav,form,[contenteditable="true"]'));
  }
  function roots(turns) {
    const candidates = new Set([document.scrollingElement]);
    for (const turn of turns.slice(0, 100)) for (let n = turn.parentElement; n; n = n.parentElement) {
      if (n.clientHeight > 100 && (/auto|scroll/.test(getComputedStyle(n).overflowY) || n.hasAttribute('data-scroll-root'))) candidates.add(n);
    }
    return [...candidates].filter(Boolean).map(n => { const r = n.getBoundingClientRect(); return {node:nodeId(n),top:number(n.scrollTop),height:number(n.scrollHeight),client:number(n.clientHeight),width:number(n.clientWidth),viewportTop:number(r.top),viewportBottom:number(r.bottom)}; });
  }
  function sample() {
    if (!timer) return;
    if (location.pathname !== route) { stop('route-changed'); return; }
    const elapsed = Math.round(performance.now() - began), toc = document.getElementById('chatgpt-toc-root')?.shadowRoot;
    if (toc && listeningShadow !== toc) { listeningShadow?.removeEventListener('click', recordAction, true); toc.addEventListener('click',recordAction,true); listeningShadow = toc; }
    if (elapsed - lastDiagnostic >= 1000 || !diagnostic) { diagnostic = diagnosticSample(toc); lastDiagnostic = elapsed; }
    const turns = shells(), mounted = turns.slice(0,300).map(n => { const r=n.getBoundingClientRect(); const key=n.getAttribute('data-turn-id') || n.getAttribute('data-turn-key'); const role=n.getAttribute('data-turn'); return {message:alias(key),node:nodeId(n),role:['user','assistant'].includes(role)?role:null,top:number(r.top),bottom:number(r.bottom),height:number(r.height)}; });
    const state = document.getElementById('chatgpt-toc-root')?.dataset.navigation;
    trace.samples.push({ms:elapsed,navigation:['idle','loading','located','cancelled','timed-out','unsupported','not-found'].includes(state)?state:null,roots:roots(turns),mounted,totalShells:turns.length,truncatedShells:turns.length>300,scrollEvents:scrolls,mutations:{...mutations},diagnostic});
    status.textContent = `記錄中 · ${Math.floor(elapsed/1000)} 秒 · ${trace.samples.length} 筆`;
    if (elapsed >= 600000) stop('time-limit');
  }
  function recordAction(e) {
    if (!timer) return;
    const b = e.target.closest?.('button'); if (!b) return;
    let action = {'toc-earlier':'collect','toc-stop':'stop-collection','toc-back':'return-position'}[b.id];
    if (!action && b.hasAttribute('data-entry-id')) action = 'navigate-entry';
    if (action) trace.actions.push({ms:Math.round(performance.now()-began),action});
  }
  function scroll() { if (timer) scrolls++; }
  const observer = new MutationObserver(records => { if (!timer) return; for (const r of records) { const n=r.target.nodeType===1?r.target:r.target.parentElement; if (!n?.closest('main') || n.closest('aside,nav,form,[contenteditable="true"]')) continue; mutations.records++; mutations.added += r.addedNodes.length; mutations.removed += r.removedNodes.length; } });
  function stop(reason) {
    if (!timer) return;
    clearInterval(timer); timer=null; observer.disconnect(); document.removeEventListener('scroll',scroll,true);
    listeningShadow?.removeEventListener('click',recordAction,true); listeningShadow=null;
    trace.ended={reason,ms:Math.round(performance.now()-began)};
    start.disabled=false;end.disabled=true;save.disabled=false;status.textContent=`已停止 · ${trace.samples.length} 筆，請下載紀錄`;
  }
  start.addEventListener('click', () => {
    if (timer) return;
    trace={schema:'toc-firefox-live-trace-v1',source:'user-operated browser; environment must be confirmed by tester',intervalMs:250,samples:[],actions:[]};
    aliases=new Map();nodes=new WeakMap();serial=0;scrolls=0;mutations={records:0,added:0,removed:0};diagnostic=null;lastDiagnostic=0;began=performance.now();route=location.pathname;
    start.disabled=true;end.disabled=false;save.disabled=true;
    observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});document.addEventListener('scroll',scroll,true);
    timer=setInterval(sample,250);sample();
  });
  end.addEventListener('click',()=>{sample();stop('user');});
  save.addEventListener('click',()=> {
    if (!trace || timer) return;
    const url=URL.createObjectURL(new Blob([JSON.stringify(trace)],{type:'application/json'})), a=document.createElement('a');
    a.href=url;a.download='toc-firefox-live-trace.json';sh.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  });
})();
