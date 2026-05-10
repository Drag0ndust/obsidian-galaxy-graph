# Contributing to Galaxy Graph

Thank you for considering contributing to Galaxy Graph! Whether it's a bug fix, new feature, shader tweak, or documentation improvement — every contribution makes the galaxy brighter.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Making Changes](#making-changes)
- [Code Style](#code-style)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)
- [Community](#community)

---

## Getting Started

1. **Fork** the repository on GitHub
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/obsidian-galaxy-graph.git
   cd obsidian-galaxy-graph
   ```
3. **Create a branch** for your work:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org) 18+ and npm
- An [Obsidian](https://obsidian.md) vault for testing
- Basic familiarity with TypeScript and Three.js (for rendering changes)

### Install & Build

```bash
npm install
npm run dev
```

The `dev` script watches for file changes and rebuilds `main.js` automatically.

### Link to Your Vault

The easiest way to test is to clone/symlink the plugin directly into your vault:

```bash
# Option A: Clone directly into your vault's plugin directory
cd /path/to/your/vault/.obsidian/plugins/
git clone https://github.com/YOUR_USERNAME/obsidian-galaxy-graph.git galaxy-graph

# Option B: Symlink (macOS/Linux)
ln -s /path/to/obsidian-galaxy-graph /path/to/your/vault/.obsidian/plugins/galaxy-graph
```

Then enable the plugin in Obsidian's settings and reload (`Ctrl/Cmd+R`) after each build.

### Testing with Different Vault Sizes

For performance testing, consider creating a test vault with many notes:

```bash
# Generate 1000 test notes with random links (you can write a script for this)
mkdir test-vault
cd test-vault
# ... your note generation script
```

---

## Project Structure

```
src/
├── GalaxyView.ts              # Obsidian ItemView — the host container
├── scene/                     # Three.js rendering
│   ├── GalaxyScene.ts         # Scene setup, bloom, camera, render loop
│   ├── StarField.ts           # Point sprite stars (shader-based)
│   ├── LinkLines.ts           # Animated edge lines
│   ├── NebulaMesh.ts          # Nebula sprites per community
│   ├── BackgroundStars.ts     # Ambient star particles
│   └── Shaders.ts             # All GLSL vertex/fragment shaders
├── layout/                    # Graph algorithms
│   ├── GraphBuilder.ts        # Reads Obsidian vault → graph data
│   ├── Clustering.ts          # Louvain community detection
│   └── ForceWorker.ts         # Web Worker force-directed layout
├── interaction/               # UI overlays
│   ├── SearchPanel.ts         # Fuzzy search + camera warp
│   └── FilterPanel.ts         # Cluster/folder/tag filter sidebar
└── settings/
    └── Settings.ts            # Plugin settings tab
```

### Key Concepts

- **Stars** are rendered as Two layers of `THREE.Points` with custom `ShaderMaterial` — one for the core, one for the glow halo. This is what feeds into the bloom pass.
- **The force layout** runs in an inline Web Worker (blob URL) to avoid blocking the main thread.
- **Community detection** runs synchronously at graph-build time since Louvain is near-linear.
- **Highlights** are driven by a per-vertex `aHighlight` attribute in the shaders. Setting it > 1.0 creates a flare; < 1.0 dims the star.

---

## Making Changes

### Adding a New Visual Effect

1. If it needs GLSL, add or modify shaders in `src/scene/Shaders.ts`
2. Wire the uniforms/attributes in the relevant scene class (`StarField.ts`, `LinkLines.ts`, etc.)
3. Update `GalaxyScene.ts` to pass time or state to the new effect

### Adding a New Graph Algorithm

1. Create a new file in `src/layout/`
2. Keep it pure (no Three.js imports) — layout code should be framework-agnostic
3. Integrate it in `GraphBuilder.ts` and expose results through `VaultGraph`

### Adding a New UI Panel

1. Create a new file in `src/interaction/`
2. Use plain DOM (no React) — Obsidian plugins should minimize dependencies
3. Wire it in `GalaxyView.ts` and add CSS to `styles.css`

---

## Code Style

- **TypeScript** strict mode with `strictNullChecks`
- **No semicolons** at end of lines (except in GLSL template literals)
- **2-space indentation**
- **Descriptive names** over comments — `updatePositions` not `update` with a comment explaining it updates positions
- **GLSL shaders** live in `Shaders.ts` as tagged template literals (`/* glsl */`)
- **Dispose everything** — Three.js geometries, materials, textures, and workers must be cleaned up in `dispose()` methods
- Keep **rendering code** (scene/) separate from **data code** (layout/) separate from **UI code** (interaction/)

### Performance Guidelines

- Never allocate in the render loop — pre-allocate buffers and reuse them
- Use `InstancedMesh` or `Points` over individual `Mesh` objects
- Heavy computation goes in a Web Worker
- Profile with Chrome DevTools before and after your change

---

## Submitting a Pull Request

1. Make sure your branch is up to date with `main`:
   ```bash
   git fetch origin
   git rebase origin/main
   ```

2. Run the build and verify it compiles:
   ```bash
   npm run build
   ```

3. Test in Obsidian with a real vault — open the galaxy, try search, filter, hover, and click.

4. Write a clear PR description:
   - **What** does this change?
   - **Why** is it needed?
   - **How** does it work? (especially for shader or algorithm changes)
   - **Screenshots/videos** if it's visual

5. Keep PRs focused — one feature or fix per PR. Large PRs are hard to review.

### PR Checklist

- [ ] Builds without errors (`npm run build`)
- [ ] Tested in Obsidian with a vault of 50+ notes
- [ ] No console errors or warnings
- [ ] All Three.js resources disposed properly
- [ ] CSS class names prefixed with `galaxy-` to avoid conflicts
- [ ] New settings (if any) have sensible defaults

---

## Reporting Bugs

Open an issue using the **Bug Report** template and include:

- Obsidian version and OS
- Vault size (approximate number of notes)
- Steps to reproduce
- Expected vs actual behavior
- Console errors (open with `Ctrl/Cmd+Shift+I`)
- Screenshots or screen recordings if possible

---

## Suggesting Features

Open an issue using the **Feature Request** template. Great feature requests include:

- A clear description of the problem you're solving
- How you'd expect it to work from a user perspective
- Mockups or references (even rough sketches help)
- Whether you'd be interested in implementing it

---

## Community

- Be kind. Review the [Code of Conduct](CODE_OF_CONDUCT.md).
- Ask questions in GitHub Discussions or Issues — there are no stupid questions.
- If you're new to Three.js or GLSL, that's fine! The codebase is documented and we're happy to help.

---

Thank you for helping make Galaxy Graph better. Every contribution, no matter how small, makes a difference. ✦
