// FR-037: structured developer-facing log events, emitted via the console
// (DevTools-only, invisible to players). Each event carries a timestamp,
// level, component name and message. Distinct from the player-facing HUD
// combat log (FR-018).

let sink = null; // test hook: capture events instead of console

export function setLogSink(fn) {
  sink = fn;
}

export function logEvent(level, component, message, data) {
  const event = {
    timestamp: new Date().toISOString(),
    level,
    component,
    message,
  };
  if (data !== undefined) event.data = data;
  if (sink) {
    sink(event);
    return event;
  }
  /* eslint-disable no-console */
  if (typeof console !== 'undefined') {
    const line = `[${event.timestamp}] [${level}] [${component}] ${message}`;
    if (level === 'error') console.error(line, data ?? '');
    else if (level === 'warn') console.warn(line, data ?? '');
    else console.info(line, data ?? '');
  }
  return event;
}
