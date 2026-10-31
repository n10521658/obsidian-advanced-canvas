import { CanvasFileNodeData } from "src/@types/AdvancedJsonCanvas"
import { BBox, Position } from "src/@types/Canvas"
import BBoxHelper from "src/utils/bbox-helper"
import CanvasHelper from "src/utils/canvas-helper"
import SvgPathHelper from "src/utils/svg-path-helper"
import EdgePathfindingMethod, { EdgePath } from "./edge-pathfinding-method"

// Added by an LLM agent (P1-9): shared per-frame time budget across edges.
// The old code allowed MAX_MS_CALCULATION (100ms) *per edge*, so 20 A* edges
// could freeze the main thread for up to 2s. Now all edges share one budget
// per animation frame.
const MAX_MS_PER_EDGE = 100
let sharedBudgetResetFrame = 0
let sharedBudgetSpentMs = 0

const BASIC_DIRECTIONS = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
] as const
const DIAGONAL_DIRECTIONS = [
  { dx: 1, dy: 1 },
  { dx: -1, dy: 1 },
  { dx: 1, dy: -1 },
  { dx: -1, dy: -1 },
] as const
const DIAGONAL_COST = Math.sqrt(2)

const ROUND_PATH_RADIUS = 5
const SMOOTHEN_PATH_TENSION = 0.2
const MAX_EXPANSIONS = 20000

class AStarNode {
  fCost = 0
  gCost = 0
  hCost = 0
  parent: AStarNode | null = null
  heapIndex = -1

  constructor(
    public x: number,
    public y: number
  ) {}

  key(): string {
    return `${this.x},${this.y}`
  }
}

/** Minimal binary min-heap keyed on fCost (P1-9: replaces the linear min-scan). */
class MinHeap {
  private items: AStarNode[] = []

  get size(): number {
    return this.items.length
  }

  push(node: AStarNode) {
    node.heapIndex = this.items.length
    this.items.push(node)
    this.bubbleUp(node.heapIndex)
  }

  pop(): AStarNode | undefined {
    if (this.items.length === 0) return undefined
    const top = this.items[0]
    const last = this.items.pop()!
    if (this.items.length > 0) {
      this.items[0] = last
      last.heapIndex = 0
      this.bubbleDown(0)
    }
    top.heapIndex = -1
    return top
  }

  update(node: AStarNode) {
    this.bubbleUp(node.heapIndex)
  }

  private bubbleUp(index: number) {
    while (index > 0) {
      const parent = (index - 1) >> 1
      if (this.items[index].fCost >= this.items[parent].fCost) break
      this.swap(index, parent)
      index = parent
    }
  }

  private bubbleDown(index: number) {
    const length = this.items.length
    for (;;) {
      const left = index * 2 + 1
      const right = left + 1
      let smallest = index
      if (left < length && this.items[left].fCost < this.items[smallest].fCost) smallest = left
      if (right < length && this.items[right].fCost < this.items[smallest].fCost) smallest = right
      if (smallest === index) break
      this.swap(index, smallest)
      index = smallest
    }
  }

  private swap(a: number, b: number) {
    const tmp = this.items[a]
    this.items[a] = this.items[b]
    this.items[b] = tmp
    this.items[a].heapIndex = a
    this.items[b].heapIndex = b
  }
}

/** Uniform-grid spatial index over obstacle bboxes (P1-9: replaces obstacles.some() per cell). */
class ObstacleGrid {
  private cellSize: number
  private cells = new Map<string, BBox[]>()

  constructor(obstacles: BBox[], cellSize: number) {
    this.cellSize = Math.max(cellSize, 1)
    for (const obstacle of obstacles) {
      const minCellX = Math.floor(obstacle.minX / this.cellSize)
      const maxCellX = Math.floor(obstacle.maxX / this.cellSize)
      const minCellY = Math.floor(obstacle.minY / this.cellSize)
      const maxCellY = Math.floor(obstacle.maxY / this.cellSize)
      for (let cx = minCellX; cx <= maxCellX; cx++) {
        for (let cy = minCellY; cy <= maxCellY; cy++) {
          const key = `${cx},${cy}`
          let list = this.cells.get(key)
          if (!list) { list = []; this.cells.set(key, list) }
          list.push(obstacle)
        }
      }
    }
  }

