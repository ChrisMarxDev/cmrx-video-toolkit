# Error monitoring

The native app initializes `@sentry/electron` 8.4.0 before creating windows.
The shell and project chat renderer load the SDK bundle built by the local editor
build when desktop dependencies are installed. Main-process service failures and
unhandled renderer exceptions share the desktop Sentry project. Standalone browser
editor use is not a separate monitoring deployment.

`SENTRY_DSN` overrides the app's public ingestion DSN. Set an empty DSN or
`CMRX_DISABLE_TELEMETRY=1` to disable reporting. Auth tokens are not bundled.
Release is `cmrx-desktop@<package version>`; direct source launches use development,
packaged apps production. Startup tracing samples 100% locally and 10% in packages.
There is no automatic agent prompt/tool-content instrumentation.

Reports retain exception types and code locations. Unknown exception text is
replaced with a fixed diagnostic. Local path prefixes, query strings, request
bodies, user details, project data, breadcrumbs and local variables are excluded.
Only app-owned source context may accompany frames. Logs use a fixed diagnostic;
Session Replay, screenshots, native minidumps and automatic sessions are disabled.
This deliberately sacrifices some diagnostic detail to protect video projects.
Sentry still receives network traffic; configure server-side IP scrubbing too.

## Release source maps

Install both apps' locked dependencies, then run the editor build. With an
authenticated `sentry` CLI, upload the exact build before copying it into installers:

```sh
make -C apps/desktop sentry-upload SENTRY_ORG=my-org SENTRY_PROJECT=my-app
```

The command injects debug IDs and uploads sources/maps for readable renderer
stacks. Do not rebuild between upload and packaging. Both packaging scripts run this
target against their final output when SENTRY_ORG and SENTRY_PROJECT are set in
the build environment. Authentication must be available on the release machine.
Without those variables, packaging remains offline and source-map upload is a
release gate to complete separately. Main source files remain unminified; native
crash symbols are unnecessary while native crash uploads are disabled.

Linux source-run verification received a main error, a renderer error and a startup
trace. Installer and macOS monitoring acceptance remain release checks. The test
trigger is not retained in the shipped app. Privacy regression coverage is in
`tests/monitoring.test.mjs`.
