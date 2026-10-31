// Added by an LLM agent
import { Menu } from "obsidian"
import { Canvas, CanvasNode } from "src/@types/Canvas"
import CanvasHelper from "src/utils/canvas-helper"
import CanvasExtension from "./canvas-extension"

/**
 * Added by an LLM agent.
 *
 * Text wrap-around: a per-node `textWrapAround` flag in the canvas JSON (removed when
 * off, to keep the JSON clean - same pattern as `hideContents`/`rotation`) that makes the
 * text of a note/card node reflow around other nodes stacked on top of it, instead of
 * being hidden behind them. Toggled from the node right-click context menu
 * (`canvas:node-menu` / `canvas:selection-menu`) and from the node popup menu.
 * Only `text` and `file` nodes are eligible - group labels and link iframes cannot reflow.
 *
 * Rendering: nodes linked to the wrap node by a bidirectional edge going into it
 * (edge `toNode` is the wrap node and `fromEnd` is `'arrow'` - the node at the edge's
 * start is the obstacle) that paint above it are merged into disjoint Y bands
 * (each band's X span is the min..max union - text between two side-by-side obstacles in
 * the same band stays covered). The edge link keeps huge canvases fast: overlap
 * geometry (one `getBoundingClientRect` per candidate) is measured for linked nodes
 * only instead of every node on the canvas. Per band, one plain margin-box floated spacer
 * (`ac-text-wrap-spacer`) is inserted into the node's `.markdown-preview-section`
 * at the band's height - before the first child extending past the band's top edge -
 * and sized to cover everything EXCEPT the wider side gap, so lines above the band stay
 * full width while following lines flow around the obstacle Word-square-style: full
 * width above/below, hugging one side beside it. A CSS line box is a single run, so a
 * band can only use one side - the text flows down the wider gap. The spacer must be a
 * zero-margin float at its in-flow position: verified live that a float's top margin is
 * part of its line-box exclusion zone (a 100px margin-top narrowed the first line from
 * 469px to 386px), so the earlier margin-top positioning narrowed every line above the
 * obstacle. Deliberately no `shape-outside`: verified live that full-width floats with
 * shape-outside polygons leave stale full-width lines behind (lines laid out before a
 * later spacer-height update never re-narrow), while plain margin-box floats re-layout
 * reliably. (The spacers must live in the block-level section, not the flex-level
 * `.markdown-preview-view`: flex items cannot float and get flex-shrunk to height 0.) Overlaps are clipped to the
 * section's visible region (walk of clipping ancestors up to the node frame) - the raw
 * section rect spans the full scrolled content height, so unclipped, any on-screen node
 * below the visible text would forge a phantom band.
 *
 * Geometry is measured with `getBoundingClientRect` (screen px) and converted back to the
 * node's local CSS px via `nodeEl rect.width / node.width`, so zoom is handled implicitly -
 * a recompute is scheduled (rAF-coalesced per canvas) on every event that can move an
 * overlap: node render/move/resize/add/remove/change, edge add/change/remove (edges
 * decide which nodes count as obstacles), data load, undo/redo, viewport
 * (zoom) changes, text edits, editing-state swaps and content scrolling (one capture-phase
 * scroll listener per canvas).
 *
 * Known limitations:
 * - Only the reading preview reflows - while a text node is being edited, the CodeMirror
 *   editor shows unwrapped text.
 * - Off-screen nodes on large canvases are virtualized (no mounted content) - they are
 *   skipped until Obsidian renders them, and the node-rendered event recomputes then.
 * - Center-aligned text nodes (`data-text-align='center'`) render their section as flex,
 *   which ignores floats - the wrap stylesheet forces those sections back to `display: block`
 *   (vertical centering is lost while wrapping).
 * - Rotated obstacles are measured by their axis-aligned bounding box (conservative).
 */
export const TEXT_WRAP_AROUND_CLASS = 'ac-text-wrap-around'
export const TEXT_WRAP_AROUND_SPACER_CLASS = 'ac-text-wrap-spacer'

/** Breathing room between wrapped text and the overlapping node, in local px */
const WRAP_GAP_PX = 8

