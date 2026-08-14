// Build step (dev-only): bundles the ES-module source under src/ into a
// single non-module IIFE and inlines it into build/index.template.html,
// producing the shippable root index.html (FR-014, FR-036, per the
// 2026-06-25 clarification: dev source uses ES modules for vitest; the
// shipped artifact inlines everything in a plain <script> block so it can
// be opened directly via file:// with no bundler at runtime).

import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

async function main() {
  const result = await build({
    entryPoints: [path.join(repoRoot, 'src', 'main.js')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['chrome90', 'firefox88', 'safari14'],
    write: false,
    minify: false,
    legalComments: 'none',
  });

  const bundleCode = result.outputFiles[0].text;
  const template = readFileSync(path.join(__dirname, 'index.template.html'), 'utf8');
  const output = template.replace('/* __GAME_BUNDLE__ */', bundleCode);
  const outPath = path.join(repoRoot, 'index.html');
  writeFileSync(outPath, output, 'utf8');
  console.log(`Built shipped artifact: ${outPath} (${(output.length / 1024).toFixed(1)} KB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
