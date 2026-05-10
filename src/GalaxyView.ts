import { ItemView, WorkspaceLeaf, debounce } from "obsidian";
import { GalaxyScene } from "./scene/GalaxyScene";
import { buildVaultGraph, VaultGraph } from "./layout/GraphBuilder";
import { SearchPanel } from "./interaction/SearchPanel";
import { FilterPanel } from "./interaction/FilterPanel";

export const VIEW_TYPE_GALAXY = "galaxy-graph-view";

export class GalaxyView extends ItemView {
  private galaxy: GalaxyScene | null = null;
  private searchPanel: SearchPanel | null = null;
  private filterPanel: FilterPanel | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private currentGraph: VaultGraph | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_GALAXY;
  }

  getDisplayText(): string {
    return "Galaxy Graph";
  }

  getIcon(): string {
    return "orbit";
  }

  /**
   * Public method to toggle the search panel from command palette.
   */
  toggleSearch() {
    this.searchPanel?.toggle();
  }

  async onOpen() {
    const container = this.contentEl;
    container.empty();
    container.addClass("galaxy-graph-container");

    // Make container focusable for keyboard events
    container.tabIndex = 0;

    // Create the Three.js galaxy scene
    this.galaxy = new GalaxyScene(container);

    // Handle clicking a star → open the note
    this.galaxy.onStarClick = (filePath: string) => {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (file) {
        this.app.workspace.getLeaf(false).openFile(file as any);
      }
    };

    // ── Search panel ──
    this.searchPanel = new SearchPanel(container);
    this.searchPanel.onSelect = (index: number) => {
      this.galaxy?.focusOnStar(index);
    };

    // ── Filter panel ──
    this.filterPanel = new FilterPanel(container);
    this.filterPanel.onChange = (state) => {
      this.galaxy?.applyFilter(state);
    };

    // Build the graph from vault data
    this.rebuildGraph();

    // ── Live updates: rebuild when the vault or metadata changes ──
    const scheduleRebuild = debounce(() => this.rebuildGraph(), 400, true);
    this.registerEvent(this.app.vault.on("create", () => scheduleRebuild()));
    this.registerEvent(this.app.vault.on("delete", () => scheduleRebuild()));
    this.registerEvent(this.app.vault.on("rename", () => scheduleRebuild()));
    this.registerEvent(this.app.metadataCache.on("changed", () => scheduleRebuild()));
    this.registerEvent(this.app.metadataCache.on("resolved", () => scheduleRebuild()));

    // ── Resize handling ──
    this.resizeObserver = new ResizeObserver(() => {
      this.galaxy?.resize();
    });
    this.resizeObserver.observe(container);

    // Focus container for keyboard events
    container.focus();
  }

  private rebuildGraph() {
    if (!this.galaxy) return;
    this.currentGraph = buildVaultGraph(this.app);
    this.galaxy.loadGraph(this.currentGraph);
    this.searchPanel?.setNodes(
      this.currentGraph.nodes.map((n, i) => ({
        index: i,
        name: n.name,
        folder: n.folder,
      }))
    );
    this.filterPanel?.setData(
      this.currentGraph.folders,
      this.currentGraph.tags,
      this.currentGraph.communities,
      this.currentGraph.nodes.map((n, i) => ({ index: i, name: n.name }))
    );
  }

  async onClose() {
    this.resizeObserver?.disconnect();
    this.searchPanel?.dispose();
    this.filterPanel?.dispose();
    this.galaxy?.destroy();
    this.galaxy = null;
    this.searchPanel = null;
    this.filterPanel = null;
    this.currentGraph = null;
  }
}
