import test from 'node:test';
import assert from 'node:assert/strict';
import { transform } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
await mkdir('artifacts/interaction', {recursive:true});
const code = await transform(await readFile('src/interaction.ts','utf8'), {loader:'ts',format:'esm'});
await writeFile('artifacts/interaction/interaction.mjs', code.code);
const {cancelsNavigation} = await import('../artifacts/interaction/interaction.mjs');
const key = (key, extra={}) => ({key,altKey:false,ctrlKey:false,metaKey:false,shiftKey:false,...extra});
test('Alt, AltGraph and Alt combinations do not stop loading', () => {
  for(const k of [key('Alt'),key('Alt',{altKey:true}),key('AltGraph'),key('o',{altKey:true}),key('ArrowUp',{altKey:true})]) assert.equal(cancelsNavigation(k),false);
});
test('panel shortcut and modifiers preserve loading, real reading actions interrupt', () => {
  for(const k of [key('O',{shiftKey:true}),key('o',{shiftKey:true}),key('Shift'),key('Control'),key('Meta'),key('l',{ctrlKey:true}),key('l',{metaKey:true})]) assert.equal(cancelsNavigation(k),false);
  for(const k of [key('Escape'),key('PageUp'),key('ArrowUp',{shiftKey:true}),key('a')]) assert.equal(cancelsNavigation(k),true);
});
