# Video editing resources

A curated list of websites, MCP servers and other tools for finding, creating
and styling media for video projects. These are optional references, not installed
integrations or toolkit requirements. This page keeps its original filename so
existing links continue to work.

## Visual effects and inspiration

- [ASCII Magic](https://www.ascii-magic.com/) — Turn images and videos into ASCII,
  dither, pixel art, halftone and glitch looks. Useful for stylized footage,
  animated backgrounds and visual inspiration; shareable recipes preserve a look.
  The browser editor exports stills, GIFs and MP4 video. Core styles are free;
  additional styles, AI generation and higher-resolution exports require Pro.
  Local browser effects run on-device; generative effects use an AI provider.
  Provider documentation checked on 2026-10-29.

## MCP servers

Soundza, Memelord, Tunetank and SFXMint documentation checked on 2026-10-28;
ASCII Magic checked on 2026-10-29. Availability, limits and terms may change.
Endpoints are documented references; inclusion does not mean an integration was tested.

| Service | Useful for | MCP endpoint | Access and usage notes | Documentation |
| --- | --- | --- | --- | --- |
| [Soundza](https://soundza.com/) | Search and download sound effects, music and ambience; generate short sound effects from a description. | `https://mcp.soundza.com/mcp/oauth` (OAuth) or `https://mcp.soundza.com/mcp` (API key) | Free account via OAuth or a free API key. Usage limits apply; the provider asks for a Soundza credit when sharing work publicly. | [Developer / MCP guide](https://soundza.com/developers) |
| [Memelord](https://www.memelord.com/) | Generate and edit image memes and captioned video memes; retrieve completed video renders. | `https://www.memelord.com/api/mcp` | API key with Bearer authentication. Generation and editing draw from the account's usage balance; render-status polling is free. | [MCP guide](https://www.memelord.com/hackers/mcp) |
| [Tunetank](https://tunetank.com/) | Find music by mood, genre, theme or duration, and sound effects by category or length; get preview and track-page links. | `https://mcp.tunetank.com` | Public, read-only server with no API key. MCP search is free; check the provider's music licensing for the intended use. | [Official MCP repository](https://github.com/tunetank/tunetank-mcp) |
| [SFXMint](https://sfxmint.com/) | Find, preview and download sound effects by description, event or sound set; optionally generate custom sounds. | `https://sfxmint.com/mcp` | Library access needs no key; download allowances apply. Audio is offered under CC0. Generation needs an API key and uses a free trial, then credits or a plan. | [Official MCP repository](https://github.com/flreey/sfxmint-mcp) · [API docs](https://sfxmint.com/api/docs) |
| [ASCII Magic](https://www.ascii-magic.com/) | Stylize images, discover styles and encode/decode reusable look recipes. For video effects, use the browser editor above. | `https://www.ascii-magic.com/mcp` | OAuth sign-in with an ASCII Magic account; free and Pro styles depend on the account plan. The MCP renderer runs in the cloud and accepts image URLs or uploaded images; download links expire after 24 hours. | [MCP guide](https://www.ascii-magic.com/mcp-server) |

## Adding a resource

Include the official link, a concrete video use case, its interface (website,
CLI, API or MCP), and relevant access, pricing or licensing notes. Date provider
checks and distinguish documented capabilities from tested integrations. Add
categories as the collection grows; a resource does not need an MCP server to belong here.
