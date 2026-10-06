import { validSettings } from './core';
import { HOSTS } from './config';
const enable = document.querySelector<HTMLButtonElement>('#enable')!;
const disable = document.querySelector<HTMLButtonElement>('#disable')!;
const clear = document.querySelector<HTMLButtonElement>('#clear')!;
const status = document.querySelector<HTMLElement>('#status')!;
async function refresh(): Promise<void> {
  const settings: unknown = await browser.runtime.sendMessage({ kind: 'settings:get' });
  const granted = await browser.permissions.contains({ origins: HOSTS });
  status.textContent = validSettings(settings) && settings.auto ? granted ? '已啟用：重新載入 ChatGPT 分頁後自動顯示目錄。' : '已設定自動啟用，但 Firefox 尚未允許 ChatGPT 網站權限；請按下啟用或在附加元件設定允許。' : '目前為手動啟用：在 ChatGPT 分頁點擴充功能按鈕。';
}
enable.addEventListener('click', () => {
  // Request synchronously in the extension page's user gesture, never in a content script.
  const request = browser.permissions.request({ origins: HOSTS });
  enable.disabled = true;
  void request.then(async granted => {
    if (!granted) { status.textContent = 'Firefox 尚未授予 ChatGPT 網站權限。'; return; }
    const result: unknown = await browser.runtime.sendMessage({ kind: 'auto:set', enabled: true });
    if (!validSettings(result) || !result.auto) { status.textContent = '自動啟用未成功，請重新嘗試。'; return; }
    await refresh();
  }).catch(() => { status.textContent = '無法啟用，請確認附加元件仍已載入。'; }).finally(() => { enable.disabled = false; });
});
disable.addEventListener('click', () => {
  disable.disabled = true;
  void browser.runtime.sendMessage({ kind: 'auto:set', enabled: false }).then(async () => {
    await refresh();
  }).catch(() => { status.textContent = '停用未完成，請重新嘗試。'; }).finally(() => { disable.disabled = false; });
});
clear.addEventListener('click', () => {
  clear.disabled = true;
  void browser.runtime.sendMessage({ kind: 'cache:clear' }).then(result => {
    status.textContent = result === true ? '已清除本機保存的對話索引；目前開啟分頁仍保留本次已觀察資料。' : '清除未完成，請重新嘗試。';
  }).catch(() => { status.textContent = '清除未完成，請重新嘗試。'; }).finally(() => { clear.disabled = false; });
});
void refresh().catch(() => { status.textContent = '無法讀取設定，請重新開啟此頁。'; });
