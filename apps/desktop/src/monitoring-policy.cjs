// Reports contain code locations and fixed diagnostics, never project contents.
const verification = /^CMRX Sentry verification (main|renderer) [0-9-]+$/;
function cleanFrame(frame) {
  const source = String(frame.filename || 'unknown').split(/[?#]/)[0];
  const relative = source.includes('/apps/') ? source.slice(source.indexOf('/apps/') + 1) : source.split(/[\\/]/).at(-1);
  return { filename: 'app:///' + relative, lineno: frame.lineno, colno: frame.colno, function: /^[\w.$<> -]{1,100}$/.test(frame.function || '') ? frame.function : undefined, in_app: frame.in_app, ...(source.includes("/apps/desktop/src/") ? { context_line: frame.context_line, pre_context: frame.pre_context, post_context: frame.post_context } : {}) };
}
function cleanEvent(event) {
  return {
    event_id: event.event_id, timestamp: event.timestamp, platform: event.platform,
    level: event.level, release: event.release, environment: event.environment,
    exception: event.exception && { values: (event.exception.values || []).map(value => ({
      type: /^[\w.]{1,80}$/.test(value.type || '') ? value.type : 'Error',
      value: verification.test(value.value || '') ? value.value : 'Application error (details withheld)',
      stacktrace: value.stacktrace && { frames: (value.stacktrace.frames || []).map(cleanFrame) },
      mechanism: value.mechanism && { type: value.mechanism.type, handled: value.mechanism.handled },
    })) },
    debug_meta: event.debug_meta && { images: (event.debug_meta.images || [])
      .filter(i => i.type === 'sourcemap' && /^[a-f0-9-]{36}$/i.test(i.debug_id || ''))
      .map(i => ({ type: 'sourcemap', debug_id: i.debug_id, code_file: cleanFrame({ filename: i.code_file }).filename })) },
    tags: { component: event.tags?.component === 'renderer' ? 'renderer' : 'main' },
  };
}
module.exports = { cleanEvent, cleanFrame };
