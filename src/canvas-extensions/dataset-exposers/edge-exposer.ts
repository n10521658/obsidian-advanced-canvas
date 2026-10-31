import { Canvas, CanvasEdge } from "src/@types/Canvas"
import SettingsManager from "src/settings"
import CanvasExtension from "../canvas-extension"
import { CanvasEdgeData } from "src/@types/AdvancedJsonCanvas"
import { writeDataset } from "./dataset-helpers"

export function getExposedEdgeData(settings: SettingsManager): (keyof CanvasEdgeData)[] {
  const exposedData: (keyof CanvasEdgeData)[] = []

  if (settings.getSetting('edgesStylingFeatureEnabled')) exposedData.push('styleAttributes')

  return exposedData
}

export default class EdgeExposerExtension extends CanvasExtension {
  isEnabled() { return true }

  init() {
    this.plugin.registerEvent(this.plugin.app.workspace.on(
      'advanced-canvas:edge-changed',
      (_canvas: Canvas, edge: CanvasEdge) => {
        const edgeData = edge?.getData()
        if (!edgeData) return

        // Added by an LLM agent (P1-12/P2-16): skip when nothing exposed; batch
        // the 3 DOM writes through the shared helper (fixes the !value falsy bug).
        const exposed = getExposedEdgeData(this.plugin.settings)
        if (exposed.length === 0) return
        const record = edgeData as unknown as Record<string, unknown>
        if (edge.path?.display) writeDataset(edge.path.display, record, exposed)
        if (edge.fromLineEnd?.el) writeDataset(edge.fromLineEnd.el, record, exposed)
        if (edge.toLineEnd?.el) writeDataset(edge.toLineEnd.el, record, exposed)
      }
    ))
  }
}
