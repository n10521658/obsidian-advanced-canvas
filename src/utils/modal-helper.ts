import App, { FuzzyMatch, FuzzySuggestModal, Modal, Notice, Setting, SuggestModal, TFile } from 'obsidian'
import { Size } from 'src/@types/Canvas'
import FilepathHelper from 'src/utils/filepath-helper'

export class AbstractSelectionModal extends FuzzySuggestModal<string> {
  suggestions: string[]
  arbitrary: boolean

  constructor(app: App, placeholder: string, suggestions: string[], arbitrary: boolean = false) {
    super(app)

    this.suggestions = suggestions
    this.arbitrary = arbitrary

    this.setPlaceholder(placeholder)
    this.setInstructions([{
        command: '↑↓',
        purpose: 'to navigate'
    }, {
        command: 'esc',
        purpose: 'to dismiss'
    }])
  }

  getItems(): string[] { return this.suggestions }
  getItemText(item: string): string { return item }

  override getSuggestions(query: string): FuzzyMatch<string>[] {
    const suggestions = super.getSuggestions(query)

    if (this.arbitrary && query.length > 0 && !suggestions.some(s => s.item === query))
      suggestions.splice(0, 0, { item: query, match: { score: 1, matches: [[0, query.length]] } })

    return suggestions
  }

  onChooseItem(_item: string, _evt: MouseEvent | KeyboardEvent): void { }
  awaitInput(): Promise<string> {
    return new Promise((resolve, _reject) => {
      this.onChooseItem = (item: string) => resolve(item)
      this.open()
    })
  }
}

/** Added by an LLM agent: width + height input dialog (used by the resize-nodes context menu item). */
export class DimensionModal extends Modal {
  private titleText: string
  private initialWidth: number
  private initialHeight: number
  private widthValue: string
  private heightValue: string
  private resolveInput: ((value: Size | null) => void) | null = null
  private resolved = false

  constructor(app: App, title: string, initialWidth: number, initialHeight: number) {
    super(app)

    this.titleText = title
    this.initialWidth = initialWidth
    this.initialHeight = initialHeight
    this.widthValue = String(initialWidth)
    this.heightValue = String(initialHeight)
  }

  onOpen() {
    this.titleEl.setText(this.titleText)

    new Setting(this.contentEl)
      .setName('Width')
      .addText(text => {
        text.setValue(this.widthValue)
        text.onChange(value => this.widthValue = value)

        text.inputEl.type = 'number'
        text.inputEl.min = '1'
        text.inputEl.addEventListener('keydown', evt => {
          if (evt.key === 'Enter') {
            evt.preventDefault()
            this.submit()
          }
        })

        text.inputEl.focus()
        text.inputEl.select()
      })

    new Setting(this.contentEl)
      .setName('Height')
      .addText(text => {
        text.setValue(this.heightValue)
        text.onChange(value => this.heightValue = value)

        text.inputEl.type = 'number'
        text.inputEl.min = '1'
        text.inputEl.addEventListener('keydown', evt => {
          if (evt.key === 'Enter') {
            evt.preventDefault()
            this.submit()
          }
        })
      })

    new Setting(this.contentEl)
      .addButton(button => button
        .setButtonText('Resize')
        .setCta()
        .onClick(() => this.submit())
      )
      .addButton(button => button
        .setButtonText('Cancel')
        .onClick(() => this.close())
      )
  }

  onClose() {
    this.contentEl.empty()

    if (this.resolved) return

    this.resolved = true
    this.resolveInput?.(null)
  }

  awaitInput(): Promise<Size | null> {
    return new Promise(resolve => {
      this.resolveInput = resolve
      this.open()
    })
  }

  private submit() {
    const width = Math.round(Number(this.widthValue))
    const height = Math.round(Number(this.heightValue))

    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      new Notice('Width and height must be positive numbers')
      return
    }

    if (this.resolved) return

    this.resolved = true
    this.resolveInput?.({ width, height })
    this.close()
  }
}

export class FileNameModal extends SuggestModal<string> {
  parentPath: string
  fileExtension: string

  constructor(app: App, parentPath: string, fileExtension: string) {
    super(app)

    this.parentPath = parentPath.replace(/^\//, '').replace(/\/$/, '')
    this.fileExtension = fileExtension
  }

  getSuggestions(query: string): string[] {
    const queryWithoutExtension = query.replace(new RegExp(`\\.${this.fileExtension}$`), '')
    if (queryWithoutExtension === '') return []

    const queryWithExtension = queryWithoutExtension + '.' + this.fileExtension
    const suggestions = [queryWithExtension]

    if (this.parentPath.length > 0) suggestions.splice(0, 0, `${this.parentPath}/${queryWithExtension}`)

    // Filter out suggestions for files that already exist
    return suggestions.filter(s => this.app.vault.getAbstractFileByPath(s) === null)
  }

  renderSuggestion(text: string, el: HTMLElement) {
    el.setText(text)
  }

  onChooseSuggestion(_text: string, _evt: MouseEvent | KeyboardEvent) {}

  awaitInput(): Promise<string> {
    return new Promise((resolve, _reject) => {
      this.onChooseSuggestion = (text: string) => { resolve(text) }
      this.open()
    })
  }
}

export class FileSelectModal extends SuggestModal<string> {
  files: string[]
  suggestNewFile: boolean

  constructor(app: App, extensionsRegex?: RegExp, suggestNewFile = false) {
    super(app)

    this.files = this.app.vault.getFiles()
      .map(file => file.path)
      .filter(path => FilepathHelper.extension(path)?.match(extensionsRegex ?? /.*/))
    this.suggestNewFile = suggestNewFile

    this.setPlaceholder('Type to search...')
    this.setInstructions([{
        command: '↑↓',
        purpose: 'to navigate'
    }, {
        command: '↵',
        purpose: 'to open'
    }, {
        command: 'shift ↵',
        purpose: 'to create'
    }, {
        command: 'esc',
        purpose: 'to dismiss'
    }])

    this.scope.register(['Shift'], 'Enter', ((e) => {
      this.onChooseSuggestion(this.inputEl.value, e)
      this.close()
    }))
  }

  getSuggestions(query: string): string[] {
    const suggestions = this.files.filter(path => path.toLowerCase().includes(query.toLowerCase()))
    if (suggestions.length === 0 && this.suggestNewFile) suggestions.push(query)

    return suggestions
  }

  renderSuggestion(path: string, el: HTMLElement) {
    const simplifiedPath = path.replace(/\.md$/, '')
    el.setText(simplifiedPath)
  }

  onChooseSuggestion(_path: string, _evt: MouseEvent | KeyboardEvent) {}

  awaitInput(): Promise<TFile> {
    return new Promise((resolve, _reject) => {
      this.onChooseSuggestion = (path: string, _evt: MouseEvent | KeyboardEvent) => {
        const file = this.app.vault.getAbstractFileByPath(path)

        if (file instanceof TFile)
          return resolve(file)

        if (!this.suggestNewFile) return

        if (FilepathHelper.extension(path) === undefined) path += '.md'
        const newFile = this.app.vault.create(path, '')
        resolve(newFile)
      }

      this.open()
    })
  }
}
