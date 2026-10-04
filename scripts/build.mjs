import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const fixture = process.argv.includes('--fixture');
const revision = JSON.parse(await readFile('package.json', 'utf8')).tocRevision;
const out = resolve('dist', fixture ? 'fixture' : 'firefox');
await mkdir(out, { recursive: true });
await build({ entryPoints: ['src/background.ts', 'src/content.ts', 'src/options.ts'], outdir: out, bundle: true, format: 'iife', platform: 'browser', target: 'firefox140',
  define: { __FIXTURE__: String(fixture), __REVISION__: JSON.stringify(revision) }, tsconfig: 'tsconfig.json', legalComments: 'none', charset: 'utf8' });
const manifest = JSON.parse(await readFile('manifests/firefox.json', 'utf8'));
if (fixture) {
  manifest.name += '（合成測試專用）';
  manifest.browser_specific_settings.gecko.id = 'chatgpt-toc-fixture@local.codex';
  manifest.optional_host_permissions = ['http://127.0.0.1/*'];
}
await writeFile(resolve(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
// Git's Windows checkout may use CRLF; ship the same text bytes as git archive.
for (const file of ['options.html', 'host.css']) {
  await writeFile(resolve(out, file), (await readFile(`src/${file}`, 'utf8')).replace(/\r\n/g, '\n'), 'utf8');
}
const hashes = {};
for (const file of ['background.js', 'content.js', 'options.js', 'options.html', 'host.css', 'manifest.json']) hashes[file] = createHash('sha256').update(await readFile(resolve(out, file))).digest('hex');
await writeFile(resolve(out, 'build-info.json'), JSON.stringify({ version: manifest.version, revision, fixture, hashes }, null, 2) + '\n');
console.log(JSON.stringify({ output: out, fixture, hashes }));
