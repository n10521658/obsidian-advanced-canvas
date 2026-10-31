// Added by an LLM agent
import { Menu } from "obsidian"
import { Canvas, CanvasNode } from "src/@types/Canvas"
import CanvasExtension from "./canvas-extension"

/**
 * Added by an LLM agent.
 *
 * Hide node contents: a "Hide node contents" / "Show node contents" item in the node's
 * right-click context menu (`canvas:node-menu` / `canvas:selection-menu`). The state is
 * stored per node as `hideContents` in the canvas JSON (removed when shown again, to
 * keep the JSON clean) and rendered by toggling the `ac-node-contents-hidden` class on
 * the node element - the CSS (styles/hide-node-contents.scss) hides the content, the
 * zoomed-out placeholder and the label, leaving an empty node frame.
 * Group nodes are excluded (the menu item doesn't show up for them).
 */

export const HIDE_CONTENTS_CLASS = 'ac-node-contents-hidden'

export default class HideNodeContentsCanvasExtension extends CanvasExtension {
  isEnabled() { return 'hideNodeContentsFeatureEnabled' as const }

  init() {
    // Re-apply the hidden state right after Obsidian rendered the node (covers re-renders)
    this.plugin.registerEvent(this.plugin.app.workspace.on(
      'advanced-canvas:node-rendered',
      (_canvas: Canvas, node: CanvasNode) => this.updateNodeEl(node)
    ))

    // Initial pass when a canvas loads
    this.plugin.registerEvent(this.plugin.app.workspace.on(
      'advanced-canvas:data-loaded:after',
      (canvas: Canvas) => {
        for (const node of canvas.nodes.values()) this.updateNodeEl(node)
      }
    ))

    // Context menus
    this.plugin.registerEvent(this.plugin.app.workspace.on(
      'canvas:node-menu',
      (menu: Menu, node: CanvasNode) => this.addMenuItem(node.canvas, [node], menu)
    ))

    this.plugin.registerEvent(this.plugin.app.workspace.on(
      'canvas:selection-menu',
      (menu: Menu, canvas: Canvas) => this.addMenuItem(canvas, this.getSelectedNodes(canvas), menu)
    ))
  }

  private getSelectedNodes(canvas: Canvas): CanvasNode[] {
    return canvas.getSelectionData().nodes
      .map(nodeData => canvas.nodes.get(nodeData.id))
      .filter(node => node !== undefined) as CanvasNode[]
  }

  private addMenuItem(canvas: Canvas, nodes: CanvasNode[], menu: Menu) {
    if (canvas.readonly) return

    // Group nodes are not supported
    nodes = nodes.filter(node => node.getData().type !== 'group')
    if (nodes.length === 0) return

    const allHidden = nodes.every(node => node.getData().hideContents === true)
    menu.addItem(item => {
      item.setTitle(allHidden ? 'Show node contents' : 'Hide node contents')
      item.setIcon(allHidden ? 'eye' : 'eye-off')
      item.onClick(() => this.setContentsHidden(canvas, nodes, !allHidden))
    })
  }

  private setContentsHidden(canvas: Canvas, nodes: CanvasNode[], hidden: boolean) {
    for (const node of nodes) {
      node.setData({
        ...node.getData(),
        hideContents: hidden ? true : undefined // Keep the canvas JSON clean
      })
      this.updateNodeEl(node)
    }

    // Single undo step for multi-node operations (node-styles pattern)
    canvas.pushHistory(canvas.getData())
  }

  private updateNodeEl(node: CanvasNode) {
    node.nodeEl.classList.toggle(HIDE_CONTENTS_CLASS, node.getData().hideContents === true)
  }
}
