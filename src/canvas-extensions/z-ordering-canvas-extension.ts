import { Menu } from "obsidian"
import { Canvas, CanvasEdge, CanvasElement, CanvasNode } from "src/@types/Canvas"
import BBoxHelper from "src/utils/bbox-helper"
import CanvasExtension from "./canvas-extension"

export default class ZOrderingCanvasExtension  extends CanvasExtension {
  isEnabled() { return 'zOrderingControlFeatureEnabled' as const }

  init() {
    this.plugin.registerEvent(this.plugin.app.workspace.on(
      'canvas:node-menu',
      (menu: Menu, node: CanvasNode) => this.nodeContextMenu(node, menu)
    ))

    this.plugin.registerEvent(this.plugin.app.workspace.on(
      'canvas:selection-menu',
      (menu: Menu, canvas: Canvas) => this.selectionContextMenu(canvas, menu)
    ))

    // Added by an LLM agent: edge z-ordering (persisted via the `zIndex` edge style attribute)
    this.plugin.registerEvent(this.plugin.app.workspace.on(
      'canvas:edge-menu',
      (menu: Menu, canvas: Canvas) => this.edgeContextMenu(canvas, menu)
    ))

    // Added by an LLM agent: keep the edge DOM order in sync with the zIndex style attributes
    // (covers the style popup, undo/redo and newly created edges)
    this.plugin.registerEvent(this.plugin.app.workspace.on(
      'advanced-canvas:edge-added',
      (canvas: Canvas) => this.reorderEdges(canvas)
    ))

    this.plugin.registerEvent(this.plugin.app.workspace.on(
      'advanced-canvas:edge-changed',
      (canvas: Canvas) => this.reorderEdges(canvas)
    ))
  }

  private nodeContextMenu(node: CanvasNode, menu: Menu) {
    this.addZOrderingContextMenuItems(node.canvas, [node], [], menu)
  }

  // Added by an LLM agent
  private edgeContextMenu(canvas: Canvas, menu: Menu) {
    this.addZOrderingContextMenuItems(canvas, [], this.getSelectedEdges(canvas), menu)
  }

  private selectionContextMenu(canvas: Canvas, menu: Menu) {
    const selectedNodes = canvas.getSelectionData().nodes
      .map(nodeData => canvas.nodes.get(nodeData.id))
      .filter(node => node !== undefined) as CanvasNode[]

    this.addZOrderingContextMenuItems(canvas, selectedNodes, this.getSelectedEdges(canvas), menu)
  }

  // Added by an LLM agent
  private getSelectedEdges(canvas: Canvas): CanvasEdge[] {
    return [...canvas.selection]
      .filter((item: CanvasElement) => (item as CanvasEdge).path !== undefined) as CanvasEdge[]
  }

  private addZOrderingContextMenuItems(canvas: Canvas, nodes: CanvasNode[], edges: CanvasEdge[], menu: Menu) {
    menu.addSeparator()

    if (this.plugin.settings.getSetting('zOrderingControlShowOneLayerShiftOptions') && nodes.length + edges.length === 1) {
      menu.addItem(item => {
        item.setTitle('Move one layer forward')
        item.setIcon('arrow-up')
        item.onClick(() => nodes.length === 1 ?
          this.moveOneLayer(canvas, nodes.first()!, true) :
          this.moveOneEdgeLayer(canvas, edges.first()!, true)) // Added by an LLM agent (edge branch)
      })

      menu.addItem(item => {
        item.setTitle('Move one layer backward')
        item.setIcon('arrow-down')
        item.onClick(() => nodes.length === 1 ?
          this.moveOneLayer(canvas, nodes.first()!, false) :
          this.moveOneEdgeLayer(canvas, edges.first()!, false)) // Added by an LLM agent (edge branch)
      })
    }

    menu.addItem(item => {
      item.setTitle('Bring to Front')
      item.setIcon('bring-to-front')
      item.onClick(() => this.moveMaxLayers(canvas, nodes, edges, true))
    })

    menu.addItem(item => {
      item.setTitle('Send to Back')
      item.setIcon('send-to-back')
      item.onClick(() => this.moveMaxLayers(canvas, nodes, edges, false))
    })

    if (nodes.some(node => node.getData().zIndex !== undefined) || edges.some(edge => this.getEdgeZIndexAttribute(edge) !== undefined)) {
      menu.addItem(item => {
        item.setTitle('Remove persistent z-index')
        item.setIcon('pin-off')
        item.onClick(() => this.removePersistentZIndexes(canvas, nodes, edges))
      })
    }

    menu.addSeparator()
  }

