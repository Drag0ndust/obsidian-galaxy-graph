# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2024-XX-XX

### Added
- Initial release
- 3D galaxy visualization with Three.js and WebGL
- Custom GLSL shaders for star glow (radial core + halo)
- Dual-layer point sprite rendering (core stars + glow halos)
- UnrealBloomPass post-processing for light bleed
- Animated energy pulses along link lines
- Force-directed graph layout running in a Web Worker
- Louvain community detection for organic cluster discovery
- Dual-layer nebulae per detected community
- Stars colored and sized by community and link count
- 3,000 ambient background stars with slow rotation
- ACES filmic tone mapping
- Orbit, zoom, and pan controls with damping
- Hover tooltips showing note name and link count
- Click-to-open-note functionality
- Fuzzy search panel (Ctrl/Cmd+F) with camera warp and star flare
- Filter panel for clusters, folders, and tags
- Tag extraction from frontmatter and inline #tags
- Plugin settings for star size, bloom, and auto-rotate
- Slow auto-rotate for ambient display
