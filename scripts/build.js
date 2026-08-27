#!/usr/bin/env node
// Inline build (Session 2026-06-25/2026-07-09 clarifications, FR-014, US6):
// concatenates the dev ES modules into ONE non-module inline <script> block
// inside a single root index.html, launchable via file:// with no tooling.
//
// Usage: node scripts/build.js [outFile]   (default: <repo root>/index.html —
// then commit the regenerated index.html; tests pass a temp outFile so the
// working tree is never mutated by the suite)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Dependency order matters: no module references a name defined later.
const MODULES = [
  'src/constants.js',
  'src/logger.js',
  'src/rng.js',
  'src/entities.js',
  'src/input.js',
  'src/dungeon.js',
  'src/game.js',
  'src/render.js',
  'src/main.js',
];

function inlineModule(file) {
  let code = readFileSync(path.join(root, file), 'utf8');
  // Drop import statements (single- or multi-line).
  code = code.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];\s*$/gm, '');
  // Drop the export keyword; declarations become plain IIFE-scoped names.
  code = code.replace(/^export\s+(?=function|const|let|var|class)/gm, '');
  return `// ===== ${file} =====\n${code.trim()}\n`;
}

const bundle = MODULES.map(inlineModule).join('\n');

// Safety net: the shipped script MUST be non-module (browsers block ES
// modules over file://) and free of test tooling (FR-036).
if (/^\s*(import|export)\s/m.test(bundle) || /\bimport\s*\(/.test(bundle)) {
  throw new Error('build: bundle still contains import/export syntax');
}
for (const banned of ['vitest', 'playwright']) {
  if (bundle.toLowerCase().includes(banned)) {
    throw new Error(`build: bundle references test tooling: ${banned}`);
  }
}

const CSS = `
  html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
  body { font: 14px/18px "Courier New", Courier, monospace; color: #9e9e9e; }
  #app { display: flex; flex-direction: column; height: 100%; }
  /* Header: max 3 lines (54px), stats+log left, controls hint right (FR-033).
     Spacing between the two columns uses a margin, not flex gap — flex gap
     needs Safari 14.1+ and FR-014 targets Safari 14+. */
  #hud { flex: 0 0 auto; max-height: 54px; height: 54px; display: flex;
         justify-content: space-between; padding: 0 8px; overflow: hidden; }
  #hud-left { overflow: hidden; min-width: 0; }
  #stats { white-space: nowrap; color: #9e9e9e; }
  #log { height: 36px; overflow-y: auto; scrollbar-width: none; white-space: pre; color: #9e9e9e; }
  #log::-webkit-scrollbar { display: none; }
  #hud-right { white-space: nowrap; color: #9e9e9e; margin-left: 16px; }
  /* Grid viewport: fills the rest, centered, scrollable without visible
     scrollbars (FR-033/FR-034) */
  #viewport { flex: 1 1 auto; overflow: auto; scrollbar-width: none; }
  #viewport::-webkit-scrollbar { display: none; }
  #grid { position: relative; width: max-content; margin: 0 auto; outline: none; }
  #grid:focus { box-shadow: 0 0 0 1px #4a4a4a; } /* visible focus feedback (FR-030) */
  .row { white-space: pre; height: 16px; }
  .cell { display: inline-block; width: 9px; height: 16px; text-align: center;
          font-size: 13px; line-height: 16px; }
  /* R102 palette: black bg; walls+staircase grey; dimmed fog dark grey;
     player white; enemies light brown; items light blue. Nothing else. */
  .c-hidden { color: #000; }
  .c-dim { color: #4a4a4a; }
  .c-wall, .c-floor, .c-stairs { color: #9e9e9e; }
  .c-player { color: #ffffff; }
  .c-enemy { color: #c9975b; }
  .c-item { color: #8fd0ff; }
  /* Full-viewport overlays, invisible when inactive (FR-035). Offsets use the
     four longhands, NOT the "inset" shorthand: inset needs Safari 14.1+ and
     FR-014 targets Safari 14+, where an ignored shorthand would collapse the
     overlay off-viewport. Overlay text is the wall grey (R102 palette). */
  .overlay { position: fixed; top: 0; right: 0; bottom: 0; left: 0;
             background: #000; color: #9e9e9e;
             display: none; padding: 48px; white-space: pre; z-index: 10;
             font: 16px/24px "Courier New", Courier, monospace; }
  .overlay.open { display: block; }
`;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Retro Dungeon Crawler</title>
<style>${CSS}</style>
</head>
<body>
<div id="app"></div>
<script>
(function () {
'use strict';
${bundle}
startGame(window);
})();
</script>
</body>
</html>
`;

const outFile = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, 'index.html');
writeFileSync(outFile, html);
console.log(`build: wrote ${outFile} (${html.length} bytes) from ${MODULES.length} modules`);
