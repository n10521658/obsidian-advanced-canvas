import { ItemView, Notice, Plugin, requireApiVersion } from 'obsidian'
import { Canvas, CanvasView } from './@types/Canvas'

// Utils
import IconsHelper from './utils/icons-helper'
import DebugHelper from './utils/debug-helper'

// Managers
import SettingsManager from './settings'
import WindowsManager from './managers/windows-manager'

// Patchers
import Patcher from './patchers/patcher'
import CanvasPatcher from './patchers/canvas-patcher'
import LinkSuggestionsPatcher from './patchers/link-suggestions-patcher'
import EmbedPatcher from './patchers/embed-patcher'
import MetadataCachePatcher from './patchers/metadata-cache-patcher'
import BacklinksPatcher from './patchers/backlinks-patcher'
import OutgoingLinksPatcher from './patchers/outgoing-links-patcher'
import FileManagerPatcher from './patchers/file-manager-patcher'
import PropertiesPatcher from './patchers/properties-patcher'
import SearchPatcher from './patchers/search-patcher'
import SearchCommandPatcher from './patchers/search-command-patcher'
import DotMdFileSearchPatcher from './patchers/dot-md-file-search-patcher' // Added by an LLM agent

// Canvas Extensions
import CanvasExtension from './canvas-extensions/canvas-extension'
import MetadataCanvasExtension from './canvas-extensions/metadata-canvas-extension'
import NodeRatioCanvasExtension from './canvas-extensions/node-ratio-canvas-extension'
import VariableBreakpointCanvasExtension from './canvas-extensions/variable-breakpoint-canvas-extension'
import GroupCanvasExtension from './canvas-extensions/group-canvas-extension'
import GroupLabelWrapCanvasExtension from './canvas-extensions/group-label-wrap-canvas-extension' // Added by an LLM agent
import GroupLabelVisibilityCanvasExtension from './canvas-extensions/group-label-visibility-canvas-extension' // Added by an LLM agent
import NoteLabelVisibilityCanvasExtension from './canvas-extensions/note-label-visibility-canvas-extension' // Added by an LLM agent
import DefaultStyleSizesCanvasExtension from './canvas-extensions/default-style-sizes-canvas-extension' // Added by an LLM agent
import NodeOutlineCanvasExtension from './canvas-extensions/node-outline-canvas-extension' // Added by an LLM agent
import EdgeOutlineCanvasExtension from './canvas-extensions/edge-outline-canvas-extension' // Added by an LLM agent
import NodeTemplatesCanvasExtension from './canvas-extensions/node-templates-canvas-extension'
import PresentationCanvasExtension from './canvas-extensions/presentation-canvas-extension'
import ZOrderingCanvasExtension from './canvas-extensions/z-ordering-canvas-extension'
import BetterReadonlyCanvasExtension from './canvas-extensions/better-readonly-canvas-extension'
import EncapsulateCanvasExtension from './canvas-extensions/encapsulate-canvas-extension'
import CommandsCanvasExtension from './canvas-extensions/commands-canvas-extension'
import AutoResizeNodeCanvasExtension from './canvas-extensions/auto-resize-node-canvas-extension'
import PortalsCanvasExtension from './canvas-extensions/portals-canvas-extension'
import FrontmatterControlButtonCanvasExtension from './canvas-extensions/frontmatter-control-button-canvas-extension'
import BetterDefaultSettingsCanvasExtension from './canvas-extensions/better-default-settings-canvas-extension'
import ColorPaletteCanvasExtension from './canvas-extensions/color-palette-canvas-extension'
import CollapsibleGroupsCanvasExtension from './canvas-extensions/collapsible-groups-canvas-extension'
import FocusModeCanvasExtension from './canvas-extensions/focus-mode-canvas-extension'
import CanvasFilterCanvasExtension from './canvas-extensions/canvas-filter-canvas-extension' // Added by an LLM agent
import AutoFileNodeEdgesCanvasExtension from './canvas-extensions/auto-file-node-edges-canvas-extension'
import FlipEdgeCanvasExtension from './canvas-extensions/flip-edge-canvas-extension'
import EdgeSelectionCanvasExtension from './canvas-extensions/edge-selection-canvas-extension'
import ExportCanvasExtension from './canvas-extensions/export-canvas-extension'
import FloatingEdgeCanvasExtension from './canvas-extensions/floating-edge-canvas-extension'
import EdgeHighlightCanvasExtension from './canvas-extensions/edge-highlight-canvas-extension'
import EdgeLabelMarkdownCanvasExtension from './canvas-extensions/edge-label-markdown-canvas-extension' // Added by an LLM agent
import EdgeArrowBaseCanvasExtension from './canvas-extensions/edge-arrow-base-canvas-extension' // Added by an LLM agent
import BezierCurvatureCanvasExtension from './canvas-extensions/bezier-curvature-canvas-extension' // Added by an LLM agent
import CopyNodeReferenceCanvasExtension from './canvas-extensions/copy-node-reference-canvas-extension'
import ReadingModeFixCanvasExtension from './canvas-extensions/reading-mode-fix-canvas-extension'
import RotateNodeCanvasExtension from './canvas-extensions/rotate-node-canvas-extension' // Added by an LLM agent
import HideNodeContentsCanvasExtension from './canvas-extensions/hide-node-contents-canvas-extension' // Added by an LLM agent
import TextWrapAroundCanvasExtension from './canvas-extensions/text-wrap-around-canvas-extension' // Added by an LLM agent
import PresentationFilterCanvasExtension from './canvas-extensions/presentation-filter-canvas-extension' // Added by an LLM agent
import IncreaseNodeSpacingCanvasExtension from './canvas-extensions/increase-node-spacing-canvas-extension' // Added by an LLM agent
import ResizeNodesCanvasExtension from './canvas-extensions/resize-nodes-canvas-extension' // Added by an LLM agent

