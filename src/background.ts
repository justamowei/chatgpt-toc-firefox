import { DEFAULT_SETTINGS, validMessage, validSettings, type Settings } from './core';
const ORIGIN = 'https://chatgpt.com/*';
const extensionOrigin = new URL(browser.runtime.getURL('/')).origin;
let settingsQueue: Promise<unknown> = Promise.resolve();
async function settings(): Promise<Settings> {
  const result = await browser.storage.local.get('settings');
  return validSettings(result.settings) ? result.settings : { ...DEFAULT_SETTINGS };
}
function supported(url?: string): boolean { try { return !!url && new URL(url).origin === 'https://chatgpt.com'; } catch { return false; } }
async function update(patch: Partial<Settings>): Promise<Settings> {
  const task = settingsQueue.then(async () => {
    const next = { ...await settings(), ...patch }; await browser.storage.local.set({ settings: next }); return next;
  });
  settingsQueue = task.catch(() => {}); return task;
}
async function stopPages(): Promise<void> {
  const tabs = await browser.tabs.query({ url: ORIGIN });
  await Promise.all(tabs.map(tab => tab.id === undefined ? undefined : browser.tabs.sendMessage(tab.id, { kind: 'dispose' }).catch(() => {})));
}
async function syncRegistration(): Promise<void> {
  const granted = await browser.permissions.contains({ origins: [ORIGIN] });
  const s = await settings();
  const registered = await browser.scripting.getRegisteredContentScripts({ ids: ['chatgpt-toc'] });
  if (s.auto && granted && !registered.length) await browser.scripting.registerContentScripts([{ id: 'chatgpt-toc', matches: [ORIGIN], js: ['content.js'], runAt: 'document_idle' }]);
  if ((!s.auto || !granted) && registered.length) await browser.scripting.unregisterContentScripts({ ids: ['chatgpt-toc'] });
}
browser.action.onClicked.addListener(async tab => {
  if (tab.id === undefined || tab.incognito || !supported(tab.url)) {
    if (tab.id !== undefined) await browser.action.setTitle({ tabId: tab.id, title: '請在一般視窗的 ChatGPT 對話頁開啟目錄' });
    return;
  }
  try {
    await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    await browser.action.setBadgeText({ tabId: tab.id, text: '' });
  } catch { await browser.action.setBadgeText({ tabId: tab.id, text: '!' }); }
});
browser.runtime.onMessage.addListener((message: unknown, sender) => {
  if (!validMessage(message) || sender.id !== browser.runtime.id || !sender.tab || sender.tab.incognito || !supported(sender.url)) return undefined;
  if (message.kind === 'settings:get') return settings();
  if (message.kind === 'settings:set') return update({ expanded: message.expanded });
  // Must be called directly from a user gesture in the content script.
  if (message.kind === 'auto:set') return (async () => {
    const granted = message.enabled ? await browser.permissions.contains({ origins: [ORIGIN] }) : true;
    if (!granted) return { auto: false, error: 'permission-required' };
    const next = await update({ auto: message.enabled }); await syncRegistration(); return next;
  })();
});
browser.permissions.onRemoved.addListener(async permissions => {
  if (!permissions.origins?.includes(ORIGIN)) return;
  await update({ auto: false }); await syncRegistration(); await stopPages();
});
browser.runtime.onInstalled.addListener(() => { void syncRegistration(); });
browser.runtime.onStartup.addListener(() => { void syncRegistration(); });
// Event page wakes must also reconcile registrations without depending on retained globals.
void syncRegistration().catch(() => {});
