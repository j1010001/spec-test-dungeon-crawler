import { describe, it, expect } from 'vitest';
import { createLogger } from '../../src/logger.js';

describe('structured developer logging (FR-037)', () => {
  function capture() {
    const lines = { info: [], warn: [], error: [] };
    return {
      lines,
      sink: {
        info: (m) => lines.info.push(m),
        warn: (m) => lines.warn.push(m),
        error: (m) => lines.error.push(m),
      },
    };
  }

  it('emits timestamp, level, component and message for info', () => {
    const { lines, sink } = capture();
    const log = createLogger(sink, () => '2026-01-01T00:00:00.000Z');
    log.info('dungeon', 'floor generated');
    expect(lines.info).toHaveLength(1);
    expect(lines.info[0]).toBe('[2026-01-01T00:00:00.000Z] [info] [dungeon] floor generated');
  });

  it('routes warn and error to the matching console channel', () => {
    const { lines, sink } = capture();
    const log = createLogger(sink, () => 'T');
    log.warn('game', 'w-msg');
    log.error('game', 'e-msg');
    expect(lines.warn[0]).toContain('[warn] [game] w-msg');
    expect(lines.error[0]).toContain('[error] [game] e-msg');
  });

  it('uses an ISO timestamp by default', () => {
    const { lines, sink } = capture();
    const log = createLogger(sink);
    log.info('c', 'm');
    expect(lines.info[0]).toMatch(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[info\] \[c\] m$/);
  });
});
