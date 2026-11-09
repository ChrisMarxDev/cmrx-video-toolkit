// Node resolves this adapter directly; the app serves the same locked browser
// module at /markdown-parser.mjs without a CDN or a second bundling toolchain.
export { marked } from "../node_modules/marked/lib/marked.esm.js";
