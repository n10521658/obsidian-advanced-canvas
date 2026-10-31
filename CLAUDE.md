# Advanced Canvas — Claude Instructions

Read the root `C:\Users\Clinton\p\AGENTS.md` first — it covers the Obsidian CLI, canvas internals,
and the build/install conventions. This file only holds plugin-specific knowledge.

## Attribution rule (from AGENTS.md)

`AGENTS.md` in this repo requires every LLM-authored change to be clearly marked — this fork uses
`// Added by an LLM agent` line comments. Follow that convention for any new change, including new
settings entries and extensions.

## Architecture

- `src/main.ts` — lifecycle only. Instantiates every class in the `CANVAS_EXTENSIONS` array and
  the patchers. New features = a new file in `src/canvas-extensions/` added to that array.
- `src/canvas-extensions/canvas-extension.ts` — base class: `isEnabled()` returns `true` or a
  settings key (feature is constructed only when the setting is on); `init()` does the wiring.
  Extensions communicate through custom workspace events (`advanced-canvas:*`, e.g.
  `node-created`, `node-moved`, `canvas-changed`, `settings-changed`) rather than patching
  Obsidian themselves.
- `src/patchers/canvas-patcher.ts` — the single place that monkey-patches Obsidian's Canvas /
  CanvasView / CanvasNode / CanvasEdge prototypes (via `monkey-around`) and emits those
  `advanced-canvas:*` events. If a feature needs a hook that doesn't exist yet, add the patch here
  and trigger a new event. For accessors (getters like `gridSpacing`) `around()` does NOT work —
  use `Object.getOwnPropertyDescriptor` / `Object.defineProperty` on `constructor.prototype` and
  register an uninstaller that restores the original descriptor (see `patchGridSpacing`).
- `src/settings.ts` — declarative: `AdvancedCanvasPluginSettingsValues` interface +
  `DEFAULT_SETTINGS_VALUES` + the `SETTINGS` tree that auto-generates the settings tab. A new
  setting needs an entry in all three. Feature headings get a toggle that "requires reload";
  settings read live (like `gridSize`) take effect immediately because the patched getter reads
  `settings.getSetting(...)` on every call.
- `src/@types/Canvas.d.ts` — hand-maintained typings of Obsidian's private canvas API. Extend it
  when you touch a new internal.
- `src/utils/canvas-helper.ts` — shared helpers. `CanvasHelper.GRID_SIZE = 20` is still the
  hardcoded default for edge-pathfinding margins; position/size snapping code should read the
  `gridSize` setting instead (see `better-default-settings-canvas-extension.ts` and
  `auto-resize-node-canvas-extension.ts`).

## Grid size feature (added by an LLM agent)

Obsidian's snap grid is a zoom-dependent `gridSpacing` getter on the Canvas prototype
(tiers 20/40/80/160). `patchGridSpacing` in `canvas-patcher.ts` overrides it to return multiples
of the `gridSize` setting (General section, default 20). This one accessor controls drag/resize
snapping, arrow-key nudging, arrange spacing, and the background grid pattern.

## "Default X" style settings pattern (added by an LLM agent)

The pattern behind `defaultGroupLabelSize` / `defaultGroupOpacity` / `defaultEdgeWidth` /
`defaultArrowSize` / `defaultNodeBorder` — use it for any new "default value of a per-element
style" setting:

1. Dropdown setting in the General section of `settings.ts` with an explicit "leave Obsidian
   alone" option (`'1'` for size multipliers, `'default'` otherwise).
