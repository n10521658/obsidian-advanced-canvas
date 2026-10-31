/* Added by an LLM agent */
import { getAllTags, Notice, TFile } from "obsidian"
import { AnyCanvasNodeData, CanvasEdgeData, CanvasFileNodeData, CanvasGroupNodeData, CanvasNodeData, CanvasTextNodeData } from "src/@types/AdvancedJsonCanvas"
import { Canvas, CanvasEdge, CanvasElement, CanvasNode } from "src/@types/Canvas"
import { ExtendedCachedMetadata } from "src/@types/Obsidian"
import CanvasHelper from "src/utils/canvas-helper"
import { AbstractSelectionModal } from "src/utils/modal-helper"
import CanvasExtension from "./canvas-extension"
import PortalsCanvasExtension from "./portals-canvas-extension" // Added by an LLM agent

/** Applied to hidden nodes/edges - the actual hiding happens in `styles/canvas-filter.scss` */
const FILTERED_OUT_CLASS = 'advanced-canvas-filtered-out'

const TAG_REGEX = /#[^\s#]+/g

// Added by an LLM agent - exported for the presentation slide filter feature
export interface ConnectionFilter {
  id: string
  name: string
  /** Follow edges that point away from the already included nodes */
  outgoing: boolean
  /** Follow edges that point towards the already included nodes */
  incoming: boolean
  /** Added by an LLM agent - only follow edges one hop away from the selection, not the whole connected component */
  immediate?: boolean
  /** Added by an LLM agent - false disables the group special cases (group expansion and showing containing groups) */
  includeGroups?: boolean
}

// Added by an LLM agent - exported for the presentation slide filter feature
export const CONNECTION_FILTERS: ConnectionFilter[] = [
  { id: 'filter-connected-nodes', name: 'Filter to selection and connected nodes', outgoing: true, incoming: true },
  { id: 'filter-immediately-connected-nodes', name: 'Filter to selection and immediately connected nodes', outgoing: true, incoming: true, immediate: true }, // Added by an LLM agent
  // Added by an LLM agent - one-hop directional variants without the group special cases
  { id: 'filter-immediately-connected-incoming-nodes', name: 'Filter to selection and immediately connected incoming nodes', outgoing: false, incoming: true, immediate: true, includeGroups: false },
  { id: 'filter-immediately-connected-outgoing-nodes', name: 'Filter to selection and immediately connected outgoing nodes', outgoing: true, incoming: false, immediate: true, includeGroups: false },
  { id: 'filter-outgoing-nodes', name: 'Filter to selection and outgoing nodes', outgoing: true, incoming: false },
  { id: 'filter-incoming-nodes', name: 'Filter to selection and incoming nodes', outgoing: false, incoming: true }
]

// Added by an LLM agent - all filters that derive their criteria from a set of nodes
// (used by the presentation slide filter feature as its selectable options)
export const NODE_BASED_FILTERS: { id: string, name: string }[] = [
  { id: 'filter-by-color', name: 'Filter by color of selection' },
  ...CONNECTION_FILTERS
]

/**
 * Temporarily hides nodes and edges that don't match a filter (color, tag or connection to the
 * selection). The filter is purely visual - nothing gets written to the canvas file - and is reset
 * by the "Reset filter" command or by reopening the canvas.
 */
export default class CanvasFilterCanvasExtension extends CanvasExtension {
  isEnabled() { return 'canvasFilterFeatureEnabled' as const }

