/* Added by an LLM agent */
import { Menu, Notice } from "obsidian"
import { Canvas, CanvasNode } from "src/@types/Canvas"
import CanvasExtension from "./canvas-extension"
import CanvasFilterCanvasExtension, { NODE_BASED_FILTERS } from "./canvas-filter-canvas-extension"

/** Setting value that disables the slide filter */
const NO_FILTER = 'none'

/**
 * Applies a canvas filter whenever a presentation navigates to a slide.
 * The slide's "filter source" is the node that is connected to the slide by a
 * "bidirectional" edge - an edge going TO the slide node with `fromEnd: 'arrow'`.
 * That node's own `slideFilter` property (set per node via the node context menu)
 * determines the applied filter; nodes without the property fall back to the global
 * `presentationSlideFilter` setting. Slides with zero or multiple such target nodes are
 * left untouched. The filter is reset when the presentation ends.
 */
export default class PresentationFilterCanvasExtension extends CanvasExtension {
  isEnabled() { return true }

  // Canvases where this feature currently has a filter applied - used to only reset
  // filters this feature applied, leaving manually applied canvas filters alone
  private filteredCanvases = new WeakSet<Canvas>()

  init() {
    this.plugin.registerEvent(this.plugin.app.workspace.on(
      'canvas:node-menu',
      (menu: Menu, node: CanvasNode) => this.addMenuItems(menu, node)
    ))

    this.plugin.registerEvent(this.plugin.app.workspace.on(
      'advanced-canvas:presentation-node-changed',
      (canvas: Canvas, node: CanvasNode) => this.onSlideChanged(canvas, node)
    ))

    this.plugin.registerEvent(this.plugin.app.workspace.on(
      'advanced-canvas:presentation-ended',
      (canvas: Canvas) => this.onPresentationEnded(canvas)
    ))
  }

  private addMenuItems(menu: Menu, node: CanvasNode) {
    if (node.canvas.readonly) return

    // The checked state shows the node's own slideFilter property, falling back to the global setting
    const currentFilterId = node.getData().slideFilter
      ?? this.plugin.settings.getSetting('presentationSlideFilter')

    const options = [{ id: NO_FILTER, name: 'None' }, ...NODE_BASED_FILTERS]
    for (const option of options) {
      menu.addItem(item => item
        .setTitle(`Slide filter: ${option.name}`)
        .setIcon('filter')
        .setChecked(currentFilterId === option.id)
        .setSection('presentation-slide-filter')
        .onClick(() => {
          node.setData({ ...node.getData(), slideFilter: option.id })
          node.canvas.pushHistory(node.canvas.getData()) // Single undo step (node-styles pattern)
          new Notice(`Slide filter of node set to: ${option.name}`)
        })
      )
    }
  }

  private onSlideChanged(canvas: Canvas, slideNode: CanvasNode) {
    const filterExtension = this.getFilterExtension()
    if (!filterExtension) return

    // Find the node connected to the slide by a "bidirectional" edge:
    // an edge going TO the slide node with an arrow on its from-end
    const slideId = slideNode.getData().id
    const targetNodeIds = new Set(canvas.getEdgesForNode(slideNode)
      .map(edge => edge.getData())
      .filter(edgeData => edgeData.toNode === slideId && edgeData.fromEnd === 'arrow')
      .map(edgeData => edgeData.fromNode))

    // Stop on zero or multiple target nodes
    if (targetNodeIds.size !== 1) return

    const targetNode = canvas.nodes.get([...targetNodeIds][0])
    if (!targetNode) return

    // The node's own slideFilter property wins; fall back to the global setting
    const filterId = targetNode.getData().slideFilter
      ?? this.plugin.settings.getSetting('presentationSlideFilter')

    if (filterId && filterId !== NO_FILTER) {
      filterExtension.applyNodeBasedFilter(canvas, filterId, [targetNode])
      this.filteredCanvases.add(canvas)
    } else {
      this.resetOwnFilter(filterExtension, canvas)
    }
  }

  private onPresentationEnded(canvas: Canvas) {
    const filterExtension = this.getFilterExtension()
    if (filterExtension) this.resetOwnFilter(filterExtension, canvas)
  }

  /** Resets the filter only if this feature applied one on the given canvas. */
  private resetOwnFilter(filterExtension: CanvasFilterCanvasExtension, canvas: Canvas) {
    if (!this.filteredCanvases.has(canvas)) return
    filterExtension.resetFilter(canvas)
    this.filteredCanvases.delete(canvas)
  }

  /**
   * Finds the canvas filter extension instance. Looked up lazily because plugin.canvasExtensions
   * is only assigned after every extension's constructor (and thus init()) has already run.
   * Undefined when the canvas filter feature is disabled.
   */
  private getFilterExtension(): CanvasFilterCanvasExtension | undefined {
    return this.plugin.canvasExtensions
      ?.find(extension => extension instanceof CanvasFilterCanvasExtension) as CanvasFilterCanvasExtension | undefined
  }
}
