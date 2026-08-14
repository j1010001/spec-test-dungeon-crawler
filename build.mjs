// Inline build (Session 2026-06-25 clarification; FR-014, FR-036):
// concatenates the ES-module dev source into template.html as ONE
// non-module <script> block (no import/export), producing the single
// shippable artifact ./index.html. The artifact needs no build step to
// launch — this script only regenerates it after source changes.
//
// Source discipline that makes the transform safe (guarded by the
// Playwright suite in tests-e2e/, per User Story 6):
//   - imports are single-line, top-level `import { .. } from '..';`
//   - exports are `export function|class|const` or none
//   - top-level names are unique across all modules

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

// Dependency order matters: later files call names defined earlier.
const MODULES = [
  'src/logger.js',
  'src/rng.js',
  'src/entities.js',
  'src/dungeon.js',
  'src/game.js',
  'src/render.js',
  'src/input.js',
  'src/main.js',
];

function stripModuleSyntax(source, file) {
  const out = [];
  const lines = source.split('\n');
  let inImport = false;
  for (const line of lines) {
    if (inImport) {
      // consume until the import statement's terminating `';`
      if (/;\s*$/.test(line)) inImport = false;
      continue;
    }
    if (/^import[\s{]/.test(line)) {
      if (!/;\s*$/.test(line)) inImport = true;
      continue;
    }
    out.push(line.replace(/^export\s+(function|class|const|let)/, '$1'));
  }
  if (inImport) throw new Error(`${file}: unterminated import statement`);
  return out.join('\n');
}

const banner = `// Retro Dungeon Crawler — shipped artifact.
// GENERATED FILE: built from src/*.js by build.mjs — edit the sources,
// then run \`npm run build\`. Single non-module script block per FR-014.
'use strict';
`;

const js = MODULES.map((m) =>
  `// ===== ${m} =====\n` + stripModuleSyntax(readFileSync(join(root, m), 'utf8'), m)
).join('\n');

const template = readFileSync(join(root, 'template.html'), 'utf8');
const html = template.replace('<!--SCRIPT-->', `<script>\n${banner}\n${js}\n</script>`);
if (html === template) throw new Error('template.html: <!--SCRIPT--> placeholder missing');

writeFileSync(join(root, 'index.html'), html);
console.log(`built index.html (${(html.length / 1024).toFixed(1)} KB)`);
