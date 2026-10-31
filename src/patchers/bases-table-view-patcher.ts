import { BasesPlugin, BasesTableCell, BasesTableCellContext, BasesTableRow, BasesTableView, BasesViewRegistrationEntry } from "src/@types/BasesPlugin"
import Patcher from "./patcher"

export default class BasesTableViewPatcher extends Patcher {
  protected async patch() {
    if (!this.plugin.settings.getSetting('canvasMetadataCompatibilityEnabled')) return

    const bases: BasesPlugin = this.plugin.app.internalPlugins.getEnabledPluginById("bases")
    if (!bases) return // Core plugin not enabled

    void this.patchViewFactory(bases)
  }

  private async patchViewFactory(bases: BasesPlugin) {
    const that = this // eslint-disable-line @typescript-eslint/no-this-alias -- For patcher

    await Patcher.patchOnce<BasesViewRegistrationEntry<BasesTableView>, BasesTableView>(this.plugin, bases.registrations.table, resolve => ({
      factory: Patcher.OverrideExisting(next => function (...args: unknown[]): BasesTableView {
        const view = next.call(this, ...args)

        void that.patchTableView(view)
        resolve(view)

        return view
      })
    }))
  }

  private async patchTableView(basesView: BasesTableView) {
    const that = this // eslint-disable-line @typescript-eslint/no-this-alias -- For patcher

    await Patcher.patchOnce<BasesTableView, BasesTableRow>(this.plugin, basesView, resolve => ({
      updateVirtualDisplay: Patcher.OverrideExisting(next => function (...args: unknown[]): void {
        const result = next.call(this, ...args)

        if (this.rows.length > 0) {
          const row = this.rows.first()!

          void that.patchTableRow(row)
          resolve(row)
        }

        return result
      })
    }))
  }

  private async patchTableRow(row: BasesTableRow) {
    const that = this // eslint-disable-line @typescript-eslint/no-this-alias -- For patcher

    await Patcher.patchOnce<BasesTableRow, BasesTableCell>(this.plugin, row, resolve => ({
      render: Patcher.OverrideExisting(next => function (...args: unknown[]): void {
        // Added by an LLM agent (P0): single next() call per render. The old
        // code called next() twice per table render (once to discover the cell,
        // once to "re-render" it), doubling table render cost.
        const result = next.call(this, ...args)

        if (this.cells.length > 0) {
          const cell = this.cells.first()!

          void that.patchTableCell(cell)
          resolve(cell)
        }

        return result
      })
    }))
  }

  private async patchTableCell(cell: BasesTableCell) {
    Patcher.patchPrototype<BasesTableCell>(this.plugin, cell, {
      render: Patcher.OverrideExisting(next => function (ctx: BasesTableCellContext): void {
        const isCanvas = ctx.file?.extension === "canvas"
        if (isCanvas) ctx.file.extension = "md"

        try {
          return next.call(this, ctx)
        } finally {
          // Added by an LLM agent (P0-3): try/finally so the shared TFile is
          // never left lied-about if next() throws.
          if (isCanvas && ctx.file) ctx.file.extension = "canvas"
        }
      })
    })
  }
}
