/* Added by an LLM agent */
import { Canvas } from "src/@types/Canvas"
import CanvasExtension from "./canvas-extension"

/** Consumed by `styles/node-outline.scss` */
const OUTLINE_WIDTH_PROPERTY = '--ac-node-outline-width'

/**
 * Exposes the node outline settings (nodeOutlineBlack / nodeOutlineWhite / nodeOutlineWidth)
 * on the canvas wrapper as `data-node-outline` ('black' | 'white' | 'both') and the
 * `--ac-node-outline-width` CSS property. The rings themselves are pure CSS
 * (box-shadow on `.canvas-node-container`, see `styles/node-outline.scss`), so edges -
 * including the edgeWidth feature - are completely untouched. When both toggles are off the
 * attribute is removed and Obsidian's styling stays untouched.
 */
export default class NodeOutlineCanvasExtension extends CanvasExtension {
  isEnabled() { return true }

  init() {
    this.plugin.registerEvent(this.plugin.app.workspace.on(
      'advanced-canvas:settings-changed',
      () => {
        for (const canvas of this.plugin.getCanvases())
          this.updateNodeOutline(canvas)
      }
    ))

    this.plugin.registerEvent(this.plugin.app.workspace.on(
      'advanced-canvas:canvas-changed',
      (canvas: Canvas) => this.updateNodeOutline(canvas)
    ))
  }

  private updateNodeOutline(canvas: Canvas) {
    const wrapperEl = canvas.wrapperEl
    if (!wrapperEl) return

    const black = this.plugin.settings.getSetting('nodeOutlineBlack')
    const white = this.plugin.settings.getSetting('nodeOutlineWhite')

    if (!black && !white) {
      delete wrapperEl.dataset.nodeOutline
      wrapperEl.style.removeProperty(OUTLINE_WIDTH_PROPERTY)
      return
    }

    wrapperEl.dataset.nodeOutline = black && white ? 'both' : (black ? 'black' : 'white')

    const width = this.plugin.settings.getSetting('nodeOutlineWidth')
    wrapperEl.style.setProperty(OUTLINE_WIDTH_PROPERTY, `${width}px`)
  }
}