  candidates(x: number, y: number): BBox[] {
    return this.cells.get(`${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`) ?? []
  }
}

export default class EdgePathfindingAStar extends EdgePathfindingMethod {
  getPath(): EdgePath | null {
    const nodeBBoxes = [...this.canvas.nodes.values()]
      .filter(node => {
        const nodeData = node.getData()

        if ((nodeData as CanvasFileNodeData).portal === true) return false // Exclude open portals

        // Exclude (group) nodes that contain either the start or end position
        const nodeBBox = node.getBBox()
        const nodeContainsFromPos = BBoxHelper.insideBBox(this.fromPos, nodeBBox, true)
        const nodeContainsToPos = BBoxHelper.insideBBox(this.toPos, nodeBBox, true)

        return !nodeContainsFromPos && !nodeContainsToPos
      }).map(node => node.getBBox())

    const fromPosWithMargin = BBoxHelper.moveInDirection(this.fromPos, this.fromSide, 10)
    const toPosWithMargin = BBoxHelper.moveInDirection(this.toPos, this.toSide, 10)

    const allowDiagonal = this.plugin.settings.getSetting('edgeStylePathfinderAllowDiagonal')
    // Added by an LLM agent (P1): single grid truth - the configured gridSize
    // setting, not the dead CanvasHelper.GRID_SIZE constant.
    const gridSize = this.plugin.settings.getSetting('gridSize') ?? CanvasHelper.GRID_SIZE
    const pathArray = this.aStarAlgorithm(fromPosWithMargin, toPosWithMargin, nodeBBoxes, gridSize / 2, allowDiagonal)
    if (!pathArray) return null // No path found - use default path

    // Make connection points to the node removing the margin
    pathArray.splice(0, 0, this.fromPos)
    pathArray.splice(pathArray.length, 0, this.toPos)

    // Smoothen path
    let svgPath: string
    const roundPath = this.plugin.settings.getSetting('edgeStylePathfinderPathRounded')
    if (roundPath) {
      if (allowDiagonal)
        svgPath = SvgPathHelper.pathArrayToSvgPath(SvgPathHelper.smoothenPathArray(pathArray, SMOOTHEN_PATH_TENSION))
      else
        svgPath = SvgPathHelper.pathArrayToRoundedSvgPath(pathArray, ROUND_PATH_RADIUS)
    } else svgPath = SvgPathHelper.pathArrayToSvgPath(pathArray)

    return {
      svgPath: svgPath,
      center: pathArray[Math.floor(pathArray.length / 2)],
      rotateArrows: false
    }
  }

  private claimBudget(): number {
    // Shared per-frame budget: each edge gets at most MAX_MS_PER_EDGE and the
    // frame as a whole never spends more than MAX_MS_PER_EDGE total on A*.
    // (rAF timestamp via performance.now frame bucket.)
    const frame = Math.floor(performance.now() / 16)
    if (frame !== sharedBudgetResetFrame) {
      sharedBudgetResetFrame = frame
      sharedBudgetSpentMs = 0
    }
    return Math.max(0, MAX_MS_PER_EDGE - sharedBudgetSpentMs)
  }

