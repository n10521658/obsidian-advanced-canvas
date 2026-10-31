import PropertiesView from "src/@types/PropertiesPlugin"
import Patcher from "./patcher"
import { TFile } from "obsidian"

export default class PropertiesPatcher extends Patcher {
  protected async patch() {
    if (!this.plugin.settings.getSetting('canvasMetadataCompatibilityEnabled')) return
    if (!this.plugin.app.viewRegistry.viewByType["file-properties"]) return // Core plugin not enabled

    await Patcher.waitForViewRequest<PropertiesView>(this.plugin, "file-properties", view => {
      Patcher.patchPrototype<PropertiesView>(this.plugin, view, {
        isSupportedFile: Patcher.OverrideExisting(next => function (file?: TFile): boolean {
          // Check if the file is a canvas file
          if (file?.extension === 'canvas') return true

          // Otherwise, call the original method
          return next.call(this, file)
        }),
        updateFrontmatter: Patcher.OverrideExisting(next => function (file: TFile, content: string): { [key: string]: unknown } | null {
          // Check if the file is a canvas file
          if (file?.extension === 'canvas') {
            let frontmatter

            try { frontmatter = JSON.parse(content)?.metadata?.frontmatter ?? {} }
            catch { frontmatter = {} }

            this.rawFrontmatter = JSON.stringify(frontmatter, null, 2)
            this.frontmatter = frontmatter

            return frontmatter
          }

          // Otherwise, call the original method
          return next.call(this, file, content)
        }),
        saveFrontmatter: Patcher.OverrideExisting(next => function (frontmatter: { [key: string]: unknown }): void {
          // Check if the file is a canvas file
          if (this.file?.extension === 'canvas') {
            if (this.file !== this.modifyingFile) return

            // Added by an LLM agent (P0-6): don't fire-and-forget vault.process;
            // guard corrupt JSON and log the real error instead of swallowing it.
            void (async () => {
              try {
                await this.app.vault.process(this.file, (data: string) => {
                  let content: { metadata?: { frontmatter?: unknown } }
                  try { content = JSON.parse(data) }
                  catch (e) {
                    console.error('Advanced Canvas: cannot save frontmatter, canvas file is not valid JSON:', this.file.path, e)
                    return data
                  }
                  if (!content?.metadata) {
                    console.error('Advanced Canvas: cannot save frontmatter, canvas file has no metadata section:', this.file.path)
                    return data
                  }
                  content.metadata.frontmatter = frontmatter
                  return JSON.stringify(content, null, 2)
                })
              } catch (e) {
                console.error('Advanced Canvas: failed to save frontmatter in canvas file:', this.file?.path, e)
              }
            })()

            return
          }

          // Otherwise, call the original method
          return next.call(this, frontmatter)
        })
      })
    })
  }
}
