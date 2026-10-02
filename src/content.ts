import { DEFAULT_SETTINGS, IndexStore, Navigator, validSettings, type NavState, type Position } from './core';
import { DomAdapter } from './dom';
import { supported } from './config';
import { styles } from './styles';
import { FullHistoryIndex } from './full-index';
import { HistoryError, loadHistory, type HistoryLimitFailure } from './history';
import { FIXTURE } from './config';
type Instance = { show(): void; dispose(): void };
const world = globalThis as typeof globalThis & { __chatgptToc?: Instance };
if (window === window.top && !browser.extension.inIncognitoContext && supported(location.href)) {
  if (world.__chatgptToc) world.__chatgptToc.show();
  else world.__chatgptToc = start();
}
function start(): Instance {
  let alive = true, expanded = false, query = '', renderKey = '', navigationToken = 0, uiRevision = 0;
  let returnPosition: Position | null = null, returnEpoch = -1, refreshTimer: ReturnType<typeof setTimeout> | undefined;
  const events = new AbortController();
  const store = new IndexStore();
  const full = new FullHistoryIndex();
  let historyController: AbortController | null = null, historyToken = 0, historyContext = '';
  // Sticky, allowlisted metadata for the last explicit read. Navigation/DOM
  // refresh must not erase the failure that explains a mounted-only index.
  let historyResult: { outcome: 'not-started' | 'loading' | 'installed' | 'failed' | 'cancelled' | 'revoked'; pages: number; error?: string; limit?: HistoryLimitFailure } = { outcome: 'not-started', pages: 0 };
  // A disabled Firefox content context cannot run teardown JavaScript. Remove
  // its inert DOM when a new context starts, before creating the single root.
  for (const stale of document.querySelectorAll('#chatgpt-toc-root')) stale.remove();
  for (const stale of document.querySelectorAll('[data-chatgpt-toc-highlight]')) {
    stale.removeAttribute('data-chatgpt-toc-highlight'); stale.removeAttribute('data-toc-located');
  }
  const host = document.createElement('div'); host.id = 'chatgpt-toc-root';
  const shadow = host.attachShadow({ mode: 'open' });
  function make<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag); node.className = className; node.textContent = text; return node;
  }
  function button(text: string, action: () => void, className = '', persistent = true): HTMLButtonElement {
    const node = make('button', className, text); node.type = 'button'; node.addEventListener('click', action, persistent ? { signal: events.signal } : undefined); return node;
  }
  const css = make('style'); css.textContent = styles; shadow.append(css);
  const shell = make('div', 'shell'), panel = make('section', 'panel'), rail = make('nav', 'rail');
  panel.id = 'toc-panel'; panel.setAttribute('aria-label', '對話目錄'); rail.setAttribute('aria-label', '提問快速導航');
  const toggle = button('目錄', () => setExpanded(!expanded), 'toggle'); toggle.setAttribute('aria-controls', panel.id);
  const markers = make('div', 'markers'); rail.append(toggle, markers);
  const header = make('header'), title = make('h2', '', '對話目錄'), close = button('×', () => setExpanded(false), 'close'); close.setAttribute('aria-label', '收合目錄');
  header.append(title, close);
  const searchWrap = make('div', 'search'), label = make('label', '', '搜尋已收錄提問'), input = make('input');
  input.id = 'toc-search'; input.type = 'search'; input.placeholder = '搜尋提問…'; label.htmlFor = input.id; searchWrap.append(label, input);
  const scope = make('div', 'scope'), list = make('ul', 'list'), status = make('p', 'status');
  scope.id = 'toc-scope'; list.id = 'toc-list'; status.id = 'toc-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const footer = make('footer');
  const earlier = button('載入較早訊息', () => { void navigate(null); }); earlier.id = 'toc-earlier';
  const complete = button('載入完整目錄', () => { void loadComplete(); }); complete.id = 'toc-complete';
  complete.title = '唯讀載入目前這段對話的歷史，內容僅留此頁記憶體。';
  const back = button('回到剛才位置', () => { void restore(); }); back.id = 'toc-back';
  const stop = button('停止', cancel); stop.id = 'toc-stop';
  const settings = button('設定', () => { void browser.runtime.sendMessage({ kind: 'options:open' }).catch(() => { if (alive) status.textContent = '無法開啟設定，請從 Firefox 附加元件頁開啟。'; }); });
  const disable = button('停用此頁', dispose); disable.id = 'toc-disable';
  const diagnosis = make('pre', 'diagnosis'); diagnosis.id = 'toc-diagnosis'; diagnosis.hidden = true;
  diagnosis.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;user-select:text;max-height:150px;overflow:auto;margin:0 14px 12px';
  const diagnose = button('頁面診斷', () => {
    // Counts only; no conversation text, IDs, URLs, or account information.
    const counts: Record<string, number> = {};
    for (const [label, selector] of Object.entries({ main: 'main', legacyRole: '[data-message-author-role]', turnShell: '[data-testid^="conversation-turn-"][data-turn]', turnKey: '[data-turn-key]', userBubble: '[data-user-message-bubble]', conversationRole: '[data-conversation-role]', agentStart: '[data-chatgpt-agent-turn-start]' })) counts[label] = document.querySelectorAll(selector).length;
    diagnosis.textContent = JSON.stringify({ version: browser.runtime.getManifest().version, diagnosticSchema: 2, mountedCount: store.entries.length, fullCount: full.snapshot ? full.entries().length : 0, binding: full.binding, matchedCount: full.matched, lastHistory: historyResult, ...counts }, null, 2); diagnosis.hidden = false;
  }); diagnose.id = 'toc-diagnose';
  footer.append(complete, earlier, back, stop, settings, disable, diagnose);
  const hint = make('div', 'hint', 'Alt＋Shift＋O 開啟 · Esc 收合');
  panel.append(header, searchWrap, scope, list, status, footer, diagnosis, hint); shell.append(panel, rail); shadow.append(shell); document.documentElement.append(host);
  const adapter = new DomAdapter(store, refresh);
  const labels: Record<NavState, string> = { idle: '請選取已收錄的提問。', loading: '正在尋找訊息…', located: '已定位並高亮正確訊息。', cancelled: '已停止導航。', 'timed-out': '已達載入上限；可稍後重試。', unsupported: '目前頁面無法完成導航，請更新導航器。', 'not-found': '尚未找到這則訊息，可繼續載入。' };
  const navigator = new Navigator(adapter, state => {
    if (!alive) return;
    host.dataset.navigation = state; status.textContent = labels[state]; busy();
  });
  let port: browser.runtime.Port | null = browser.runtime.connect({ name: 'toc-lifecycle' });
  port.onMessage.addListener(message => { if (isDispose(message)) dispose(); });
  // Firefox closes ports when its event page idles; that is not permission revocation.
  // The content instance remains local. Explicit dispose messages also reach pages
  // without a live port through background.ts's tabs.sendMessage fallback.
  port.onDisconnect.addListener(() => { port = null; });
  function isDispose(message: unknown): boolean { return !!message && typeof message === 'object' && Object.keys(message).length === 1 && (message as { kind?: string }).kind === 'dispose'; }
  const runtimeListener = (message: unknown, sender: browser.runtime.MessageSender) => {
    if (sender.id === browser.runtime.id && isDispose(message)) dispose();
  };
  browser.runtime.onMessage.addListener(runtimeListener);
  function busy(): void {
    const loading = !!historyController || navigator.state === 'loading';
    stop.hidden = !loading; earlier.disabled = loading; complete.disabled = loading;
    host.dataset.history = historyController ? 'loading' : full.snapshot ? 'loaded' : 'idle';
  }
  function cancelHistory(): void { if (historyController) historyResult = { outcome: 'cancelled', pages: historyResult.pages }; historyToken++; historyController?.abort(); historyController = null; historyContext = ''; adapter.endHistoryRead(); busy(); }
  function cancel(): void {
    const loading = !!historyController;
    navigationToken++; navigator.cancel(); cancelHistory();
    if (loading && alive) status.textContent = '已停止讀取完整歷史，未套用未完成的結果。';
  }
  function currentEpoch(): number { return adapter.navigationEpoch(); }
  function allEntries() { return full.snapshot ? full.entries() : store.entries; }
  async function loadComplete(): Promise<void> {
    if (!alive) return;
    cancel(); refresh();
    const initial = adapter.read(), context = location.origin + location.pathname;
    full.clear(); adapter.useHistory(null, full.revision); returnPosition = null; returnEpoch = -1;
    const controller = new AbortController(), token = ++historyToken;
    historyController = controller; historyContext = context;
    historyResult = { outcome: 'loading', pages: 0 };
    adapter.beginHistoryRead();
    status.textContent = '正在讀取目前對話的完整歷史…'; busy(); render();
    try {
      const snapshot = await loadHistory(location.href, controller.signal, pages => {
        if (alive && token === historyToken && !controller.signal.aborted) { historyResult.pages = pages; status.textContent = `正在讀取完整歷史：已核對 ${pages} 頁…`; }
      }, FIXTURE ? { origin: location.origin } : undefined);
      if (!alive || token !== historyToken || controller.signal.aborted || context !== location.origin + location.pathname) return;
      const current = adapter.read();
      if (!full.install(snapshot, initial) || full.observe(current)) {
        full.clear(); historyResult = { outcome: 'failed', pages: snapshot.pages, error: 'binding-changed' }; status.textContent = '讀取期間對話或分支已變更，未套用完整目錄，請重新載入。';
      } else {
        historyResult = { outcome: 'installed', pages: snapshot.pages };
        adapter.useHistory(full.entries(), full.revision, full.snapshot?.messageIds);
        status.textContent = full.binding === 'subset-matched' ? '完整歷史已讀取。未掛載提問會按需尋找；若無法掛載，請手動捲動。' : '完整歷史已讀取，但尚未核對畫面訊息身分；可搜尋，定位暫停。';
      }
      render();
    } catch (error) {
      if (!alive || token !== historyToken || controller.signal.aborted) return;
      historyResult = { outcome: 'failed', pages: historyResult.pages, error: error instanceof HistoryError ? error.code : 'unknown', ...(error instanceof HistoryError && error.limit ? { limit: error.limit } : {}) };
      const messages: Record<string, string> = {
        'unsupported-url': '請先開啟已儲存的對話；新對話須先送出提問並取得對話網址。',
        timeout: '完整歷史讀取逾時，未套用部分結果，請稍後重試。',
        'access-denied': '無法讀取對話歷史，請確認此頁已登入且可開啟這段對話。',
        'rate-limit': 'ChatGPT 暫時限制讀取頻率，請稍後重試。',
        limit: '對話超出本次載入上限，未宣稱完整；仍可使用已掛載目錄。',
        changed: '讀取期間對話歷史已變更，請重新載入。',
        schema: '網站歷史格式尚未支援，完整目錄未套用；仍可使用已掛載目錄。',
      };
      status.textContent = error instanceof HistoryError ? messages[error.code] ?? '完整歷史讀取失敗，仍可使用已掛載目錄，請稍後重試。' : '完整歷史讀取失敗，仍可使用已掛載目錄，請稍後重試。';
      if (error instanceof HistoryError && error.limit) {
        const reason: Record<HistoryLimitFailure['kind'], string> = { configuration: '載入設定', 'session-bytes': '登入回應大小', 'page-bytes': '單筆歷史回應大小', 'total-bytes': '累計讀取量', 'text-chars': '單則提問字元數', depth: '資料巢狀深度', nodes: '資料結構數', messages: '訊息數', pages: '分頁數' };
        const unit = error.limit.measurement === 'count' ? '' : ' bytes';
        status.textContent = `${reason[error.limit.kind]}超出上限（${error.limit.observed}${unit}／${error.limit.maximum}${unit}），完整目錄未載入。可按「頁面診斷」查看不含聊天內容的原因。`;
      }
    } finally {
      if (token === historyToken) { historyController = null; historyContext = ''; adapter.endHistoryRead(); busy(); }
    }
  }
  function setExpanded(value: boolean, focus = true, persist = true): void {
    if (!alive) return;
    expanded = value; panel.hidden = !expanded; toggle.setAttribute('aria-expanded', String(expanded));
    if (focus) uiRevision++;
    if (focus) (expanded ? input : toggle).focus({ preventScroll: true });
    if (persist) void browser.runtime.sendMessage({ kind: 'settings:set', expanded }).catch(() => {});
  }
  function updateCurrent(): void {
    if (!alive) return;
    const prompt = [...adapter.nodes].filter(([id]) => allEntries().some(e => e.id === adapter.canonical(id))).sort((a, b) => Math.abs(a[1].getBoundingClientRect().top - 90) - Math.abs(b[1].getBoundingClientRect().top - 90))[0]?.[0];
    for (const node of shadow.querySelectorAll<HTMLButtonElement>('[data-entry-id]')) node.setAttribute('aria-current', String(node.dataset.entryId === (prompt ? adapter.canonical(prompt) : undefined)));
  }
  function render(): void {
    if (!alive) return;
    const known = allEntries(), entries = full.snapshot ? full.search(query) : store.search(query);
    scope.textContent = full.snapshot ? `已讀取完整歷史 ${known.length} 則提問 · 伺服器分支；${full.binding === 'subset-matched' ? `畫面已核對 ${full.matched} 則，其他提問按需定位` : '畫面分支尚未核對，定位暫停'}。` : `已收錄 ${store.entries.length} 則 · ${store.completeness === 'unknown' ? '訊息識別尚未確認' : '歷史尚未完整'}。搜尋只涵蓋已收錄提問。`;
    label.textContent = full.snapshot ? '搜尋完整歷史提問' : '搜尋已收錄提問';
    complete.textContent = full.snapshot ? '重新載入完整目錄' : '載入完整目錄';
    back.disabled = !returnPosition || returnEpoch !== currentEpoch();
    const key = JSON.stringify([full.snapshot ? full.revision : store.epoch, query, known.map(e => [e.id, e.text, e.stable])]);
    if (key !== renderKey) {
      renderKey = key;
      const focused = shadow.activeElement instanceof HTMLElement ? shadow.activeElement.dataset.entryId : undefined;
      list.replaceChildren(); markers.replaceChildren();
      for (const entry of entries) {
        const row = make('li'); const choice = button(entry.text.slice(0, 180), () => { void navigate(entry.id); }, 'entry', false);
        choice.dataset.entryId = entry.id; choice.title = entry.text; choice.disabled = !entry.stable; row.append(choice); list.append(row);
      }
      for (const entry of known) {
        const mark = button('', () => { void navigate(entry.id); }, 'mark', false); mark.dataset.entryId = entry.id;
        mark.title = entry.text.slice(0, 180); mark.setAttribute('aria-label', `定位：${entry.text.slice(0, 180)}`); mark.disabled = !entry.stable; markers.append(mark);
      }
      if (!entries.length) list.append(make('li', 'empty', query ? '沒有符合的已收錄提問。' : '尚未辨識到提問；若已有對話，頁面版本可能尚未支援。'));
      if (focused) [...list.querySelectorAll<HTMLButtonElement>('[data-entry-id]')].find(node => node.dataset.entryId === focused)?.focus({ preventScroll: true });
    }
    updateCurrent();
  }
  function refresh(direction?: 'older' | 'newer'): void {
    if (!alive) return;
    if (!supported(location.href)) { dispose(); return; }
    const observation = adapter.read(), hadHistory = !!full.snapshot;
    const revoked = full.observe(observation);
    const reset = store.merge(observation, direction ?? adapter.currentDirection() ?? 'observe');
    adapter.useHistory(full.snapshot ? full.entries() : null, full.revision, full.snapshot?.messageIds);
    const historyChanged = !!historyController && (historyContext !== observation.context || observation.invalidated);
    if (revoked || historyChanged || (reset && !hadHistory)) {
      navigationToken++; navigator.cancel();
      if (historyChanged || revoked) cancelHistory();
      if (revoked) historyResult = { outcome: 'revoked', pages: historyResult.pages, error: 'observation-changed' };
      adapter.clearHighlight(); returnPosition = null; returnEpoch = -1;
      status.textContent = revoked ? '對話內容或分支已變更，完整目錄已撤銷，請重新載入。' : '對話或分支已變更，已重建目前目錄。';
    }
    host.setAttribute('data-theme', document.documentElement.classList.contains('dark') ? 'dark' : document.documentElement.classList.contains('light') ? 'light' : 'system');
    render();
  }
  function queue(): void {
    if (!alive) return;
    if (store.context !== location.origin + location.pathname) { clearTimeout(refreshTimer); refreshTimer = undefined; refresh(); return; }
    if (refreshTimer === undefined) refreshTimer = setTimeout(() => { refreshTimer = undefined; refresh(); }, 120);
  }
  async function navigate(id: string | null): Promise<void> {
    if (!alive) return;
    refresh();
    if (id !== null && !allEntries().some(entry => entry.id === id && entry.stable)) { status.textContent = '此目標已失效，請從目前目錄重新選取。'; return; }
    if (historyController) cancelHistory();
    adapter.target(id);
    returnPosition = adapter.capture(); returnEpoch = currentEpoch(); render();
    delete host.dataset.restored;
    const token = ++navigationToken;
    const result = await navigator.run(id);
    if (!alive || token !== navigationToken) return;
    if (id === null && result === 'idle') status.textContent = '本次載入已停止。未核對完整歷史；可返回剛才位置或繼續。';
    if (full.snapshot && (result === 'not-found' || result === 'timed-out')) status.textContent = '提問已在完整目錄中，但頁面尚未掛載；請手動捲動至附近再定位。';
    updateCurrent();
  }
  async function restore(): Promise<void> {
    const position = returnPosition, epoch = returnEpoch;
    if (!alive || !position || epoch !== currentEpoch()) { status.textContent = '原閱讀位置已失效，無法恢復。'; return; }
    adapter.target(position.id);
    const token = ++navigationToken;
    delete host.dataset.restored;
    const result = await navigator.run(position.id);
    if (!alive || token !== navigationToken || epoch !== currentEpoch()) return;
    if (result !== 'located') { status.textContent = '原閱讀位置目前未掛載，尚未恢復。'; return; }
    const restored = adapter.restore(position, events.signal);
    status.textContent = restored ? '已回到剛才的閱讀位置。' : '原閱讀錨點已改變，位置未能精準恢復。';
    host.dataset.restored = String(restored); updateCurrent();
  }
  const observer = new MutationObserver(queue); observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'data-message-id', 'data-message-author-role', 'data-testid', 'data-fixture-branch', 'data-turn', 'data-turn-id', 'data-turn-key', 'data-user-message-bubble', 'data-conversation-role', 'data-chatgpt-agent-turn-start'] });
  const routeTimer = setInterval(() => { if (alive && store.context !== location.origin + location.pathname) refresh(); }, 500);
  window.addEventListener('popstate', refreshRoute, { signal: events.signal });
  function refreshRoute(): void { refresh(); }
  window.addEventListener('pagehide', dispose, { signal: events.signal });
  document.addEventListener('scroll', updateCurrent, { capture: true, passive: true, signal: events.signal });
  for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown', 'input']) document.addEventListener(type, event => {
    if (navigator.state === 'loading' && event.isTrusted && !event.composedPath().includes(host)) cancel();
  }, { capture: true, passive: true, signal: events.signal });
  input.addEventListener('input', () => { query = input.value; render(); }, { signal: events.signal });
  shadow.addEventListener('keydown', event => {
    const key = event as KeyboardEvent;
    if (key.key === 'Escape') { key.preventDefault(); cancel(); setExpanded(false); }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key.key) || key.target === input) return;
    const choices = [...list.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const index = choices.indexOf(shadow.activeElement as HTMLButtonElement);
    const next = key.key === 'Home' ? 0 : key.key === 'End' ? choices.length - 1 : Math.max(0, Math.min(choices.length - 1, index + (key.key === 'ArrowDown' ? 1 : -1)));
    if (choices[next]) { key.preventDefault(); choices[next].focus(); }
  }, { signal: events.signal });
  input.addEventListener('keydown', event => { if (event.key === 'ArrowDown' || event.key === 'Enter') { event.preventDefault(); list.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus(); } }, { signal: events.signal });
  function dispose(): void {
    if (!alive) return;
    alive = false; navigationToken++; navigator.cancel(); cancelHistory(); full.clear(); events.abort(); observer.disconnect(); clearTimeout(refreshTimer); clearInterval(routeTimer);
    browser.runtime.onMessage.removeListener(runtimeListener); port?.disconnect(); port = null; adapter.dispose(); store.reset(); host.remove();
    delete world.__chatgptToc;
  }
  panel.hidden = true; back.disabled = true; stop.hidden = true; status.textContent = labels.idle; toggle.setAttribute('aria-expanded', 'false');
  refresh();
  void browser.runtime.sendMessage({ kind: 'settings:get' }).then((value: unknown) => { if (alive && uiRevision === 0) setExpanded(validSettings(value) ? value.expanded : DEFAULT_SETTINGS.expanded, false, false); }).catch(() => {});
  return { show: () => setExpanded(true), dispose };
}