/** Node types whose content can reflow (matches the "Card Padding" style scope minus links, whose iframes cannot reflow) */
const WRAPPABLE_NODE_TYPES = ['text', 'file']

interface WrapBand {
  y0: number
  y1: number
  x0: number
  x1: number
}

/** Screen-px box with right/bottom edges (for intersection math) */
interface ScreenRect {
  left: number
  top: number
  right: number
  bottom: number
}

export default class TextWrapAroundCanvasExtension extends CanvasExtension {
  isEnabled() { return 'textWrapAroundFeatureEnabled' as const }

  /** Canvases with a recompute queued for the next animation frame */
  private pendingCanvases = new Set<Canvas>()
  private rafScheduled = false
  /** Capture-phase scroll listeners, one per canvas (removed on canvas unload / dispose) */
  private scrollCleanups = new Map<Canvas, () => void>()

  init() {
    // Recompute triggers - all coalesced through schedule() so a drag (render + move +
    // resize per frame) costs one recompute per canvas per frame.
    const refreshEvents = [
      'advanced-canvas:node-rendered',
      'advanced-canvas:node-moved',
      'advanced-canvas:node-resized',
      'advanced-canvas:node-added',
      'advanced-canvas:node-changed',
      'advanced-canvas:node-removed',
      'advanced-canvas:node-text-content-changed',
      'advanced-canvas:node-editing-state-changed',
      'advanced-canvas:node-breakpoint-changed',
    ] as const
    for (const event of refreshEvents) {
      this.plugin.registerEvent(this.plugin.app.workspace.on(
        event,
        // Rest params: these events carry extra payloads (node, update, ...) that the
        // refresh does not need - one handler shape fits the whole overload union.
        (canvas: Canvas, ..._rest: unknown[]) => this.schedule(canvas)
      ))
    }

    for (const event of ['advanced-canvas:data-loaded:after', 'advanced-canvas:canvas-changed', 'advanced-canvas:undo', 'advanced-canvas:redo', 'advanced-canvas:viewport-changed:after', 'advanced-canvas:edge-added', 'advanced-canvas:edge-changed', 'advanced-canvas:edge-removed'] as const) {
      this.plugin.registerEvent(this.plugin.app.workspace.on(
        event,
        (canvas: Canvas) => this.schedule(canvas)
      ))
    }

    this.plugin.registerEvent(this.plugin.app.workspace.on(
      'advanced-canvas:canvas-view-unloaded:before',
      (view) => this.removeScrollListener(view.canvas)
    ))

    // Context menus (right click)
    this.plugin.registerEvent(this.plugin.app.workspace.on(
      'canvas:node-menu',
      (menu: Menu, node: CanvasNode) => this.addMenuItems(node.canvas, [node], menu)
    ))

    this.plugin.registerEvent(this.plugin.app.workspace.on(
      'canvas:selection-menu',
      (menu: Menu, canvas: Canvas) => this.addMenuItems(canvas, this.getSelectedNodes(canvas), menu)
    ))

    // Node popup menu (the toolbar with "Card Padding" / "Set Aspect Ratio")
    this.plugin.registerEvent(this.plugin.app.workspace.on(
      'advanced-canvas:popup-menu-created',
      (canvas: Canvas) => this.onPopupMenuCreated(canvas)
    ))
  }

  dispose() {
    // Added by an LLM agent: release spacers, classes, listeners and queued frames so
    // disabling the feature (or unloading) leaves vanilla nodes behind.
    this.pendingCanvases.clear()
    for (const cleanup of this.scrollCleanups.values()) {
      try { cleanup() } catch { /* already detached */ }
    }
    this.scrollCleanups.clear()
    for (const canvas of this.plugin.getCanvases()) this.clearCanvas(canvas)
  }

  onSettingsEnabled() {
    for (const canvas of this.plugin.getCanvases()) this.schedule(canvas)
  }

  private getSelectedNodes(canvas: Canvas): CanvasNode[] {
    return canvas.getSelectionData().nodes
      .map(nodeData => canvas.nodes.get(nodeData.id))
      .filter(node => node !== undefined) as CanvasNode[]
  }

