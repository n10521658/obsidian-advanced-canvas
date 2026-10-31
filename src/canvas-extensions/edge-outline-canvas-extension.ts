/* Added by an LLM agent */
import { Canvas, CanvasEdge } from "src/@types/Canvas"
import CanvasExtension from "./canvas-extension"

/** Consumed by `styles/edge-outline.scss` */
const OUTLINE_WIDTH_PROPERTY = '--ac-edge-outline-width'
const OUTLINE_CLASS = 'ac-edge-outline-path'
const OUTER_OUTLINE_CLASS = 'ac-edge-outline-outer'
const ARROW_OUTLINE_CLASS = 'ac-edge-outline-arrow'
const ARROW_OUTER_OUTLINE_CLASS = 'ac-edge-outline-arrow-outer'

/* eslint-disable @typescript-eslint/no-explicit-any -- Expandos link an underlay to its source element */
/** Tracks the element an arrow underlay was cloned from, so orphans can be cleaned up */
const ARROW_SOURCE_EXPANDO = '__acArrowOutlineSource'
/** Tracks an arrow head's underlays on the arrow element itself */
const ARROW_CLONES_EXPANDO = '__acArrowOutlineClones'
/* eslint-enable @typescript-eslint/no-explicit-any */

type OutlineMode = 'none' | 'black' | 'white' | 'both'

/**
 * Exposes the edge outline settings (edgeOutlineBlack / edgeOutlineWhite / edgeOutlineWidth)
 * on the canvas wrapper as `data-edge-outline` ('black' | 'white' | 'both') and the
 * `--ac-edge-outline-width` CSS property, and maintains one underlay <path> per ring
 * (class `ac-edge-outline-path`) inside each edge's line group, inserted right before the
 * display path. The underlay carries the same `d` and dataset as the display path (synced on
 * `advanced-canvas:edge-path-updated` / `edge-changed` / `edge-added`), so path styles
 * (dashes, invisible) and the edgeWidth multiplier apply to the ring too - the ring width is
 * the display width + the outline width, which is what makes it compatible with edgeWidth.
 * The interaction path is left untouched, so hit-testing keeps Obsidian's own fat stroke.
 */
export default class EdgeOutlineCanvasExtension extends CanvasExtension {
  // Added by an LLM agent (P1-10/P1-12): the old isEnabled() { return true }
  // doubled every edge's DOM even when both outline toggles were off. Gate on
  // the actual settings, and skip all work when disabled.
  isEnabled() { return true }
  private edgeRaf = new WeakMap<Canvas, number>()
  private pendingEdges = new WeakMap<Canvas, Set<CanvasEdge>>()

  private isOutlineActive(): boolean {
    return this.isActive() && this.outlineMode() !== 'none'
  }

  init() {
    this.plugin.registerEvent(this.plugin.app.workspace.on(
      'advanced-canvas:settings-changed',
      () => {
        if (!this.isOutlineActive()) {
          // Clean up underlays when the feature is turned off.
          for (const canvas of this.plugin.getCanvases()) {
            this.updateWrapper(canvas)
            for (const edge of canvas.edges.values()) this.syncEdge(edge)
          }
          return
        }
        for (const canvas of this.plugin.getCanvases()) {
          this.updateWrapper(canvas)
          for (const edge of canvas.edges.values()) this.syncEdge(edge)
        }
      }
    ))

    this.plugin.registerEvent(this.plugin.app.workspace.on(
      'advanced-canvas:canvas-changed',
      (canvas: Canvas) => {
        if (!this.isOutlineActive()) return
        this.updateWrapper(canvas)
        for (const edge of canvas.edges.values()) this.syncEdge(edge)
      }
    ))

    // Added by an LLM agent (P1-10): coalesce per-frame edge-path-updated with
    // rAF instead of querySelectorAll + full dataset diff per frame per edge.
    const syncEdge = (_canvas: Canvas, edge: CanvasEdge) => {
      if (!this.isOutlineActive()) return
      this.queueEdgeSync(_canvas, edge)
    }
    this.plugin.registerEvent(this.plugin.app.workspace.on('advanced-canvas:edge-added', syncEdge))
    this.plugin.registerEvent(this.plugin.app.workspace.on('advanced-canvas:edge-changed', syncEdge))
    this.plugin.registerEvent(this.plugin.app.workspace.on('advanced-canvas:edge-path-updated', syncEdge))
    // Added by an LLM agent (P1-10): edge-removed cleanup so expando arrays
    // don't pin detached nodes.
    this.plugin.registerEvent(this.plugin.app.workspace.on(
      'advanced-canvas:edge-removed',
      (_canvas: Canvas, edge: CanvasEdge) => this.cleanupEdge(edge)
    ))
  }

  override onSettingsEnabled() {
    for (const canvas of this.plugin.getCanvases()) {
      this.updateWrapper(canvas)
      for (const edge of canvas.edges.values()) this.syncEdge(edge)
    }
  }

  /** Added by an LLM agent (P1-10): batch edge syncs to one rAF per canvas. */
  private queueEdgeSync(canvas: Canvas, edge: CanvasEdge) {
    let pending = this.pendingEdges.get(canvas)
    if (!pending) { pending = new Set(); this.pendingEdges.set(canvas, pending) }
    pending.add(edge)
    if (this.edgeRaf.has(canvas)) return
    this.edgeRaf.set(canvas, window.requestAnimationFrame(() => {
      this.edgeRaf.delete(canvas)
      const batch = this.pendingEdges.get(canvas)
      this.pendingEdges.delete(canvas)
      if (!batch) return
      for (const e of batch) {
        try { this.syncEdge(e) } catch (err) { console.error('Advanced Canvas: edge outline sync failed:', err) }
      }
    }))
  }

