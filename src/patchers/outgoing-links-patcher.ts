import Patcher from "./patcher"
import OutgoingLink from "src/@types/OutgoingLinkPlugin"

export default class OutgoingLinksPatcher extends Patcher {
  protected async patch() {
    if (!this.plugin.settings.getSetting('canvasMetadataCompatibilityEnabled')) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- We do not have typings for the Outgoing Links plugin
    await Patcher.waitForViewRequest<any>(this.plugin, "outgoing-link", view => {
      Patcher.patchPrototype<OutgoingLink>(this.plugin, view.outgoingLink, {
        recomputeLinks: Patcher.OverrideExisting(next => function (...args: unknown[]): void {
          const isCanvas = this.file?.extension === 'canvas'

          // Trick the app into thinking that the file is a markdown file
          if (isCanvas) this.file.extension = 'md'

          try {
            return next.call(this, ...args)
          } finally {
            // Added by an LLM agent (P0-3): try/finally so the shared TFile
            // object is never left lied-about if next() throws or is async.
            if (isCanvas && this.file) this.file.extension = 'canvas'
          }
        }),
        recomputeUnlinked: Patcher.OverrideExisting(next => function (...args: unknown[]): void {
          const isCanvas = this.file?.extension === 'canvas'

          // Trick the app into thinking that the file is a markdown file
          if (isCanvas) this.file.extension = 'md'

          try {
            return next.call(this, ...args)
          } finally {
            // Added by an LLM agent (P0-3): see above.
            if (isCanvas && this.file) this.file.extension = 'canvas'
          }
        })
      })
    })
  }
}
