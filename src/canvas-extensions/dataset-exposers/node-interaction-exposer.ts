import { Canvas, CanvasNode } from "src/@types/Canvas"
import CanvasExtension from "../canvas-extension"
import { getExposedNodeData } from "./node-exposer"
import PortalsCanvasExtension from "../portals-canvas-extension"
import { writeDataset } from "./dataset-helpers"

export const TARGET_NODE_DATASET_PREFIX = "target"

export default class NodeInteractionExposerExtension extends CanvasExtension {
  isEnabled() { return true }

  init() {
    this.plugin.registerEvent(this.plugin.app.workspace.on(
      'advanced-canvas:node-interaction',
      (canvas: Canvas, node: CanvasNode) => {
        const nodeData = node?.getData()
        if (!nodeData) return

        const interactionEl = canvas.nodeInteractionLayer.interactionEl
        if (!interactionEl) return

        // Added by an LLM agent (P2-16): shared helper (fixes the !value falsy bug).
        const exposed = getExposedNodeData(this.plugin.settings)
        if (exposed.length !== 0)
          writeDataset(interactionEl, nodeData as unknown as Record<string, unknown>, exposed, TARGET_NODE_DATASET_PREFIX)

        // Custom treatment for portal nodes
        if (PortalsCanvasExtension.isPortalElement(node.id)) interactionEl.dataset.isFromPortal = 'true'
        else delete interactionEl.dataset.isFromPortal
      }
    ))
  }
}
