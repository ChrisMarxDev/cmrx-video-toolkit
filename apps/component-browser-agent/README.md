# Component browser MCP adapter

Local MCP tools expose the canonical component catalog and the existing Flutter
workbench. The optional MCP App embeds that same compiled application. A normal
browser URL remains available; there is no second widget renderer.

## Agent-operated setup

Catalog tools need Node.js 22+ and the locked packages below. Building the browser
also needs Flutter/Dart, Python and FFmpeg. A prebuilt browser can be served without
those build tools. See [requirements](../../docs/EXTERNAL-REQUIREMENTS.md).

Run these setup commands for the user from the toolkit root:

```sh
npm --prefix apps/component-browser-agent ci
```

Register the following command in a local stdio-capable MCP host:

```sh
node /absolute/toolkit/apps/component-browser-agent/mcp.mjs
```

Typical host configuration (replace both executable and checkout paths):

```json
{
  "mcpServers": {
    "video-components": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/toolkit/apps/component-browser-agent/mcp.mjs"]
    }
  }
}
```

Preserve unrelated host settings. Use a Node executable and PATH available to the
GUI host; `FLUTTER` and `PYTHON` can select explicit executable paths. FFmpeg must
also be on PATH for demo generation. Reconnect/restart the host after registration.
This is a checkout-based stdio extension, not a packaged desktop plugin or a
remote cloud connector. It does not change host configuration by itself.

For first use, ask the agent to search for a component and open the browser at the
chosen preset. No video recording, transcript, model or project root is required.

## Tools

| Tool | Behavior |
| --- | --- |
| `list_components` | Search ID/name/widget/purpose with optional exact category and pagination; returns concise entries and available categories. |
| `get_component` | Read controls, variants, source and resolved default/preset props for an ID; rejects unknown IDs/presets. |
| `open_component_browser` | Start loopback serving and return `browserUrl`, optionally at `id`/`variant`; builds if missing, or when `rebuild: true`. Attaches the MCP App resource. |

Catalog calls work without starting HTTP or invoking Flutter. They read
`components/components.json` on each call. They do not synthesize constructor code.
The browser's **Copy code** supplies its maintained constructor example.

A cold build generates synthetic demo media, runs Flutter pub get, and builds with
`--no-web-resources-cdn`. Build stdout never pollutes MCP stdio. Concurrent opens
share build/startup. For a cold build allow a long tool timeout (up to ten minutes
per build command), or prebuild using `make components` and stop that server before
using MCP. A failed build returns the command's diagnostic tail; fix the prerequisite
and retry. Existing builds are reused until `rebuild: true` is requested, so rebuild
after changing Dart/catalog files. Metadata tools always reflect source, which can
be newer than an unreconstructed preview.

## Inline display and browser fallback

The `ui://video-components/browser.html` resource performs the MCP Apps handshake
and loads the returned URL in a nested iframe. Its CSP declares only the service's
loopback origin for frames/resources/connections. The host must support MCP Apps,
allow local HTTP frames and reach the machine running the server. Hosts that block
these frames can use `browserUrl` in a regular browser instead. Receiving tool data
alone does not prove inline rendering failed.

The wrapper's **Open in browser** uses the host's `ui/open-link`; if unavailable,
use the tool's URL manually. The adapter never automates or launches a desktop
browser. Existing computer-use permission rules still apply to agent inspection.
Actual host rendering is a separate acceptance check from protocol tests.

The workbench's **Copy flow reference** contains selected props for the creator to
share with the agent. **Copy variant link** carries only the preset. There is no
automatic selection callback or Done/approval contract in this adapter. Choosing
a component does not approve a video, its styling or its timing.

## Scope and lifecycle

The service binds to `127.0.0.1` on a dynamic port and rejects other Host values.
It serves only real files inside `tools/component_browser/build/web`, rejects
symlink escapes, supports media byte ranges and permits GET/HEAD only. It has no
write/upload/shell endpoint and accepts no arbitrary file path or URL as tool input.
The built assets are public demo software, not user media. Do not put private files
in this web build or expose this server through a tunnel. This is not a sandbox
against a malicious local process modifying the checkout.

The origin stays fixed for the stdio process lifetime, including resource prefetch.
Closing stdin or sending SIGINT/SIGTERM stops owned HTTP/build resources. Stop and
restart the MCP connection to reopen after shutdown. The adapter serves this
checkout only; private registries need their own compiled integration application.

## Validate

```sh
npm --prefix apps/component-browser-agent test
```

Tests use the real catalog and MCP SDK with synthetic web assets, HTTP range and
path-boundary checks, startup/build failures, and a simulated host message bridge.
They do not claim a Flutter build or actual MCP-host visual acceptance. Validate the
real workbench separately using [its checks](../../tools/component_browser/README.md).

Protocol references: [MCP Apps lifecycle](https://apps.extensions.modelcontextprotocol.io/api/documents/overview.html)
and [resource CSP](https://apps.extensions.modelcontextprotocol.io/api/interfaces/app.McpUiResourceCsp.html).

## Catalog families

Schema version 2 lists canonical families once. Searching an old layout name or ID
returns its family. `get_component` and `open_component_browser` accept old IDs
and preset names, resolve them, and return canonical selections. `get_component`
includes `implementation` with the selected presentation's property schema. See
[the family contract](../../components/FAMILIES.md).
