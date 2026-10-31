import { Canvas, CanvasNode } from "src/@types/Canvas"
import SettingsManager from "src/settings"
import CanvasExtension from "../canvas-extension"
import { CanvasGroupNodeData, CanvasNodeData } from "src/@types/AdvancedJsonCanvas"
import CanvasWrapperExposerExtension from "./canvas-wrapper-exposer"
import { writeDataset } from "./dataset-helpers"

const CANVAS_NODE_IFRAME_BODY_CLASS = 'canvas-node-iframe-body'

export function getExposedNodeData(settings: SettingsManager): (keyof CanvasNodeData)[] {
  const exposedData: (keyof CanvasNodeData)[] = []

  if (settings.getSetting('nodeStylingFeatureEnabled')) exposedData.push('styleAttributes')
  if (settings.getSetting('collapsibleGroupsFeatureEnabled')) exposedData.push('collapsed' satisfies keyof CanvasGroupNodeData as keyof CanvasNodeData)
  if (settings.getSetting('portalsFeatureEnabled')) exposedData.push('isPortalLoaded' as keyof CanvasNodeData)
  // Added by an LLM agent - Expose the rotation as a data-rotation attribute (also mirrored into
  // the editing iframe body). data-content-rotation is managed by the rotate node extension
  // itself, because the effective value includes propagation from containing groups/portals.
  if (settings.getSetting('nodeRotationFeatureEnabled')) exposedData.push('rotation')

  return exposedData
}

export default class NodeExposerExtension extends CanvasExtension {
  isEnabled() { return true }
  // Added by an LLM agent (P0-2): track iframe MutationObservers per node so
  // they can be disconnected on edit-end/unload instead of leaking one per edit.
  private iframeObservers = new Map<string, MutationObserver>()

  init() {
    this.plugin.registerEvent(this.plugin.app.workspace.on(
      'advanced-canvas:node-changed',
      (_canvas: Canvas, node: CanvasNode) => {
        const nodeData = node?.getData()
        if (!nodeData) return

        this.setDataAttributes(node.nodeEl, nodeData)

        const iframe = node.nodeEl.querySelector('iframe')?.contentDocument?.body
        if (iframe) this.setDataAttributes(iframe, nodeData)
      }
    ))

    // Expose data in editing iframe too
    this.plugin.registerEvent(this.plugin.app.workspace.on(
      'advanced-canvas:node-editing-state-changed',
      (_canvas: Canvas, node: CanvasNode, editing: boolean) => {
        if (!editing) {
          this.disconnectIframeObserver(node.id)
          return
        }

        const nodeData = node.getData()
        if (!nodeData) return

        const iframe = node.nodeEl.querySelector('iframe')?.contentDocument?.body
        if (!iframe) return

        iframe.classList.add(CANVAS_NODE_IFRAME_BODY_CLASS)
        this.disconnectIframeObserver(node.id)
        const observer = new MutationObserver(() => iframe.classList.toggle(CANVAS_NODE_IFRAME_BODY_CLASS, true))
        observer.observe(iframe, { attributes: true, attributeFilter: ['class'] })
        this.iframeObservers.set(node.id, observer)
        // Belt-and-braces: if the iframe is removed without an edit-end event,
        // disconnect when its node element leaves the DOM.
        const cleanup = new MutationObserver(() => {
          if (!iframe.isConnected) {
            this.disconnectIframeObserver(node.id)
            cleanup.disconnect()
          }
        })
        cleanup.observe(node.nodeEl, { childList: true, subtree: true })
        this.plugin.register(() => { observer.disconnect(); cleanup.disconnect() })
        this.setDataAttributes(iframe, nodeData)

        // Expose wrapper settings in the iframe too
        CanvasWrapperExposerExtension.updateCanvasExposedSettings(this.plugin, iframe)
      }
    ))
  }

  override dispose() {
    for (const observer of this.iframeObservers.values()) {
      try { observer.disconnect() } catch { /* already disconnected */ }
    }
    this.iframeObservers.clear()
  }

  private disconnectIframeObserver(nodeId: string) {
    const existing = this.iframeObservers.get(nodeId)
    if (existing) {
      try { existing.disconnect() } catch { /* already disconnected */ }
      this.iframeObservers.delete(nodeId)
    }
  }

  private setDataAttributes(element: HTMLElement, nodeData: CanvasNodeData) {
    // Added by an LLM agent (P1-12/P2-16): skip entirely when nothing is
    // exposed (all backing features off) - this runs on node-changed
    // (drag/resize/typing), so the early exit matters.
    const exposed = getExposedNodeData(this.plugin.settings)
    if (exposed.length === 0) return
    writeDataset(element, nodeData as unknown as Record<string, unknown>, exposed)
  }
}
