/* Added by an LLM agent */
import { Notice } from "obsidian"
import { Canvas } from "src/@types/Canvas"
import CanvasHelper from "src/utils/canvas-helper"
import CanvasExtension from "./canvas-extension"

/**
 * Toggles the visibility of every file/text/link node label. The actual hiding is done in
 * `styles/note-label-visibility.scss`, driven by the `hideNoteLabels` setting that gets
 * exposed on the canvas wrapper by `dataset-exposers/canvas-wrapper-exposer.ts`.
 */
export default class NoteLabelVisibilityCanvasExtension extends CanvasExtension {
  isEnabled() { return true }

  init() {
    this.plugin.addCommand({
      id: 'toggle-note-label-visibility',
      name: 'Toggle note label visibility',
      checkCallback: CanvasHelper.canvasCommand(
        this.plugin,
        (_canvas: Canvas) => true,
        (_canvas: Canvas) => this.toggleNoteLabelVisibility()
      )
    })
  }

  private toggleNoteLabelVisibility() {
    const hidden = !this.plugin.settings.getSetting('hideNoteLabels')
    void this.plugin.settings.setSetting({ hideNoteLabels: hidden })

    new Notice(hidden ? 'Note labels hidden' : 'Note labels visible')
  }
}
