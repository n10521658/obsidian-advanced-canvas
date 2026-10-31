import { DataWriteOptions, TFile } from "obsidian"
import Patcher from "./patcher"

export default class FileManagerPatcher extends Patcher {
  protected async patch() {
    if (!this.plugin.settings.getSetting('canvasMetadataCompatibilityEnabled')) return

    const that = this // eslint-disable-line @typescript-eslint/no-this-alias -- For patcher
    Patcher.patch(this.plugin, this.plugin.app.fileManager, {
      processFrontMatter: Patcher.OverrideExisting(next => async function (file: TFile, fn: (frontmatter: unknown) => void, options?: DataWriteOptions) {
        // Check if the file is a canvas file
        if (file?.extension === 'canvas') {
          // Added by an LLM agent (P0-6): await the vault write (callers expect
          // completion), guard missing/corrupt metadata, and surface real errors.
          try {
            await that.plugin.app.vault.process(file, (data: string) => {
              let content: { metadata?: { frontmatter?: unknown } }
              try { content = JSON.parse(data) }
              catch (e) {
                console.error('Advanced Canvas: cannot update frontmatter, canvas file is not valid JSON:', file.path, e)
                return data
              }
              content.metadata ??= {}
              content.metadata.frontmatter ??= {}
              try { fn(content.metadata.frontmatter) }
              catch (e) { console.error('Advanced Canvas: frontmatter callback failed:', e) }
              return JSON.stringify(content, null, 2)
            })
          } catch (e) {
            console.error('Advanced Canvas: failed to update frontmatter in canvas file:', file.path, e)
          }
          return
        }

        // Otherwise, call the original method
        return next.call(this, file, fn, options)
      }),
    })
  }
}