  init() {
    this.plugin.addCommand({
      id: 'reset-filter',
      name: 'Reset filter',
      checkCallback: CanvasHelper.canvasCommand(
        this.plugin,
        (_canvas: Canvas) => true,
        (canvas: Canvas) => this.resetFilter(canvas)
      )
    })

    this.plugin.addCommand({
      id: 'filter-by-color',
      name: 'Filter by color of selection',
      checkCallback: CanvasHelper.canvasCommand(
        this.plugin,
        (canvas: Canvas) => canvas.selection.size > 0,
        (canvas: Canvas) => this.filterByColor(canvas)
      )
    })

    this.plugin.addCommand({
      id: 'filter-by-tag',
      name: 'Filter by tag',
      checkCallback: CanvasHelper.canvasCommand(
        this.plugin,
        (_canvas: Canvas) => true,
        (canvas: Canvas) => void this.filterByTag(canvas)
      )
    })

    this.plugin.addCommand({
      id: 'hide-selection',
      name: 'Hide selection',
      checkCallback: CanvasHelper.canvasCommand(
        this.plugin,
        (canvas: Canvas) => canvas.selection.size > 0,
        (canvas: Canvas) => this.hideSelection(canvas, false)
      )
    })

    this.plugin.addCommand({
      id: 'hide-selection-with-edges',
      name: 'Hide selection and its edges',
      checkCallback: CanvasHelper.canvasCommand(
        this.plugin,
        (canvas: Canvas) => canvas.selection.size > 0,
        (canvas: Canvas) => this.hideSelection(canvas, true)
      )
    })

    for (const connectionFilter of CONNECTION_FILTERS) {
      this.plugin.addCommand({
        id: connectionFilter.id,
        name: connectionFilter.name,
        checkCallback: CanvasHelper.canvasCommand(
          this.plugin,
          (canvas: Canvas) => canvas.selection.size > 0,
          (canvas: Canvas) => this.filterByConnections(canvas, connectionFilter)
        )
      })
    }
  }

  // Added by an LLM agent
  /** Shows all nodes and edges again (same as the "Reset filter" command). */
  resetFilter(canvas: Canvas) {
    this.showOnlyNodes(canvas)
    this.showOnlyEdges(canvas)
  }

  // Added by an LLM agent
  /**
   * Applies one of the NODE_BASED_FILTERS using the given nodes as the implicit selection
   * (used by the presentation slide filter feature). Returns false for unknown filter ids.
   */
  applyNodeBasedFilter(canvas: Canvas, filterId: string, nodes: CanvasNode[]): boolean {
    if (filterId === 'filter-by-color') {
      this.filterByColor(canvas, nodes)
      return true
    }

    const connectionFilter = CONNECTION_FILTERS.find(filter => filter.id === filterId)
    if (!connectionFilter) return false

    this.filterByConnections(canvas, connectionFilter, nodes)
    return true
  }

  // Visibility helpers

  private setElementsVisibility(elements: (HTMLElement | undefined)[], visible: boolean) {
    for (const element of elements) element?.classList.toggle(FILTERED_OUT_CLASS, !visible)
  }

  private setNodeVisibility(node: CanvasNode, visible: boolean) {
    this.setElementsVisibility([node.nodeEl], visible)
  }

  private setEdgeVisibility(edge: CanvasEdge, visible: boolean) {
    this.setElementsVisibility([edge.lineGroupEl, edge.lineEndGroupEl, edge.labelElement?.wrapperEl], visible)
  }

  /** Shows the nodes with the given ids and hides all others. Shows every node if no ids are given. */
  private showOnlyNodes(canvas: Canvas, nodeIdsToShow?: Set<string>) {
    // Added by an LLM agent (P1-10): set a single container attribute so the
    // stylesheet can short-circuit, then toggle per-node classes in one pass
    // (previously N synchronous style recalcs with no batching).
    if (nodeIdsToShow === undefined) canvas.wrapperEl.removeAttribute('data-ac-filter-active')
    else canvas.wrapperEl.setAttribute('data-ac-filter-active', 'nodes')
    for (const node of canvas.nodes.values())
      this.setNodeVisibility(node, nodeIdsToShow === undefined || nodeIdsToShow.has(node.id))
  }

  /** Shows the edges with the given ids and hides all others. Shows every edge if no ids are given. */
  private showOnlyEdges(canvas: Canvas, edgeIdsToShow?: Set<string>) {
    for (const edge of canvas.edges.values())
      this.setEdgeVisibility(edge, edgeIdsToShow === undefined || edgeIdsToShow.has(edge.id))
  }

