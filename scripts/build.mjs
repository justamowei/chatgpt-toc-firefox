import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, posix } from 'node:path';
const fixture = process.argv.includes('--fixture');
const revision = JSON.parse(await readFile('package.json', 'utf8')).tocRevision;
const out = resolve('dist', fixture ? 'fixture' : 'firefox');
await mkdir(out, { recursive: true });
// All runtime imports are local TypeScript modules. Resolve them through Node's
// workspace reads, avoiding esbuild's unnecessary ancestor-directory scanning
// under Windows filesystem restrictions. Reject imports outside src explicitly.
const workspaceSources = { name: 'workspace-sources', setup(bundler) {
  bundler.onResolve({ filter: /.*/ }, args => {
    if (args.kind !== 'entry-point' && !args.path.startsWith('.')) throw new Error('Non-local runtime import: ' + args.path);
    let file = posix.normalize(args.kind === 'entry-point' ? args.path : posix.join(posix.dirname(args.importer), args.path));
    if (!file.endsWith('.ts')) file += '.ts';
    if (!file.startsWith('src/') || file.includes('\\')) throw new Error('Runtime import outside src: ' + args.path);
    return { path: file, namespace: 'workspace-source' };
  });
  bundler.onLoad({ filter: /.*/, namespace: 'workspace-source' }, async args => ({ contents: await readFile(resolve(args.path), 'utf8'), loader: 'ts' }));
} };
await build({ entryPoints: ['src/background.ts', 'src/content.ts', 'src/options.ts'], outdir: out, bundle: true, format: 'iife', platform: 'browser', target: 'firefox140',
  define: { __FIXTURE__: String(fixture), __REVISION__: JSON.stringify(revision) }, tsconfigRaw: JSON.parse(await readFile('tsconfig.json', 'utf8')),
  plugins: [workspaceSources], legalComments: 'none', charset: 'utf8' });
const manifest = JSON.parse(await readFile('manifests/firefox.json', 'utf8'));
if (fixture) {
  manifest.name += '（合成測試專用）';
  manifest.browser_specific_settings.gecko.id = 'chatgpt-toc-fixture@local.codex';
  manifest.host_permissions = ['http://127.0.0.1/*'];
  delete manifest.optional_host_permissions;
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
