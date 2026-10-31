// Added by an LLM agent
import { Menu } from "obsidian"
import { BBox, Canvas, CanvasNode } from "src/@types/Canvas"
import BBoxHelper from "src/utils/bbox-helper"
import CanvasExtension from "./canvas-extension"

/**
 * Added by an LLM agent.
 *
 * "Increase spacing" submenu in the selection context menu (`canvas:selection-menu`, and
 * `canvas:node-menu` while the right-clicked node is part of the selection).
 *
 * The amount is a fixed number of canvas px (20/40/80/160/320) and the axis can be chosen
 * separately (horizontal / vertical / both). Nodes are grouped into columns (x axis) or
 * rows (y axis) by overlapping projections and every following column/row is shifted by
 * the amount, so every gap between adjacent columns/rows grows by exactly the amount while
 * nodes that are aligned (e.g. a vertical stack for horizontal spacing) stay put. All
 * shifts are re-centered on the original selection center.
 *
 * Group nodes count as a single node: a selected group and every node fully contained in
 * it (nested groups included) form one unit and move together by the same shift, so the
 * group's internal layout never changes. Nodes contained in a selected group are absorbed
 * by it even when they are also selected themselves.
 */

const SPACING_AMOUNTS = [20, 40, 80, 160, 320] as const
type SpacingAmount = typeof SPACING_AMOUNTS[number]
type SpacingAxis = 'horizontal' | 'vertical' | 'both'

interface SpacingUnit {
  nodes: CanvasNode[]
  bbox: BBox
}

interface SpacingShift {
  x: number
  y: number
}

const SPACING_AXIS_OPTIONS: { axis: SpacingAxis, label: string, icon: string }[] = [
  { axis: 'horizontal', label: 'Horizontal', icon: 'move-horizontal' },
  { axis: 'vertical', label: 'Vertical', icon: 'move-vertical' },
  { axis: 'both', label: 'Horizontal & vertical', icon: 'move-diagonal' }
]

export default class IncreaseNodeSpacingCanvasExtension extends CanvasExtension {
  isEnabled() { return 'increaseNodeSpacingFeatureEnabled' as const }

  init() {
    this.plugin.registerEvent(this.plugin.app.workspace.on(
      'canvas:selection-menu',
      (menu: Menu, canvas: Canvas) => this.addSpacingMenuItems(menu, this.getSelectedNodes(canvas))
    ))

    // Right-clicking one of several selected nodes opens the node menu; offer the same
    // action when the clicked node is part of the selection.
    this.plugin.registerEvent(this.plugin.app.workspace.on(
      'canvas:node-menu',
      (menu: Menu, node: CanvasNode) => {
        const selectedNodes = this.getSelectedNodes(node.canvas)
        if (!selectedNodes.includes(node)) return

        this.addSpacingMenuItems(menu, selectedNodes)
      }
    ))
  }

  private getSelectedNodes(canvas: Canvas): CanvasNode[] {
    return canvas.getSelectionData().nodes
      .map(nodeData => canvas.nodes.get(nodeData.id))
      .filter(node => node !== undefined) as CanvasNode[]
  }

  private addSpacingMenuItems(menu: Menu, selectedNodes: CanvasNode[]) {
    const canvas = selectedNodes[0]?.canvas
    if (!canvas || canvas.readonly) return

    const units = this.buildSpacingUnits(canvas, selectedNodes)
    if (units.length < 2) return

    menu.addSeparator()

    menu.addItem(item => {
      item.setTitle('Increase spacing')
        .setIcon('move-diagonal')

      // Added by an LLM agent: setSubmenu() exists at runtime but is missing from the
      // public typings (augmented in src/@types/Obsidian.d.ts)
      const directionMenu = item.setSubmenu()

      for (const option of SPACING_AXIS_OPTIONS) {
        directionMenu.addItem(directionItem => {
          directionItem.setTitle(option.label)
            .setIcon(option.icon)

          const amountMenu = directionItem.setSubmenu()
          for (const amount of SPACING_AMOUNTS) {
            amountMenu.addItem(amountItem => {
              amountItem.setTitle(`${amount} px`)
              amountItem.onClick(() => this.increaseSpacing(canvas, units, option.axis, amount))
            })
          }
        })
      }
    })

    menu.addSeparator()
  }

