import { validSettings } from './core';
import { HOSTS } from './config';
const enable = document.querySelector<HTMLButtonElement>('#enable')!;
const disable = document.querySelector<HTMLButtonElement>('#disable')!;
const status = document.querySelector<HTMLElement>('#status')!;
async function refresh(): Promise<void> {
  const settings: unknown = await browser.runtime.sendMessage({ kind: 'settings:get' });
  const granted = await browser.permissions.contains({ origins: HOSTS });
  status.textContent = validSettings(settings) && settings.auto && granted ? '已啟用：重新載入 ChatGPT 分頁後自動顯示目錄。' : '目前為手動啟用：在 ChatGPT 分頁點擴充功能按鈕。';
}
enable.addEventListener('click', () => {
  // Request synchronously in the extension page's user gesture, never in a content script.
  const request = browser.permissions.request({ origins: HOSTS });
  enable.disabled = true;
  void request.then(async granted => {
    if (!granted) { status.textContent = '未授予網站權限，保留手動啟用。'; return; }
    const result: unknown = await browser.runtime.sendMessage({ kind: 'auto:set', enabled: true });
    if (!validSettings(result) || !result.auto) { status.textContent = '自動啟用未成功，請重新嘗試。'; return; }
    await refresh();
  }).catch(() => { status.textContent = '無法啟用，請確認附加元件仍已載入。'; }).finally(() => { enable.disabled = false; });
});
disable.addEventListener('click', () => {
  disable.disabled = true;
  void browser.runtime.sendMessage({ kind: 'auto:set', enabled: false }).then(async () => {
    await browser.permissions.remove({ origins: HOSTS }); await refresh();
  }).catch(() => { status.textContent = '停用未完成，請透過 Firefox 附加元件設定撤回網站權限。'; }).finally(() => { disable.disabled = false; });
});
void refresh().catch(() => { status.textContent = '無法讀取設定，請重新開啟此頁。'; });
