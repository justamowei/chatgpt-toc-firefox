// Compile the same pure DOM reader into a read-only browser inspection callback.
// This does not load or mutate the addon inside a real ChatGPT page.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { transform } from 'esbuild';
const source = (await readFile('src/turns.ts', 'utf8')).replace('export interface Turn', 'interface Turn').replace('export function readTurns', 'function readTurns');
const { code } = await transform(source, { loader: 'ts', format: 'esm', target: 'es2022' });
await mkdir('artifacts/iab-cache-fix', { recursive: true });
await writeFile('artifacts/iab-cache-fix/readonly-parser.js', `() => { ${code}; return readTurns().map(e => ({role:e.role,id:e.stableId,slot:e.slot,text:e.role==='user'?e.text:undefined})); }`);
