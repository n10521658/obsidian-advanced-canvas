// Added by an LLM agent
import { Menu } from "obsidian"
import { Canvas, CanvasNode } from "src/@types/Canvas"
import { DimensionModal } from "src/utils/modal-helper"
import CanvasExtension from "./canvas-extension"

/**
 * Added by an LLM agent.
 *
 * "Resize nodes…" in the selection context menu (`canvas:selection-menu`, and
 * `canvas:node-menu` while the right-clicked node is part of the selection). Opens a
 * width + height dialog and applies the entered size to every selected node except
 * group nodes (a group's box can not be resized by this feature). Node positions are
 * kept (the top-left corner stays in place).
 */

export default class ResizeNodesCanvasExtension extends CanvasExtension {
  isEnabled() { return 'resizeNodesFeatureEnabled' as const }

  init() {
    this.plugin.registerEvent(this.plugin.app.workspace.on(
      'canvas:selection-menu',
      (menu: Menu, canvas: Canvas) => this.addResizeMenuItem(menu, canvas, this.getSelectedNodes(canvas))
    ))

    // Right-clicking one of several selected nodes opens the node menu; offer the same
    // action when the clicked node is part of the selection.
    this.plugin.registerEvent(this.plugin.app.workspace.on(
      'canvas:node-menu',
      (menu: Menu, node: CanvasNode) => {
        const selectedNodes = this.getSelectedNodes(node.canvas)
        if (!selectedNodes.includes(node)) return

        this.addResizeMenuItem(menu, node.canvas, selectedNodes)
      }
    ))
  }

  private getSelectedNodes(canvas: Canvas): CanvasNode[] {
    return canvas.getSelectionData().nodes
      .map(nodeData => canvas.nodes.get(nodeData.id))
      .filter(node => node !== undefined) as CanvasNode[]
  }

  private addResizeMenuItem(menu: Menu, canvas: Canvas, selectedNodes: CanvasNode[]) {
    if (canvas.readonly) return

    // Group nodes are not supported
    const resizableNodes = selectedNodes.filter(node => node.getData().type !== 'group')
    if (resizableNodes.length === 0) return

    menu.addItem(item => {
      item.setTitle('Resize nodes…')
        .setIcon('scaling')
        .onClick(() => void this.resizeNodes(canvas, resizableNodes))
    })
  }

  private async resizeNodes(canvas: Canvas, nodes: CanvasNode[]) {
    const firstNodeData = nodes[0].getData()
    const size = await new DimensionModal(
      this.plugin.app,
      nodes.length === 1 ? 'Resize node' : `Resize ${nodes.length} nodes`,
      firstNodeData.width,
      firstNodeData.height
    ).awaitInput()

    if (!size) return

    let changed = false
    for (const node of nodes) {
      const nodeData = node.getData()
      if (nodeData.width === size.width && nodeData.height === size.height) continue

      changed = true
      node.setData({
        ...nodeData,
        width: size.width,
        height: size.height
      }, false)
    }

    if (!changed) return

    // Single undo step for the whole multi-node operation (requestSave(false) must not push a second one)
    canvas.pushHistory(canvas.getData())
    canvas.requestSave(false)
  }
}