2. Add it to `DEFAULT_SIZE_SETTINGS` in `default-style-sizes-canvas-extension.ts` (with
   `unchangedValue` if it isn't `'1'`). The extension exposes it as a `data-*` attribute on the
   canvas wrapper, and only while it differs from the unchanged value — the CSS is keyed on the
   attribute's *presence*, so Obsidian stays untouched by default.
3. Add the rules in `src/styles/default-style-sizes.scss`. An element's own explicit value must
   win: sizes do it with a `var(--x-multiplier, var(--default-x-multiplier, 1))` fallback, the
   node border does it with `:not([data-border])` (per-node style attributes are exposed as
   `data-*` on `node.nodeEl` by `dataset-exposers/node-exposer.ts` — but only while
   `nodeStylingFeatureEnabled` is on, so never rely on those attributes existing for behavior
   that must also work with node styling disabled).

`nodePreviewTextSize` (added by an LLM agent) rides on the same mechanism but isn't a per-element
default: it scales `.canvas-node-placeholder`, the note title Obsidian shows instead of node
content once zoomed out past the content breakpoint (zoom ≤ -1.7, wrapper gets
`mod-zoomed-out`; app.css gives the placeholder a fixed `font-size: 32px`).

## Node outlines (added by an LLM agent)

`node-outline-canvas-extension.ts` exposes the `nodeOutlineBlack` / `nodeOutlineWhite` /
`nodeOutlineWidth` settings (General section) on the canvas wrapper as
`data-node-outline="black|white|both"` + the `--ac-node-outline-width` CSS property — same
wrapper-attribute pattern as `DefaultStyleSizesCanvasExtension`. The rings are pure CSS
box-shadows in `styles/node-outline.scss`: Obsidian sets `box-shadow` on
`.canvas-node-container` per interaction state (stationary / dragging / selected / themed),
so the outline shadow is prepended to a mirror of each of those rules instead of overriding
`box-shadow` once. Edges (including the `edgeWidth` feature) are untouched. Shaped nodes with
`box-shadow: none !important` (masked shapes) and the dashed/dotted/invisible default node
border suppress all shadows, outline included.

## Edge outlines (added by an LLM agent)

`edge-outline-canvas-extension.ts` is the edge counterpart (`edgeOutlineBlack` /
`edgeOutlineWhite` / `edgeOutlineWidth`, General section), but SVG strokes can't be layered
with box-shadow, so it works differently: it maintains one underlay `<path>` per ring (class
`ac-edge-outline-path`, plus `ac-edge-outline-outer` on the first-painted one when both
toggles are on) inside `edge.lineGroupEl`, inserted between the interaction and display
paths. The underlays are synced with the display path's `d` **and its whole dataset** on
`advanced-canvas:edge-added` / `edge-changed` / `edge-path-updated` (the latter is the
`updatePath` patch in canvas-patcher.ts) and on settings/canvas changes — copying the dataset
is what makes dashes (`data-path`) and the edgeWidth multiplier (`data-edge-width`) apply to
the rings too. The interaction path is never touched, so Obsidian's 24px hit-testing stroke
survives.

- `styles/edge-outline.scss` computes ring width as display width + outline width:
  `(2px|5.5px * var(--edge-width-multiplier, var(--default-edge-width-multiplier, 1)) + 2|4
  * var(--ac-edge-outline-width)) * var(--zoom-multiplier)` — 5.5px base for the
  focused/hovered state, 4× for the outer ring. It also mirrors app.css's
  `transition: stroke-width 100ms ease-out` so the rings animate with the line (without it
  the rings jump while the line animates).
- Note when probing: `getComputedStyle(display).strokeWidth` right after a
  `data-edge-width` change returns the pre-transition value — wait ~100ms (or read the
  custom property) before concluding the multiplier didn't apply.
- Arrow heads are outlined the same way, with cloned `.canvas-path-end` underlays (class
  `ac-edge-outline-arrow`). The clones keep the `canvas-path-end` class so the app.css /
  arrow-style scale transforms apply unchanged; only fill/stroke/stroke-width are overridden.
  Because the polygon's stroke is scaled by `zoom * arrow-size` via CSS transform, the ring
  stroke width is divided by `--arrow-size-multiplier` to match the line's visual ring width.
  Clone/source links are tracked with `__acArrowOutlineSource` / `__acArrowOutlineClones`
  expandos so underlays of replaced arrow elements get cleaned up. Caveat: on
  transparent-fill arrow styles (thin triangle) the inner half of a ring peeks into the
  arrow's interior. Edge labels are deliberately not outlined.

## Z ordering controls — nodes and edges (added by an LLM agent)

`z-ordering-canvas-extension.ts` (gated by `zOrderingControlFeatureEnabled`) works on both
element types, but they use different storage and rendering:

- **Nodes** (pre-existing): persistent `zIndex` number in the node JSON; the
  `setZIndex`/`updateZIndex`/`renderZIndex` patches in canvas-patcher.ts write it to
  `nodeEl.style.zIndex`.
- **Edges**: the z-index lives in the edge's `styleAttributes.zIndex` (a **string**, like
  every style attribute) and is exposed in the edge style popup via the `zIndex` entry in
  `BUILTIN_EDGE_STYLE_ATTRIBUTES`. SVG `<g>` elements ignore CSS z-index, so stacking is
  done by **DOM reorder**: `reorderEdges(canvas)` stable-sorts `canvas.edges` by effective
  zIndex and re-appends each `lineGroupEl`/`lineEndGroupEl` to
  `canvas.edgeContainerEl`/`canvas.edgeEndContainerEl`. It runs on
  `advanced-canvas:edge-added` / `edge-changed` (covers the style popup, undo/redo and new
  edges) and early-exits when no edge has a non-zero zIndex.
