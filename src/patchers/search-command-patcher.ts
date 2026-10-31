import { CanvasView } from "src/@types/Canvas"
import Patcher from "./patcher"
import { setIcon } from "obsidian"
import { CanvasGroupNodeData, CanvasTextNodeData } from "src/@types/AdvancedJsonCanvas"

// Added by an LLM agent (P0-5): escape user input so it is matched literally.
function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export default class SearchCommandPatcher extends Patcher {
  protected async patch() {
    if (!this.plugin.settings.getSetting('nativeFileSearchEnabled')) return

    const that = this // eslint-disable-line @typescript-eslint/no-this-alias -- For patcher
    Patcher.patch(this.plugin, this.plugin.app.commands.commands["editor:open-search"], {
      checkCallback: Patcher.OverrideExisting(next => function (this: unknown, checking: boolean) {
        // If there is an active md editor, return the original method
        if (that.plugin.app.workspace.activeEditor) return next.call(this, checking)

        // If there is no active canvas view, return the original method
        const activeCanvasView = that.plugin.getCurrentCanvasView()
        if (!activeCanvasView) return next.call(this, checking)

        // Always allow the command to be executed in canvas view
        if (checking) return true

        // Show the search view in the active canvas view
        if (!activeCanvasView.canvas.searchEl) new CanvasSearchView(activeCanvasView)

        return true
      })
    })
  }
}

interface SearchMatch {
  nodeId: string
  content: string
  matches: number[][]
}

class CanvasSearchView {
  private view: CanvasView

  private containerEl: HTMLDivElement
  private searchInput: HTMLInputElement
  private searchCount: HTMLDivElement
  // Added by an LLM agent (P0-5): debounce handle for search-on-type.
  private inputDebounce = 0

  private searchMatches: SearchMatch[] = []
  private matchIndex = 0

  constructor(view: CanvasView) {
    this.view = view
    this.createSearchView()
  }

  private createSearchView() {
    this.containerEl = this.view.canvas.wrapperEl.createDiv()
    this.containerEl.className = "document-search-container"

    const documentSearch = this.containerEl.createDiv()
    documentSearch.className = "document-search"

    const searchInputContainer = documentSearch.createDiv()
    searchInputContainer.className = "search-input-container document-search-input"

    this.searchInput = searchInputContainer.createEl("input")
    this.searchInput.type = "text"
    this.searchInput.placeholder = "Find..."
    this.searchInput.addEventListener("keydown", (e: KeyboardEvent) => this.onKeyDown(e))
    // Added by an LLM agent (P0-5/P1-11): debounce search-on-type so every
    // keystroke doesn't deserialize every node + regex-scan on the UI thread.
    this.searchInput.addEventListener("input", () => {
      window.clearTimeout(this.inputDebounce)
      this.inputDebounce = window.setTimeout(() => this.onInput(), 120)
    })

    this.searchCount = searchInputContainer.createDiv()
    this.searchCount.className = "document-search-count"
    this.searchCount.style.display = "none" /* eslint-disable-line obsidianmd/no-static-styles-assignment -- Should be dynamic */
    this.searchCount.textContent = "0 / 0"

    const documentSearchButtons = documentSearch.createDiv()
    documentSearchButtons.className = "document-search-buttons"

    const previousButton = documentSearchButtons.createEl("button")
    previousButton.className = "clickable-icon document-search-button"
    previousButton.setAttribute("aria-label", "Previous\nShift + F3")
    previousButton.setAttribute("data-tooltip-position", "top")
    setIcon(previousButton, "arrow-up")
    previousButton.addEventListener("click", () => this.changeMatch(this.matchIndex - 1))

    const nextButton = documentSearchButtons.createEl("button")
    nextButton.className = "clickable-icon document-search-button"
    nextButton.setAttribute("aria-label", "Next\nF3")
    nextButton.setAttribute("data-tooltip-position", "top")
    setIcon(nextButton, "arrow-down")
    nextButton.addEventListener("click", () => this.changeMatch(this.matchIndex + 1))

    const closeButton = documentSearch.createEl("button")
    closeButton.className = "clickable-icon document-search-close-button"
    closeButton.setAttribute("aria-label", "Exit search")
    closeButton.setAttribute("data-tooltip-position", "top")
    setIcon(closeButton, "x")
    closeButton.addEventListener("click", () => this.close())

    this.view.canvas.searchEl = this.containerEl
    this.searchInput.focus()
  }

  private onKeyDown(e: KeyboardEvent) {
    // TODO: Fix arrows moving the node and not the cursor

    if (e.key === "Enter" || e.key === "F3")
      this.changeMatch(this.matchIndex + (e.shiftKey ? -1 : 1))
    else if (e.key === "Escape")
      this.close()
  }

  private onInput() {
    const hasQuery = this.searchInput.value.length > 0
    this.searchCount.style.display = hasQuery ? "block" : "none"

    if (!hasQuery) this.searchMatches = []
    else {
      // Added by an LLM agent (P0-5): escape user input before building the
      // RegExp (a literal `(` used to throw uncaught) and bail out safely on
      // catastrophic patterns instead of ReDoS-ing the UI thread.
      let regex: RegExp
      try {
        regex = new RegExp(escapeRegExp(this.searchInput.value), "gi")
      } catch {
        this.searchMatches = []
        this.changeMatch(0)
        return
      }
      const query = this.searchInput.value.toLowerCase()
      this.searchMatches = Array.from(this.view.canvas.nodes.values()).map(node => {
        const nodeData = node.getData()

        let content: string | undefined = undefined
        if (nodeData.type === "text") content = (nodeData as CanvasTextNodeData).text
        else if (nodeData.type === "group") content = (nodeData as CanvasGroupNodeData).label
        else if (nodeData.type === "file") {
          try { content = node.child?.data } catch { content = undefined }
        }

        if (!content || !content.toLowerCase().includes(query)) return null

        const matches: number[][] = []
        try {
          regex.lastIndex = 0
          let match: RegExpExecArray | null
          let guard = 0
          while ((match = regex.exec(content)) !== null) {
            matches.push([match.index, match.index + match[0].length])
            if (match[0].length === 0) regex.lastIndex++
            if (++guard > 1000) break
          }
        } catch {
          return null
        }

        return { nodeId: node.id, content: content, matches: matches }
      }).filter(match => match && match.matches.length > 0) as SearchMatch[]
    }

    // Update match index and update the count display
    this.changeMatch(0)
  }

  private changeMatch(index: number) {
    // Bind the index to the range of searchMatches
    if (this.searchMatches.length === 0) this.matchIndex = -1
    else {
      if (index < 0) index += this.searchMatches.length
      this.matchIndex = index % this.searchMatches.length
    }

    const match = this.searchMatches[this.matchIndex]
    if (match) this.goToMatch(match)

    this.searchCount.textContent = `${this.matchIndex + 1} / ${this.searchMatches.length}`
  }

  private goToMatch(match: SearchMatch) {
    this.view.setEphemeralState({ match: match })
  }

  private close() {
    window.clearTimeout(this.inputDebounce)
    this.containerEl.remove()
    this.view.canvas.searchEl = undefined
  }
}
