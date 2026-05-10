/**
 * FilterPanel — collapsible sidebar for filtering the galaxy by
 * community (Louvain clusters), folder, and tag.
 *
 * Communities are the primary grouping since they represent the
 * organic structure of the vault discovered by the algorithm.
 */

import { Community } from "../layout/Clustering";

export interface FilterState {
  activeCommunities: Set<number>;
  activeFolders: Set<string>;
  activeTags: Set<string>;
  isFiltering: boolean;
}

const NEBULA_PALETTE_CSS = [
  "#4fc3f7", "#ba68c8", "#ffb74d", "#81c784", "#ef5350",
  "#64b5f6", "#fff176", "#f06292", "#4db6ac", "#ff8a65",
  "#7986cb", "#aed581", "#e57373", "#4dd0e1", "#ce93d8", "#dce775",
];

export class FilterPanel {
  container: HTMLDivElement;
  private state: FilterState;
  private folders: string[] = [];
  private tags: string[] = [];
  private communities: Community[] = [];
  private communityLabels: Map<number, string> = new Map();
  private collapsed = true;

  onChange: ((state: FilterState) => void) | null = null;

  constructor(parent: HTMLElement) {
    this.state = {
      activeCommunities: new Set(),
      activeFolders: new Set(),
      activeTags: new Set(),
      isFiltering: false,
    };

    this.container = document.createElement("div");
    this.container.className = "galaxy-filter-panel";
    parent.appendChild(this.container);

    const toggleBtn = document.createElement("button");
    toggleBtn.className = "galaxy-filter-toggle";
    toggleBtn.innerHTML = "⬡";
    toggleBtn.title = "Filter Galaxy";
    toggleBtn.addEventListener("click", () => this.toggleCollapse());
    this.container.appendChild(toggleBtn);

    const content = document.createElement("div");
    content.className = "galaxy-filter-content";
    content.style.display = "none";
    this.container.appendChild(content);
  }

  setData(
    folders: string[],
    tags: string[],
    communities: Community[],
    nodeNames: { index: number; name: string }[]
  ) {
    this.folders = folders;
    this.tags = tags;
    this.communities = communities;

    // Generate labels for each community from its most-connected member names
    this.communityLabels.clear();
    for (const comm of communities) {
      if (comm.nodeIndices.length < 3) continue;
      // Pick the top 2-3 member names as the label
      const memberNames = comm.nodeIndices
        .slice(0, 3)
        .map((idx) => {
          const entry = nodeNames.find((n) => n.index === idx);
          return entry ? entry.name : "";
        })
        .filter(Boolean);
      const label = memberNames.join(", ");
      this.communityLabels.set(
        comm.id,
        label.length > 30 ? label.slice(0, 28) + "…" : label
      );
    }

    this.rebuild();
  }

  private toggleCollapse() {
    this.collapsed = !this.collapsed;
    const content = this.container.querySelector(".galaxy-filter-content") as HTMLElement;
    if (content) content.style.display = this.collapsed ? "none" : "block";
    const btn = this.container.querySelector(".galaxy-filter-toggle") as HTMLElement;
    if (btn) btn.classList.toggle("galaxy-filter-toggle-active", !this.collapsed);
  }

  private rebuild() {
    const content = this.container.querySelector(".galaxy-filter-content") as HTMLElement;
    if (!content) return;
    content.innerHTML = "";

    // ── Communities (primary) ──
    const visibleComms = this.communities.filter((c) => c.nodeIndices.length >= 3);
    if (visibleComms.length > 0) {
      const header = document.createElement("div");
      header.className = "galaxy-filter-header";
      header.textContent = "Clusters";
      content.appendChild(header);

      for (const comm of visibleComms) {
        const color = NEBULA_PALETTE_CSS[comm.id % NEBULA_PALETTE_CSS.length];
        const label = this.communityLabels.get(comm.id) || `Cluster ${comm.id + 1}`;
        const count = comm.nodeIndices.length;

        const item = this.createFilterItem(
          `${label}`,
          color,
          `${count} stars`,
          () => this.toggleCommunity(comm.id)
        );
        item.dataset.community = String(comm.id);
        content.appendChild(item);
      }
    }

    // ── Folders ──
    if (this.folders.length > 0) {
      const header = document.createElement("div");
      header.className = "galaxy-filter-header";
      header.textContent = "Folders";
      content.appendChild(header);

      for (const folder of this.folders) {
        const item = this.createFilterItem(
          folder, "#5a6a82", null,
          () => this.toggleFolder(folder)
        );
        item.dataset.folder = folder;
        content.appendChild(item);
      }
    }

    // ── Tags ──
    if (this.tags.length > 0) {
      const header = document.createElement("div");
      header.className = "galaxy-filter-header";
      header.textContent = "Tags";
      content.appendChild(header);

      for (const tag of this.tags.slice(0, 20)) { // cap at 20 for UI sanity
        const item = this.createFilterItem(
          `#${tag}`, "#8090a8", null,
          () => this.toggleTag(tag)
        );
        item.dataset.tag = tag;
        content.appendChild(item);
      }
    }

    // ── Reset ──
    const reset = document.createElement("button");
    reset.className = "galaxy-filter-reset";
    reset.textContent = "Show All";
    reset.addEventListener("click", () => this.resetFilters());
    content.appendChild(reset);
  }

  private createFilterItem(
    label: string,
    color: string,
    badge: string | null,
    onClick: () => void
  ): HTMLDivElement {
    const item = document.createElement("div");
    item.className = "galaxy-filter-item";

    const dot = document.createElement("span");
    dot.className = "galaxy-filter-dot";
    dot.style.background = color;
    dot.style.boxShadow = `0 0 6px ${color}80`;
    item.appendChild(dot);

    const text = document.createElement("span");
    text.className = "galaxy-filter-label";
    text.textContent = label;
    item.appendChild(text);

    if (badge) {
      const b = document.createElement("span");
      b.className = "galaxy-filter-badge";
      b.textContent = badge;
      item.appendChild(b);
    }

    item.addEventListener("click", () => {
      item.classList.toggle("galaxy-filter-item-active");
      onClick();
    });

    return item;
  }

  private toggleCommunity(id: number) {
    if (this.state.activeCommunities.has(id)) {
      this.state.activeCommunities.delete(id);
    } else {
      this.state.activeCommunities.add(id);
    }
    this.updateFilterState();
  }

  private toggleFolder(folder: string) {
    if (this.state.activeFolders.has(folder)) {
      this.state.activeFolders.delete(folder);
    } else {
      this.state.activeFolders.add(folder);
    }
    this.updateFilterState();
  }

  private toggleTag(tag: string) {
    if (this.state.activeTags.has(tag)) {
      this.state.activeTags.delete(tag);
    } else {
      this.state.activeTags.add(tag);
    }
    this.updateFilterState();
  }

  private resetFilters() {
    this.state.activeCommunities.clear();
    this.state.activeFolders.clear();
    this.state.activeTags.clear();
    this.state.isFiltering = false;
    const items = this.container.querySelectorAll(".galaxy-filter-item-active");
    items.forEach((item) => item.classList.remove("galaxy-filter-item-active"));
    this.onChange?.(this.state);
  }

  private updateFilterState() {
    this.state.isFiltering =
      this.state.activeCommunities.size > 0 ||
      this.state.activeFolders.size > 0 ||
      this.state.activeTags.size > 0;
    this.onChange?.(this.state);
  }

  getState(): FilterState {
    return this.state;
  }

  dispose() {
    if (this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
  }
}