// Advanced Styles
import NodeStylesExtension from './canvas-extensions/advanced-styles/node-styles'
import EdgeStylesExtension from './canvas-extensions/advanced-styles/edge-styles'

// Dataset Exposers
import CanvasMetadataExposerExtension from './canvas-extensions/dataset-exposers/canvas-metadata-exposer'
import NodeInteractionExposerExtension from './canvas-extensions/dataset-exposers/node-interaction-exposer'
import NodeExposerExtension from './canvas-extensions/dataset-exposers/node-exposer'
import EdgeExposerExtension from './canvas-extensions/dataset-exposers/edge-exposer'
import CanvasWrapperExposerExtension from './canvas-extensions/dataset-exposers/canvas-wrapper-exposer'
import BasesTableViewPatcher from './patchers/bases-table-view-patcher'

const PATCHERS = [
  // Core canvas patchers
  CanvasPatcher,
  SearchCommandPatcher,
  DotMdFileSearchPatcher, // Added by an LLM agent

  // Core metadata patchers
  MetadataCachePatcher,
  FileManagerPatcher,

  // Direct metadata dependant patchers
  PropertiesPatcher,
  // Added by an LLM agent (P2-15): no `false` holes - filter version-gated
  // patchers at load time so this.patchers has no undefined entries.
  ...(!requireApiVersion("1.12.0") ? [BacklinksPatcher] : []),
  OutgoingLinksPatcher,

  // Metadata dependant patchers
  ...(requireApiVersion("1.9.0") ? [BasesTableViewPatcher] : []),
  LinkSuggestionsPatcher,
  EmbedPatcher,
  SearchPatcher,
]

const CANVAS_EXTENSIONS: typeof CanvasExtension[] = [
  // Advanced JSON Canvas Extensions
  MetadataCanvasExtension,
  NodeStylesExtension,
  EdgeStylesExtension,
  NodeRatioCanvasExtension,
  FloatingEdgeCanvasExtension,
  AutoResizeNodeCanvasExtension,
  CollapsibleGroupsCanvasExtension,
  ColorPaletteCanvasExtension,
  PresentationCanvasExtension,
  PortalsCanvasExtension,

  // UI Extensions (Non-savable data)
  CanvasMetadataExposerExtension,
  CanvasWrapperExposerExtension,
  NodeExposerExtension,
  EdgeExposerExtension,
  NodeInteractionExposerExtension,

  FrontmatterControlButtonCanvasExtension,
  BetterDefaultSettingsCanvasExtension,
  CommandsCanvasExtension,
  BetterReadonlyCanvasExtension,
  ReadingModeFixCanvasExtension,
  GroupCanvasExtension,
  GroupLabelWrapCanvasExtension, // Added by an LLM agent
  GroupLabelVisibilityCanvasExtension, // Added by an LLM agent
  NoteLabelVisibilityCanvasExtension, // Added by an LLM agent
  DefaultStyleSizesCanvasExtension, // Added by an LLM agent
  NodeOutlineCanvasExtension, // Added by an LLM agent
  EdgeOutlineCanvasExtension, // Added by an LLM agent
  NodeTemplatesCanvasExtension,
  VariableBreakpointCanvasExtension,
  EdgeHighlightCanvasExtension,
  EdgeLabelMarkdownCanvasExtension, // Added by an LLM agent
  // Added by an LLM agent (P2-14): ordering is a declared dependency, not tribal
  // knowledge. EdgeArrowBase measures the final path produced by EdgeStyles, and
  // BezierCurvature scales EdgeArrowBase's control points - keep this order and
  // see getExtensionOrderDependencies() below for the machine-checked version.
  EdgeArrowBaseCanvasExtension, // Added by an LLM agent
  BezierCurvatureCanvasExtension, // Added by an LLM agent
  AutoFileNodeEdgesCanvasExtension,
  FlipEdgeCanvasExtension,
  ZOrderingCanvasExtension,
  ExportCanvasExtension,
  FocusModeCanvasExtension,
  CanvasFilterCanvasExtension, // Added by an LLM agent
  EncapsulateCanvasExtension,
  EdgeSelectionCanvasExtension,
  CopyNodeReferenceCanvasExtension,
  RotateNodeCanvasExtension, // Added by an LLM agent
  HideNodeContentsCanvasExtension, // Added by an LLM agent
  TextWrapAroundCanvasExtension, // Added by an LLM agent
  PresentationFilterCanvasExtension, // Added by an LLM agent
  IncreaseNodeSpacingCanvasExtension, // Added by an LLM agent
  ResizeNodesCanvasExtension // Added by an LLM agent
]

