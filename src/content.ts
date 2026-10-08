import { DEFAULT_SETTINGS, IndexStore, Navigator, normalize, validSettings, type NavState, type Position } from './core';
import { DomAdapter } from './dom';
import { supported, BUILD_REVISION } from './config';
import { styles } from './styles';
import { cancelsNavigation } from './interaction';
import { PersistentIndex, runtimeIndexBackend } from './persistence';
type Instance = { show(): void; dispose(): void };
const world = globalThis as typeof globalThis & { __chatgptToc?: Instance };
if (window === window.top && !browser.extension.inIncognitoContext && supported(location.href)) {
  if (world.__chatgptToc) world.__chatgptToc.show();
  else world.__chatgptToc = start();
}
function start(): Instance {
  let alive = true, expanded = false, query = '', railKey = '', navigationToken = 0, uiRevision = 0;
  let currentPrompt: string | undefined, listGeneration = 0, listQuery = '', listOrdered = true, listSegments = '', listNumbers = '';
  let renderedEntries: typeof store.entries = [], renderedQuarantine: typeof store.quarantine = [];
  const listButtons = new Map<string, HTMLButtonElement>(), railButtons = new Map<string, HTMLButtonElement>();
  let currentLocatable = new Set<string>();
  let listBuilt = false, listFrame: number | undefined, currentFrame: number | undefined;
  let returnPosition: Position | null = null, returnEpoch = -1, refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let navigationPending = false, operation: AbortController | null = null;
  let collecting = false, collectionStart = 0, collectionMinutes = DEFAULT_SETTINGS.collectionMinutes;
  const events = new AbortController();
  const store = new IndexStore();
  let restoredContext = '', restoreToken = 0;
  const persistence = new PersistentIndex(runtimeIndexBackend(), store, {
    incognito: browser.extension.inIncognitoContext, onStatus: () => { if (alive) render(); },
  });
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
  const earlier = button('重建整段目錄', () => { void navigate(null); }); earlier.id = 'toc-earlier'; earlier.title = '清空本對話已保存的目錄，移到最底，再向上收集到頂端；不刪除聊天。';
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
  const hint = make('div', 'hint', 'Shift＋O 開啟 · Esc 收合。重建會清空本對話目錄，由底往上收集。');
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
    if (sender.id !== browser.runtime.id) return;
    if (isDispose(message)) dispose();
    const notice = message as { kind?: string; context?: string; generation?: number };
    if (notice?.kind === 'cache:invalidated' && notice.context === store.context && Number.isSafeInteger(notice.generation) && notice.generation! > store.cacheGeneration) {
      cancel(); persistence.invalidate(); restoreToken++; store.reset(); store.cacheGeneration = notice.generation!;
      restoredContext = ''; refresh();
    }
  };
  browser.runtime.onMessage.addListener(runtimeListener);
  function cancel(): void {
    const pending = navigationPending; navigationToken++; navigationPending = false; operation?.abort(); operation = null; navigator.cancel();
    if (pending) { host.dataset.navigation = 'cancelled'; earlier.disabled = false; stop.hidden = true; status.textContent = labels.cancelled; }
  }
  function setExpanded(value: boolean, focus = true, persist = true): void {
    if (!alive) return;
    expanded = value; panel.hidden = !expanded; toggle.setAttribute('aria-expanded', String(expanded));
    if (expanded) render();
    if (focus) uiRevision++;
    if (focus) (expanded ? input : toggle).focus({ preventScroll: true });
    if (persist) void browser.runtime.sendMessage({ kind: 'settings:set', expanded }).catch(() => {});
  }
  function updateCurrent(): void {
    if (!alive) return;
    let prompt: string | undefined, distance = Infinity;
    for (const [id, node] of adapter.nodes) if (store.mounted.has(id) && node.isConnected) {
      const next = Math.abs(node.getBoundingClientRect().top - 90);
      if (next < distance) { distance = next; prompt = id; }
    }
    if (currentPrompt !== prompt) {
      for (const buttons of [listButtons, railButtons]) {
        if (currentPrompt) buttons.get(currentPrompt)?.setAttribute('aria-current', 'false');
        if (prompt) buttons.get(prompt)?.setAttribute('aria-current', 'true');
      }
      currentPrompt = prompt;
    }
  }
  function render(): void {
    if (!alive) return;
    scope.textContent = `本頁已看過 ${store.entries.length} 則 · 目前掛載 ${store.mounted.size} 則。歷史尚未完整；${store.branchConfidence === 'unverified' ? '當前分支未完整核對；' : ''}搜尋涵蓋已觀察資料。` +
      (!store.ordered ? '部分先後順序尚未確認，按已收錄群組顯示。' : store.recoveredIds.size ? '已沿用保存的目錄排序。' : '') +
      (store.quarantine.length ? `另有 ${store.retainedCount - store.entries.length} 筆曾看過資料已隔離，僅供搜尋。` : '') +
      (store.limitReason ? `已達${store.limitReason === 'entries' ? '5000 筆記錄' : '500 萬字元'}保留上限，已停止新增；現有資料仍可搜尋。` : '') +
      ({ loading: ' 正在讀取本機目錄。', pending: ' 本機目錄儲存中。', saved: ' 已儲存於本機。', error: ' 本機儲存失敗，本頁資料仍保留。', off: '' }[persistence.status]);
    back.disabled = !returnPosition || returnEpoch !== store.epoch;
    currentLocatable = adapter.locatableIds();
    const selectable = (id: string, stable: boolean) => stable &&
      (store.mounted.has(id) ? currentLocatable.has(id) : store.canSeek(id));
    // Collapse is a visibility update. Retain list nodes and its scroll position;
    // refresh cached rows only when data/search/order actually changes.
    const segmentKey = store.ordered ? '' : store.segments.map(s => `${s.ordered}:${s.ids.join('|')}`).join(';');
    const numberKey = store.numberedIds.join('|');
    const changed = listNumbers !== numberKey || !listBuilt || listQuery !== query || listOrdered !== store.ordered || listSegments !== segmentKey ||
      renderedEntries.length !== store.entries.length || store.entries.some((e, i) => e !== renderedEntries[i]) ||
      renderedQuarantine.length !== store.quarantine.length || store.quarantine.some((g, i) => g !== renderedQuarantine[i]);
    if (expanded && changed) {
      listBuilt = true; listQuery = query; listOrdered = store.ordered; listSegments = segmentKey; listNumbers = numberKey;
      renderedEntries = [...store.entries]; renderedQuarantine = [...store.quarantine];
      const entries = store.search(query), matches = new Map(entries.map(e => [e.id, e]));
      const generation = ++listGeneration;
      if (listFrame !== undefined) cancelAnimationFrame(listFrame);
      const focused = shadow.activeElement instanceof HTMLElement ? shadow.activeElement.dataset.entryId : undefined;
      list.replaceChildren(); listButtons.clear();
      const rows: (() => HTMLLIElement)[] = [];
      for (const [index, segment] of store.segments.entries()) {
        const visible = segment.ids.flatMap(id => matches.has(id) ? [matches.get(id)!] : []);
        if (!visible.length) continue;
        if (!store.ordered) rows.push(() => make('li', 'empty', `已收錄群組 ${index + 1} · ${segment.ordered ? '已保存區段排序' : '先後順序尚未確認'}`));
        for (const entry of visible) {
        rows.push(() => {
        const row = make('li'); const ordinal = store.ordinal(entry.id)!; const prefix = ordinal.confirmed ? `${ordinal.number}. ` : `暫${ordinal.number}. `;
        const choice = button(prefix + entry.text.slice(0, 180), () => { void navigate(entry.id); }, 'entry', false);
        choice.dataset.entryId = entry.id; choice.dataset.ordinal = String(ordinal.number); choice.dataset.numberConfirmed = String(ordinal.confirmed); choice.title = (ordinal.confirmed ? `本對話第 ${ordinal.number} 筆提問：` : '尚未從對話起點核對，暫編：') + entry.text; choice.disabled = !selectable(entry.id, entry.stable);
        choice.setAttribute('aria-current', String(entry.id === currentPrompt)); listButtons.set(entry.id, choice); row.append(choice); return row;
        });
        }
      }
      const archived = store.quarantine.flatMap(group => group.entries).filter(entry => !query || normalize(entry.text).includes(normalize(query)));
      if (archived.length) rows.push(() => make('li', 'empty', '曾看過／分支未核對 · 僅供搜尋，不提供定位'));
      for (const entry of archived) rows.push(() => { const row = make('li', 'archived'); row.textContent = entry.text.slice(0, 180); row.title = entry.text; return row; });
      if (!entries.length && !archived.length) rows.push(() => make('li', 'empty', query ? '沒有符合的已觀察提問。' : '尚未辨識到提問；可捲動對話讓網站掛載訊息。'));
      let cursor = 0;
      const appendBatch = () => {
        listFrame = undefined;
        if (!alive || generation !== listGeneration) return;
        const fragment = document.createDocumentFragment();
        const until = Math.min(rows.length, cursor + 60);
        while (cursor < until) fragment.append(rows[cursor++]());
        list.append(fragment);
        if (focused && expanded) listButtons.get(focused)?.focus({ preventScroll: true });
        if (cursor < rows.length) listFrame = requestAnimationFrame(appendBatch);
        list.setAttribute('aria-busy', String(cursor < rows.length));
      };
      appendBatch();
    } else if (expanded) {
      for (const entry of store.entries) { const row = listButtons.get(entry.id); if (row) {
        const disabled = !selectable(entry.id, entry.stable); if (row.disabled !== disabled) row.disabled = disabled;
      } }
    }
    const key = JSON.stringify([store.cacheRevision, [...store.mounted]]);
    if (key !== railKey) {
      railKey = key; markers.replaceChildren(); railButtons.clear();
      // The rail is a direct shortcut to live prompts, never a sample of
      // retained history. The expanded text list still contains the full cache.
      const liveEntries = new Map(store.entries.map(entry => [entry.id, entry]));
      const railEntries = [...store.mounted].flatMap(id => {
        const entry = liveEntries.get(id);
        return entry && currentLocatable.has(id) ? [entry] : [];
      });
      for (const entry of railEntries) {
        const mark = button('', () => { void navigate(entry.id); }, 'mark', false); mark.dataset.entryId = entry.id;
        const ordinal = store.ordinal(entry.id)!; mark.title = `${ordinal.confirmed ? '' : '暫'}${ordinal.number}. ${entry.text.slice(0, 180)}`; mark.setAttribute('aria-label', `定位：${entry.text.slice(0, 180)}`); mark.disabled = !selectable(entry.id, entry.stable);
        mark.setAttribute('aria-current', String(entry.id === currentPrompt)); railButtons.set(entry.id, mark); markers.append(mark);
      }
    }
    updateCurrent();
  }
  function collect(direction?: 'older' | 'newer', records: MutationRecord[] = []): void {
    if (!alive) return;
    if (!supported(location.href)) { dispose(); return; }
    const snapshot = adapter.read();
    if (store.context && store.context !== snapshot.context) { query = ''; input.value = ''; }
    if (store.context && (store.context !== snapshot.context || store.branch !== snapshot.branch)) void persistence.flush().catch(() => {});
    let reset = false;
    // Capture short-lived, first-seen removed prompts as plain data before the
    // UI debounce. Never carry removed content across a route/known branch.
    if (snapshot.context === store.context && snapshot.branch === store.branch) for (const entries of adapter.readRemoved(records)) {
      reset = store.merge({ ...snapshot, entries }) || reset;
    }
    reset = store.merge(snapshot, direction ?? adapter.currentDirection() ?? 'observe') || reset;
    adapter.remember(); adapter.observeNumbering();
    if (reset) { cancel(); adapter.clearHighlight(); adapter.clearReturnWitness(); returnPosition = null; returnEpoch = -1;
      status.textContent = store.quarantine.length ? '觀察到正文或順序矛盾，舊資料已隔離供搜尋。' : '已切換對話，開始收集本頁提問。'; }
    if (restoredContext !== snapshot.context) {
      restoredContext = snapshot.context; const token = ++restoreToken, context = snapshot.context;
      void persistence.restore(context, () => adapter.read()).then(restored => {
        if (!alive || token !== restoreToken || store.context !== context) return;
        if (restored) { cancel(); adapter.remember(); render(); }
        persistence.schedule();
      }).catch(() => { if (alive && token === restoreToken) persistence.schedule(); });
    } else persistence.schedule();
    if (collecting && store.limitReason && (navigationPending || navigator.state === 'loading')) {
      cancel(); status.textContent = '已達本機保留上限，收集已停止；已收錄資料仍可搜尋。';
    }
    host.setAttribute('data-theme', document.documentElement.classList.contains('dark') ? 'dark' : document.documentElement.classList.contains('light') ? 'light' : 'system');
    if (navigator.state === 'loading') status.textContent = collecting
      ? `${adapter.lastLoadReport.phase === 'head' ? '正在選取較早掛載訊息，逐段向前收集' : '正在選取較晚掛載訊息，補收後續對話'} · 本次新增 ${Math.max(0, store.entries.length - collectionStart)} 則 · 最多 ${collectionMinutes} 分鐘，可按停止。`
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
    // Removed mounts must be captured immediately; ordinary streaming/scroll
    // events share one read so a token stream cannot rebuild the index per event.
    if (store.context === location.origin + location.pathname && adapter.readRemoved(records).length) collect(undefined, records);
    if (refreshTimer === undefined) refreshTimer = setTimeout(() => { refreshTimer = undefined; collect(); render(); }, 120);
  }
  async function navigate(id: string | null): Promise<void> {
    if (!alive) return;
    refresh();
    if (id !== null && (!store.entries.some(entry => entry.id === id && entry.stable) ||
      (!adapter.canLocate(id) && (!store.canSeek(id) || store.mounted.has(id))))) {
      status.textContent = '此目標的順序、正文或目前分支尚未核對；請先手動捲動至該則提問。'; return;
    }
    cancel(); const token = ++navigationToken; let epoch = store.epoch;
    collecting = id === null; collectionStart = store.entries.length;
    operation = new AbortController(); navigationPending = true;
    host.dataset.navigation = 'loading'; earlier.disabled = true; stop.hidden = false;
    status.textContent = collecting ? '正在準備重建本對話目錄…' : '正在準備導航…';
    if (collecting) {
      try {
        const value: unknown = await browser.runtime.sendMessage({ kind: 'settings:get' });
        if (!alive || token !== navigationToken || epoch !== store.epoch) return;
        collectionMinutes = validSettings(value) ? value.collectionMinutes : DEFAULT_SETTINGS.collectionMinutes;
      } catch { collectionMinutes = DEFAULT_SETTINGS.collectionMinutes; }
      if (!alive || token !== navigationToken || epoch !== store.epoch) return;
    }
    const position = await adapter.capture(operation.signal);
    if (!alive || token !== navigationToken || epoch !== store.epoch) return;
    if (collecting) {
      restoreToken++; restoredContext = store.context;
      const context = store.context;
      try {
        const rebuilt = await persistence.rebuild(context, () => adapter.read(), () => alive && token === navigationToken && epoch === store.epoch);
        if (!rebuilt || !alive || token !== navigationToken) { if (alive) { adapter.remember(); render(); } return; }
      } catch {
        if (alive && token === navigationToken) { cancel(); status.textContent = '本機目錄重建失敗；請稍後重試。'; }
        return;
      }
      epoch = store.epoch; adapter.remember(); collectionStart = 0;
    }
    returnPosition = position; returnEpoch = epoch; render();
    delete host.dataset.restored;
    adapter.begin(id === null);
    const result = await navigator.run(id, id === null ? collectionMinutes * 60_000 : undefined);
    if (!alive || token !== navigationToken) return;
    navigationPending = false;
    if (id === null && result === 'idle') status.textContent = adapter.collectionFinished
      ? `已由底往上收集 ${store.entries.length} 則提問，到達頂端並自動停止。${store.numberedIds.length ? '已保存對話提問編號。' : '有區段未連續核對，仍使用暫編號。'}網站未顯示的歷史尚無法核對；可返回剛才位置。`
      : `本次新增 ${Math.max(0, store.entries.length - collectionStart)} 則。完整歷史尚未核對；可繼續收集。`;
    persistence.schedule(); render(); updateCurrent();
  }
  async function restore(): Promise<void> {
    const position = returnPosition, epoch = returnEpoch;
    if (!alive || !position || epoch !== store.epoch) { status.textContent = '原閱讀位置已失效，無法恢復。'; return; }
    if (!adapter.mounted(position.id) && !store.canSeek(position.anchorId ?? position.id)) {
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
  window.addEventListener('pagehide', event => {
    if (event.persisted) { cancel(); void persistence.flush().catch(() => {}); }
    else dispose();
  }, { signal: events.signal });
  window.addEventListener('pageshow', () => { if (alive) refresh(); }, { signal: events.signal });
  document.addEventListener('scroll', event => {
    if (event.composedPath().includes(host)) return;
    if (currentFrame === undefined) currentFrame = requestAnimationFrame(() => { currentFrame = undefined; queue(); updateCurrent(); });
  }, { capture: true, passive: true, signal: events.signal });
  for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown', 'input']) document.addEventListener(type, event => {
    if (type === 'keydown' && !cancelsNavigation(event as KeyboardEvent)) return;
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
    void persistence.flush().catch(() => {}); persistence.dispose(); restoreToken++;
    alive = false; cancel(); events.abort(); observer.disconnect(); clearTimeout(refreshTimer); clearInterval(routeTimer);
    if (listFrame !== undefined) cancelAnimationFrame(listFrame);
    if (currentFrame !== undefined) cancelAnimationFrame(currentFrame);
    browser.runtime.onMessage.removeListener(runtimeListener); port?.disconnect(); port = null; adapter.dispose(); store.reset(); host.remove();
    delete world.__chatgptToc;
  }
  panel.hidden = true; back.disabled = true; stop.hidden = true; status.textContent = labels.idle; toggle.setAttribute('aria-expanded', 'false');
  refresh();
  void browser.runtime.sendMessage({ kind: 'settings:get' }).then((value: unknown) => { if (alive && uiRevision === 0) setExpanded(validSettings(value) ? value.expanded : DEFAULT_SETTINGS.expanded, false, false); }).catch(() => {});
  return { show: () => setExpanded(true), dispose };
}