  private moveOneLayer(canvas: Canvas, selectedNode: CanvasNode, forward: boolean) {
    const selectedNodeBBox = selectedNode.getBBox()
    const collidingNodes = [...canvas.nodes.values()]
      .filter(node => BBoxHelper.isColliding(selectedNodeBBox, node.getBBox())) // Only nodes that collide with the selected node
      .filter(node => node !== selectedNode) // Exclude the selected node

    const nearestZIndexNode = collidingNodes
      .sort((a, b) => forward ? a.zIndex - b.zIndex : b.zIndex - a.zIndex) // Sort by zIndex
      .filter(node => forward ? node.zIndex > selectedNode.zIndex : node.zIndex < selectedNode.zIndex) // Only nodes that are one layer above or below the selected node
      .first()
    if (nearestZIndexNode === undefined) return // Already at the top or bottom

    const targetZIndex = nearestZIndexNode.zIndex

    // Shift the nearest zIndex node to the selected node's zIndex
    this.setNodesZIndex([nearestZIndexNode], selectedNode.zIndex)

    // Shift the selected node to the nearest zIndex node
    this.setNodesZIndex([selectedNode], targetZIndex)
  }

  // Added by an LLM agent
  private moveOneEdgeLayer(canvas: Canvas, selectedEdge: CanvasEdge, forward: boolean) {
    const selectedEdgeBBox = selectedEdge.getBBox()
    const selectedZIndex = this.getEdgeZIndex(selectedEdge)

    const nearestZIndexEdge = [...canvas.edges.values()]
      .filter(edge => BBoxHelper.isColliding(selectedEdgeBBox, edge.getBBox())) // Only edges that collide with the selected edge
      .filter(edge => edge !== selectedEdge) // Exclude the selected edge
      .sort((a, b) => forward ? this.getEdgeZIndex(a) - this.getEdgeZIndex(b) : this.getEdgeZIndex(b) - this.getEdgeZIndex(a)) // Sort by zIndex
      .filter(edge => forward ? this.getEdgeZIndex(edge) > selectedZIndex : this.getEdgeZIndex(edge) < selectedZIndex) // Only edges that are one layer above or below the selected edge
      .first()
    if (nearestZIndexEdge === undefined) return // Already at the top or bottom

    const targetZIndex = this.getEdgeZIndex(nearestZIndexEdge)

    // Shift the nearest zIndex edge to the selected edge's zIndex (no extra history entry)
    this.setEdgesZIndex(canvas, [nearestZIndexEdge], selectedZIndex, false)

    // Shift the selected edge to the nearest zIndex edge (single undo step for the whole swap)
    this.setEdgesZIndex(canvas, [selectedEdge], targetZIndex, true)
  }

  private moveMaxLayers(canvas: Canvas, selectedNodes: CanvasNode[], selectedEdges: CanvasEdge[], forward: boolean) {
    if (selectedNodes.length > 0) {
      // Added by an LLM agent (P1-10): no Math.max(...array) spread (stack risk
      // on large canvases) - single linear pass instead.
      let targetZIndex: number
      if (forward) {
        let max = -Infinity
        for (const node of canvas.nodes.values()) max = Math.max(max, node.zIndex)
        targetZIndex = max + 1
      } else {
        let min = Infinity
        for (const node of canvas.nodes.values()) min = Math.min(min, node.zIndex)
        targetZIndex = min - selectedNodes.length
      }

      this.setNodesZIndex(selectedNodes, targetZIndex)
    }

    // Added by an LLM agent: edges are z-ordered on their own scale - the default layering
    // (group nodes < edges < regular nodes) is handled by the group z-index offset in canvas-patcher.ts
    if (selectedEdges.length > 0) {
      let targetZIndex: number
      if (forward) {
        let max = -Infinity
        for (const edge of canvas.edges.values()) max = Math.max(max, this.getEdgeZIndex(edge))
        targetZIndex = max + 1
      } else {
        let min = Infinity
        for (const edge of canvas.edges.values()) min = Math.min(min, this.getEdgeZIndex(edge))
        targetZIndex = min - selectedEdges.length
      }

      this.setEdgesZIndex(canvas, selectedEdges, targetZIndex)
    }
  }

  private removePersistentZIndexes(canvas: Canvas, nodes: CanvasNode[], edges: CanvasEdge[]) {
    for (const node of nodes) node.setZIndex(undefined)

    // Added by an LLM agent
    if (edges.length > 0) this.setEdgesZIndex(canvas, edges, null)
  }