  /** Shows the given nodes, the groups containing them and the edges between them - hides everything else */
  private showOnlyNodesAndTheirEdges(canvas: Canvas, nodesToShow: AnyCanvasNodeData[]) {
    // Added by an LLM agent - use the live nodes/edges: canvas.getData() strips portal elements
    const nodes = [...canvas.nodes.values()].map(node => node.getData())
    const edges = [...canvas.edges.values()].map(edge => edge.getData())

    const nodeIdsToShow = new Set(nodesToShow.map(node => node.id))
    const edgeIdsToShow = new Set(edges
      .filter(edge => nodeIdsToShow.has(edge.fromNode) && nodeIdsToShow.has(edge.toNode))
      .map(edge => edge.id))

    for (const group of this.getGroupsContaining(nodes, nodesToShow))
      nodeIdsToShow.add(group.id)

    this.showOnlyNodes(canvas, nodeIdsToShow)
    this.showOnlyEdges(canvas, edgeIdsToShow)
  }

  // Added by an LLM agent
  /** All live nodes nested inside the given portal (at any depth) */
  private static getPortalNestedNodes(nodes: AnyCanvasNodeData[], portalId: string) {
    return nodes.filter(node => node.id !== portalId &&
      PortalsCanvasExtension.getNestedIds(node.id).contains(portalId))
  }

  // Added by an LLM agent
  /** All live edges with both endpoints nested inside the given portal */
  private static getPortalInternalEdges(edges: CanvasEdgeData[], portalId: string) {
    return edges.filter(edge =>
      PortalsCanvasExtension.getNestedIds(edge.fromNode).contains(portalId) &&
      PortalsCanvasExtension.getNestedIds(edge.toNode).contains(portalId))
  }

  private static bboxContains(outerNode: CanvasNodeData, innerNode: CanvasNodeData) {
    return outerNode.x <= innerNode.x &&
      (outerNode.x + outerNode.width) >= (innerNode.x + innerNode.width) &&
      outerNode.y <= innerNode.y &&
      (outerNode.y + outerNode.height) >= (innerNode.y + innerNode.height)
  }

  /** Returns all group nodes that fully contain at least one of the given nodes */
  private getGroupsContaining(allNodes: AnyCanvasNodeData[], containedNodes: AnyCanvasNodeData[]): CanvasGroupNodeData[] {
    return allNodes.filter(node => node.type === 'group' &&
      containedNodes.some(containedNode => CanvasFilterCanvasExtension.bboxContains(node, containedNode))
    ) as CanvasGroupNodeData[]
  }

  // Filters

  // Added by an LLM agent - `elements` overrides the selection as the filter source (presentation slide filter)
  private filterByColor(canvas: Canvas, elements?: CanvasElement[]) {
    const colorsToShow = new Set((elements ?? [...canvas.selection]).map(element => element.getData().color ?? ''))
    if (colorsToShow.has(''))
      new Notice('One of the selected elements has no color, so colorless nodes stay visible as well')

    // Added by an LLM agent
    // Use the live nodes instead of canvas.getData() (which strips portal elements) and
    // expand every color-matching portal so its entire content stays visible
    const nodes = [...canvas.nodes.values()].map(node => node.getData())

    const nodesToShow = nodes.filter(node =>
      node.type !== 'group' &&
      !PortalsCanvasExtension.isPortalElement(node.id) &&
      colorsToShow.has(node.color ?? ''))

    // Index-based loop - matching nested portals get appended and expanded as well
    const shownNodeIds = new Set(nodesToShow.map(node => node.id))
    for (let i = 0; i < nodesToShow.length; i++) {
      const node = nodesToShow[i]
      if (node.type !== 'file' || !(node as CanvasFileNodeData).portal) continue

      for (const nestedNode of CanvasFilterCanvasExtension.getPortalNestedNodes(nodes, node.id)) {
        if (shownNodeIds.has(nestedNode.id)) continue
        shownNodeIds.add(nestedNode.id)
        nodesToShow.push(nestedNode)
      }
    }

    this.showOnlyNodesAndTheirEdges(canvas, nodesToShow)
  }

  private async filterByTag(canvas: Canvas) {
    const tags = this.getAvailableTags(canvas)
    if (tags.length === 0) {
      new Notice('No tags found in this vault')
      return
    }

    const selectedTag = await new AbstractSelectionModal(this.plugin.app, 'Select a tag to filter by...', tags).awaitInput()
    if (!selectedTag) return

    const nodesToShow = canvas.getData().nodes
      .filter(node => this.getTagsOfNode(canvas, node).some(tag => CanvasFilterCanvasExtension.tagMatches(tag, selectedTag)))

    this.showOnlyNodesAndTheirEdges(canvas, nodesToShow)
  }

