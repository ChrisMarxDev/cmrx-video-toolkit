# Documentation website

This is a standalone Astro Starlight app, published with GitHub Pages under
/cmrx-video-toolkit/. Keep base-prefixed internal links. CMRX colors here are
explicitly approved website branding, not video-component defaults. Do not import
private Studio files or fonts. Keep the toolkit independently buildable.

Guides live in src/content/docs/guides/. scripts/sync-reference.mjs generates the
reference pages from canonical Markdown elsewhere in this public repository.
Edit those source files rather than generated reference pages. Run npm run build
from docs/ after changes. Never put private media, transcripts or knowledge here.
