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

In the standalone editor, layer mute/disable operations remain saved, revision-checked
edits with undo/export semantics. When embedded in the desktop app's preview bridge,
those buttons instead control temporary local audio/visibility, including during
agent/render locks. Structural edits retain client and server locking; timeline
seeking, panning and preview layer inspection remain available. Preview overrides
are not persisted to project.json or undo history.

Timeline range edits: Shift-drag the ruler, or mark the playhead with I/O, then
Shift+Backspace removes that time across all tracks and closes the gap. The operation
is frame-snapped, revision-checked and one Undo restores it. Clip/source comments
keep their source anchors (removed content stays as an orphaned note); timeline
comments shift with the edit, clamping moments inside the removed range to its start.
Right-click the timeline or open More for range actions, split, delete, history,
transcript and shortcuts. Desktop also exposes Export there. Backspace deletes a
selected clip without closing its gap. Escape clears a range or dismisses the menu.

### Renderer build mode

`npm run build` builds the player with React's production runtime by default,
including when embedded in the desktop app. For local debugging with React's
additional diagnostics, use `EDITOR_DEV=1 npm run build`. Rebuild normally before
packaging or profiling performance; neither mode changes export resolution.

Playback quality uses disposable cached media through `/api/playback-preview` and
`/api/media?quality=720|1080`. The authenticated status request starts background
preparation; media requests use the ready copy or fall back to the original.
It never rewrites asset paths or changes FFmpeg export inputs. See the desktop
README for the quality controls and cache lifecycle.