- Menus: `canvas:edge-menu` fires with the edge as the only selection; the
  `canvas:selection-menu` handler now splits the selection into nodes and edges and applies
  each operation to both groups independently (Bring to Front/Send to Back/one-layer
  shifts/Remove persistent z-index). Edge history is one `canvas.pushHistory` per
  operation (the one-layer swap pushes only on the second `setEdgesZIndex` call).

**Layering between the types** (groups < edges < nodes): the edge SVGs keep their native
`z-index: auto` (they are the first children of `.canvas`; regular nodes render with
z-index ≥ 1, so they sit above by default). Group nodes are pushed below the edge band by
`applyGroupZIndexOffset` in canvas-patcher.ts, called from the `renderZIndex` patch: for
`type === 'group'` the *rendered* CSS z-index is `zIndex - GROUP_Z_INDEX_OFFSET` (1,000,000)
while the logical `node.zIndex` stays untouched, so the z-ordering commands and
`zIndexCounter` are unaffected. This is a default, not a hard guarantee — a node sent to
back past z-index 0 can slide below the edge band, matching the relaxed "zIndex is one
shared scale" semantics.

## Canvas filter & portals/groups (added by an LLM agent)

`canvas-filter-canvas-extension.ts` never builds its graph from `canvas.getData()` — the portals
extension strips all portal elements from `getData()` output (`onGetData`, hooked via
`advanced-canvas:data-requested`), so any filter built on it is portal-blind. The filters instead
read the live `canvas.nodes` / `canvas.edges` maps (per-element `getData()` is not hooked). Live
portal elements look like ordinary nodes/edges with `acportal||`-prefixed ids;
`PortalsCanvasExtension.getNestedIds(id)` splits those ids, `isPortalElement(id)` detects them.

- Connection filters (`filterByConnections`, BFS from the selection): reaching an open portal
  node (a `file` node with `portal: true`) reveals its entire nested content; reaching a group
  node reveals every bbox-contained node (`bboxContains`, so nested groups are covered too). Both
  expansions run inside the BFS loop and traversal continues from the revealed nodes. After
  traversal, **every** edge with both endpoints visible is shown, not just the edges the
  traversal followed (A→B, A→C, B→C + filter from A shows B→C as well).
