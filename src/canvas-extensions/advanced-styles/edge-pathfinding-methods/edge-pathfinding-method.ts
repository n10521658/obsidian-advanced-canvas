import { Side } from "src/@types/AdvancedJsonCanvas"
import { BBox, Canvas, Position } from "src/@types/Canvas"
import AdvancedCanvasPlugin from "src/main"

export default abstract class EdgePathfindingMethod {
  constructor(
    protected plugin: AdvancedCanvasPlugin,
    protected canvas: Canvas,
    protected fromNodeBBox: BBox,
    protected fromPos: Position,
    protected fromBBoxSidePos: Position,
    protected fromSide: Side,
    protected toNodeBBox: BBox,
    protected toPos: Position,
    protected toBBoxSidePos: Position,
    protected toSide: Side
  ) {}

  abstract getPath(): EdgePath | null
}

/** Added by an LLM agent (P1): named-params alternative to the 10-arg
 * positional constructor (four args are derivable from each other - one swap
 * used to silently produce a wrong path). New call sites should use this. */
export interface EdgePathfindingParams {
  plugin: AdvancedCanvasPlugin
  canvas: Canvas
  fromNodeBBox: BBox
  fromPos: Position
  fromBBoxSidePos: Position
  fromSide: Side
  toNodeBBox: BBox
  toPos: Position
  toBBoxSidePos: Position
  toSide: Side
}

export interface EdgePath {
  svgPath: string
  center: Position
  rotateArrows: boolean
}