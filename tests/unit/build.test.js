import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, rmSync, mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { CONTROL_HINT } from '../../src/constants.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artifact = path.join(root, 'index.html');

// Acceptance tests for the inline/build step (FR-014, FR-036, SC-007,
// Session 2026-06-25/2026-07-09 clarifications). The suite NEVER mutates the
// working tree: builds go to a temp directory and are diffed against the
// committed root index.html.
describe('shipped artifact: single root index.html', () => {
  let tmpDir;
  let html; // fresh build (temp path)
  let committed; // committed root artifact

  beforeAll(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'rdc-build-'));
    const out = path.join(tmpDir, 'index.html');
    execSync(`node scripts/build.js "${out}"`, { cwd: root, stdio: 'pipe' });
    html = readFileSync(out, 'utf8');
    committed = readFileSync(artifact, 'utf8');
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('the committed root index.html exists and is a fresh build of src/ (byte-identical)', () => {
    expect(existsSync(artifact)).toBe(true);
    expect(html.trimStart().toLowerCase().startsWith('<!doctype html>')).toBe(true);
    expect(committed).toBe(html); // stale artifact = failing build step
  });

  it('contains exactly one script block, and it is NOT an ES module', () => {
    const scripts = [...html.matchAll(/<script\b[^>]*>/gi)];
    expect(scripts).toHaveLength(1);
    expect(scripts[0][0]).not.toMatch(/type\s*=\s*["']?module/i);
    expect(scripts[0][0]).not.toMatch(/\bsrc\s*=/i); // fully inlined, no external file
  });

  it('the inlined script contains no import/export statements (file:// safe)', () => {
    const script = /<script\b[^>]*>([\s\S]*?)<\/script>/i.exec(html)[1];
    expect(script).not.toMatch(/^\s*import\s/m);
    expect(script).not.toMatch(/^\s*export\s/m);
    expect(script).not.toMatch(/\bimport\s*\(/); // no dynamic import either
  });

  it('makes no external network requests: no http(s) URLs, no fetch/XHR', () => {
    expect(html).not.toMatch(/https?:\/\//i);
    expect(html).not.toMatch(/\bfetch\s*\(/);
    expect(html).not.toMatch(/XMLHttpRequest/);
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/<img\b/i);
  });

  it('ships no test code or test-only dependencies (FR-036)', () => {
    expect(html.toLowerCase()).not.toContain('vitest');
    expect(html.toLowerCase()).not.toContain('playwright');
    expect(html).not.toContain('node_modules');
  });

  it('carries the exact floor-1 control hint (SC-006)', () => {
    expect(html).toContain(CONTROL_HINT);
  });

  it('is deterministic: rebuilding yields the identical artifact', () => {
    const out2 = path.join(tmpDir, 'index2.html');
    execSync(`node scripts/build.js "${out2}"`, { cwd: root, stdio: 'pipe' });
    expect(readFileSync(out2, 'utf8')).toBe(html);
  });

  // Regression: FR-035 overlay coverage on Safari 14.0 (FR-014 floor). The
  // `inset` shorthand is Safari 14.1+ — if the overlay relied on it alone it
  // would collapse to 0x0 there, hiding the game-over/victory "Press R"
  // prompt. The stylesheet must carry all four longhand offsets.
  it('.overlay is positioned with the four longhand offsets, never inset alone (Safari 14.0)', () => {
    const rule = /\.overlay\s*\{[^}]*\}/.exec(html);
    expect(rule).not.toBeNull();
    const overlay = rule[0];
    expect(overlay).toMatch(/(^|[^a-z-])top:\s*0/);
    expect(overlay).toMatch(/(^|[^a-z-])right:\s*0/);
    expect(overlay).toMatch(/(^|[^a-z-])bottom:\s*0/);
    expect(overlay).toMatch(/(^|[^a-z-])left:\s*0/);
    expect(overlay).toContain('position: fixed');
    // If someone reintroduces the shorthand it must be accompanied by the
    // longhands above — never load-bearing on its own.
  });

  // Regression: flex `gap` is also Safari 14.1+ — HUD column spacing must not
  // depend on it (FR-033 layout on the FR-014 Safari 14 floor).
  it('the stylesheet uses no flex gap declarations (Safari 14.0)', () => {
    const style = /<style\b[^>]*>([\s\S]*?)<\/style>/i.exec(html)[1];
    expect(style).not.toMatch(/(^|[^a-z-])(row-|column-)?gap\s*:/);
  });

  // Regression: R102 permits exactly five foreground colors (dark grey, grey,
  // white, light brown, light blue) on the black background — the artifact
  // must not smuggle in a sixth.
  it('carries only the five R102 foreground colors', () => {
    const style = /<style\b[^>]*>([\s\S]*?)<\/style>/i.exec(html)[1];
    const colors = new Set(
      [...style.matchAll(/color:\s*(#[0-9a-f]{3,8})/gi)].map((m) => m[1].toLowerCase())
    );
    expect([...colors].sort()).toEqual(
      ['#000', '#4a4a4a', '#8fd0ff', '#9e9e9e', '#c9975b', '#ffffff'].sort()
    ); // #000 is the hidden-cell "color" = background black, not a 6th foreground
  });
});
