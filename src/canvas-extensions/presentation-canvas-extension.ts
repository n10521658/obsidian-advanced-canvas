import { Menu, Notice } from 'obsidian'
import { BBox, Canvas, CanvasEdge, CanvasElement, CanvasNode, Position, Size } from 'src/@types/Canvas'
import BBoxHelper from "src/utils/bbox-helper"
import CanvasHelper from "src/utils/canvas-helper"
import CanvasExtension from './canvas-extension'

const START_SLIDE_NAME = 'Start Slide'
const DEFAULT_SLIDE_NAME = 'New Slide'

export default class PresentationCanvasExtension extends CanvasExtension {
  savedViewport: { x: number, y: number, zoom: number } = { x: 0, y: 0, zoom: 1 }
  isPresentationMode = false
  visitedNodeIds: string[] = []
  fullscreenModalObserver: MutationObserver | null = null
  presentationUsesFullscreen = false
  // Added by an LLM agent (P1): per-canvas sessions + animation generation so
  // two leaves presenting don't clobber each other and mashing Right arrow
  // doesn't stack 5 overlapping zoom chains. Legacy singleton fields above are
  // kept as aliases of the active canvas session for API compatibility.
  private sessions = new Map<Canvas, { savedViewport: { x: number, y: number, zoom: number }, visitedNodeIds: string[], animationGen: number, keyHandler: ((e: KeyboardEvent) => void) | null, fullscreenHandler: ((e: Event) => void) | null }>()

  isEnabled() { return 'presentationFeatureEnabled' as const }

  init() {
    /* Add wrap in slide option to context menu */
    this.plugin.registerEvent(this.plugin.app.workspace.on(
      'canvas:selection-menu',
      (menu: Menu, canvas: Canvas) => {
        menu.addItem((item) =>
          item
            .setTitle('Wrap in slide')
            .setIcon('gallery-vertical')
            .onClick(() => this.addSlide(canvas, undefined,
              BBoxHelper.enlargeBBox(BBoxHelper.combineBBoxes(
                [...canvas.selection.values()].map((element: CanvasElement) => element.getBBox())
              ), this.plugin.settings.getSetting('wrapInSlidePadding'))
            ))
        )
      }
    ))

    this.plugin.addCommand({
      id: 'create-new-slide',
      name: 'Create new slide',
      checkCallback: CanvasHelper.canvasCommand(
        this.plugin,
        (canvas: Canvas) => !canvas.readonly && !this.isPresentationMode,
        (canvas: Canvas) => this.addSlide(canvas)
      )
    })

    this.plugin.addCommand({
      id: 'set-start-node',
      name: 'Set start node',
      checkCallback: CanvasHelper.canvasCommand(
        this.plugin,
        (canvas: Canvas) => !canvas.readonly && !this.isPresentationMode && canvas.getSelectionData().nodes.length === 1,
        (canvas: Canvas) => this.setStartNode(canvas, canvas.nodes.get(canvas.getSelectionData().nodes[0].id))
      )
    })

    this.plugin.addCommand({
      id: 'start-presentation',
      name: 'Start presentation',
      checkCallback: CanvasHelper.canvasCommand(
        this.plugin,
        (_canvas: Canvas) => !this.isPresentationMode,
        (canvas: Canvas) => void this.startPresentation(canvas)
      )
    })

    this.plugin.addCommand({
      id: 'continue-presentation',
      name: 'Continue presentation',
      checkCallback: CanvasHelper.canvasCommand(
        this.plugin,
        (_canvas: Canvas) => !this.isPresentationMode,
        (canvas: Canvas) => void this.startPresentation(canvas, true)
      )
    })

    this.plugin.addCommand({
      id: 'end-presentation',
      name: 'End presentation',
      checkCallback: CanvasHelper.canvasCommand(
        this.plugin,
        (_canvas: Canvas) => this.isPresentationMode,
        (canvas: Canvas) => this.endPresentation(canvas)
      )
    })

    this.plugin.addCommand({
      id: 'previous-node',
      name: 'Previous node',
      checkCallback: CanvasHelper.canvasCommand(
        this.plugin,
        (_canvas: Canvas) => this.isPresentationMode,
        (canvas: Canvas) => this.previousNode(canvas)
      )
    })

    this.plugin.addCommand({
      id: 'next-node',
      name: 'Next node',
      checkCallback: CanvasHelper.canvasCommand(
        this.plugin,
        (_canvas: Canvas) => this.isPresentationMode,
        (canvas: Canvas) => this.nextNode(canvas)
      )
    })

    // Register events
    this.plugin.registerEvent(this.plugin.app.workspace.on(
      'advanced-canvas:canvas-changed',
      (canvas: Canvas) => this.onCanvasChanged(canvas)
    ))

    this.plugin.registerEvent(this.plugin.app.workspace.on(
      'advanced-canvas:popup-menu-created',
      (canvas: Canvas) => this.onPopupMenuCreated(canvas)
    ))
  }

