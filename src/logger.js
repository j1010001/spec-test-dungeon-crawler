// Structured developer-facing logging (FR-037): timestamp, level, component,
// message — emitted to the browser console (DevTools only), never to the HUD.
export function createLogger(sink, clock) {
  const out = sink || (typeof console !== 'undefined' ? console : null);
  const now = clock || (() => new Date().toISOString());
  function emit(level, component, message) {
    if (!out) return;
    const line = `[${now()}] [${level}] [${component}] ${message}`;
    if (level === 'error' && out.error) out.error(line);
    else if (level === 'warn' && out.warn) out.warn(line);
    else if (out.info) out.info(line);
  }
  return {
    info: (component, message) => emit('info', component, message),
    warn: (component, message) => emit('warn', component, message),
    error: (component, message) => emit('error', component, message),
  };
}
