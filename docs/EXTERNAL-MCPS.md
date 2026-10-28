# Useful external MCP servers

Optional resources for finding or creating media for video projects.
Provider documentation checked on 2026-10-28; availability, limits and terms may change.

| Service | Useful for | MCP endpoint | Access and usage notes | Documentation |
| --- | --- | --- | --- | --- |
| [Soundza](https://soundza.com/) | Search and download sound effects, music and ambience; generate short sound effects from a description. | `https://mcp.soundza.com/mcp/oauth` (OAuth) or `https://mcp.soundza.com/mcp` (API key) | Free account via OAuth or a free API key. Usage limits apply; the provider asks for a Soundza credit when sharing work publicly. | [Developer / MCP guide](https://soundza.com/developers) |
| [Memelord](https://www.memelord.com/) | Generate and edit image memes and captioned video memes; retrieve completed video renders. | `https://www.memelord.com/api/mcp` | API key with Bearer authentication. Generation and editing draw from the account's usage balance; render-status polling is free. | [MCP guide](https://www.memelord.com/hackers/mcp) |
| [Tunetank](https://tunetank.com/) | Find music by mood, genre, theme or duration, and sound effects by category or length; get preview and track-page links. | `https://mcp.tunetank.com` | Public, read-only server with no API key. MCP search is free; check the provider's music licensing for the intended use. | [Official MCP repository](https://github.com/tunetank/tunetank-mcp) |
| [SFXMint](https://sfxmint.com/) | Find, preview and download sound effects by description, event or sound set; optionally generate custom sounds. | `https://sfxmint.com/mcp` | Library access needs no key; download allowances apply. Audio is offered under CC0. Generation needs an API key and uses a free trial, then credits or a plan. | [Official MCP repository](https://github.com/flreey/sfxmint-mcp) · [API docs](https://sfxmint.com/api/docs) |