  /** Added by an LLM agent (P1-10): drop expando-tracked clones of a removed edge. */
  private cleanupEdge(edge: CanvasEdge) {
    try {
      const group = edge.lineEndGroupEl
      if (group) {
        for (const clone of Array.from(group.querySelectorAll(`.${ARROW_OUTLINE_CLASS}`))) clone.remove()
      }
      const lineGroup = edge.lineGroupEl
      if (lineGroup) {
        for (const underlay of Array.from(lineGroup.querySelectorAll(`:scope > path.${OUTLINE_CLASS}`))) underlay.remove()
      }
    } catch { /* edge already detached */ }
  }

  private outlineMode(): OutlineMode {
    const black = this.plugin.settings.getSetting('edgeOutlineBlack')
    const white = this.plugin.settings.getSetting('edgeOutlineWhite')

    if (black && white) return 'both'
    if (black) return 'black'
    if (white) return 'white'
    return 'none'
  }

  private updateWrapper(canvas: Canvas) {
    const wrapperEl = canvas.wrapperEl
    if (!wrapperEl) return

    const mode = this.outlineMode()
    if (mode === 'none') {
      delete wrapperEl.dataset.edgeOutline
      wrapperEl.style.removeProperty(OUTLINE_WIDTH_PROPERTY)
      return
    }

    wrapperEl.dataset.edgeOutline = mode

    const width = this.plugin.settings.getSetting('edgeOutlineWidth')
    wrapperEl.style.setProperty(OUTLINE_WIDTH_PROPERTY, `${width}px`)
  }

  private syncEdge(edge: CanvasEdge) {
    const mode = this.outlineMode()
    const needed = mode === 'both' ? 2 : (mode === 'none' ? 0 : 1)

    this.syncLine(edge, needed)
    this.syncArrowHeads(edge, needed)
  }

  private syncLine(edge: CanvasEdge, needed: number) {
    const lineGroup = edge.lineGroupEl
    const display = edge.path?.display
    if (!lineGroup || !display || display.parentElement !== lineGroup) return

    const underlays = Array.from(lineGroup.querySelectorAll(`:scope > path.${OUTLINE_CLASS}`)) as SVGPathElement[]
    while (underlays.length > needed) underlays.pop()!.remove()
    while (underlays.length < needed) {
      const underlay = lineGroup.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path')
      underlay.classList.add(OUTLINE_CLASS)
      lineGroup.insertBefore(underlay, display) // Ends up between the interaction and display paths
      underlays.push(underlay)
    }

    underlays.forEach((underlay, index) => {
      // With two rings the first-painted one is the outer ring
      underlay.classList.toggle(OUTER_OUTLINE_CLASS, needed === 2 && index === 0)

      const d = display.getAttribute('d') ?? ''
      if (underlay.getAttribute('d') !== d) underlay.setAttribute('d', d)

      // Keep the display path's exposed style attributes (path style, edge width, ...) so the
      // ring follows dashes and the edgeWidth multiplier
      for (const key of Object.keys(underlay.dataset))
        if (!(key in display.dataset)) delete underlay.dataset[key]
      for (const [key, value] of Object.entries(display.dataset))
        if (underlay.dataset[key] !== value) underlay.dataset[key] = value
    })
  }

  /**
   * Maintains the underlay clones of the arrow head(s) (`polygon.canvas-path-end` inside
   * `lineEndGroupEl`). Each clone keeps the `canvas-path-end` class, so app.css and the arrow
   * style rules (scale transform, arrow size multiplier) apply to it unchanged - the SCSS
   * only swaps fill/stroke/stroke-width. The clone/source link is tracked with expandos, so
   * underlays of arrow elements that Obsidian replaced get removed again.
   */
  private syncArrowHeads(edge: CanvasEdge, needed: number) {
    const group = edge.lineEndGroupEl
    if (!group) return

    // Drop underlays whose source arrow element is gone (or all of them when disabled)
    for (const clone of Array.from(group.querySelectorAll(`.${ARROW_OUTLINE_CLASS}`))) {
      const source = (clone as any)[ARROW_SOURCE_EXPANDO] as Element | undefined
      if (needed === 0 || !source || !source.isConnected) clone.remove()
    }
    if (needed === 0) return

    const arrowHeads = Array.from(group.querySelectorAll(`.canvas-path-end`))
      .filter(el => !el.classList.contains(ARROW_OUTLINE_CLASS))

    for (const arrowHead of arrowHeads) {
      let clones = ((arrowHead as any)[ARROW_CLONES_EXPANDO] ??= []) as Element[]
      clones = clones.filter(clone => clone.isConnected)
      ;(arrowHead as any)[ARROW_CLONES_EXPANDO] = clones

      while (clones.length > needed) clones.pop()!.remove()
      while (clones.length < needed) {
        const clone = arrowHead.cloneNode(false) as Element
        clone.removeAttribute('id')
        clone.classList.add(ARROW_OUTLINE_CLASS)
        ;(clone as any)[ARROW_SOURCE_EXPANDO] = arrowHead
        arrowHead.parentElement!.insertBefore(clone, arrowHead)
        clones.push(clone)
      }

      clones.forEach((clone, index) => {
        // With two rings the first-painted one is the outer ring
        clone.classList.toggle(ARROW_OUTER_OUTLINE_CLASS, needed === 2 && index === 0)

        for (const attr of ['points', 'transform']) {
          const value = arrowHead.getAttribute(attr)
          if (clone.getAttribute(attr) === value) continue
          if (value === null) clone.removeAttribute(attr)
          else clone.setAttribute(attr, value)
        }
      })
    }
  }
}
