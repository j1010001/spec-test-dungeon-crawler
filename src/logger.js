// Structured developer-facing logging (FR-037): timestamp, level,
// component, message — emitted via console (DevTools only), never
// rendered in the game UI. Distinct from the player-facing HUD log.

export function createLogger(component) {
  function emit(level, message, data) {
    const event = {
      ts: new Date().toISOString(),
      level,
      component,
      message,
    };
    if (data !== undefined) event.data = data;
    // console.error is reserved for real faults: the artifact smoke test
    // (SC-008) requires zero console.error during normal play, so the
    // error level is only used when something is genuinely broken.
    const fn =
      level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
    fn(JSON.stringify(event));
  }
  return {
    info: (message, data) => emit('info', message, data),
    warn: (message, data) => emit('warn', message, data),
    error: (message, data) => emit('error', message, data),
  };
}