- `filter-immediately-connected-nodes` is the one-hop variant: `ConnectionFilter.immediate` in
  `CONNECTION_FILTERS` breaks after the first BFS iteration (portal/group expansion of first-hop
  nodes still runs). Its directional variants `filter-immediately-connected-incoming-nodes` /
  `filter-immediately-connected-outgoing-nodes` additionally set `includeGroups: false`, which
  skips both group special cases (group-content expansion and showing containing groups).
  For all `immediate` filters, bidirectional edges (`fromEnd: 'arrow'`) don't count as
  connections and are skipped by the traversal (added by an LLM agent).
- The color filter is portal-aware the same way: matching portal nodes expand to their full
  content; portal-internal nodes are excluded from direct color matching.
- Shared helpers on the extension class: `getPortalNestedNodes(nodes, portalId)` /
  `getPortalInternalEdges(edges, portalId)`.
- `filterByTag` still reads `canvas.getData().nodes` for its candidates (portal-blind) — not yet
  aligned with the others.

## Presentation slide filter (added by an LLM agent)

`src/canvas-extensions/presentation-filter-canvas-extension.ts` applies a chosen canvas filter
whenever a presentation navigates to a slide. The slide's "filter source" is the node connected
to it by a "bidirectional" edge — an edge going **from** the slide node with `fromEnd: 'arrow'`
(edges pointing *to* the slide don't count). Slides with zero or multiple such target nodes are
left untouched (the previous filter state stays). The filter is reset on presentation end.

- The filter is chosen **per node**: the target node's `slideFilter` property in the canvas JSON
  (a filter id or `'none'`) determines the applied filter. It's set from the node context menu
  ("Slide filter: …" checked items in their own menu section via `canvas:node-menu`); choosing an
  option writes the property via `node.setData` + `canvas.pushHistory` (single undo step). The
  checked state shows the node's own property, falling back to the global
  `presentationSlideFilter` setting (dropdown under the Presentations settings heading), which is
  also the effective filter for nodes without the property. Selectable ids come from
  `NODE_BASED_FILTERS` (exported from `canvas-filter-canvas-extension.ts`): `filter-by-color` +
  all `CONNECTION_FILTERS`.
- Hook points: the presentation extension triggers `advanced-canvas:presentation-node-changed`
  (canvas, slideNode) at the end of `animateNodeTransition` — the single funnel for
  next/prev/start/refocus — and `advanced-canvas:presentation-ended` in `endPresentation`.
  These events are emitted by the extension itself, not by `canvas-patcher.ts`.
- The actual filtering is delegated to `CanvasFilterCanvasExtension.applyNodeBasedFilter(canvas,
  filterId, nodes)` — `filterByColor` / `filterByConnections` take an optional elements array
  that overrides the selection as the filter source. `resetFilter(canvas)` is the public form of
  the "Reset filter" command. The extension instance is found lazily via
  `plugin.canvasExtensions.find(e => e instanceof CanvasFilterCanvasExtension)`; it's undefined
  when the canvas filter feature is disabled, in which case this feature no-ops.
- A `WeakSet<Canvas>` (`filteredCanvases`) tracks where this feature applied a filter, so
  navigating to a slide whose target node has no effective filter (or ending the presentation)
  only resets filters this feature applied — a manually applied canvas filter is left alone.

## Hidden ".md" files in the canvas file search (added by an LLM agent)

Files named exactly `.md` are dotfiles — Obsidian's vault layer never indexes them
(`vault.getFiles()` / `getAbstractFileByPath('.md')` return nothing), but
`vault.adapter.list()` still sees them. `src/patchers/dot-md-file-search-patcher.ts`
patches `Modal.prototype.open`, duck-types the canvas "Add note from vault" suggest
modal (the only suggest modal carrying a `.canvas` with `shouldShowMarkdown === true`),
and wraps the instance's `getSuggestions` / `renderSuggestion` / `onChooseSuggestion`
to inject `.md` files discovered by an adapter walk (skipping dot-folders). Injected
items are marked with `acDotMdPath` and carry a fake TFile duck-type
(`path/name/basename/extension/stat/getShortName`) because no real TFile exists.
Gated by the `dotMdFileSearchEnabled` feature heading (default on, requires reload).

## Hide node contents (added by an LLM agent)

`src/canvas-extensions/hide-node-contents-canvas-extension.ts` adds a "Hide node contents" /
"Show node contents" item to the node right-click menus (`canvas:node-menu` and
`canvas:selection-menu` workspace events — same pattern as rotate-node). Group nodes are
filtered out, so the item never shows for them. The state persists per node as
`hideContents` in the canvas JSON (declared in the AdvancedJsonCanvas spec d.ts, removed
when shown again) and renders via the `ac-node-contents-hidden` class on `nodeEl`,
re-applied on `advanced-canvas:node-rendered` / `data-loaded:after`. The CSS
(`styles/hide-node-contents.scss`) hides `.canvas-node-content`, `.canvas-node-placeholder`
and `.canvas-node-label`, leaving an empty frame — CSS (not DOM clearing) so the embeds'
async rendering can't fight it. Gated by `hideNodeContentsFeatureEnabled` (default on).

## Text wrap-around (added by an LLM agent)

`src/canvas-extensions/text-wrap-around-canvas-extension.ts` adds a "Wrap text around
overlapping nodes" toggle (checked menu item) to the node right-click menus
(`canvas:node-menu` / `canvas:selection-menu`) and an `is-active` toggle button
(`#ac-text-wrap-around`, `wrap-text` icon) to the node popup menu next to Card Padding /
Set Aspect Ratio. Only `text`/`file` nodes are eligible (group labels and link iframes
can't reflow). The state persists per node as `textWrapAround` in the canvas JSON
(declared in the AdvancedJsonCanvas spec d.ts, removed when off) and renders via the
`ac-text-wrap-around` class on `nodeEl`.

Layout: only nodes linked to the wrap node by a bidirectional edge going into it
(edge `toNode` = wrap node, `fromEnd` = `'arrow'`, built once per refresh by
`buildLinkedObstacleMap`) that paint above it (`nodeEl.style.zIndex` → live `zIndex` →
DOM order) count as obstacles - the edge link keeps huge canvases fast (overlap geometry
is measured per linked node, not per node on the canvas). The screen-space overlap with
the node's visible text region
(section box clipped to scrolling ancestors up to the node frame, with zoom-scaled
client metrics) is converted to local content-box px (`nodeEl rect.width / node.width`
scale) and merged into disjoint Y bands (X spans unioned per band). One plain
margin-box floated spacer div (`ac-text-wrap-spacer`, see
`styles/text-wrap-around.scss`) per band is inserted into the preview section before
the first child extending past the band's top edge (zero top margin - a float's top
margin is part of its exclusion zone and would narrow the lines above the obstacle),
sized to everything except the wider side gap so text flows around the obstacle on one
side, full width above and below. No `shape-outside` (leaves stale lines after
spacer-height updates).
Recomputes are rAF-coalesced per canvas on node render/move/resize/add/remove/change,
edge add/change/remove (edges decide which nodes count as obstacles),
data load, undo/redo, viewport (zoom) changes, text edits, editing-state swaps and
content scrolling (one capture-phase scroll listener per canvas). Limitations: editing
mode shows unwrapped CodeMirror text; center-aligned nodes lose vertical centering while
wrapping (flex ignores floats, forced back to block); rotated obstacles use their AABB.
Gated by `textWrapAroundFeatureEnabled` (default on).

## Increase node spacing (added by an LLM agent)

`src/canvas-extensions/increase-node-spacing-canvas-extension.ts` adds an "Increase spacing"
cascade to the selection context menu (`canvas:selection-menu`, plus `canvas:node-menu` while
the right-clicked node is part of the selection): each direction (Horizontal / Vertical /
Horizontal & vertical) has 20/40/80/160/320 px submenus. Submenus use the runtime
`MenuItem.prototype.setSubmenu()` (declared in `src/@types/Obsidian.d.ts` - it is missing from
the public typings); the real menu UI supports it, including mobile.

Selection semantics: units are built by `buildSpacingUnits`. A selected group absorbs every
node fully contained in it (largest group first, so an outer selected group absorbs a nested
selected one) and all of them move by the same delta - the group and its children count as a
single node and their internal layout never changes. Remaining selected nodes are
single-node units. Nodes are then grouped into columns/rows by overlapping projections on the
chosen axis (`addAxisShifts`); each following column/row is shifted by `index * amount`, so
every gap between adjacent columns/rows grows by exactly the amount while aligned nodes (e.g.
a vertical stack for Horizontal) stay put. `centerShifts` re-centers the result on the
original selection bbox center. Moves use the native `CanvasNode.moveTo()` (rounds to int px,
marks the node moved so edges/renderers update), then one `canvas.pushHistory` +
`canvas.requestSave(false)`. The `false` matters: `canvas.requestSave()` pushes another history
entry itself (`requestPushHistory`), so `pushHistory` + `requestSave()` = two undo steps.
Gated by `increaseNodeSpacingFeatureEnabled` (default on).

## Resize nodes (added by an LLM agent)

`src/canvas-extensions/resize-nodes-canvas-extension.ts` adds "Resize nodes…" to the same two
menu events as the spacing feature. It opens `DimensionModal` (`src/utils/modal-helper.ts`) -
a width + height dialog pre-filled with the first selected node's size, Enter/Resize submits,
Cancel/Escape resolves `null`. The entered size is applied to every selected node except
group nodes (top-left corner stays fixed, node data is written via `node.setData(..., false)`),
then one `canvas.pushHistory` + `canvas.requestSave(false)` for the whole operation (see the
spacing section for why `false` is required). Gated by `resizeNodesFeatureEnabled` (default on).

## Build & install

- `npm run build` — esbuild (bundle + sass) straight into `dist/`; `manifest.json` is copied by
  `esbuild-plugin-copy`. **The build does not type-check** — run `npx tsc -noEmit -skipLibCheck`
  separately.
- `npm run dev` — watch mode, same output.
- `dist/` is a junction **into** the main vault
  (`dist -> C:\Users\Clinton\o\g\main\.obsidian\plugins\advanced-canvas`), i.e. the reversed-link
  style from the root CLAUDE.md — rebuilds are live in the vault with no copy step. Don't
  "normalize" the link direction. The **Company Documentation** vault also points its plugin
  folder at the same `dist/` (normal direction:
  `.obsidian\plugins\advanced-canvas -> C:\Users\Clinton\p\obsidian-advanced-canvas\dist`), so
  rebuilds are live there too — reload whichever vault you're testing
  (`obsidian vault='Company Documentation' reload`).
- After rebuilding, `obsidian plugin:reload` does NOT pick up junctioned code — use a full
  `obsidian vault=main reload`.

## Live testing

CLI calls here take ~60s each; run them in the background and batch probes into one eval.
Plugin object: `app.plugins.plugins['advanced-canvas']` (has `.settings.getSetting(key)` /
`.setSetting({...})`, which fires `advanced-canvas:settings-changed` — settings that are read
live apply immediately, no reload needed). Find a canvas with
`app.workspace.iterateAllLeaves(l => ... l.view.canvas ...)`, but expect several canvas leaves —
identify yours by a known node id, not by position. Open a canvas file with
`await app.workspace.openLinkText(path, '', 'tab')` — `setViewState` can leave an `empty` view.
If the Obsidian window is hidden, nodes don't render (empty `nodeEl`s, no computed styles) —
verify CSS targeting headlessly with `nodeEl.matches('<full selector>')` plus a
`document.styleSheets` rule search instead.