  // Added by an LLM agent - `startElements` overrides the selection as the traversal start (presentation slide filter)
  private filterByConnections(canvas: Canvas, connectionFilter: ConnectionFilter, startElements?: CanvasElement[]) {
    // Added by an LLM agent
    // Use the live nodes/edges instead of canvas.getData() - getData() strips all portal
    // elements (see PortalsCanvasExtension.onGetData), which made this filter incompatible
    // with portals. Live portal elements look like normal nodes/edges with
    // 'acportal||'-prefixed ids, so traversing into a portal works like normal traversal.
    const nodes = [...canvas.nodes.values()].map(node => node.getData())
    const edges = [...canvas.edges.values()].map(edge => edge.getData())

    const nodeIdsToShow = new Set((startElements ?? [...canvas.selection]).map(element => element.id))
    const edgeIdsToShow = new Set<string>()
    const expandedPortalIds = new Set<string>()
    const expandedGroupIds = new Set<string>() // Added by an LLM agent

    // Added by an LLM agent (P1-8): adjacency lists built ONCE per filter run.
    // The old code scanned ALL edges per BFS level (O(levels x E)) plus all
    // nodes for portals and groups per level (O(n^2)-O(n^3) total).
    const outgoing = new Map<string, CanvasEdgeData[]>()
    const incoming = new Map<string, CanvasEdgeData[]>()
    for (const edge of edges) {
      if (connectionFilter.immediate && edge.fromEnd === 'arrow') continue
      let list = outgoing.get(edge.fromNode)
      if (!list) { list = []; outgoing.set(edge.fromNode, list) }
      list.push(edge)
      list = incoming.get(edge.toNode)
      if (!list) { list = []; incoming.set(edge.toNode, list) }
      list.push(edge)
    }
    // Precompute group nodes + portal nodes once (old code re-filtered per level).
    const groupNodes = nodes.filter(node => node.type === 'group')
    const portalNodes = nodes.filter(node => node.type === 'file' && (node as CanvasFileNodeData).portal)

    // Traverse the graph breadth-first, starting at the selection
    let frontier = new Set(nodeIdsToShow)
    while (frontier.size > 0) {
      const nextFrontier = new Set<string>()

      for (const nodeId of frontier) {
        if (connectionFilter.outgoing) {
          for (const edge of outgoing.get(nodeId) ?? []) {
            edgeIdsToShow.add(edge.id)
            if (nodeIdsToShow.has(edge.toNode)) continue
            nodeIdsToShow.add(edge.toNode)
            nextFrontier.add(edge.toNode)
          }
        }
        if (connectionFilter.incoming) {
          for (const edge of incoming.get(nodeId) ?? []) {
            edgeIdsToShow.add(edge.id)
            if (nodeIdsToShow.has(edge.fromNode)) continue
            nodeIdsToShow.add(edge.fromNode)
            nextFrontier.add(edge.fromNode)
          }
        }
      }

      // Added by an LLM agent
      // Reaching an open portal node means reaching its entire content - reveal all nested
      // nodes/edges and keep traversing from them (this also expands nested portals)
      for (const node of portalNodes) {
        if (!nodeIdsToShow.has(node.id) || expandedPortalIds.has(node.id)) continue
        expandedPortalIds.add(node.id)

        for (const nestedNode of CanvasFilterCanvasExtension.getPortalNestedNodes(nodes, node.id)) {
          if (nodeIdsToShow.has(nestedNode.id)) continue
          nodeIdsToShow.add(nestedNode.id)
          nextFrontier.add(nestedNode.id)
        }

        for (const edge of CanvasFilterCanvasExtension.getPortalInternalEdges(edges, node.id))
          edgeIdsToShow.add(edge.id)
      }

      // Added by an LLM agent
      // Reaching a group node means reaching its entire content - reveal all contained
      // nodes and keep traversing from them (bbox containment also covers nested groups)
      if (connectionFilter.includeGroups !== false) {
        for (const node of groupNodes) {
          if (!nodeIdsToShow.has(node.id) || expandedGroupIds.has(node.id)) continue
          expandedGroupIds.add(node.id)

          for (const containedNode of nodes) {
            if (containedNode.id === node.id || nodeIdsToShow.has(containedNode.id)) continue
            if (!CanvasFilterCanvasExtension.bboxContains(node, containedNode)) continue

            nodeIdsToShow.add(containedNode.id)
            nextFrontier.add(containedNode.id)
          }
        }
      }

      if (connectionFilter.immediate) break // Added by an LLM agent - stop after the first hop

      frontier = nextFrontier
    }

    // Added by an LLM agent - `includeGroups: false` also skips showing the groups that contain a shown node
    if (connectionFilter.includeGroups !== false)
      for (const group of this.getGroupsContaining(nodes, nodes.filter(node => nodeIdsToShow.has(node.id))))
        nodeIdsToShow.add(group.id)

    // Added by an LLM agent
    // Show every edge between visible nodes, not just the ones the traversal followed
    // (e.g. with edges A->B, A->C and B->C, filtering from A shows B->C as well)
    for (const edge of edges) {
      if (nodeIdsToShow.has(edge.fromNode) && nodeIdsToShow.has(edge.toNode))
        edgeIdsToShow.add(edge.id)
    }

    this.showOnlyNodes(canvas, nodeIdsToShow)
    this.showOnlyEdges(canvas, edgeIdsToShow)
  }

