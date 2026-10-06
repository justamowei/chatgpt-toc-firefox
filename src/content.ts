import { DEFAULT_SETTINGS, IndexStore, Navigator, normalize, validSettings, type NavState, type Position } from './core';
import { DomAdapter } from './dom';
import { supported, BUILD_REVISION } from './config';
import { styles } from './styles';
type Instance = { show(): void; dispose(): void };
const world = globalThis as typeof globalThis & { __chatgptToc?: Instance };
if (window === window.top && !browser.extension.inIncognitoContext && supported(location.href)) {
  if (world.__chatgptToc) world.__chatgptToc.show();
  else world.__chatgptToc = start();
}
function start(): Instance {
  let alive = true, expanded = false, query = '', renderKey = '', navigationToken = 0, uiRevision = 0;
  let returnPosition: Position | null = null, returnEpoch = -1, refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let navigationPending = false, operation: AbortController | null = null;
  let collecting = false, collectionStart = 0;
  const events = new AbortController();
  const store = new IndexStore();
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
  const earlier = button('收集整段對話', () => { void navigate(null); }); earlier.id = 'toc-earlier';
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
    diagnosis.textContent = JSON.stringify({ version: browser.runtime.getManifest().version, revision: BUILD_REVISION, collected: store.entries.length,
      observed: store.retainedCount, mounted: store.mounted.size, quarantined: store.quarantine.reduce((n, g) => n + g.entries.length, 0),
      navigation: adapter.diagnostic(), ...counts }, null, 2); diagnosis.hidden = false;
  }); diagnose.id = 'toc-diagnose';
  footer.append(earlier, back, stop, settings, disable, diagnose);
  const hint = make('div', 'hint', 'Shift＋O 開啟 · Esc 收合');
  panel.append(header, searchWrap, scope, list, status, footer, diagnosis, hint); shell.append(panel, rail); shadow.append(shell); document.documentElement.append(host);
  const adapter = new DomAdapter(store, refresh);
  const labels: Record<NavState, string> = { idle: '請選取已收錄的提問。', loading: '正在尋找訊息…', located: '已定位並高亮正確訊息。', cancelled: '已停止導航。', 'timed-out': '已達載入上限；可稍後重試。', unsupported: '目前頁面無法完成導航，請更新導航器。', 'not-found': '尚未找到這則訊息，可繼續載入。' };
  const navigator = new Navigator(adapter, state => {
    if (!alive) return;
    host.dataset.navigation = state; status.textContent = labels[state]; stop.hidden = state !== 'loading'; earlier.disabled = state === 'loading';
    if (state === 'timed-out') status.textContent = navigator.lastStopReason === 'batch-limit'
      ? `已達本次${collecting ? '收集' : '尋找'}步數上限，${collecting ? `新增 ${Math.max(0, store.entries.length - collectionStart)} 則；可繼續收集。` : '目標尚未重新掛載，可重試。'}`
      : `已達本次${collecting ? '收集' : '尋找'}時間上限，${collecting ? `新增 ${Math.max(0, store.entries.length - collectionStart)} 則；可繼續收集。` : '目標尚未重新掛載，可重試。'}`;
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
  function cancel(): void { navigationToken++; navigationPending = false; operation?.abort(); operation = null; navigator.cancel(); }
  function setExpanded(value: boolean, focus = true, persist = true): void {
    if (!alive) return;
    expanded = value; panel.hidden = !expanded; toggle.setAttribute('aria-expanded', String(expanded));
    render();
    if (focus) uiRevision++;
    if (focus) (expanded ? input : toggle).focus({ preventScroll: true });
    if (persist) void browser.runtime.sendMessage({ kind: 'settings:set', expanded }).catch(() => {});
  }
  function updateCurrent(): void {
    if (!alive) return;
    const prompt = [...adapter.nodes].filter(([id]) => store.entries.some(e => e.id === id)).sort((a, b) => Math.abs(a[1].getBoundingClientRect().top - 90) - Math.abs(b[1].getBoundingClientRect().top - 90))[0]?.[0];
    for (const node of shadow.querySelectorAll<HTMLButtonElement>('[data-entry-id]')) node.setAttribute('aria-current', String(node.dataset.entryId === prompt));
  }
  function render(): void {
    if (!alive) return;
    const entries = store.search(query);
    scope.textContent = `本頁已看過 ${store.entries.length} 則 · 目前掛載 ${store.mounted.size} 則。歷史尚未完整；${store.branchConfidence === 'unverified' ? '當前分支未完整核對；' : ''}搜尋涵蓋已觀察資料。` +
      (!store.ordered ? '部分順序待核對，按觀察區段分組。' : '') +
      (store.quarantine.length ? `另有 ${store.retainedCount - store.entries.length} 筆曾看過資料已隔離，僅供搜尋。` : '') +
      (store.limitReason ? `已達${store.limitReason === 'entries' ? '5000 筆記錄' : '500 萬字元'}保留上限，已停止新增；現有資料仍可搜尋。` : '');
    back.disabled = !returnPosition || returnEpoch !== store.epoch;
    const key = JSON.stringify([store.cacheRevision, query, [...store.mounted], expanded]);
    if (key !== renderKey) {
      renderKey = key;
      const focused = shadow.activeElement instanceof HTMLElement ? shadow.activeElement.dataset.entryId : undefined;
      list.replaceChildren(); markers.replaceChildren();
      const selectable = (id: string, stable: boolean) => stable &&
        (adapter.canLocate(id) || (store.ordered && !store.quarantine.length && !store.mounted.has(id)));
      for (const [index, segment] of store.segments.entries()) {
        const visible = entries.filter(entry => segment.ids.includes(entry.id));
        if (!visible.length) continue;
        if (!store.ordered) list.append(make('li', 'empty', `觀察區段 ${index + 1} · ${segment.ordered ? '區段內順序已核對' : '區段內順序待核對'}`));
        for (const entry of visible) {
        const row = make('li'); const choice = button(entry.text.slice(0, 180), () => { void navigate(entry.id); }, 'entry', false);
        choice.dataset.entryId = entry.id; choice.title = entry.text; choice.disabled = !selectable(entry.id, entry.stable); row.append(choice); list.append(row);
        }
      }
      const archived = store.quarantine.flatMap(group => group.entries).filter(entry => !query || normalize(entry.text).includes(normalize(query)));
      if (archived.length) list.append(make('li', 'empty', '曾看過／分支未核對 · 僅供搜尋，不提供定位'));
      for (const entry of archived) { const row = make('li', 'archived'); row.textContent = entry.text.slice(0, 180); row.title = entry.text; list.append(row); }
      // The rail is a direct shortcut to live prompts, never a sample of
      // retained history. The expanded text list still contains the full cache.
      const liveEntries = new Map(store.entries.map(entry => [entry.id, entry]));
      const railEntries = [...store.mounted].flatMap(id => {
        const entry = liveEntries.get(id);
        return entry && adapter.canLocate(id) ? [entry] : [];
      });
      for (const entry of railEntries) {
        const mark = button('', () => { void navigate(entry.id); }, 'mark', false); mark.dataset.entryId = entry.id;
        mark.title = entry.text.slice(0, 180); mark.setAttribute('aria-label', `定位：${entry.text.slice(0, 180)}`); mark.disabled = !selectable(entry.id, entry.stable); markers.append(mark);
      }
      if (!entries.length && !archived.length) list.append(make('li', 'empty', query ? '沒有符合的已觀察提問。' : '尚未辨識到提問；可捲動對話讓網站掛載訊息。'));
      if (focused) [...list.querySelectorAll<HTMLButtonElement>('[data-entry-id]')].find(node => node.dataset.entryId === focused)?.focus({ preventScroll: true });
    }
    updateCurrent();
  }
  function collect(direction?: 'older' | 'newer', records: MutationRecord[] = []): void {
    if (!alive) return;
    if (!supported(location.href)) { dispose(); return; }
    const snapshot = adapter.read();
    let reset = false;
    // Capture short-lived, first-seen removed prompts as plain data before the
    // UI debounce. Never carry removed content across a route/known branch.
    if (snapshot.context === store.context && snapshot.branch === store.branch) for (const entries of adapter.readRemoved(records)) {
      reset = store.merge({ ...snapshot, entries }) || reset;
    }
    reset = store.merge(snapshot, direction ?? adapter.currentDirection() ?? 'observe') || reset;
    adapter.remember();
    if (reset) { cancel(); adapter.clearHighlight(); adapter.clearReturnWitness(); returnPosition = null; returnEpoch = -1;
      status.textContent = store.quarantine.length ? '觀察到正文或順序矛盾，舊資料已隔離供搜尋。' : '已切換對話，開始收集本頁提問。'; }
    host.setAttribute('data-theme', document.documentElement.classList.contains('dark') ? 'dark' : document.documentElement.classList.contains('light') ? 'light' : 'system');
    if (navigator.state === 'loading') status.textContent = collecting
      ? `${adapter.lastLoadReport.phase === 'head' ? '正在選取較早掛載訊息，逐段向前收集' : '正在選取較晚掛載訊息，補收後續對話'} · 本次新增 ${Math.max(0, store.entries.length - collectionStart)} 則 · 最多 5 分鐘，可按停止。`
      : adapter.lastLoadReport.phase === 'jump' ? '正在跳至已觀察的位置，等待目標重新掛載…'
      : adapter.lastLoadReport.phase === 'refine' ? '正在修正跳轉位置，核對目標訊息…' : '正在尋找目標附近的訊息…';
  }
  function refresh(direction?: 'older' | 'newer'): void {
    collect(direction);
    render();
  }
  function queue(records: MutationRecord[] = []): void {
    if (!alive) return;
    if (store.context !== location.origin + location.pathname) { clearTimeout(refreshTimer); refreshTimer = undefined; refresh(); return; }
    collect(undefined, records);
    if (refreshTimer === undefined) refreshTimer = setTimeout(() => { refreshTimer = undefined; render(); }, 120);
  }
  async function navigate(id: string | null): Promise<void> {
    if (!alive) return;
    refresh();
    if (id !== null && (!store.entries.some(entry => entry.id === id && entry.stable) ||
      (!adapter.canLocate(id) && (!store.ordered || store.quarantine.length || store.mounted.has(id))))) {
      status.textContent = '此目標的順序、正文或目前分支尚未核對；請先手動捲動至該則提問。'; return;
    }
    cancel(); const token = ++navigationToken, epoch = store.epoch;
    collecting = id === null; collectionStart = store.entries.length;
    operation = new AbortController(); navigationPending = true;
    const position = await adapter.capture(operation.signal);
    if (!alive || token !== navigationToken || epoch !== store.epoch) return;
    returnPosition = position; returnEpoch = epoch; render();
    delete host.dataset.restored;
    adapter.begin(id === null);
    const result = await navigator.run(id);
    if (!alive || token !== navigationToken) return;
    navigationPending = false;
    if (id === null && result === 'idle') status.textContent = adapter.collectionFinished
      ? `本次已向前、向後巡覽，新增 ${Math.max(0, store.entries.length - collectionStart)} 則；兩端連續未觀察到進展。完整歷史尚未核對；可返回剛才位置。`
      : `連續等待未觀察到進展，本次新增 ${Math.max(0, store.entries.length - collectionStart)} 則。請開啟頁面診斷檢查捲動；完整歷史尚未核對。`;
    updateCurrent();
  }
  async function restore(): Promise<void> {
    const position = returnPosition, epoch = returnEpoch;
    if (!alive || !position || epoch !== store.epoch) { status.textContent = '原閱讀位置已失效，無法恢復。'; return; }
    if (!adapter.mounted(position.id) && (!store.ordered || store.quarantine.length)) {
      status.textContent = '原閱讀位置的順序尚未核對，請先手動捲動至原提問附近。'; return;
    }
    if (!adapter.mounted(position.id) && position.role === 'assistant' && !position.anchorId) {
      status.textContent = '原答案缺少可核對的提問錨點，請先手動捲動至原答案附近。'; return;
    }
    cancel(); const token = ++navigationToken;
    collecting = false;
    operation = new AbortController(); navigationPending = true;
    delete host.dataset.restored;
    adapter.begin();
    const result = await navigator.run(position.id);
    if (!alive || token !== navigationToken || epoch !== store.epoch) return;
    if (result !== 'located') { navigationPending = false; status.textContent = '原閱讀位置目前未掛載，尚未恢復。'; return; }
    const restored = await adapter.restore(position, operation.signal);
    if (!alive || token !== navigationToken || epoch !== store.epoch) return;
    navigationPending = false;
    status.textContent = restored ? '已回到剛才的閱讀位置。' : '原閱讀錨點已改變，位置未能精準恢復。';
    host.dataset.restored = String(restored); updateCurrent();
  }
  const observer = new MutationObserver(queue); observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'data-message-id', 'data-message-author-role', 'data-testid', 'data-fixture-branch', 'data-turn', 'data-turn-id', 'data-turn-key', 'data-user-message-bubble', 'data-conversation-role', 'data-chatgpt-agent-turn-start'] });
  const routeTimer = setInterval(() => { if (alive && store.context !== location.origin + location.pathname) refresh(); }, 500);
  window.addEventListener('popstate', refreshRoute, { signal: events.signal });
  function refreshRoute(): void { refresh(); }
  window.addEventListener('pagehide', dispose, { signal: events.signal });
  document.addEventListener('scroll', () => { queue(); updateCurrent(); }, { capture: true, passive: true, signal: events.signal });
  for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown', 'input']) document.addEventListener(type, event => {
    if ((navigationPending || navigator.state === 'loading') && event.isTrusted && !event.composedPath().includes(host)) cancel();
  }, { capture: true, passive: true, signal: events.signal });
  input.addEventListener('input', () => { query = input.value; render(); }, { signal: events.signal });
  document.addEventListener('keydown', event => {
    if (!event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || event.key.toLowerCase() !== 'o' ||
      event.repeat || event.isComposing || event.keyCode === 229 || event.defaultPrevented) return;
    const editing = event.composedPath().some(target => target instanceof HTMLElement &&
      (target.isContentEditable || target.matches('input, textarea, select, [role~="textbox"], [role~="combobox"]')));
    if (editing) return;
    event.preventDefault(); event.stopPropagation(); setExpanded(true);
  }, { capture: true, signal: events.signal });
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
    alive = false; cancel(); events.abort(); observer.disconnect(); clearTimeout(refreshTimer); clearInterval(routeTimer);
    browser.runtime.onMessage.removeListener(runtimeListener); port?.disconnect(); port = null; adapter.dispose(); store.reset(); host.remove();
    delete world.__chatgptToc;
  }
  panel.hidden = true; back.disabled = true; stop.hidden = true; status.textContent = labels.idle; toggle.setAttribute('aria-expanded', 'false');
  refresh();
  void browser.runtime.sendMessage({ kind: 'settings:get' }).then((value: unknown) => { if (alive && uiRevision === 0) setExpanded(validSettings(value) ? value.expanded : DEFAULT_SETTINGS.expanded, false, false); }).catch(() => {});
  return { show: () => setExpanded(true), dispose };
}
