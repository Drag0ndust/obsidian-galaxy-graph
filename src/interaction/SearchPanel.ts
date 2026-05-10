/**
 * SearchPanel — Obsidian-native search input overlaid on the galaxy.
 *
 * Features:
 *  - Fuzzy search across note names
 *  - Live results dropdown
 *  - On select: camera warps to star + triggers flare animation
 *  - Keyboard shortcut: Ctrl/Cmd+F to focus
 */

export interface SearchResult {
  index: number;
  name: string;
  folder: string;
  score: number;
}

export class SearchPanel {
  container: HTMLDivElement;
  private input: HTMLInputElement;
  private resultsList: HTMLDivElement;
  private allNames: { index: number; name: string; folder: string }[] = [];
  private visible = false;

  onSelect: ((index: number) => void) | null = null;

  constructor(parent: HTMLElement) {
    // Wrapper
    this.container = document.createElement("div");
    this.container.className = "galaxy-search-panel";
    this.container.style.display = "none";
    parent.appendChild(this.container);

    // Search icon + input
    const inputWrap = document.createElement("div");
    inputWrap.className = "galaxy-search-input-wrap";
    this.container.appendChild(inputWrap);

    const icon = document.createElement("span");
    icon.className = "galaxy-search-icon";
    icon.textContent = "✦";
    inputWrap.appendChild(icon);

    this.input = document.createElement("input");
    this.input.type = "text";
    this.input.placeholder = "Search stars…";
    this.input.className = "galaxy-search-input";
    inputWrap.appendChild(this.input);

    // Results dropdown
    this.resultsList = document.createElement("div");
    this.resultsList.className = "galaxy-search-results";
    this.container.appendChild(this.resultsList);

    // Events
    this.input.addEventListener("input", () => this.onInputChange());
    this.input.addEventListener("keydown", (e) => this.onKeyDown(e));

    // Global keyboard shortcut
    parent.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        this.toggle();
      }
      if (e.key === "Escape" && this.visible) {
        this.hide();
      }
    });
  }

  setNodes(names: { index: number; name: string; folder: string }[]) {
    this.allNames = names;
  }

  toggle() {
    if (this.visible) this.hide();
    else this.show();
  }

  show() {
    this.visible = true;
    this.container.style.display = "block";
    this.input.value = "";
    this.resultsList.innerHTML = "";
    setTimeout(() => this.input.focus(), 50);
  }

  hide() {
    this.visible = false;
    this.container.style.display = "none";
    this.input.blur();
  }

  private onInputChange() {
    const query = this.input.value.trim().toLowerCase();
    this.resultsList.innerHTML = "";

    if (query.length === 0) return;

    // Simple fuzzy match: check if all query chars appear in order
    const results: SearchResult[] = [];
    for (const entry of this.allNames) {
      const score = this.fuzzyScore(query, entry.name.toLowerCase());
      if (score > 0) {
        results.push({ index: entry.index, name: entry.name, folder: entry.folder, score });
      }
    }

    // Sort by score (higher = better match)
    results.sort((a, b) => b.score - a.score);

    // Show top 8
    const top = results.slice(0, 8);
    for (const result of top) {
      const item = document.createElement("div");
      item.className = "galaxy-search-result-item";
      item.innerHTML = `
        <span class="galaxy-search-result-name">${this.highlightMatch(result.name, query)}</span>
        <span class="galaxy-search-result-folder">${result.folder}</span>
      `;
      item.addEventListener("click", () => {
        this.onSelect?.(result.index);
        this.hide();
      });
      this.resultsList.appendChild(item);
    }

    if (top.length === 0) {
      const empty = document.createElement("div");
      empty.className = "galaxy-search-empty";
      empty.textContent = "No stars found";
      this.resultsList.appendChild(empty);
    }
  }

  private onKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      const first = this.resultsList.querySelector(".galaxy-search-result-item") as HTMLElement;
      if (first) first.click();
    }
    if (e.key === "Escape") {
      this.hide();
    }
  }

  /**
   * Simple fuzzy scoring: characters must appear in order.
   * Consecutive matches score higher. Prefix matches score highest.
   */
  private fuzzyScore(query: string, target: string): number {
    let qi = 0;
    let score = 0;
    let consecutive = 0;
    let lastMatchIdx = -2;

    for (let ti = 0; ti < target.length && qi < query.length; ti++) {
      if (target[ti] === query[qi]) {
        qi++;
        score += 1;
        // Bonus for consecutive chars
        if (ti === lastMatchIdx + 1) {
          consecutive++;
          score += consecutive * 2;
        } else {
          consecutive = 0;
        }
        // Bonus for matching at start
        if (ti === qi - 1) score += 3;
        lastMatchIdx = ti;
      }
    }

    // All query chars must match
    if (qi < query.length) return 0;
    // Bonus for shorter targets (closer match)
    score += Math.max(0, 10 - (target.length - query.length));
    return score;
  }

  private highlightMatch(name: string, query: string): string {
    let result = "";
    let qi = 0;
    const lowerName = name.toLowerCase();
    for (let i = 0; i < name.length; i++) {
      if (qi < query.length && lowerName[i] === query[qi]) {
        result += `<mark>${name[i]}</mark>`;
        qi++;
      } else {
        result += name[i];
      }
    }
    return result;
  }

  dispose() {
    if (this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
  }
}
