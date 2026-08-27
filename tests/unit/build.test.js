import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { CONTROL_HINT } from '../../src/constants.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artifact = path.join(root, 'index.html');

// Acceptance tests for the inline/build step (FR-014, FR-036, SC-007,
// Session 2026-06-25/2026-07-09 clarifications).
describe('shipped artifact: single root index.html', () => {
  let html;

  beforeAll(() => {
    execSync('node scripts/build.js', { cwd: root, stdio: 'pipe' });
    html = readFileSync(artifact, 'utf8');
  });

  it('build produces index.html at the repository root', () => {
    expect(existsSync(artifact)).toBe(true);
    expect(html.trimStart().toLowerCase().startsWith('<!doctype html>')).toBe(true);
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
    execSync('node scripts/build.js', { cwd: root, stdio: 'pipe' });
    expect(readFileSync(artifact, 'utf8')).toBe(html);
  });
});
