# JavaScript video editor

React/TypeScript player, timeline and revision-checked Node workspace service used
by the [desktop app](../desktop/README.md). It is independent of the older Flutter
review editor in `apps/editor`; that editor's entrypoints remain unchanged.

```sh
npm ci
make check
make demo WORKSPACE=workspaces/example
make run WORKSPACE=workspaces/example PORT=4319
```

Requires Node.js 22.12+, npm and FFmpeg/ffprobe. Demo creates synthetic media and
must target a new workspace. Runtime files, recordings and transcripts stay local.
The build includes application-local, OFL-licensed Fraunces typography; see
`resources/fonts/PROVENANCE.json` and the adjacent license.

The service exposes state/context, event streaming and revision-checked timeline,
comment, transcript, layer and render operations. Existing source and output time
remain distinct. See [schema contract](SCHEMA.md), `project.schema.json` and
`src/server.ts` for the API. `make mcp WORKSPACE=…` starts its MCP Apps adapter for
a running workspace; ordinary browser review does not require an MCP host.