  onCanvasChanged(canvas: Canvas): void {
    CanvasHelper.addCardMenuOption(
      canvas,
      CanvasHelper.createCardMenuOption(
        canvas,
        {
          id: 'new-slide',
          label: 'Drag to add slide',
          icon: 'gallery-vertical'
        },
        () => this.getDefaultSlideSize(),
        (canvas: Canvas, pos: Position) => this.addSlide(canvas, pos)
      )
    )
  }

  onPopupMenuCreated(canvas: Canvas): void {
    if (!this.plugin.settings.getSetting('showSetStartNodeInPopup')) return

    // If the canvas is readonly or there are multiple/no nodes selected, return
    const selectedNodesData = canvas.getSelectionData().nodes
    if (canvas.readonly || selectedNodesData.length !== 1 || canvas.selection.size > 1) return

    const selectedNode = canvas.nodes.get(selectedNodesData[0].id)
    if (!selectedNode) return

    CanvasHelper.addPopupMenuOption(
      canvas,
      CanvasHelper.createPopupMenuOption({
        id: 'start-node',
        label: 'Set as start slide',
        icon: 'play',
        callback: () => this.setStartNode(canvas, selectedNode)
      })
    )
  }

  private setStartNode(canvas: Canvas, node: CanvasNode | undefined) {
    if (!node) return
    canvas.metadata['startNode'] = node.getData().id
  }

  private getDefaultSlideSize(): Size {
    const slideSize = this.plugin.settings.getSetting('defaultSlideDimensions')
    return { width: slideSize[0], height: slideSize[1] }
  }

  private getSlideAspectRatio(): number {
    const slideSize = this.getDefaultSlideSize()
    return slideSize.width / slideSize.height
  }

  private addSlide(canvas: Canvas, pos?: Position, bbox?: BBox) {
    const isStartNode = canvas.metadata['startNode'] === undefined
    const slideSize = this.getDefaultSlideSize()
    const slideAspectRatio = this.getSlideAspectRatio()

    if (bbox) {
      const bboxWidth = bbox.maxX - bbox.minX
      const bboxHeight = bbox.maxY - bbox.minY

      // Make sure the nodes fit inside the bounding box while keeping the aspect ratio
      if (bboxWidth / bboxHeight > slideAspectRatio) {
        slideSize.width = bboxWidth
        slideSize.height = bboxWidth / slideAspectRatio
      } else {
        slideSize.height = bboxHeight
        slideSize.width = bboxHeight * slideAspectRatio
      }

      pos = {
        x: bbox.minX,
        y: bbox.minY
      }
    }

    // If no position is provided, use the center of the canvas
    if (!pos) pos = CanvasHelper.getCenterCoordinates(canvas, this.getDefaultSlideSize())

    const groupNode = canvas.createGroupNode({
      pos: pos,
      size: slideSize,
      label: isStartNode ? START_SLIDE_NAME : DEFAULT_SLIDE_NAME,
      focus: false,
    })

    groupNode.setData({
      ...groupNode.getData(),
      ratio: slideAspectRatio
    })

    if (isStartNode) canvas.metadata['startNode'] = groupNode.getData().id
  }

