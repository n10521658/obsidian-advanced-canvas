import AdvancedCanvasPlugin from "src/main"
import { AdvancedCanvasPluginSettingsValues } from "src/settings"

export default abstract class CanvasExtension {
  plugin: AdvancedCanvasPlugin
  private settingsChangedRef: unknown = null
  private enabled = false

  abstract isEnabled(): boolean | keyof AdvancedCanvasPluginSettingsValues
  abstract init(): void

  constructor(plugin: AdvancedCanvasPlugin) {
    this.plugin = plugin

    if (!this.checkEnabled())
      return

    this.enabled = true
    this.init()
    // Added by an LLM agent (P2-13): live-toggle support. Extensions that were
    // gated off at startup subscribe to settings-changed so unticking /
    // reticking the feature box enables/disables without an app reload.
    // Extensions that need custom teardown override dispose(); extensions that
    // need custom re-init override onSettingsEnabled().
    try {
      this.settingsChangedRef = this.plugin.app.workspace.on(
        'advanced-canvas:settings-changed',
        () => this.syncEnabledState()
      )
      this.plugin.registerEvent(this.settingsChangedRef as never)
    } catch { /* workspace not ready in tests */ }
  }

  /** Override to release listeners/observers/timers created in init(). */
  dispose(): void {}

  /** Override to refresh already-initialized state when settings change. */
  onSettingsEnabled(): void {}

  isActive(): boolean {
    return this.enabled
  }

  private settingKey(): keyof AdvancedCanvasPluginSettingsValues | null {
    const flag = this.isEnabled()
    return flag === true ? null : (flag as keyof AdvancedCanvasPluginSettingsValues)
  }

  private checkEnabled(): boolean {
    const key = this.settingKey()
    if (key === null) return true
    try { return !!this.plugin.settings.getSetting(key) }
    catch { return false }
  }

  private syncEnabledState() {
    const shouldBeEnabled = this.checkEnabled()
    if (shouldBeEnabled === this.enabled) {
      if (shouldBeEnabled) {
        try { this.onSettingsEnabled() } catch (e) { console.error(`Advanced Canvas: onSettingsEnabled failed for ${this.constructor.name}:`, e) }
      }
      return
    }
    this.enabled = shouldBeEnabled
    if (shouldBeEnabled) {
      try { this.init() } catch (e) { console.error(`Advanced Canvas: late init failed for ${this.constructor.name}:`, e) }
      try { this.onSettingsEnabled() } catch (e) { console.error(`Advanced Canvas: onSettingsEnabled failed for ${this.constructor.name}:`, e) }
    } else {
      try { this.dispose() } catch (e) { console.error(`Advanced Canvas: dispose failed for ${this.constructor.name}:`, e) }
    }
  }
}
