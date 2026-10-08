(function mountV035Rebuild(options = {}) {
  window.v035Fixture?.dispose();
  document.body.replaceChildren();
  const prefix = options.prefix || 'A', windowSize = options.windowSize || 5;
  let count = options.count || 32, start = Math.min(options.start ?? 15, count - windowSize);
  let frozen = !!options.frozen, disposed = false, pending = null, loading = false, slowHeadUsed = false;
  let serial = 0, streamTick = 0, stableIds = !options.unstableIds;
  const mounts = [], events = [], requests = [], edits = new Map(), timers = new Set();
  const outer = document.createElement('div'); outer.dataset.scrollRoot = '';
  outer.style.cssText = 'height:620px;overflow:auto;position:relative;overflow-anchor:none';
  const root = document.createElement('div'); root.dataset.scrollRoot = '';
  root.style.cssText = 'height:620px;overflow:hidden;position:relative;overflow-anchor:none';
  const main = document.createElement('main');
  main.style.cssText = 'margin:0;position:relative;overflow-anchor:none';
  outer.append(root); root.append(main); document.body.append(outer);
  const composer = document.createElement('form');
  composer.style.cssText = 'height:180px;background:#eee;position:fixed;bottom:0;left:0;right:0';
  composer.innerHTML = '<textarea aria-label="Synthetic large composer" style="height:145px;width:70%"></textarea>';
  document.body.append(composer);
  const tops = [], heights = [];
  function layout() {
    let total = 0;
    for (let i = 0; i < count; i++) {
      tops[i] = total; heights[i] = i === 11 ? 12500 : 1100 + i % 3 * 180;
      total += heights[i];
    }
    // A genuine spacer follows the last answer. Numeric bottom includes it.
    main.style.height = (total + (options.spacer ?? 1600)) + 'px';
  }
  function later(fn, delay) {
    const id = setTimeout(() => { timers.delete(id); if (!disposed) fn(); }, delay);
    timers.add(id); return id;
  }
  function render(reason = 'mount') {
    main.replaceChildren();
    const wanted = new Set(options.pinned === false ? [] : [count - 2, count - 1]);
    for (let i = start; i < Math.min(count, start + windowSize); i++) wanted.add(i);
    for (const i of [...wanted].sort((a, b) => a - b)) for (const role of ['user', 'assistant']) {
      const shell = document.createElement('section');
      shell.dataset.testid = 'conversation-turn-' + serial++;
      shell.dataset.turn = role; if (stableIds) shell.dataset.turnId = prefix + ':' + role[0] + '-' + i;
      shell.dataset.anchorIndex = String(i); shell.dataset.anchorRole = role;
      const height = role === 'user' ? 100 : heights[i] - 100;
      shell.style.cssText = 'position:absolute;left:20px;right:20px;top:' + (tops[i] + (role === 'user' ? 0 : 100)) +
        'px;height:' + height + 'px;content-visibility:auto;contain-intrinsic-size:auto ' + height + 'px;overflow-anchor:none';
      const body = document.createElement('div'); body.dataset.messageAuthorRole = role;
      if (stableIds) body.dataset.messageId = prefix + ':' + role[0] + '-' + i;
      body.textContent = role === 'user' ? (edits.get(i) ?? prefix + ' 本機提問 ' + i) : '本機長回答 ' + i;
      body.style.cssText = 'min-height:70px'; shell.append(body); main.append(shell);
    }
    if (options.hiddenBusy) {
      const hidden = document.createElement('div'); hidden.setAttribute('aria-busy', 'true');
      hidden.setAttribute('role', 'progressbar'); hidden.style.display = 'none'; main.append(hidden);
    }
    if (loading) addLoader();
    mounts.push({ start, end: Math.min(count - 1, start + windowSize - 1), reason, top: root.scrollTop, at: performance.now() });
  }
  function addLoader() {
    const loader = document.createElement('div'); loader.dataset.testid = 'loading-conversation';
    loader.setAttribute('aria-busy', 'true'); loader.setAttribute('role', 'progressbar');
    loader.style.cssText = 'position:absolute;top:0;height:44px;width:180px;background:#ffc';
    loader.textContent = 'Slow head mount'; main.append(loader);
  }
  function onScroll() {
    const top = root.scrollTop, bottom = top + root.clientHeight >= root.scrollHeight - 2;
    events.push({ top, bottom, start, loading, at: performance.now() });
    if (frozen || pending !== null) return;
    let visible = 0;
    while (visible + 1 < count && tops[visible + 1] <= top + 2) visible++;
    // Native positions directly drive remounts, including numeric bottom.
    // No element method is monkey-patched or used as its trigger.
    const next = bottom ? count - windowSize : Math.max(0, Math.min(count - windowSize, visible - 2));
    if (next === start) return;
    const direction = next < start ? 'older' : 'newer';
    requests.push({ from: start, to: next, direction, bottom, top, at: performance.now() });
    let delay = options.delay ?? 120;
    if (next === 0 && options.slowHeadMs && !slowHeadUsed) {
      slowHeadUsed = true; loading = true; start = 0; render('slow-head-placeholder'); delay = options.slowHeadMs;
    }
    pending = later(() => { pending = null; start = next; loading = false; render(direction); }, delay);
  }
  layout(); render('initial'); root.scrollTop = tops[Math.min(count - 1, start + 2)] + 20;
  root.addEventListener('scroll', onScroll);
  const stream = options.tailStream ? setInterval(() => {
    const answer = main.querySelector('[data-message-id="' + prefix + ':a-' + (count - 1) + '"]');
    if (answer) answer.textContent = '本機尾端串流 ' + ++streamTick;
  }, 100) : null;
  window.v035Fixture = {
    freeze(value = true) { frozen = value; },
    hydrateStable() { stableIds = true; for (const shell of main.querySelectorAll('section')) { const id = prefix + ':' + shell.dataset.anchorRole[0] + '-' + shell.dataset.anchorIndex; shell.dataset.turnId = id; shell.firstElementChild.dataset.messageId = id; } },
    move(index) { root.scrollTop = tops[index] + 20; },
    bottom() { root.scrollTop = root.scrollHeight; },
    edit(index) { edits.set(index, prefix + ' changed prompt ' + index); render('edit'); },
    append() { count++; start = count - windowSize; layout(); render('append'); root.scrollTop = root.scrollHeight; },
    stats() { return { prefix, count, start, top: root.scrollTop, height: root.scrollHeight, client: root.clientHeight,
      windowSize, loading, frozen, streamTick, mounts: mounts.slice(), events: events.slice(), requests: requests.slice(),
      mountedUsers: main.querySelectorAll('[data-message-author-role="user"]').length }; },
    dispose() { disposed = true; clearInterval(stream); for (const timer of timers) clearTimeout(timer); root.removeEventListener('scroll', onScroll); },
  };
})
