import { App, PluginSettingTab, Setting } from "obsidian";
import type GalaxyGraphPlugin from "../../main";

export interface GalaxySettings {
  starSizeMultiplier: number;
  showOrphanNotes: boolean;
  backgroundStarCount: number;
  // Phase 2: Bloom
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  autoRotate: boolean;
}

export const DEFAULT_SETTINGS: GalaxySettings = {
  starSizeMultiplier: 1.0,
  showOrphanNotes: true,
  backgroundStarCount: 3000,
  bloomStrength: 1.2,
  bloomRadius: 0.6,
  bloomThreshold: 0.2,
  autoRotate: true,
};

export class GalaxySettingTab extends PluginSettingTab {
  plugin: GalaxyGraphPlugin;

  constructor(app: App, plugin: GalaxyGraphPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Galaxy Graph Settings" });

    // ── Stars ──
    containerEl.createEl("h3", { text: "Stars" });

    new Setting(containerEl)
      .setName("Star size multiplier")
      .setDesc("Scale the size of all stars (0.5 – 3.0)")
      .addSlider((slider) =>
        slider
          .setLimits(0.5, 3.0, 0.1)
          .setValue(this.plugin.settings.starSizeMultiplier)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.starSizeMultiplier = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Show orphan notes")
      .setDesc("Display notes with no links as dim dust particles")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showOrphanNotes)
          .onChange(async (value) => {
            this.plugin.settings.showOrphanNotes = value;
            await this.plugin.saveSettings();
          })
      );

    // ── Bloom ──
    containerEl.createEl("h3", { text: "Bloom & Glow" });

    new Setting(containerEl)
      .setName("Bloom strength")
      .setDesc("Intensity of the glow effect (0 – 3.0)")
      .addSlider((slider) =>
        slider
          .setLimits(0, 3.0, 0.1)
          .setValue(this.plugin.settings.bloomStrength)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.bloomStrength = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Bloom radius")
      .setDesc("How far the glow spreads (0 – 2.0)")
      .addSlider((slider) =>
        slider
          .setLimits(0, 2.0, 0.1)
          .setValue(this.plugin.settings.bloomRadius)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.bloomRadius = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Bloom threshold")
      .setDesc("Minimum brightness to glow (0 = everything glows, 1 = only bright stars)")
      .addSlider((slider) =>
        slider
          .setLimits(0, 1.0, 0.05)
          .setValue(this.plugin.settings.bloomThreshold)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.bloomThreshold = value;
            await this.plugin.saveSettings();
          })
      );

    // ── Camera ──
    containerEl.createEl("h3", { text: "Camera" });

    new Setting(containerEl)
      .setName("Auto-rotate")
      .setDesc("Slowly rotate the galaxy for an ambient effect")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoRotate)
          .onChange(async (value) => {
            this.plugin.settings.autoRotate = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
