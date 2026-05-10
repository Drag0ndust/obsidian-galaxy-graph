import { Plugin } from "obsidian";
import { GalaxyView, VIEW_TYPE_GALAXY } from "./src/GalaxyView";
import {
  GalaxySettings,
  DEFAULT_SETTINGS,
  GalaxySettingTab,
} from "./src/settings/Settings";

export default class GalaxyGraphPlugin extends Plugin {
  settings: GalaxySettings = DEFAULT_SETTINGS;

  async onload() {
    await this.loadSettings();

    // Register the custom galaxy view
    this.registerView(VIEW_TYPE_GALAXY, (leaf) => new GalaxyView(leaf));

    // Add a ribbon icon to open the galaxy
    this.addRibbonIcon("orbit", "Open Galaxy Graph", () => {
      this.activateView();
    });

    // Add a command to open the galaxy
    this.addCommand({
      id: "open-galaxy-graph",
      name: "Open Galaxy Graph",
      callback: () => this.activateView(),
    });

    // Add a command to search the galaxy
    this.addCommand({
      id: "search-galaxy-graph",
      name: "Search Galaxy Graph",
      callback: () => {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_GALAXY);
        if (leaves.length > 0) {
          const view = leaves[0].view as GalaxyView;
          view.toggleSearch();
        } else {
          this.activateView();
        }
      },
    });

    // Settings tab
    this.addSettingTab(new GalaxySettingTab(this.app, this));
  }

  async onunload() {
    // Obsidian handles detaching views on unload
  }

  async activateView() {
    const { workspace } = this.app;

    let leaf = workspace.getLeavesOfType(VIEW_TYPE_GALAXY)[0];

    if (!leaf) {
      leaf = workspace.getLeaf(false);
      await leaf.setViewState({
        type: VIEW_TYPE_GALAXY,
        active: true,
      });
    }

    workspace.revealLeaf(leaf);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
