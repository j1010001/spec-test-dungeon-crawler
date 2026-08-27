// Global unit-test setup: silence structured console logging (FR-037) by
// routing it into a no-op sink; individual tests may install their own sink.
import { beforeEach } from 'vitest';
import { setLogSink } from '../src/logger.js';

beforeEach(() => {
  setLogSink(() => {});
});
