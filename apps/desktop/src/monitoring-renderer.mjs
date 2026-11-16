import * as Sentry from '@sentry/electron/renderer';
Sentry.init({
  sendDefaultPii: false, maxBreadcrumbs: 0,
  integrations: defaults => defaults.filter(i => ['GlobalHandlers', 'BrowserApiErrors', 'EventFilters'].includes(i.name)),
});
Sentry.setTag('component', 'renderer');