  private isWrappable(node: CanvasNode): boolean {
    return WRAPPABLE_NODE_TYPES.includes(node.getData().type)
  }

  private isWrapEnabled(node: CanvasNode): boolean {
    return node.getData().textWrapAround === true
  }

  // #region Menus

  private addMenuItems(canvas: Canvas, nodes: CanvasNode[], menu: Menu) {
    if (!this.isActive() || canvas.readonly) return

    nodes = nodes.filter(node => this.isWrappable(node))
    if (nodes.length === 0) return

    const allEnabled = nodes.every(node => this.isWrapEnabled(node))
    menu.addItem(item => {
      item.setTitle('Wrap text around overlapping nodes')
      item.setIcon('wrap-text')
      item.setChecked(allEnabled)
      item.onClick(() => this.setNodesWrap(canvas, nodes, !allEnabled))
    })
  }

  private onPopupMenuCreated(canvas: Canvas) {
    if (!this.isActive() || canvas.readonly) return

    const nodes = this.getSelectedNodes(canvas).filter(node => this.isWrappable(node))
    if (nodes.length === 0) return

    const allEnabled = nodes.every(node => this.isWrapEnabled(node))
    const button = CanvasHelper.createPopupMenuOption({
      id: 'ac-text-wrap-around',
      label: 'Wrap text around overlapping nodes',
      icon: 'wrap-text',
      callback: () => {
        const next = !nodes.every(node => this.isWrapEnabled(node))
        this.setNodesWrap(canvas, nodes, next)
        button.classList.toggle('is-active', next)
      }
    })
    button.classList.toggle('is-active', allEnabled)

    CanvasHelper.addPopupMenuOption(canvas, button)
  }

  private setNodesWrap(canvas: Canvas, nodes: CanvasNode[], enabled: boolean) {
    for (const node of nodes) {
      node.setData({
        ...node.getData(),
        textWrapAround: enabled ? true : undefined // Keep the canvas JSON clean
      })
    }

    // Single undo step for multi-node operations (node-styles pattern)
    canvas.pushHistory(canvas.getData())
    this.schedule(canvas)
  }

  // #endregion

  // #region Scheduling

  private schedule(canvas: Canvas) {
    if (!this.isActive() || !canvas) return

    this.pendingCanvases.add(canvas)
    this.ensureScrollListener(canvas)

    if (this.rafScheduled) return
    this.rafScheduled = true
    window.requestAnimationFrame(() => {
      this.rafScheduled = false
      const canvases = [...this.pendingCanvases]
      this.pendingCanvases.clear()
      for (const pending of canvases) {
        try { this.refreshCanvas(pending) }
        catch (e) { console.error('Advanced Canvas: text wrap-around refresh failed:', e) }
      }
    })
  }

  /** Content scrolling moves overlaps relative to the in-flow spacers - recompute on scroll */
  private ensureScrollListener(canvas: Canvas) {
    if (this.scrollCleanups.has(canvas) || !canvas.canvasEl) return

    const onScroll = () => this.schedule(canvas)
    canvas.canvasEl.addEventListener('scroll', onScroll, true)
    this.scrollCleanups.set(canvas, () => canvas.canvasEl.removeEventListener('scroll', onScroll, true))
  }

  private removeScrollListener(canvas: Canvas) {
    const cleanup = this.scrollCleanups.get(canvas)
    if (!cleanup) return
    this.scrollCleanups.delete(canvas)
    try { cleanup() } catch { /* already detached */ }
  }

  // #endregion

  // #region Refresh

  private refreshCanvas(canvas: Canvas) {
    if (!this.isActive()) {
      this.clearCanvas(canvas)
      return
    }

    // Added by an LLM agent: obstacle candidates are edge-linked only (see
    // buildLinkedObstacleMap) - built once per refresh so a huge canvas costs one
    // pass over the edges instead of one per wrap node.
    const linkedObstacles = this.buildLinkedObstacleMap(canvas)

    for (const node of canvas.nodes.values()) {
      const enabled = this.isWrappable(node) && this.isWrapEnabled(node)
      node.nodeEl.classList.toggle(TEXT_WRAP_AROUND_CLASS, enabled)
      if (!enabled) {
        this.clearSpacers(node)
        continue
      }
      this.updateNode(canvas, node, linkedObstacles.get(node.id))
    }
  }