  private setNodesZIndex(nodes: CanvasNode[], zIndex: number) {
    const sortedNodes = nodes.sort((a, b) => a.zIndex - b.zIndex)

    for (let i = 0; i < sortedNodes.length; i++) {
      const node = sortedNodes[i]
      const finalZIndex = zIndex + i

      node.setZIndex(finalZIndex)
    }

    // Added by an LLM agent (P2-16): compact when the counter grows unbounded
    // (old code never compacted - every Bring-to-Front pushed zIndexCounter +1
    // forever, eventually colliding with the group offset band).
    this.maybeCompactNodeZIndexes(nodes.first()?.canvas)
  }

  /** Added by an LLM agent (P2-16): renormalize persistent zIndexes to 1..N. */
  private maybeCompactNodeZIndexes(canvas: Canvas | undefined) {
    if (!canvas) return
    let max = -Infinity
    for (const node of canvas.nodes.values()) max = Math.max(max, node.zIndex)
    if (max < 100000) return
    const sorted = [...canvas.nodes.values()].sort((a, b) => a.zIndex - b.zIndex)
    sorted.forEach((node, i) => {
      const data = node.getData()
      if (data.zIndex !== undefined) node.setZIndex(i + 1)
    })
    canvas.zIndexCounter = sorted.length + 1
  }

  // Added by an LLM agent: persists the zIndex in the edge's styleAttributes (as a string, like every style attribute)
  private setEdgesZIndex(canvas: Canvas, edges: CanvasEdge[], zIndex: number | null, pushHistory = true) {
    // Added by an LLM agent (P1-10): cache parsed zIndex once per edge (old code
    // called Number() inside the sort comparator = O(n log n) parses) and push
    // ONE history entry for the whole multi-edge op (old code pushed per edge
    // via setData AND once more here = N+1 reorders per gesture).
    const withOrder = edges.map(edge => ({ edge, order: this.getEdgeZIndex(edge) }))
    withOrder.sort((a, b) => a.order - b.order)

    for (let i = 0; i < withOrder.length; i++) {
      const edge = withOrder[i].edge
      const edgeData = edge.getData()
      const finalZIndex = zIndex === null ? null : zIndex + i

      edge.setData({
        ...edgeData,
        styleAttributes: {
          ...edgeData.styleAttributes,
          zIndex: finalZIndex === null ? null : finalZIndex.toString()
        }
      }, false)
    }

    if (pushHistory) canvas.pushHistory(canvas.getData())
    this.reorderEdges(canvas)
  }

  // Added by an LLM agent: SVG <g> elements ignore CSS z-index, so edge stacking is done via DOM order inside the edge containers
  private reorderEdges(canvas: Canvas) {
    const edges = [...canvas.edges.values()]
    // Added by an LLM agent (P1-10): DOM-order dirty check - skip the N
    // appendChild reflows when the DOM already matches the sorted order.
    const sortedEdges = edges
      .map(edge => ({ edge, order: this.getEdgeZIndex(edge) }))
      .sort((a, b) => a.order - b.order)
    if (!sortedEdges.some(item => item.order !== 0)) return // No custom z-order -> keep the native order

    let dirty = false
    for (let i = 0; i < sortedEdges.length; i++) {
      const lineGroup = sortedEdges[i].edge.lineGroupEl
      if (!lineGroup || lineGroup.parentElement?.children[i] !== lineGroup) { dirty = true; break }
    }
    if (!dirty) return

    for (const { edge } of sortedEdges) {
      if (!edge.isAttached) continue

      canvas.edgeContainerEl.appendChild(edge.lineGroupEl)
      canvas.edgeEndContainerEl.appendChild(edge.lineEndGroupEl)
    }
  }

  // Added by an LLM agent
  private getEdgeZIndexAttribute(edge: CanvasEdge): string | undefined {
    return edge.getData().styleAttributes?.zIndex ?? undefined
  }

  // Added by an LLM agent
  private getEdgeZIndex(edge: CanvasEdge): number {
    const parsed = Number(this.getEdgeZIndexAttribute(edge))
    return isNaN(parsed) ? 0 : parsed
  }

  // Added by an LLM agent
  private getAllEdgeZIndexes(canvas: Canvas) {
    return [...canvas.edges.values()].map(edge => this.getEdgeZIndex(edge))
  }

  private getAllNodeZIndexes(canvas: Canvas) {
    return [...canvas.nodes.values()].map(n => n.zIndex)
  }
}