  private async animateNodeTransition(canvas: Canvas, fromNode: CanvasNode | undefined, toNode: CanvasNode) {
    // Added by an LLM agent (P1): cancellation generation - a newer transition
    // on the same canvas invalidates in-flight sleeps from a mashed arrow key.
    const session = this.sessions.get(canvas)
    const generation = (session ? session.animationGen + 1 : 1)
    if (session) session.animationGen = generation
    const isCurrent = () => this.sessions.get(canvas)?.animationGen === generation

    const removePadding = this.plugin.settings.getSetting('zoomToSlideWithoutPadding')
    const animationDurationMs = this.plugin.settings.getSetting('slideTransitionAnimationDuration') * 1000

    const toNodeBBox = CanvasHelper.getSmallestAllowedZoomBBox(canvas, toNode.getBBox())
    const toNodeBBoxPadded = removePadding ? toNodeBBox : BBoxHelper.enlargeBBox(toNodeBBox, 50)

    if (animationDurationMs > 0 && fromNode) {
      const animationIntensity = this.plugin.settings.getSetting('slideTransitionAnimationIntensity')

      const fromNodeBBox = CanvasHelper.getSmallestAllowedZoomBBox(canvas, fromNode.getBBox())
      const fromNodeBBoxPadded = removePadding ? fromNodeBBox : BBoxHelper.enlargeBBox(fromNodeBBox, 50)

      const currentNodeBBoxEnlarged = BBoxHelper.scaleBBox(fromNodeBBoxPadded, animationIntensity)
      canvas.zoomToRealBbox(currentNodeBBoxEnlarged)

      await sleep(animationDurationMs / 2)
      if (!isCurrent()) return

      if (fromNode.getData().id !== toNode.getData().id) {
        const nextNodeBBoxEnlarged = BBoxHelper.scaleBBox(toNodeBBoxPadded, animationIntensity)
        canvas.zoomToRealBbox(nextNodeBBoxEnlarged)

        await sleep(animationDurationMs / 2)
        if (!isCurrent()) return
      }
    }

    if (!isCurrent()) return
    canvas.zoomToRealBbox(toNodeBBoxPadded)

    // Added by an LLM agent - notify listeners (e.g. the presentation slide filter) about the slide change
    this.plugin.app.workspace.trigger('advanced-canvas:presentation-node-changed', canvas, toNode)
  }

  private async startPresentation(canvas: Canvas, tryContinue = false) {
    // Added by an LLM agent (P1): per-canvas session mirrors the legacy
    // singleton fields so two leaves can present independently.
    let existing = this.sessions.get(canvas)
    if (!existing) {
      existing = { savedViewport: { x: 0, y: 0, zoom: 1 }, visitedNodeIds: [], animationGen: 0, keyHandler: null, fullscreenHandler: null }
      this.sessions.set(canvas, existing)
    }
    const priorVisited = tryContinue ? (existing.visitedNodeIds.length > 0 ? existing.visitedNodeIds : this.visitedNodeIds) : []
    // Only reset visited nodes if we are not trying to continue
    if (!tryContinue || priorVisited.length === 0) {
      const startNode = canvas.metadata['startNode'] && canvas.nodes.get(canvas.metadata['startNode'])
      if (!startNode) {
        new Notice('No start node found. Please mark a node as a start node through the popup menu.')
        return
      }

      this.visitedNodeIds = [startNode.getData().id]
    } else {
      this.visitedNodeIds = [...priorVisited]
    }
    existing.visitedNodeIds = [...this.visitedNodeIds]

    // Save current viewport
    this.savedViewport = {
      x: canvas.tx,
      y: canvas.ty,
      zoom: canvas.tZoom,
    }
    existing.savedViewport = { ...this.savedViewport }

    const shouldEnterFullscreen = this.plugin.settings.getSetting('fullscreenPresentationEnabled')
    this.presentationUsesFullscreen = shouldEnterFullscreen

    canvas.wrapperEl.focus()
    canvas.wrapperEl.classList.add('presentation-mode')

    if (shouldEnterFullscreen) {
      try {
        await canvas.wrapperEl.requestFullscreen()
      } catch {
        // If fullscreen fails, fall back to windowed mode for this session
        this.presentationUsesFullscreen = false
      }
    }

    // Lock canvas
    canvas.setReadonly(true)

    // Disable zoom clamping
    if (this.plugin.settings.getSetting('useUnclampedZoomWhilePresenting'))
      canvas.screenshotting = true

    // Register event handler for keyboard navigation
    // Added by an LLM agent (P1): addEventListener instead of `onkeydown =`
    // (the old assignment clobbered other handlers); tracked per-canvas so two
    // leaves don't share one slot.
    let session = this.sessions.get(canvas)
    if (!session) {
      session = { savedViewport: { x: 0, y: 0, zoom: 1 }, visitedNodeIds: [], animationGen: 0, keyHandler: null, fullscreenHandler: null }
      this.sessions.set(canvas, session)
    }
    if (session.keyHandler) canvas.wrapperEl.removeEventListener('keydown', session.keyHandler)
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        this.endPresentation(canvas)
        return
      }

