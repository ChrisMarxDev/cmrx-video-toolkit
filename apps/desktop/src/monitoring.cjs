const Sentry = require('@sentry/electron/main');
const { cleanEvent } = require('./monitoring-policy.cjs');
const { app } = require('electron');
const development = !app.isPackaged || app.getAppPath() === __dirname;
const dsn = process.env.SENTRY_DSN ?? 'https://4453fa94b8b47b272646a2bd2237fd77@o4512443437088768.ingest.de.sentry.io/4512443547713616';
Sentry.init({
  dsn, enabled: !!dsn && process.env.CMRX_DISABLE_TELEMETRY !== '1',
  release: `cmrx-desktop@${require('../package.json').version}`,
  environment: development ? 'development' : 'production',
  traceLifecycle: 'static',
  sendDefaultPii: false, autoSessionTracking: false, maxBreadcrumbs: 0,
  // Native minidumps can contain private media/chat in memory. Do not upload them.
  integrations: defaults => defaults.filter(i => ['OnUncaughtException', 'OnUnhandledRejection', 'PreloadInjection', 'EventFilters', 'ContextLines'].includes(i.name)),
  beforeSend: cleanEvent,
  tracesSampleRate: development ? 1.0 : 0.1,
  enableLogs: true,
  beforeSendTransaction: event => ({ ...cleanEvent(event), type: 'transaction',
    transaction: 'desktop.operation', start_timestamp: event.start_timestamp,
    contexts: { trace: { trace_id: event.contexts?.trace?.trace_id,
      span_id: event.contexts?.trace?.span_id, op: 'app.operation' } }, spans: [] }),
  beforeSendLog: log => ({ level: log.level, timestamp: log.timestamp, message: 'Application diagnostic', attributes: {} }),
});
const startup = Sentry.startInactiveSpan({ name: 'desktop.startup', op: 'app.startup' });
app.whenReady().then(() => { startup.end(); Sentry.logger.info('Desktop ready'); });
module.exports = Sentry;