  private clearCanvas(canvas: Canvas) {
    for (const node of canvas.nodes.values()) {
      node.nodeEl.classList.remove(TEXT_WRAP_AROUND_CLASS)
      this.clearSpacers(node)
    }
  }

  private clearSpacers(node: CanvasNode) {
    // Added by an LLM agent: contentEl only exists once Obsidian mounts the node's
    // content - off-screen nodes on large canvases stay virtualized (and nothing mounts
    // while the window is hidden), so there is nothing to clear. Without this guard the
    // first virtualized node throws and aborts the whole per-canvas refresh loop.
    if (!node.contentEl) return
    node.contentEl.querySelectorAll(`:scope .${TEXT_WRAP_AROUND_SPACER_CLASS}`).forEach(spacer => spacer.remove())
  }

  private findMarkdownContainer(node: CanvasNode): HTMLElement | null {
    // The inner `.markdown-preview-section` (present in both text cards and rendered note
    // embeds) is a plain block container. The outer `.markdown-preview-view` is
    // `display: flex`, which would make the spacers flex items - flex items cannot float
    // (so `shape-outside` is ignored) and get flex-shrunk to height 0 (verified live:
    // even a fresh `height: 100px` div computes to 0px in there). Non-markdown content
    // (images, PDFs, link iframes) has no section - wrapping no-ops.
    return node.contentEl.querySelector<HTMLElement>(':scope .markdown-preview-view .markdown-preview-section')
  }