export default class AdvancedCanvasPlugin extends Plugin {
  debugHelper: DebugHelper

  settings: SettingsManager
  windowsManager: WindowsManager

  patchers: Patcher[]
  canvasExtensions: CanvasExtension[]

  async onload() {
    IconsHelper.addIcons()

    this.settings = new SettingsManager(this)
    await this.settings.loadSettings()
    this.settings.addSettingsTab()

    this.windowsManager = new WindowsManager(this)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Just use any to avoid type issues
    this.patchers = PATCHERS.map((Patcher: any) => {
      try { return new Patcher(this) }
      catch (e) {
        // Added by an LLM agent (P2-16): fail LOUDLY when an Obsidian private
        // disappears (OverrideExisting throws). The old code console.error'd and
        // limped on half-patched; now the user gets a Notice naming the patcher.
        console.error(`Error initializing patcher ${Patcher?.name}:`, e)
        try { new Notice(`Advanced Canvas: ${Patcher?.name} failed to patch (Obsidian API changed?). See console.`) }
        catch { /* Notices unavailable in tests */ }
        return undefined
      }
    }).filter((p): p is Patcher => !!p)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Just use any to avoid type issues
    this.canvasExtensions = CANVAS_EXTENSIONS.map((Extension: any) => {
      try { return new Extension(this) }
      catch (e) {
        console.error(`Error initializing ac-extension ${Extension?.name}:`, e)
        return undefined
      }
    }).filter((e): e is CanvasExtension => !!e)
    this.assertExtensionOrder()
  }

  onunload() {
    // Added by an LLM agent (P0/P2): give extensions a chance to release
    // observers/timers. Core plugin.register uninstallers still run after this.
    for (const extension of this.canvasExtensions ?? []) {
      try { extension.dispose() } catch (e) { console.error(`Error disposing extension ${extension?.constructor?.name}:`, e) }
    }
    this.canvasExtensions = []
    this.patchers = []
  }

  getCanvases(): Canvas[] {
    return this.app.workspace.getLeavesOfType('canvas')
      .map(leaf => (leaf.view as CanvasView)?.canvas)
      .filter(canvas => canvas)
  }

  // Added by an LLM agent (P2-14): machine-checked declaration of the
  // order-sensitive extension pairs. onload asserts this after constructing
  // extensions so a future reorder fails loudly instead of silently changing
  // global event order.
  assertExtensionOrder() {
    const order = (this.canvasExtensions ?? []).map(e => e.constructor.name)
    const mustComeAfter: Array<[string, string]> = [
      ['EdgeArrowBaseCanvasExtension', 'EdgeStylesExtension'],
      ['BezierCurvatureCanvasExtension', 'EdgeArrowBaseCanvasExtension'],
    ]
    for (const [later, earlier] of mustComeAfter) {
      const laterIdx = order.indexOf(later)
      const earlierIdx = order.indexOf(earlier)
      if (laterIdx !== -1 && earlierIdx !== -1 && laterIdx < earlierIdx)
        console.error(`Advanced Canvas: ${later} must be constructed after ${earlier} (see CANVAS_EXTENSIONS order).`)
    }
  }

  getCurrentCanvasView(): CanvasView | null {
    const canvasView = this.app.workspace.getActiveViewOfType(ItemView)
    if (canvasView?.getViewType() !== 'canvas') return null
    return canvasView as CanvasView
  }

  getCurrentCanvas(): Canvas | null {
    return this.getCurrentCanvasView()?.canvas || null
  }

  createFileSnapshot(path: string, content: string) {
    const fileRecoveryPlugin = this.app.internalPlugins.plugins['file-recovery']?.instance
    if (!fileRecoveryPlugin) return

    fileRecoveryPlugin.forceAdd(path, content)
  }

  // this.app.plugins.plugins["advanced-canvas"].enableDebugMode()
  enableDebugMode() {
    if (this.debugHelper) return
    this.debugHelper = new DebugHelper(this)
  }
}
