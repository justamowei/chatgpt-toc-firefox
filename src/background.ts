import { DEFAULT_SETTINGS, validMessage, validSettings, type Settings } from './core';
import { HOSTS, supported } from './config';
let settingsQueue: Promise<unknown> = Promise.resolve();
let registrationQueue: Promise<unknown> = Promise.resolve();
const ports = new Set<browser.runtime.Port>();
async function settings(): Promise<Settings> {
  const result = await browser.storage.local.get('settings');
  return validSettings(result.settings) ? result.settings : { ...DEFAULT_SETTINGS };
}
async function update(patch: Partial<Settings>): Promise<Settings> {
  const task = settingsQueue.then(async () => {
    const next = { ...await settings(), ...patch }; await browser.storage.local.set({ settings: next }); return next;
  });
  settingsQueue = task.catch(() => {}); return task;
}
function stopPages(): Promise<void> {
  // Notify connected pages before awaiting anything, even after host permission is lost.
  for (const port of ports) { try { port.postMessage({ kind: 'dispose' }); } catch {} }
  // URL-filtered queries lose access when host permission is revoked.
  return browser.tabs.query({}).then(tabs => Promise.all(tabs.map(tab => tab.id === undefined || tab.incognito ? undefined :
    browser.tabs.sendMessage(tab.id, { kind: 'dispose' }, { frameId: 0 }).catch(() => {})))).then(() => {});
}
function syncRegistration(): Promise<void> {
  const task = registrationQueue.then(async () => {
    const granted = await browser.permissions.contains({ origins: HOSTS });
    const s = await settings();
    const registered = await browser.scripting.getRegisteredContentScripts({ ids: ['chatgpt-toc'] });
    if (s.auto && granted && !registered.length) await browser.scripting.registerContentScripts([
      { id: 'chatgpt-toc', matches: HOSTS, js: ['content.js'], runAt: 'document_idle' },
    ]);
    if ((!s.auto || !granted) && registered.length) await browser.scripting.unregisterContentScripts({ ids: ['chatgpt-toc'] });
  });
  registrationQueue = task.catch(() => {}); return task;
}
function contentSender(sender: browser.runtime.MessageSender): boolean {
  return sender.id === browser.runtime.id && !!sender.tab && !sender.tab.incognito && sender.frameId === 0 && supported(sender.url);
}
function optionsSender(sender: browser.runtime.MessageSender): boolean {
  return sender.id === browser.runtime.id && !sender.tab?.incognito && sender.url === browser.runtime.getURL('options.html');
}
browser.runtime.onConnect.addListener(port => {
  if (port.name !== 'toc-lifecycle' || !port.sender || !contentSender(port.sender)) { port.disconnect(); return; }
  ports.add(port); port.onDisconnect.addListener(() => { ports.delete(port); });
});
browser.action.onClicked.addListener(async tab => {
  if (tab.id === undefined || tab.incognito || !supported(tab.url)) {
    if (tab.id !== undefined) await browser.action.setTitle({ tabId: tab.id, title: '請在一般視窗的 ChatGPT 對話頁開啟目錄' });
    return;
  }
  try {
    await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    await browser.action.setBadgeText({ tabId: tab.id, text: '' });
  } catch { await browser.action.setBadgeText({ tabId: tab.id, text: '!'}); }
});
browser.runtime.onMessage.addListener((message: unknown, sender) => {
  if (!validMessage(message)) return undefined;
  const page = contentSender(sender), options = optionsSender(sender);
  if (!page && !options) return undefined;
  if (message.kind === 'settings:get') return settings();
  if (message.kind === 'settings:set' && page) return update({ expanded: message.expanded });
  if (message.kind === 'options:open' && page) return browser.runtime.openOptionsPage();
  if (message.kind === 'auto:set' && options) return (async () => {
    if (message.enabled && !await browser.permissions.contains({ origins: HOSTS })) return { auto: false, error: 'permission-required' };
    if (!message.enabled) await stopPages();
    const next = await update({ auto: message.enabled }); await syncRegistration(); return next;
  })();
  return undefined;
});
browser.permissions.onRemoved.addListener(permissions => {
  if (!permissions.origins?.some(origin => HOSTS.includes(origin))) return;
  const stopped = stopPages();
  void Promise.all([stopped, update({ auto: false }).then(syncRegistration)]).catch(() => {});
});
browser.runtime.onInstalled.addListener(() => { void syncRegistration().catch(() => {}); });
browser.runtime.onStartup.addListener(() => { void syncRegistration().catch(() => {}); });
void syncRegistration().catch(() => {});