  private updateNode(canvas: Canvas, node: CanvasNode, linkedObstacleIds?: Set<string>) {
    // Added by an LLM agent: skip virtualized nodes (see clearSpacers) - there is no
    // content to reflow until Obsidian mounts it, and the node-rendered event schedules
    // a recompute then.
    if (!node.contentEl) return
    const container = this.findMarkdownContainer(node)
    if (!container) {
      this.clearSpacers(node)
      return
    }

    // Added by an LLM agent: no edge-linked obstacles - nothing can cover this node's
    // text, so skip the (layout-forcing) geometry reads entirely.
    if (!linkedObstacleIds || linkedObstacleIds.size === 0) {
      this.clearSpacers(node)
      return
    }

    // Screen px -> local CSS px (the canvas scales node content by the zoom level)
    const nodeRect = node.nodeEl.getBoundingClientRect()
    if (node.width <= 0 || nodeRect.width <= 0) {
      this.clearSpacers(node)
      return
    }
    const scale = nodeRect.width / node.width

    const containerRect = container.getBoundingClientRect()
    if (containerRect.width <= 0 || containerRect.height <= 0) {
      // Content not mounted (e.g. zoomed out past the breakpoint placeholder)
      this.clearSpacers(node)
      return
    }

    // Clip to the actually visible region: the section rect spans the full scrolled
    // content height, so without this an on-screen node below the visible text would
    // count as overlapping it (verified live: a node 400px below produced a phantom
    // full-width band). Spacers were already cleared above, so just return.
    const visible = this.visibleSectionRect(container, node, scale)
    if (!visible) return

    const computed = window.getComputedStyle(container)
    const padLeft = parseFloat(computed.paddingLeft) || 0
    const padTop = parseFloat(computed.paddingTop) || 0
    const originX = containerRect.left + padLeft * scale
    const originY = containerRect.top + padTop * scale
    const contentWidth = container.clientWidth - padLeft - (parseFloat(computed.paddingRight) || 0)
    // Measure the natural height with stale spacers removed so a tall spacer cannot grow the content
    this.clearSpacers(node)
    const contentHeight = container.scrollHeight - padTop - (parseFloat(computed.paddingBottom) || 0)
    if (contentWidth <= 0 || contentHeight <= 0) return

    const bands = this.computeBands(canvas, node, { originX, originY, scale, contentWidth, contentHeight, visible }, linkedObstacleIds)
    if (bands.length === 0) return

    // Where each band's spacer belongs in the DOM: before the first child extending
    // past the band's top edge (children fully above the band keep full-width lines
    // before the spacer; a block straddling the band top errs to narrowed, which only
    // ever hides nothing - the opposite direction would slide text under the opaque
    // obstacle). Measured pre-insertion: block border boxes do not move for floats, so
    // one layout pass serves all bands. (Spacers were cleared above, but filter
    // defensively anyway.)
    const childBottoms = Array.from(container.children)
      .filter(child => !child.classList.contains(TEXT_WRAP_AROUND_SPACER_CLASS))
      .map(child => ({ child, bottom: (child.getBoundingClientRect().bottom - originY) / scale }))
    for (const band of bands) {
      // Inline geometry: fully dynamic per band, so no static-CSS rule could cover it.
      const spacer = activeDocument.createElement('div')
      spacer.classList.add(TEXT_WRAP_AROUND_SPACER_CLASS)
      const height = band.y1 - band.y0
      // Word-style square wrap: a CSS line box is a single run, so one band can only use
      // one side of the obstacle - the text flows down the wider gap. This is done with a
      // plain margin-box float on the obstacle side (NO shape-outside: verified live that
      // a full-width float + shape-outside polygon leaves stale full-width lines behind -
      // lines laid out before a later spacer-height update never re-narrow - while plain
      // margin-box floats re-layout reliably). E.g. obstacle on the left -> `float: left`
      // spacer covering [0, x1) packs the lines into [x1, W]. No `margin-top`: a float's
      // top margin is part of its exclusion zone (verified live), so the spacer is
      // inserted at the band's height instead - lines above stay full width.
      const useLeftSide = band.x0 >= contentWidth - band.x1
      if (useLeftSide) {
        spacer.style.float = 'right'
        spacer.style.width = `${Math.max(0, contentWidth - band.x0)}px`
        spacer.style.marginLeft = `${WRAP_GAP_PX}px` // Breathing room towards the text
      } else {
        spacer.style.float = 'left'
        spacer.style.width = `${Math.max(0, band.x1)}px`
        spacer.style.marginRight = `${WRAP_GAP_PX}px` // Breathing room towards the text
      }
      spacer.style.height = `${height}px`
      const anchor = childBottoms.find(({ bottom }) => bottom > band.y0 + 1)?.child ?? null
      container.insertBefore(spacer, anchor)
    }
  }

  /**
   * The section's box clipped to every clipping ancestor up to the node frame, in screen
   * px. Returns null when nothing of the section is visible.
   *
   * Added by an LLM agent: `clientWidth`/`clientHeight`/`clientLeft`/`clientTop` are
   * layout px (unaffected by the canvas zoom transform) while every rect and the
   * accumulated region are screen px, so the client metrics must be scaled - unscaled,
   * the visible region inflates by 1/scale (verified live: at 0.38x zoom the bottom
   * edge overshot by ~430 screen px, forging phantom bands from nodes far below and
   * beside the wrap node).
   */
  private visibleSectionRect(section: HTMLElement, node: CanvasNode, scale: number): ScreenRect | null {
    const r = section.getBoundingClientRect()
    const region: ScreenRect = { left: r.left, top: r.top, right: r.right, bottom: r.bottom }

    let el: HTMLElement | null = section.parentElement
    while (el) {
      const style = window.getComputedStyle(el)
      if (style.overflowX !== 'visible' || style.overflowY !== 'visible') {
        const b = el.getBoundingClientRect()
        const left = b.left + el.clientLeft * scale
        const top = b.top + el.clientTop * scale
        region.left = Math.max(region.left, left)
        region.top = Math.max(region.top, top)
        region.right = Math.min(region.right, left + el.clientWidth * scale)
        region.bottom = Math.min(region.bottom, top + el.clientHeight * scale)
        if (region.right <= region.left || region.bottom <= region.top) return null
      }
      if (el === node.nodeEl) break
      el = el.parentElement
    }
    return region
  }

