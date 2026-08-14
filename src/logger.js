// Structured, developer-facing logging (FR-037). Invisible to players,
// visible in DevTools. Distinct from the player-facing HUD combat log
// (FR-018), which lives in game.js as `log push` events.

const LEVELS = ['info', 'warn', 'error'];

/**
 * Emit a structured log event to the console.
 * @param {'info'|'warn'|'error'} level
 * @param {string} component
 * @param {string} message
 * @param {object} [meta]
 */
export function logEvent(level, component, message, meta) {
  const safeLevel = LEVELS.includes(level) ? level : 'info';
  const event = {
    timestamp: new Date().toISOString(),
    level: safeLevel,
    component,
    message,
    ...(meta ? { meta } : {}),
  };
  const method = safeLevel === 'error' ? 'error' : safeLevel === 'warn' ? 'warn' : 'log';
  // eslint-disable-next-line no-console
  if (typeof console !== 'undefined' && typeof console[method] === 'function') {
    console[method]('[dungeon]', JSON.stringify(event));
  }
  return event;
}

export const logger = {
  info: (component, message, meta) => logEvent('info', component, message, meta),
  warn: (component, message, meta) => logEvent('warn', component, message, meta),
  error: (component, message, meta) => logEvent('error', component, message, meta),
};