  /**
   * Builds the units the spacing operation works on: selected groups absorb every node
   * fully contained in them (largest group first, so an outer selected group absorbs a
   * nested selected one), the remaining selected nodes are single-node units.
   */
  private buildSpacingUnits(canvas: Canvas, selectedNodes: CanvasNode[]): SpacingUnit[] {
    const units: SpacingUnit[] = []
    const absorbed = new Set<CanvasNode>()

    const selectedGroups = selectedNodes
      .filter(node => node.getData().type === 'group')
      .sort((a, b) => b.width * b.height - a.width * a.height)

    const allNodes = [...canvas.nodes.values()]

    for (const group of selectedGroups) {
      if (absorbed.has(group)) continue

      const groupBBox = this.getNodeBBox(group)
      const unitNodes = [
        group,
        ...allNodes.filter(node =>
          node !== group &&
          !absorbed.has(node) &&
          BBoxHelper.insideBBox(this.getNodeBBox(node), groupBBox, true)
        )
      ]

      for (const node of unitNodes) absorbed.add(node)
      units.push({
        nodes: unitNodes,
        bbox: BBoxHelper.combineBBoxes(unitNodes.map(node => this.getNodeBBox(node)))
      })
    }

    for (const node of selectedNodes) {
      if (absorbed.has(node)) continue

      absorbed.add(node)
      units.push({ nodes: [node], bbox: this.getNodeBBox(node) })
    }

    return units
  }

  private increaseSpacing(canvas: Canvas, units: SpacingUnit[], axis: SpacingAxis, amount: SpacingAmount) {
    const shifts = new Map<SpacingUnit, SpacingShift>()
    for (const unit of units) shifts.set(unit, { x: 0, y: 0 })

    if (axis !== 'vertical') this.addAxisShifts(units, shifts, 'x', amount)
    if (axis !== 'horizontal') this.addAxisShifts(units, shifts, 'y', amount)

    this.centerShifts(units, shifts)

    if (![...shifts.values()].some(shift => shift.x !== 0 || shift.y !== 0)) return

    const movedNodes = new Set<CanvasNode>()
    for (const unit of units) {
      const shift = shifts.get(unit)!
      if (shift.x === 0 && shift.y === 0) continue

      for (const node of unit.nodes) {
        if (movedNodes.has(node)) continue

        movedNodes.add(node)
        node.moveTo({ x: node.x + shift.x, y: node.y + shift.y })
      }
    }

    // Single undo step for the whole multi-node operation (requestSave(false) must not push a second one)
    canvas.pushHistory(canvas.getData())
    canvas.requestSave(false)
  }

  /**
   * Shifts every column/row of units (units whose projections on the axis overlap belong
   * to the same column/row) by its index * amount, which increases every gap between
   * adjacent columns/rows by exactly `amount`.
   */
  private addAxisShifts(units: SpacingUnit[], shifts: Map<SpacingUnit, SpacingShift>, axis: 'x' | 'y', amount: number) {
    const intervals = units
      .map(unit => ({
        unit,
        min: axis === 'x' ? unit.bbox.minX : unit.bbox.minY,
        max: axis === 'x' ? unit.bbox.maxX : unit.bbox.maxY
      }))
      .sort((a, b) => a.min - b.min)

    let columnIndex = -1
    let columnMax = -Infinity

    for (const interval of intervals) {
      if (interval.min >= columnMax) {
        columnIndex++
        columnMax = interval.max
      } else {
        columnMax = Math.max(columnMax, interval.max)
      }

      shifts.get(interval.unit)![axis] += columnIndex * amount
    }
  }

  /** Offsets all shifts so the selection's bounding box center stays where it was. */
  private centerShifts(units: SpacingUnit[], shifts: Map<SpacingUnit, SpacingShift>) {
    const before = BBoxHelper.combineBBoxes(units.map(unit => unit.bbox))
    const after = BBoxHelper.combineBBoxes(units.map(unit => {
      const shift = shifts.get(unit)!
      return {
        minX: unit.bbox.minX + shift.x,
        minY: unit.bbox.minY + shift.y,
        maxX: unit.bbox.maxX + shift.x,
        maxY: unit.bbox.maxY + shift.y
      }
    }))

    const offsetX = ((before.minX + before.maxX) - (after.minX + after.maxX)) / 2
    const offsetY = ((before.minY + before.maxY) - (after.minY + after.maxY)) / 2

    if (offsetX === 0 && offsetY === 0) return

    for (const shift of shifts.values()) {
      shift.x += offsetX
      shift.y += offsetY
    }
  }

  private getNodeBBox(node: CanvasNode): BBox {
    return { minX: node.x, minY: node.y, maxX: node.x + node.width, maxY: node.y + node.height }
  }
}
