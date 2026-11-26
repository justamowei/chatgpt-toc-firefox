import { spawnSync } from 'node:child_process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const result = spawnSync(process.execPath, ['node_modules/web-ext/bin/web-ext.js', 'build', '--source-dir', 'dist/firefox', '--artifacts-dir', 'artifacts/packages', '--overwrite-dest'], { stdio: 'inherit', windowsHide: true });
if (result.status !== 0) process.exit(result.status ?? 1);
for (const name of await readdir('artifacts/packages')) {
  if (!name.endsWith('.zip')) continue;
  const path = resolve('artifacts/packages', name);
  const sha256 = createHash('sha256').update(await readFile(path)).digest('hex');
  await writeFile(path + '.sha256', `${sha256}  ${name}\n`);
  console.log(JSON.stringify({ path, sha256, signed: false }));
}
