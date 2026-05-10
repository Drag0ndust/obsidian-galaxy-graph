import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { VaultGraph } from "../layout/GraphBuilder";
import { StarField } from "./StarField";
import { LinkLines } from "./LinkLines";
import { BackgroundStars } from "./BackgroundStars";
import { NebulaMesh } from "./NebulaMesh";
import { FilterState } from "../interaction/FilterPanel";

export class GalaxyScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private composer: EffectComposer;
  private bloomPass: UnrealBloomPass;

  private starField: StarField | null = null;
  private linkLines: LinkLines | null = null;
  private nebulaMesh: NebulaMesh | null = null;
  private bgStars: BackgroundStars;

  private animFrameId: number = 0;
  private container: HTMLElement;
  private clock = new THREE.Clock();

  // Graph data
  private currentGraph: VaultGraph | null = null;

  // Force layout worker
  private worker: Worker | null = null;
  private latestPositions: Float32Array | null = null;

  // Hover state
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private tooltip: HTMLDivElement;
  private hoveredIndex = -1;

  // Warp animation. `warpTarget`/`warpStart` move the camera position
  // (only set by focusOnStar). `warpTargetLookAt`/`warpStartLookAt` move
  // the orbit centre — set by every selection so the star ends up centred.
  private warpProgress = 0;
  private warpStart: THREE.Vector3 | null = null;
  private warpTarget: THREE.Vector3 | null = null;
  private warpStartLookAt: THREE.Vector3 | null = null;
  private warpTargetLookAt: THREE.Vector3 | null = null;

  // Click callback
  onStarClick: ((filePath: string) => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x030308, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x030308, 0.002);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
    this.camera.position.set(0, 80, 180);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.rotateSpeed = 0.4;
    this.controls.zoomSpeed = 1.0;
    this.controls.minDistance = 15;
    this.controls.maxDistance = 600;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.15;

    this.bgStars = new BackgroundStars(3000, 600);
    this.scene.add(this.bgStars.points);

    const renderPass = new RenderPass(this.scene, this.camera);
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      1.2, 0.6, 0.2
    );

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    this.tooltip = document.createElement("div");
    this.tooltip.className = "galaxy-tooltip";
    this.tooltip.style.display = "none";
    container.appendChild(this.tooltip);

    this.renderer.domElement.addEventListener("mousemove", this.onMouseMove);
    this.renderer.domElement.addEventListener("click", this.onClick);

    this.resize();
    this.animate();
  }

  loadGraph(graph: VaultGraph) {
    this.disposeGraph();
    this.currentGraph = graph;

    this.starField = new StarField(graph.nodes, graph.folders);
    this.scene.add(this.starField.corePoints);
    this.scene.add(this.starField.glowPoints);

    this.linkLines = new LinkLines(graph.nodes, graph.edges, graph.folders);
    this.scene.add(this.linkLines.line);

    this.nebulaMesh = new NebulaMesh(graph.nodes, graph.communities);
    this.scene.add(this.nebulaMesh.group);

    this.startForceLayout(graph);
  }

  getGraph(): VaultGraph | null {
    return this.currentGraph;
  }

  getStarField(): StarField | null {
    return this.starField;
  }

  // ── Search: warp to star + flare ────────────────────────────────

  /**
   * Mark a star as selected: persistent extra glow on the star,
   * blinking highlight on its connected edges, and pan the orbit
   * centre to the star so it sits in the middle of the view.
   */
  selectStar(index: number) {
    if (!this.starField) return;
    this.starField.setSelected(index);
    this.starField.triggerFlare(index, 2.5);
    this.linkLines?.highlightEdgesForNode(index, 2.0);

    const pos = this.starField.getPosition(index);
    if (!pos) return;

    // Re-centre the orbit on the selected star. Camera position is left alone
    // here — focusOnStar layers a position warp on top when needed.
    this.warpStartLookAt = this.controls.target.clone();
    this.warpTargetLookAt = pos.clone();
    this.warpStart = null;
    this.warpTarget = null;
    this.warpProgress = 0;
  }

  /**
   * Focus on a specific star: select it visually and warp the camera to it.
   */
  focusOnStar(index: number) {
    if (!this.starField) return;

    const pos = this.starField.getPosition(index);
    if (!pos) return;

    this.selectStar(index);

    // Layer a camera-position warp on top of the orbit-centre lerp.
    this.warpStart = this.camera.position.clone();
    this.warpTarget = pos.clone().add(new THREE.Vector3(5, 8, 25));

    // Temporarily disable auto-rotate during warp
    this.controls.autoRotate = false;
  }

  // ── Filter: dim/highlight stars by folder/tag ───────────────────

  applyFilter(filterState: FilterState) {
    if (!this.starField || !this.currentGraph || !this.linkLines) return;

    const count = this.starField.getNodeCount();

    if (!filterState.isFiltering) {
      this.starField.setHighlights(null);
      this.linkLines.setHighlightsFromNodes(null);
      return;
    }

    const highlights = new Float32Array(count);
    const nodes = this.currentGraph.nodes;
    const hasCommunityFilter = filterState.activeCommunities.size > 0;
    const hasFolderFilter = filterState.activeFolders.size > 0;
    const hasTagFilter = filterState.activeTags.size > 0;

    for (let i = 0; i < count; i++) {
      const node = nodes[i];
      let match = false;

      // OR logic: match any active filter type
      if (hasCommunityFilter && filterState.activeCommunities.has(node.communityId)) {
        match = true;
      }
      if (hasFolderFilter && filterState.activeFolders.has(node.folder)) {
        match = true;
      }
      if (hasTagFilter && node.tags?.some((t: string) => filterState.activeTags.has(t))) {
        match = true;
      }

      highlights[i] = match ? 1.0 : 0.08;
    }

    this.starField.setHighlights(highlights);
    this.linkLines.setHighlightsFromNodes(highlights);
  }

  // ── Mouse interaction ──────────────────────────────────────────

  private onMouseMove = (event: MouseEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.tooltip.style.left = event.clientX - rect.left + 14 + "px";
    this.tooltip.style.top = event.clientY - rect.top - 10 + "px";
  };

  private onClick = () => {
    if (this.hoveredIndex < 0 || !this.starField) return;
    this.selectStar(this.hoveredIndex);
    if (this.onStarClick) {
      const node = this.starField.getNode(this.hoveredIndex);
      if (node) this.onStarClick(node.id);
    }
  };

  // ── Render loop ────────────────────────────────────────────────

  private animate = () => {
    this.animFrameId = requestAnimationFrame(this.animate);
    const elapsed = this.clock.getElapsedTime();
    const delta = this.clock.getDelta();

    // Update force layout positions
    if (this.latestPositions) {
      this.starField?.updatePositions(this.latestPositions);
      this.linkLines?.updatePositions(this.latestPositions);
      this.nebulaMesh?.updatePositions(this.latestPositions, elapsed);
    }

    // Update time-driven animations (including flares)
    this.starField?.updateTime(elapsed);
    this.linkLines?.updateTime(elapsed);

    // Warp animation: orbit-centre always lerps to the selected star;
    // camera position lerps too only when focusOnStar layered it on.
    if (this.warpTargetLookAt && this.warpStartLookAt) {
      this.warpProgress += 0.02; // ~1.2 seconds at 60fps
      const t = this.easeInOutCubic(Math.min(this.warpProgress, 1.0));

      this.controls.target.lerpVectors(this.warpStartLookAt, this.warpTargetLookAt, t);

      if (this.warpStart && this.warpTarget) {
        this.camera.position.lerpVectors(this.warpStart, this.warpTarget, t);
      }

      if (this.warpProgress >= 1.0) {
        this.warpStart = null;
        this.warpTarget = null;
        this.warpStartLookAt = null;
        this.warpTargetLookAt = null;
        // Re-enable auto-rotate after warp settles
        setTimeout(() => {
          this.controls.autoRotate = true;
        }, 3000);
      }
    }

    // Hover detection
    if (this.starField) {
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const hit = this.starField.raycast(this.raycaster);
      if (hit >= 0) {
        const node = this.starField.getNode(hit);
        if (node) {
          this.tooltip.textContent = node.name;
          this.tooltip.style.display = "block";
          this.renderer.domElement.style.cursor = "pointer";
        }
        this.hoveredIndex = hit;
      } else {
        this.tooltip.style.display = "none";
        this.renderer.domElement.style.cursor = "grab";
        this.hoveredIndex = -1;
      }
    }

    this.bgStars.points.rotation.y += 0.00004;
    this.bgStars.points.rotation.x += 0.00001;

    this.controls.update();
    this.composer.render();
  };

  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // ── Lifecycle ──────────────────────────────────────────────────

  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloomPass.resolution.set(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setBloomParams(strength: number, radius: number, threshold: number) {
    this.bloomPass.strength = strength;
    this.bloomPass.radius = radius;
    this.bloomPass.threshold = threshold;
  }

  setAutoRotate(enabled: boolean) {
    this.controls.autoRotate = enabled;
  }

  private startForceLayout(graph: VaultGraph) {
    const workerCode = this.getWorkerCode();
    const blob = new Blob([workerCode], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    this.worker = new Worker(url);

    this.worker.onmessage = (e) => {
      if (e.data.type === "tick") {
        this.latestPositions = new Float32Array(e.data.positions);
      }
    };

    this.worker.postMessage({
      type: "init",
      nodes: graph.nodes.map((n) => ({ id: n.id, linkCount: n.linkCount })),
      edges: graph.edges,
    });
  }

  private getWorkerCode(): string {
    return `
      let nodes = [];
      let edges = [];
      let running = false;
      let iteration = 0;
      const MAX_ITERATIONS = 300;
      const REPULSION = 800;
      const ATTRACTION = 0.005;
      const DAMPING = 0.92;
      const CENTER_GRAVITY = 0.01;
      const GALAXY_FLATTEN = 0.3;

      self.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === "init") {
          const idToIndex = new Map();
          nodes = msg.nodes.map((n, i) => {
            idToIndex.set(n.id, i);
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * 100 + 10;
            return {
              x: Math.cos(angle) * radius,
              y: Math.sin(angle) * radius,
              z: (Math.random() - 0.5) * 20,
              vx: 0, vy: 0, vz: 0,
              linkCount: n.linkCount || 0,
            };
          });
          edges = [];
          for (const edge of msg.edges) {
            const si = idToIndex.get(edge.source);
            const ti = idToIndex.get(edge.target);
            if (si !== undefined && ti !== undefined) {
              edges.push({ source: si, target: ti });
            }
          }
          running = true;
          iteration = 0;
          tick();
        }
        if (msg.type === "stop") { running = false; }
      };

      function tick() {
        if (!running || iteration >= MAX_ITERATIONS) {
          self.postMessage({ type: "done" });
          return;
        }
        const alpha = 1 - iteration / MAX_ITERATIONS;
        const n = nodes.length;

        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            const dx = nodes[i].x - nodes[j].x;
            const dy = nodes[i].y - nodes[j].y;
            const dz = nodes[i].z - nodes[j].z;
            const distSq = dx * dx + dy * dy + dz * dz + 1;
            const force = (REPULSION * alpha) / distSq;
            nodes[i].vx += dx * force;
            nodes[i].vy += dy * force;
            nodes[i].vz += dz * force;
            nodes[j].vx -= dx * force;
            nodes[j].vy -= dy * force;
            nodes[j].vz -= dz * force;
          }
        }

        for (const edge of edges) {
          const s = nodes[edge.source];
          const t = nodes[edge.target];
          const dx = t.x - s.x;
          const dy = t.y - s.y;
          const dz = t.z - s.z;
          s.vx += dx * ATTRACTION * alpha;
          s.vy += dy * ATTRACTION * alpha;
          s.vz += dz * ATTRACTION * alpha;
          t.vx -= dx * ATTRACTION * alpha;
          t.vy -= dy * ATTRACTION * alpha;
          t.vz -= dz * ATTRACTION * alpha;
        }

        const positions = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          const nd = nodes[i];
          nd.vx -= nd.x * CENTER_GRAVITY;
          nd.vy -= nd.y * CENTER_GRAVITY;
          nd.vz -= nd.z * CENTER_GRAVITY;
          nd.vz *= GALAXY_FLATTEN;
          nd.vx *= DAMPING;
          nd.vy *= DAMPING;
          nd.vz *= DAMPING;
          nd.x += nd.vx;
          nd.y += nd.vy;
          nd.z += nd.vz;
          positions[i * 3] = nd.x;
          positions[i * 3 + 1] = nd.y;
          positions[i * 3 + 2] = nd.z;
        }

        self.postMessage({ type: "tick", positions }, [positions.buffer]);
        iteration++;
        setTimeout(tick, 0);
      }
    `;
  }

  private disposeGraph() {
    if (this.starField) {
      this.scene.remove(this.starField.corePoints);
      this.scene.remove(this.starField.glowPoints);
      this.starField.dispose();
      this.starField = null;
    }
    if (this.linkLines) {
      this.scene.remove(this.linkLines.line);
      this.linkLines.dispose();
      this.linkLines = null;
    }
    if (this.nebulaMesh) {
      this.scene.remove(this.nebulaMesh.group);
      this.nebulaMesh.dispose();
      this.nebulaMesh = null;
    }
    if (this.worker) {
      this.worker.postMessage({ type: "stop" });
      this.worker.terminate();
      this.worker = null;
    }
    this.latestPositions = null;
    this.currentGraph = null;
  }

  destroy() {
    cancelAnimationFrame(this.animFrameId);
    this.disposeGraph();
    this.bgStars.dispose();
    this.renderer.domElement.removeEventListener("mousemove", this.onMouseMove);
    this.renderer.domElement.removeEventListener("click", this.onClick);
    this.controls.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    if (this.tooltip.parentElement) this.tooltip.parentElement.removeChild(this.tooltip);
    if (this.renderer.domElement.parentElement) this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
  }
}