  private hideSelection(canvas: Canvas, includeConnectedEdges: boolean) {
    const selectedIds = new Set([...canvas.selection].map(element => element.id))

    for (const nodeId of selectedIds) {
      const node = canvas.nodes.get(nodeId)
      if (node) this.setNodeVisibility(node, false)

      const edge = canvas.edges.get(nodeId)
      if (edge) this.setEdgeVisibility(edge, false)
    }

    if (includeConnectedEdges) {
      for (const edge of canvas.edges.values()) {
        const edgeData: CanvasEdgeData = edge.getData()
        if (!selectedIds.has(edgeData.fromNode) && !selectedIds.has(edgeData.toNode)) continue

        this.setEdgeVisibility(edge, false)
      }
    }

    canvas.deselectAll()
  }

  // Tag helpers

  /** All tags of the vault, plus the ones that only exist inside text nodes of this canvas */
  private getAvailableTags(canvas: Canvas): string[] {
    const vaultTags = Object.keys(this.plugin.app.metadataCache.getTags() ?? {})
    const canvasTags = canvas.getData().nodes.flatMap(node => this.getTagsOfNode(canvas, node))

    return [...new Set([...vaultTags, ...canvasTags])].sort((a, b) => a.localeCompare(b))
  }

  private getTagsOfNode(canvas: Canvas, nodeData: AnyCanvasNodeData): string[] {
    if (nodeData.type === 'file') {
      const file = canvas.nodes.get(nodeData.id)?.file
      if (!(file instanceof TFile)) return []

      const fileMetadata = this.plugin.app.metadataCache.getFileCache(file)
      if (!fileMetadata) return []

      return getAllTags(fileMetadata) ?? []
    }

    if (nodeData.type === 'text') {
      // Prefer the per-node metadata created by the metadata cache patcher - it also knows about frontmatter tags
      const canvasFile = canvas.view.file
      const canvasMetadata = canvasFile ? this.plugin.app.metadataCache.getFileCache(canvasFile) as ExtendedCachedMetadata | null : null
      const nodeMetadata = canvasMetadata?.nodes?.[nodeData.id]
      if (nodeMetadata) return getAllTags(nodeMetadata) ?? []

      return [...(nodeData as CanvasTextNodeData).text.matchAll(TAG_REGEX)].map(match => match[0])
    }

    return []
  }

  /** Matches nested tags as well - e.g. the filter `#project` includes `#project/canvas` */
  private static tagMatches(tag: string, filterTag: string) {
    return tag === filterTag || tag.startsWith(`${filterTag}/`)
  }
}
