# App design rules

Approved and refined with the owner, 2026-11-10. Applies to the desktop app;
generated videos follow their own project style. Use the app development skill at
`.agents/skills/design-system/SKILL.md` when changing this system.

1. **Lead with the work.** Chat, timed comments, seeking and small cuts are core.
   Keep those visible. Put secondary operations in the timeline right-click / More
   menu. Redo stays visible in the timeline tools; Transcript sits beside Comments.
   Backspace replaces the delete button.
2. **One video.** Tabs above; chat left; one composited player and timeline right.
   Keep controls beside their content. Do not add watch/download players to chat.
3. **Neutral working surfaces.** Use charcoal for the canvas and composer, soft
   neutral primary buttons, and light-neutral focus/selection. Avoid lime-on-purple
   controls: the owner finds them toy-like. Brand color belongs in quiet decoration.
4. **Four surface roles.** Canvas is continuous; panels group work; raised surfaces
   hold inputs; floating surfaces hold menus/dialogs. Avoid a card around every item.
5. **Divide by purpose.** Use spacing first, fine lines between adjacent sections,
   and the shared transparent resize handle. Do not stack decorative boundaries.
6. **Three button roles.** Filled for the main action in an area, outlined for an
   alternative, quiet icons for tools. Selected tools retain a tint. Hover brightens,
   press deepens, keyboard focus stays visible. Keep destructive actions distinct.
7. **Show before explaining.** Prefer real thumbnails, familiar icons, cursor changes
   and direct manipulation. Keep accessible names and hover labels. Put learned Shift
   shortcuts in tooltips/help, not permanent instructions. Keep unfamiliar decisions,
   connections and error recovery named. Company/product names use their real logos.
8. **Readable, spacious chat.** Assistant text sits on canvas; user/queue messages
   have a subtle surface. One neutral composer holds images, model and actions.
   Use 16–24px block gaps, 12–16px internal padding, 8px control gaps, and 32–36px
   tool targets. Setup actions are at least 44px. Preserve precise timeline geometry.
9. **Expressive setup, quiet editing.** Lead onboarding with original dither artwork
   and a short heading. Offer Upload or Open empty project. Use subtle dither edge
   light in editing chrome, never over media, text fields or dense timeline content.
   Keep the Bayer cell grid fixed; animate light/opacity rather than scaling cells.
10. **One loading language.** Compact wave-animated square-cell matrices (14px)
    belong in loading areas. Installation uses a dithered bar: real percentages
    when reported, indeterminate motion otherwise. Respect reduced motion; keep
    errors and cancellation visible. Never fake overall completion.
11. **Swaps keep their footprint.** An icon or component state swap must fit the
    previous instance's box. Keep its space, alignment and surrounding layout
    fixed; scale the replacement down when needed.
12. **Status dots stay dots.** Change color, never shape or size. Working is yellow.
    Keep the same 6px dot in tabs and editor status, with state text on hover/focus.

## Foundations and implementation

| Role | Source / current choice |
| --- | --- |
| Canonical app tokens | `src/app-tokens.css` |
| Working canvas / panel / input | `#121214` / `#19191C` / `#242427` |
| Text / muted / primary action | `#EEEEEF` / `#B3B3BA` / `#E1E1E6` |
| Focus / playhead | `#C8C6D0` / `#EEEEF0` |
| Typography | Space Grotesk UI; Fraunces welcome/setup headlines; mono technical values |
| Radius | 20px panels, 12px controls, 8px compact tools |
| Loading primitive | `../local-editor/src/matrix-loader.css`, bundled/copied by the editor build |
| Chat, setup, settings | `src/app-polish.css`, `src/onboarding.mjs`, `src/settings-view.mjs` |
| Embedded editor | `src/editor-theme.css`; standalone editor defaults stay independent |
| Native tabs and dialogs | `src/desktop-shell.css` |
| Dither art | `src/dither-art.mjs`, original deterministic Bayer artwork |
| Shared dividers | `../local-editor/src/resize-handles.css` |

The requested Studio seed remains available as brand primitives: obsidian
`#100B18`, purple ink `#24143D`, lavender `#DFD6F4`, lime `#D5FF45`, white.
Later owner feedback supersedes the initial lavender/lime working-control proposal.
No private guide, font or media asset is copied into this public app.
Space Grotesk and Fraunces are packaged; IBM Plex Mono currently has a system-mono
fallback. Dark-first; no light theme is implemented. Legacy component exceptions
still need review; token adoption does not imply every screen has been audited.

## Interaction contract

Send/Queue use state-correct arrow icons and accessible names. Enter submits;
Shift+Enter inserts a line. Stop is separate. Steer remains an explicit queued-message
action. Image drafts show thumbnails/removal and clear after accepted submission.

Shift-drag the ruler or mark I/O at the playhead to select a range. Shift+Backspace
removes that time across all tracks and closes the gap in one undoable edit. Escape
clears selection/menu. Backspace alone deletes a clip with its gap retained.
The timeline menu also holds layer inspection, transcript, history, shortcuts and
export. Temporary preview mute/hide stays usable during agent work. Source edits
obey the shared runtime lock. One status dot explains state on hover/focus; a square
matrix on the player indicates active editing without blocking inspection.

Good: Queue remains usable during an agent turn while its icon/name reflect its
purpose. Bad: replacing it with a blocking spinner, persistent shortcut prose, or
an unexplained symbol. Loading and errors must reflect real state, not decoration.

## Secondary surfaces

Settings keeps its heading/categories visible while panel content scrolls. Use UI
headings, neutral fields and 32px minimum action targets. Save operations show the
shared matrix, reject duplicate submissions and report completion/errors. Hidden
state must win over component layout, so unavailable fields stay unavailable.

The asset browser uses neutral preview cards with an explicit selected state.
Keep the current collection visible while refreshing; show the matrix and a busy
state, then restore retry controls on failure. Empty collections offer Open folder;
empty searches offer Clear filters. Preserve real media previews and source files.
Implementation: `src/agent-settings.mjs`, `src/asset-manager.mjs`, app styles.

Approved secondary-surface rules — 2026-11-10:
- **Lists first.** Show saved keys/connections before their forms. Add opens a form;
  Edit/Replace uses that same form. Cancel closes it and clears secret drafts.
- **Preview, then attach.** A click previews an asset. Attach to chat is explicit;
  double-clicking must not attach it or change the timeline.
- **Confirm shared removals.** Name the asset/key/connection and action, focus Cancel
  by default, and let Escape dismiss. No removal request before confirmation.
  Timeline cuts remain immediate and undoable.

Shared confirmation: `src/confirm-removal.mjs`; uses the app's neutral dialog and
reserved destructive-action tokens. Project-to-library saving is not a removal.

Add to timeline opens the native video file picker. Editor labels and controls are
not text-selectable; inputs, comment fields and editable text retain selection.
Chat content remains selectable.

Recording uses a compact source-selection popup, then a timer/Stop control.
Successful saves close it automatically; errors keep recovery actions visible.

Settings lives in the native tab bar, with no duplicate chat gear. Assets uses
the composer’s folder icon and is also reachable from Settings. Show project
names in navigation and asset scopes; keep Open folder… a quiet text action.