  private aStarAlgorithm(fromPos: Position, toPos: Position, obstacles: BBox[], gridResolution: number, allowDiagonal: boolean): Position[] | null {
    const start: AStarNode = new AStarNode(
      Math.floor(fromPos.x / gridResolution) * gridResolution,
      Math.floor(fromPos.y / gridResolution) * gridResolution
    )
    // Round start and end positions to the nearest grid cell outside of the nodes to connect
    if (this.fromSide === 'right' && fromPos.x !== start.x) start.x += gridResolution
    if (this.fromSide === 'bottom' && fromPos.y !== start.y) start.y += gridResolution

    const end: AStarNode = new AStarNode(
      Math.floor(toPos.x / gridResolution) * gridResolution,
      Math.floor(toPos.y / gridResolution) * gridResolution
    )
    // Round start and end positions to the nearest grid cell outside of the nodes to connect
    if (this.toSide === 'right' && toPos.x !== end.x) end.x += gridResolution
    if (this.toSide === 'bottom' && toPos.y !== end.y) end.y += gridResolution

    const obstacleGrid = new ObstacleGrid(obstacles, gridResolution * 8)

    // Check if start and end positions are valid
    if (this.isInsideObstacle(start, obstacleGrid) || this.isInsideObstacle(end, obstacleGrid)) return null

    const openHeap = new MinHeap()
    const openByKey = new Map<string, AStarNode>()
    const closedSet = new Set<string>()

    start.hCost = this.heuristic(start, end, allowDiagonal)
    start.fCost = start.hCost
    openHeap.push(start)
    openByKey.set(start.key(), start)

    const budgetMs = this.claimBudget()
    if (budgetMs <= 0) return null
    const startTimestamp = performance.now()
    let expansions = 0

    const availableDirections = allowDiagonal ? [...BASIC_DIRECTIONS, ...DIAGONAL_DIRECTIONS] : BASIC_DIRECTIONS

    while (openHeap.size > 0) {
      const current = openHeap.pop()!
      openByKey.delete(current.key())
      if (closedSet.has(current.key())) continue
      closedSet.add(current.key())

      // Check if we have reached the end
      if (current.x === end.x && current.y === end.y)
        return [fromPos, ...this.reconstructPath(current), toPos].map(node => ({ x: node.x, y: node.y }))

      if (++expansions > MAX_EXPANSIONS) return null
      if ((expansions & 63) === 0 && performance.now() - startTimestamp > budgetMs) {
        sharedBudgetSpentMs += performance.now() - startTimestamp
        return null
      }

      // Location is not start or end, all touching positions are invalid
      if (!(current.x === start.x && current.y === start.y) && this.isTouchingObstacle(current, obstacleGrid))
        continue

      // Expand neighbors (no per-neighbor allocation of direction arrays)
      for (const direction of availableDirections) {
        const nx = current.x + direction.dx * gridResolution
        const ny = current.y + direction.dy * gridResolution
        const key = `${nx},${ny}`
        if (closedSet.has(key)) continue
        if (this.isInsideObstacleXY(nx, ny, obstacleGrid)) continue

        const stepCost = direction.dx !== 0 && direction.dy !== 0 ? DIAGONAL_COST : 1
        const tentativeGCost = current.gCost + stepCost

        const existing = openByKey.get(key)
        if (existing) {
          if (tentativeGCost >= existing.gCost) continue
          existing.parent = current
          existing.gCost = tentativeGCost
          existing.fCost = tentativeGCost + existing.hCost
          openHeap.update(existing)
        } else {
          const neighbor = new AStarNode(nx, ny)
          neighbor.parent = current
          neighbor.gCost = tentativeGCost
          neighbor.hCost = this.heuristic(neighbor, end, allowDiagonal)
          neighbor.fCost = neighbor.gCost + neighbor.hCost
          openHeap.push(neighbor)
          openByKey.set(key, neighbor)
        }
      }
    }

    // No path found
    return null
  }

  // Added by an LLM agent (P1-9): octile distance when diagonal moves are
  // allowed (admissible for 8-directional grids); Manhattan otherwise. The old
  // Manhattan-with-diagonal-costs heuristic was inadmissible and over-expanded.
  private heuristic(node: AStarNode, end: AStarNode, allowDiagonal: boolean): number {
    const dx = Math.abs(node.x - end.x)
    const dy = Math.abs(node.y - end.y)
    if (!allowDiagonal) return dx + dy
    return Math.max(dx, dy) + (DIAGONAL_COST - 1) * Math.min(dx, dy)
  }

  // Define a function to check if a position isn't inside any obstacle
  private isTouchingObstacle(node: Position, obstacles: ObstacleGrid): boolean {
    return obstacles.candidates(node.x, node.y).some(obstacle => BBoxHelper.insideBBox(node, obstacle, true))
  }

  private isInsideObstacle(node: Position, obstacles: ObstacleGrid): boolean {
    return obstacles.candidates(node.x, node.y).some(obstacle => BBoxHelper.insideBBox(node, obstacle, false))
  }

  private isInsideObstacleXY(x: number, y: number, obstacles: ObstacleGrid): boolean {
    const pos = { x, y }
    return obstacles.candidates(x, y).some(obstacle => BBoxHelper.insideBBox(pos, obstacle, false))
  }

  private reconstructPath(node: AStarNode | null): AStarNode[] {
    const path: AStarNode[] = []

    while (node) {
      path.push(node)
      node = node.parent
    }

    return path.reverse()
  }
}
