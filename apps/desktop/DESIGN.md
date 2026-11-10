# Desktop app design system

Status: theme, density, type roles and accent allocation approved by the owner on
2026-11-10. Shared foundations are implemented; component/state review continues.
Use `.agents/skills/design-system/SKILL.md` for system work. It is development
guidance, separate from the video-editing agent's creative skill catalog.

## Sources and scope

The owner requested the CMRX Studio design system as the starting point. The
palette below seeds the app-only semantic tokens in `src/app-tokens.css`. Existing app source remains the implementation evidence. Generated videos
continue to follow their own workspace/project style instructions. This interview
must not silently change other products, brand rules or video styles.

No private Studio guide, font, recording or other private asset is copied here.
The app's local design system must be independently usable from this repository.

| Foundation seed | Value / role | Status |
| --- | --- | --- |
| Obsidian | `#100B18`, dark page foundation | Approved seed |
| Purple ink | `#24143D`, brand ink / purple surface | Approved seed |
| White | `#FFFFFF`, light paper | Approved seed; light theme deferred |
| Lavender | `#DFD6F4`, secondary/action field | Approved action field |
| Lime | `#D5FF45`, playhead/focus/selection signal | Approved active signal |
| Dark text / muted | `#F5F1FC` / `#C1B8D0` | Approved seed; combination-level contrast review remains |
| UI / headline / technical | Space Grotesk / Fraunces / IBM Plex Mono | Approved roles below; technical font has a system-monospace fallback |
| Spacing | 4, 8, 16, 24, 32, 48, 80 px | Approved starting scale; dense timeline geometry retains measured exceptions |
| Radius | 20px panels/media, 12px controls | 20px panels, 12px controls; compact toolbar controls retain 8px |
| Texture | Fine ordered dithering | Owner requested dithered images, gradients and balls for this app |

## Implementation inventory

| Layer | Existing source | Evidence / gap |
| --- | --- | --- |
| Chat primitives/theme | `src/chat.css`, `src/app-polish.css` | Consumes shared app tokens; legacy optical/state values remain to audit |
| Native tabs/dialogs | `src/desktop-shell.css`, `src/desktop-shell.js` | Consumes the same app tokens via a file stylesheet |
| Embedded editor theme | `src/editor-theme.css` | Imports shared app tokens over standalone editor defaults |
| Editor and timeline | `../local-editor/src/{app.tsx,style.css}` | Standalone editor must retain independently usable defaults |
| Shared resize handle | `../local-editor/src/resize-handles.css` | One implementation across desktop/editor, with hover/focus/keyboard behavior |
| Branding and decoration | `src/brand-ui.mjs`, `src/dither-art.mjs`, `resources/brands/` | Existing identity sources; do not fetch/copy replacement logos silently |
| Status/toolbar block | `src/project-runtime.mjs`, editor bridge in `src/chat.js` and `../local-editor/src/app.tsx` | One visible toolbar, state dot, player spinner, comments and export |
| Composer/queue block | `src/chat.js`, `src/asset-manager.mjs` | Draft images with remove, queue-first submission and explicit queued steering |
| First-run/settings blocks | `src/onboarding.mjs`, `src/settings-view.mjs`, `src/agent-settings.mjs` | Native setup and async states need design-system review after rules settle |

`src/app-tokens.css` is the app's canonical token source, loaded by chat, native
shell and the embedded editor theme. It owns brand primitives, derived quiet-purple
surfaces, text/border/action/focus roles, spacing and radius roles. Components use
semantic roles; avoid adding another raw near-purple in a consumer stylesheet.
Standalone editor defaults and generated-video styles remain independent.

Examples grounded in current code: `src/editor-theme.css` imports the shared
foundation rather than redefining the palette; `src/desktop-shell.css` consumes
surface and focus roles. Counterexample for future work: a new button with an
inline literal purple would bypass those roles; extend the semantic source instead.

Space Grotesk and Fraunces use existing packaged fonts. Technical text requests
IBM Plex Mono with a system-monospace fallback; a new IBM Plex Mono font asset was
not added in this pass. Remaining state-specific colors/optical sizes are not
silently promoted to new canonical tokens. No light theme is implemented.

## Established product rules from the owner's decisions

- Natural-language editing is primary; the editor supports inspection, seeking,
  minor cuts and timed feedback. One composited player; no duplicate watch/download
  video actions in chat.
- Keep copy brief and controls compact. No instructional Enter/Shift+Enter footer
  or redundant product-title bar. First-run choices are upload or empty project.
- Status is a dot with hover/focus details. Agent editing has a nonblocking player
  indicator; agent/preview/queue state must follow the shared runtime contract.
- Combine status, comments/transcript/shortcuts and Export in one toolbar. Add video
  belongs in the timeline. Temporary layer inspection stays available during work.
- Default to queueing while the agent works. Steering is an explicit queued-message
  action. Draft images have visible previews/removal and clear after accepted send.
- Use the same transparent resize-handle treatment across resizable regions.
- Company/product mentions in UI use the appropriate approved logo. Do not recolor
  or distort third-party identities.

## Approved app rules — 2026-11-10

1. Dark-first for this release; light theme later. The OS light preference does not
   imply a light theme exists.
2. Compact editing controls and chat, with more breathing room in setup/settings.
   Keep readable text and interaction targets rather than shrink everything alike.
3. Fraunces for welcome, empty-state and onboarding editorial headlines; Space
   Grotesk for the working UI, including dense panel labels; mono for technical
   values/timecodes. This is an app-only refinement of the broader headline rule.
4. Quiet obsidian/purple surfaces, lavender actions, lime for playhead/focus/selection.
   Avoid large lime decoration or accidental light text on lavender actions.
5. Restrained dither flourishes around onboarding and empty states. Do not texture
   the user's video, text fields or busy editing controls by default.

## Further proposals, not yet adopted as new product-wide rules

- Tooltips supplement icons; critical errors/actions should not be hover-only.
  Review actual failure/recovery states before formalizing a component contract.
- Define a UI motion scale deliberately, with interruptible transitions and reduced
  motion, rather than borrow video timing. Existing motion/reduced-motion behavior
  remains; no new timing scale has been approved in this round.

Next: review representative screens and component states against these foundations,
record justified exceptions, and extract blocks only when repeated behavior warrants
it. Token consumption is implemented; this is not a claim that every legacy style,
contrast pair or screen has received visual approval.
