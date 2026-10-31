/* Added by an LLM agent */
import { Canvas, CanvasEdge, Position } from "src/@types/Canvas"
import BBoxHelper from "src/utils/bbox-helper"
import CanvasExtension from "./canvas-extension"

function scaledControlPoint(anchor: Position, controlPoint: Position, factor: number): Position {
  return {
    x: anchor.x + (controlPoint.x - anchor.x) * factor,
    y: anchor.y + (controlPoint.y - anchor.y) * factor
  }
}

/**
 * Adjusts the curvature of bezier edges via the `bezierCurvature` edge style attribute.
 *
 * A bezier edge is one whose `pathfindingMethod` style attribute is unset or blank - pathfinding
 * methods build their own path after `updatePath`, so scaling their control points would have no
 * visible effect anyway. The attribute value is a multiplier on the vector from each end point to
 * its bezier control point: 0 makes the curve a straight line, 1 is Obsidian's default shape and
 * values above 1 make the curve swing out further.
 *
 * Runs on `advanced-canvas:edge-path-updated`, after the arrow-base extension (see CANVAS_EXTENSIONS
 * ordering in main.ts), so it scales the final, arrow-adjusted control points. Obsidian recomputes
 * `edge.bezier` from scratch on every `updatePath`, so the scaling never compounds.
 */
export default class BezierCurvatureCanvasExtension extends CanvasExtension {
  isEnabled() { return true }

  init() {
    this.plugin.registerEvent(this.plugin.app.workspace.on(
      'advanced-canvas:edge-path-updated',
      (canvas: Canvas, edge: CanvasEdge) => this.onEdgePathUpdated(canvas, edge)
    ))
  }

  private onEdgePathUpdated(_canvas: Canvas, edge: CanvasEdge) {
    // Style attributes only exist while the edge styling feature is enabled
    if (!this.plugin.settings.getSetting('edgesStylingFeatureEnabled')) return
    if (!edge.bezier || !edge.path?.display) return

    const styleAttributes = edge.getData()?.styleAttributes
    if (styleAttributes?.pathfindingMethod) return // Only plain bezier edges

    const rawCurvature = styleAttributes?.bezierCurvature
    if (rawCurvature === undefined || rawCurvature === null) return

    const curvature = Number.parseFloat(rawCurvature)
    if (!Number.isFinite(curvature) || curvature < 0 || curvature === 1) return

    const { from, to, cp1, cp2 } = edge.bezier
    const scaledCp1 = scaledControlPoint(from, cp1, curvature)
    const scaledCp2 = scaledControlPoint(to, cp2, curvature)
    const curve = `M${from.x},${from.y} C${scaledCp1.x},${scaledCp1.y} ${scaledCp2.x},${scaledCp2.y} ${to.x},${to.y}`

    Object.assign(edge.bezier, { cp1: scaledCp1, cp2: scaledCp2, path: curve })

    // Same as Obsidian's own path: an end without an arrow head gets a stub out to the node border
    let path = curve
    if (!edge.fromLineEnd) {
      const fromBorder = BBoxHelper.getCenterOfBBoxSide(edge.from.node.getBBox(), edge.from.side)
      path = `M${fromBorder.x} ${fromBorder.y} L${from.x} ${from.y} ${path}`
    }
    if (!edge.toLineEnd) {
      const toBorder = BBoxHelper.getCenterOfBBoxSide(edge.to.node.getBBox(), edge.to.side)
      path = `${path} M${to.x} ${to.y} L${toBorder.x} ${toBorder.y}`
    }

    edge.path.interaction.setAttribute('d', path)
    edge.path.display.setAttribute('d', path)
  }
}