  /**
   * Added by an LLM agent: nodes allowed to act as wrap obstacles for each wrap node,
   * keyed by wrap node id. Only nodes with a bidirectional edge going INTO the wrap
   * node count: an edge whose `toNode` is the wrap node and whose `fromEnd` is
   * `'arrow'`; the node at the edge's start (`fromNode`) is the obstacle.
   */
  private buildLinkedObstacleMap(canvas: Canvas): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>()
    for (const edge of canvas.edges.values()) {
      const data = edge.getData()
      if (data.fromEnd !== 'arrow' || !data.fromNode || !data.toNode) continue
      let set = map.get(data.toNode)
      if (!set) {
        set = new Set<string>()
        map.set(data.toNode, set)
      }
      set.add(data.fromNode)
    }
    return map
  }

  /**
   * Overlaps of nodes painting above `node`, merged into disjoint Y bands in the node's
   * local content-box px. Each band's X span is the min..max union of its overlaps.
   * Only edge-linked obstacles (see buildLinkedObstacleMap) are measured - every other
   * node is skipped before any geometry read. Overlaps are clipped to the section's
   * visible region, so only obstacles covering on-screen text produce bands.
   */
  private computeBands(canvas: Canvas, node: CanvasNode, geometry: { originX: number, originY: number, scale: number, contentWidth: number, contentHeight: number, visible: ScreenRect }, linkedObstacleIds: Set<string>): WrapBand[] {
    const { originX, originY, scale, contentWidth, contentHeight, visible } = geometry

    const overlaps: WrapBand[] = []
    for (const other of canvas.nodes.values()) {
      if (other === node || !linkedObstacleIds.has(other.id) || !this.isOnTop(other, node)) continue

      const otherRect = other.nodeEl.getBoundingClientRect()
      const x0 = Math.max(otherRect.left, visible.left)
      const x1 = Math.min(otherRect.right, visible.right)
      const y0 = Math.max(otherRect.top, visible.top)
      const y1 = Math.min(otherRect.bottom, visible.bottom)

      // To local content-box px, clamped to the content box
      const local = {
        x0: Math.max(0, (x0 - originX) / scale),
        x1: Math.min(contentWidth, (x1 - originX) / scale),
        y0: Math.max(0, (y0 - originY) / scale),
        y1: Math.min(contentHeight, (y1 - originY) / scale)
      }
      if (local.x1 - local.x0 < 1 || local.y1 - local.y0 < 1) continue

      overlaps.push(local)
    }

    // Merge into disjoint Y bands (sorted sweep; touching bands merge too)
    overlaps.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)
    const bands: WrapBand[] = []
    for (const overlap of overlaps) {
      const current = bands[bands.length - 1]
      if (current && overlap.y0 <= current.y1) {
        current.y1 = Math.max(current.y1, overlap.y1)
        current.x0 = Math.min(current.x0, overlap.x0)
        current.x1 = Math.max(current.x1, overlap.x1)
      } else {
        bands.push({ ...overlap })
      }
    }
    return bands
  }

  /**
   * Whether `obstacle` paints above `background`: rendered z-index first, live zIndex
   * counter second, DOM order last (later siblings paint on top at equal z-index).
   */
  private isOnTop(obstacle: CanvasNode, background: CanvasNode): boolean {
    const obstacleZ = parseFloat(obstacle.nodeEl.style.zIndex)
    const backgroundZ = parseFloat(background.nodeEl.style.zIndex)
    if (!Number.isNaN(obstacleZ) && !Number.isNaN(backgroundZ) && obstacleZ !== backgroundZ)
      return obstacleZ > backgroundZ

    if (obstacle.zIndex !== background.zIndex) return obstacle.zIndex > background.zIndex

    const position = background.nodeEl.compareDocumentPosition(obstacle.nodeEl)
    if (position & Node.DOCUMENT_POSITION_DISCONNECTED) return false
    return !!(position & Node.DOCUMENT_POSITION_FOLLOWING)
  }

  // #endregion
}
