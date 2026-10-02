import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { download } from 'geckodriver';
import { Builder, By } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
export async function fixtureSession(folder = 'artifacts/firefox-fixture') {
  const artifacts = resolve(folder); await mkdir(artifacts, { recursive: true });
  const built = spawnSync(process.execPath, ['scripts/build.mjs', '--fixture'], { stdio: 'inherit', windowsHide: true });
  if (built.status !== 0) throw new Error('Fixture build failed');
  const server = createServer(async (req, res) => {
    try { const file = req.url === '/fixture.js' ? 'tests/fixtures/fixture.js' : 'tests/fixtures/conversation.html'; res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'text/html'); res.end(await readFile(file)); }
    catch { res.writeHead(500); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let driver;
  try {
    const binary = await download('0.37.1', resolve('../../work/geckodriver'));
    const profileRoot = resolve('../../work/firefox-fixture/profiles'); await mkdir(profileRoot, { recursive: true });
    const options = new firefox.Options().setBinary(process.env.FIREFOX_BINARY || 'C:/Program Files/Mozilla Firefox/firefox.exe').addArguments('-headless').windowSize({ width: 1200, height: 900 });
    const service = new firefox.ServiceBuilder(binary).setStdio('ignore').addArguments('--allow-system-access', '--profile-root', profileRoot);
    driver = await new Builder().forBrowser('firefox').setFirefoxOptions(options).setFirefoxService(service).build();
    const addon = await driver.installAddon(resolve('dist/fixture'), true);
    await driver.setContext(firefox.Context.CHROME);
    const uuid = await driver.executeScript('return JSON.parse(Services.prefs.getStringPref("extensions.webextensions.uuids"))[arguments[0]]', addon);
    await driver.setContext(firefox.Context.CONTENT);
    const url = `http://127.0.0.1:${server.address().port}/c/synthetic`;
    const optionsUrl = `moz-extension://${uuid}/options.html`;
    async function action() {
      await driver.setContext(firefox.Context.CHROME);
      try {
        await driver.findElement(By.id('unified-extensions-button')).click();
        await driver.findElement(By.css(`toolbarbutton.unified-extensions-item-action-button[data-extensionid="${addon}"]`)).click();
      } finally { await driver.setContext(firefox.Context.CONTENT); }
    }
    async function screenshot(name) { await writeFile(resolve(artifacts, name), await driver.takeScreenshot(), 'base64'); }
    return { driver, addon, url, optionsUrl, artifacts, action, screenshot, async close() { await driver.quit(); await new Promise(resolve => server.close(resolve)); } };
  } catch (error) { if (driver) await driver.quit(); await new Promise(resolve => server.close(resolve)); throw error; }
}