      if (this.plugin.settings.getSetting('useArrowKeysToChangeSlides')) {
        if (e.key === 'ArrowRight') this.nextNode(canvas)
        else if (e.key === 'ArrowLeft') this.previousNode(canvas)
      }

      if (this.plugin.settings.getSetting('usePgUpPgDownKeysToChangeSlides')) {
        if (e.key === 'PageDown') this.nextNode(canvas)
        else if (e.key === 'PageUp') this.previousNode(canvas)
      }
    }
    session.keyHandler = keyHandler
    canvas.wrapperEl.addEventListener('keydown', keyHandler)

    if (this.presentationUsesFullscreen) {
      // Keep modals while in fullscreen mode
      // Added by an LLM agent (P1): only relocate Obsidian's own overlay
      // containers (modal/prompt/menu), not EVERY added node - the old observer
      // kidnapped all body children and broke other plugins' modals.
      this.fullscreenModalObserver = new MutationObserver((mutationRecords) => {
        mutationRecords.forEach((mutationRecord) => {
          mutationRecord.addedNodes.forEach((node) => {
            if (node.nodeType !== 1) return
            const el = node as unknown as HTMLElement
            if (typeof el.matches !== 'function' || !el.matches('.modal-container, .prompt, .menu, .suggestion-container')) return
            try { activeDocument.body.removeChild(node) } catch { return }
            activeDocument.fullscreenElement?.appendChild(node)
          })
        })

        const inputField = activeDocument.querySelector('.prompt-input') as HTMLInputElement
        if (inputField) inputField.focus()
      })
      this.fullscreenModalObserver.observe(activeDocument.body, { childList: true })

      // Register event handler for exiting presentation mode
      if (session.fullscreenHandler) canvas.wrapperEl.removeEventListener('fullscreenchange', session.fullscreenHandler)
      const fullscreenHandler = (_e: Event) => {
        if (activeDocument.fullscreenElement) return
        this.endPresentation(canvas)
      }
      session.fullscreenHandler = fullscreenHandler
      canvas.wrapperEl.addEventListener('fullscreenchange', fullscreenHandler)
    }

    this.isPresentationMode = true

    // Wait for fullscreen to be enabled
    if (this.presentationUsesFullscreen)
      await sleep(500)

    // Zoom to first node
    const startNodeId = this.visitedNodeIds.first()
    if (!startNodeId) return

    const startNode = canvas.nodes.get(startNodeId)
    if (!startNode) return

    void this.animateNodeTransition(canvas, undefined, startNode)
  }

  private endPresentation(canvas: Canvas) {
    if (!this.isPresentationMode) return

    // Added by an LLM agent (P1): invalidate in-flight animations + detach the
    // per-canvas listeners (removeEventListener, not nulling on* properties).
    const session = this.sessions.get(canvas)
    if (session) {
      session.animationGen++
      if (session.keyHandler) {
        canvas.wrapperEl.removeEventListener('keydown', session.keyHandler)
        session.keyHandler = null
      }
      if (session.fullscreenHandler) {
        canvas.wrapperEl.removeEventListener('fullscreenchange', session.fullscreenHandler)
        session.fullscreenHandler = null
      }
    }
    // Unregister event handlers
    if (this.presentationUsesFullscreen) {
      this.fullscreenModalObserver?.disconnect()
      this.fullscreenModalObserver = null

      // Exit fullscreen mode
      if (activeDocument.fullscreenElement) void activeDocument.exitFullscreen()
    }

    // Unlock canvas
    canvas.setReadonly(false)

    // Re-enable zoom clamping
    if (this.plugin.settings.getSetting('useUnclampedZoomWhilePresenting'))
      canvas.screenshotting = false

    // Remove styles
    canvas.wrapperEl.classList.remove('presentation-mode')

    // Reset viewport
    if (this.plugin.settings.getSetting('resetViewportOnPresentationEnd'))
      canvas.setViewport(this.savedViewport.x, this.savedViewport.y, this.savedViewport.zoom)

    this.isPresentationMode = false
    this.presentationUsesFullscreen = false

    // Added by an LLM agent - notify listeners (e.g. the presentation slide filter) that the presentation ended
    this.plugin.app.workspace.trigger('advanced-canvas:presentation-ended', canvas)
  }

  // Added by an LLM agent
  /** Re-focuses the viewport on the slide the presentation is currently on. */
  zoomToCurrentSlide(canvas: Canvas) {
    const currentNodeId = this.visitedNodeIds.last()
    if (!currentNodeId) return

    const currentNode = canvas.nodes.get(currentNodeId)
    if (!currentNode) return

    void this.animateNodeTransition(canvas, currentNode, currentNode)
  }

  private nextNode(canvas: Canvas) {
    const fromNodeId = this.visitedNodeIds.last()
    if (!fromNodeId) return

    const fromNode = canvas.nodes.get(fromNodeId)
    if (!fromNode) return

    const outgoingEdges = canvas.getEdgesForNode(fromNode).filter((edge: CanvasEdge) => edge.from.node.getData().id === fromNodeId)
    let toNode = outgoingEdges.first()?.to.node

    // If there are multiple outgoing edges, we need to look at the edge label
    if (outgoingEdges.length > 1) {
      // Create map of edge labels to nodes
      const sortedEdges = outgoingEdges
        .sort((a: CanvasEdge, b: CanvasEdge) => {
          if (!a.label) return 1
          if (!b.label) return -1

          return a.label.localeCompare(b.label)
        })

      // Find which edges already have been traversed
      const traversedEdgesCount = this.visitedNodeIds
        .filter((visitedNodeId: string) => visitedNodeId === fromNodeId).length - 1

      // Select next edge
      const nextEdge = sortedEdges[traversedEdgesCount]
      toNode = nextEdge?.to?.node
    }

    if (toNode) {
      this.visitedNodeIds.push(toNode.getData().id)
      const session = this.sessions.get(canvas)
      if (session) session.visitedNodeIds = [...this.visitedNodeIds]
      void this.animateNodeTransition(canvas, fromNode, toNode)
    } else {
      // No more nodes left, animate to same node
      void this.animateNodeTransition(canvas, fromNode, fromNode)
    }
  }

  private previousNode(canvas: Canvas) {
    const fromNodeId = this.visitedNodeIds.pop()
    if (!fromNodeId) return

    const fromNode = canvas.nodes.get(fromNodeId)
    if (!fromNode) return

    const toNodeId = this.visitedNodeIds.last()
    let toNode = toNodeId ? canvas.nodes.get(toNodeId) : null

    // Fall back to same node if there are no more nodes before
    if (!toNode) {
      toNode = fromNode
      this.visitedNodeIds.push(fromNodeId)
    }
    const session = this.sessions.get(canvas)
    if (session) session.visitedNodeIds = [...this.visitedNodeIds]

    void this.animateNodeTransition(canvas, fromNode, toNode)
  }

  override dispose() {
    for (const [, session] of this.sessions) session.animationGen++
    this.sessions.clear()
    try { this.fullscreenModalObserver?.disconnect() } catch { /* ignore */ }
    this.fullscreenModalObserver = null
  }
}
