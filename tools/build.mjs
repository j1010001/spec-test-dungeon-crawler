#!/usr/bin/env node
// Inline build (FR-014 / SC-007 / US6): concatenates the ES-module dev
// source into ONE non-module <script> block inside a single self-contained
// /index.html at the repository root. Node stdlib only. No test code, no
// external requests, no import/export statements in the output (browsers
// block ES modules over file://, per the 2026-06-25 clarification).
//
// Regenerate with:  npm run build   (or: node tools/build.mjs)

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Dependency order: no module may use a name defined later.
const MODULES = [
  'src/constants.js',
  'src/rng.js',
  'src/logger.js',
  'src/fov.js',
  'src/dungeon.js',
  'src/game.js',
  'src/input.js',
  'src/render.js',
  'src/main.js',
];

function stripModuleSyntax(source, name) {
  // Drop import statements (including multi-line named imports).
  let src = source.replace(/^import\s[\s\S]*?from\s+['"][^'"]+['"];\s*$/gm, '');
  src = src.replace(/^import\s+['"][^'"]+['"];\s*$/gm, '');
  // `export const X` / `export function X` / `export class X` => keep the
  // declaration, drop the keyword.
  src = src.replace(/^(\s*)export\s+/gm, '$1');
  if (/^\s*(import|export)\b/m.test(src)) {
    throw new Error(`module syntax survived stripping in ${name}`);
  }
  return src;
}

const js = MODULES.map((rel) => {
  const src = readFileSync(join(root, rel), 'utf8');
  return `// ===== ${rel} =====\n${stripModuleSyntax(src, rel)}`;
}).join('\n\n');

const css = readFileSync(join(root, 'src/style.css'), 'utf8');

if (/<\/script/i.test(js)) throw new Error('script content would break the inline block');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Retro Dungeon Crawler</title>
<style>
${css}
</style>
</head>
<body>
<div id="app"></div>
<script>
(function () {
'use strict';
${js}
})();
</script>
</body>
</html>
`;

writeFileSync(join(root, 'index.html'), html);
console.log(`wrote index.html (${html.length} bytes) from ${MODULES.length} modules`);
