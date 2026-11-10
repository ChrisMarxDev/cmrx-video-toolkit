# Desktop app design system

Status: foundation inventory and interview, not an approved restyling specification.
Use `.agents/skills/design-system/SKILL.md` for system work. It is development
guidance, separate from the video-editing agent's creative skill catalog.

## Sources and scope

The owner requested the CMRX Studio design system as the starting point. The
palette below is a foundation seed for the app; it does not change production
styles. Existing app source remains the implementation evidence. Generated videos
continue to follow their own workspace/project style instructions. This interview
must not silently change other products, brand rules or video styles.

No private Studio guide, font, recording or other private asset is copied here.
The app's local design system must be independently usable from this repository.

| Foundation seed | Value / role | Status |
| --- | --- | --- |
| Obsidian | `#100B18`, dark page foundation | Requested starting point |
| Purple ink | `#24143D`, brand ink / purple surface | Requested starting point |
| White | `#FFFFFF`, light paper | Requested starting point; no light theme implied |
| Lavender | `#DFD6F4`, secondary/action field | Already used in app; semantics to settle |
| Lime | `#D5FF45`, small purposeful signal | Already used in app; semantics to settle |
| Dark text / muted | `#F5F1FC` / `#C1B8D0` | Requested starting point; actual contrast unreviewed |
| UI / headline / technical | Space Grotesk / Fraunces / IBM Plex Mono | Role mapping to settle; not all fonts shipped in every surface |
| Spacing | 4, 8, 16, 24, 32, 48, 80 px | Starting scale, not a mandate for dense timeline geometry |
| Radius | 20px panels/media, 12px controls | Brand starting point; app exceptions need explicit decisions |
| Texture | Fine ordered dithering | Owner requested dithered images, gradients and balls for this app |

## Implementation inventory

| Layer | Existing source | Evidence / gap |
| --- | --- | --- |
| Chat primitives/theme | `src/chat.css`, `src/app-polish.css` | Separate raw values and overrides; not yet a shared semantic token source |
| Native tabs/dialogs | `src/desktop-shell.css`, `src/desktop-shell.js` | Another independent palette/type/radius implementation |
| Embedded editor theme | `src/editor-theme.css` | Separate semantic variables over the base editor |
| Editor and timeline | `../local-editor/src/{app.tsx,style.css}` | Standalone editor must retain independently usable defaults |
| Shared resize handle | `../local-editor/src/resize-handles.css` | One implementation across desktop/editor, with hover/focus/keyboard behavior |
| Branding and decoration | `src/brand-ui.mjs`, `src/dither-art.mjs`, `resources/brands/` | Existing identity sources; do not fetch/copy replacement logos silently |
| Status/toolbar block | `src/project-runtime.mjs`, editor bridge in `src/chat.js` and `../local-editor/src/app.tsx` | One visible toolbar, state dot, player spinner, comments and export |
| Composer/queue block | `src/chat.js`, `src/asset-manager.mjs` | Draft images with remove, queue-first submission and explicit queued steering |
| First-run/settings blocks | `src/onboarding.mjs`, `src/settings-view.mjs`, `src/agent-settings.mjs` | Native setup and async states need design-system review after rules settle |

Current palettes/type roles differ across those surfaces. Record them as drift to
review, not as approved new tokens. Do not migrate raw values blindly before the
interview resolves theme, density and type-role decisions. A future app token
source should feed all desktop surfaces, while preserving standalone editor defaults.

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

## Proposals awaiting the owner's answers

These are app-only proposals, not production defaults or changes to video styles.

1. Dark-first workbench; decide whether a matching light theme is required now.
2. Compact timeline/toolbars, comfortable chat/settings/forms; preserve readable
   text and generous interaction targets rather than shrink every element alike.
3. Fraunces for welcome/empty/editorial headings; Space Grotesk for workbench labels
   and dense panel headings; mono for timecodes/technical values. This needs an
   app-specific typography decision against the broader headline convention.
4. Quiet dark/purple surfaces, lavender primary actions, lime reserved for playhead,
   selection/focus or a small active signal. Dedicated error/warning semantics must
   be legible and accompanied by text/icon, not confused with brand decoration.
5. Keep dither flourishes in onboarding, empty states and small peripheral moments.
   Never texture the user's video, text fields or busy editing controls by default.
6. Tooltips supplement icons; critical errors, required actions and destructive
   choices must not be discoverable only through hover. Keep familiar toolbar
   icons compact; keep explicit labels for consequential/infrequent actions.
7. Use restrained, interruptible transitions and reduced-motion alternatives.
   Adapt motion values deliberately for UI roles rather than reuse video timing
   or scatter arbitrary durations.

Next: interview the owner, mark approved/rejected decisions, define semantic tokens
and actual component state records, then exercise representative screens before
promoting new reusable blocks. No rendered-screen/contrast review has been performed
as part of installing the skill and recording this inventory.
