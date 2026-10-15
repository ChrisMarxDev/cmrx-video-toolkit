# MCP video review proof of concept

This isolated sample tests **embedded video → user annotation → local JSON →
agent continuation**. It does not change the editor or run transcription,
composition, or real recordings. Its eight-second synthetic clip is generated
locally with FFmpeg. No OpenAI API key is needed.

## Run locally

Requires Node 22+ and FFmpeg on PATH:

```sh
cd apps/mcp-review-sample
npm ci
npm start
```

The MCP endpoint is `http://127.0.0.1:4877/mcp`. `PORT` selects another port.
This is an MCP endpoint, not a normal browser page. The HTML is delivered as
`ui://video-review-sample/v1.html` (`text/html;profile=mcp-app`).

For Codex, register the endpoint and start a fresh session:

```sh
codex mcp add video-review-sample --url http://127.0.0.1:4877/mcp
```

Prompt:

> Call video-review-sample's open_review_sample tool. If this host supports MCP
> Apps, show the interactive view and wait for me to click Done. Do not call
> finish_review_sample yourself. After I finish, call get_review_sample using
> the returned sessionId and report my annotation, playback diagnostics, and
> artifact path. If no view appears, report that limitation; do not simulate
> my review or claim the embedded UI passed.

Codex's tool connection alone does **not** establish embedded UI support. The
terminal client is useful for protocol/artifact checks; the visual test needs
an MCP Apps-capable host. The sample does not automatically launch a browser
fallback because that would hide the exact capability we are testing.

## Connect ChatGPT

ChatGPT's standard remote MCP connection needs a reachable HTTPS endpoint.
Install `cloudflared` for this optional development path, then:

```sh
npm run share
```

This starts a temporary Cloudflare tunnel and the same local server. It prints
`publicMcpUrl` for ChatGPT and `localMcpUrl` for Codex; use the printed local URL
instead of `/mcp` in the Codex command above. `.local/connection.json` retains
the URLs and process IDs. Ctrl+C stops both processes. A new run gets new URLs.

In ChatGPT Plugins, choose **Add custom MCP server**, use the printed public URL,
and choose no authentication. Create/install the development plugin, select it
in a new chat, then use the prompt above. Account/workspace access policies may
affect whether this setup is available. Do not register a public URL in Git.

The temporary endpoint has an unpredictable URL path, not production OAuth.
Anyone holding that URL can use the sample tools. It only serves the generated
clip and creates bounded sample annotations in `.local/`; there is no arbitrary
file/path input. Do not adapt this development exposure to private recordings
without designing authentication and access scope first.

## What to verify in the host

1. The review panel appears inside the chat, without an external browser.
2. Play the clip and seek using its controls. Both diagnostics should say yes.
3. Enter a distinctive instruction and a time range; click **Done**.
4. Confirm `.local/<sessionId>.json` exists on the server machine, with the
   instruction, source times, playback diagnostics and `status: completed`.
5. Check whether the host accepts `ui/message` and continues. If it does not,
   the UI reports that the save succeeded but continuation was not accepted.
   Ask the agent to call `get_review_sample` explicitly.

Closing a panel does not approve a review. Each open creates a distinct draft;
Done performs an atomic write. State survives a server restart, though a draft's
media URL may expire when a temporary tunnel is replaced; open a fresh sample.
This sample's JSON is a probe result, **not** the production editor's review.json
contract or a Flutter-ready composition.

## Validation boundary

```sh
npm test
```

The integration test uses the real MCP SDK client over HTTP, checks tool/resource
metadata, byte-range media serving, invalid inputs, saving and restart persistence.
It does not claim actual host playback, iframe CSP compatibility, or automatic
agent resumption. Those are the acceptance checks above. The video and saved
results are ignored by Git.

References:
- [OpenAI MCP/UI quickstart](https://developers.openai.com/plugins/build/app-quickstart)
- [UI resource metadata and CSP](https://developers.openai.com/plugins/build/chatgpt-ui)
- [Connect a development server to ChatGPT](https://developers.openai.com/plugins/deploy/connect-chatgpt)
- [Codex MCP configuration](https://developers.openai.com/codex/mcp)
