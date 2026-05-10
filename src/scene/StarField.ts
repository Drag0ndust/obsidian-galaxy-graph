import * as THREE from "three";
import { GraphNode } from "../layout/GraphBuilder";
import { NebulaMesh } from "./NebulaMesh";
import {
  starVertexShader,
  starFragmentShader,
  glowVertexShader,
  glowFragmentShader,
} from "./Shaders";

export class StarField {
  corePoints: THREE.Points;
  glowPoints: THREE.Points;
  private nodeOrder: GraphNode[];
  private baseScales: Float32Array;
  private positionAttr: THREE.BufferAttribute;
  private glowPositionAttr: THREE.BufferAttribute;
  private highlightAttr: THREE.BufferAttribute;
  private glowHighlightAttr: THREE.BufferAttribute;
  private coreUniforms: { uTime: { value: number }; uSizeMultiplier: { value: number } };
  private glowUniforms: { uTime: { value: number }; uSizeMultiplier: { value: number } };

  // Flare animation state
  private flareTargets: Map<number, { start: number; duration: number }> = new Map();

  // Persistent selection — the star receives extra glow until another is selected.
  private selectedIndex = -1;
  private static readonly SELECTED_INTENSITY = 1.5;

  constructor(nodes: GraphNode[], _folders: string[]) {
    this.nodeOrder = nodes;
    const count = nodes.length;

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const pulsePhases = new Float32Array(count);
    const highlights = new Float32Array(count);
    this.baseScales = new Float32Array(count);
    const col = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const node = nodes[i];
      const scale = 3.0 + Math.log2(1 + node.linkCount) * 2.5;
      this.baseScales[i] = scale;
      sizes[i] = scale;
      pulsePhases[i] = (node.lastModified % 10000) * 0.001;
      highlights[i] = 1.0;

      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * 100 + 10;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = Math.sin(angle) * radius;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 20;

      // Color by community (organic clusters) instead of folder
      col.copy(NebulaMesh.getCommunityColor(node.communityId));
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }

    // ── Core stars ──
    const coreGeo = new THREE.BufferGeometry();
    this.positionAttr = new THREE.BufferAttribute(positions, 3);
    this.positionAttr.setUsage(THREE.DynamicDrawUsage);
    coreGeo.setAttribute("position", this.positionAttr);
    coreGeo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    coreGeo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    coreGeo.setAttribute("aPulsePhase", new THREE.BufferAttribute(pulsePhases, 1));

    this.highlightAttr = new THREE.BufferAttribute(highlights.slice(), 1);
    this.highlightAttr.setUsage(THREE.DynamicDrawUsage);
    coreGeo.setAttribute("aHighlight", this.highlightAttr);

    this.coreUniforms = { uTime: { value: 0 }, uSizeMultiplier: { value: 1.0 } };

    const coreMat = new THREE.ShaderMaterial({
      uniforms: this.coreUniforms,
      vertexShader: starVertexShader,
      fragmentShader: starFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.corePoints = new THREE.Points(coreGeo, coreMat);

    // ── Glow halos ──
    const glowGeo = new THREE.BufferGeometry();
    const glowPositions = new Float32Array(positions);
    this.glowPositionAttr = new THREE.BufferAttribute(glowPositions, 3);
    this.glowPositionAttr.setUsage(THREE.DynamicDrawUsage);
    glowGeo.setAttribute("position", this.glowPositionAttr);
    glowGeo.setAttribute("aColor", new THREE.BufferAttribute(colors.slice(), 3));
    glowGeo.setAttribute("aSize", new THREE.BufferAttribute(sizes.slice(), 1));
    glowGeo.setAttribute("aPulsePhase", new THREE.BufferAttribute(pulsePhases.slice(), 1));

    this.glowHighlightAttr = new THREE.BufferAttribute(highlights.slice(), 1);
    this.glowHighlightAttr.setUsage(THREE.DynamicDrawUsage);
    glowGeo.setAttribute("aHighlight", this.glowHighlightAttr);

    this.glowUniforms = { uTime: { value: 0 }, uSizeMultiplier: { value: 1.0 } };

    const glowMat = new THREE.ShaderMaterial({
      uniforms: this.glowUniforms,
      vertexShader: glowVertexShader,
      fragmentShader: glowFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.glowPoints = new THREE.Points(glowGeo, glowMat);
    this.glowPoints.renderOrder = -1;
  }

  updateTime(time: number) {
    this.coreUniforms.uTime.value = time;
    this.glowUniforms.uTime.value = time;

    const coreArr = this.highlightAttr.array as Float32Array;
    const glowArr = this.glowHighlightAttr.array as Float32Array;

    // Animate active flares
    let dirty = false;
    for (const [idx, flare] of this.flareTargets) {
      const elapsed = time - flare.start;
      const t = elapsed / flare.duration;
      if (t >= 1.0) {
        // Flare done, restore to normal
        coreArr[idx] = 1.0;
        glowArr[idx] = 1.0;
        this.flareTargets.delete(idx);
      } else {
        // Flare curve: quick ramp up → slow decay
        const intensity = t < 0.15
          ? (t / 0.15) * 3.0          // ramp up to 3x in first 15%
          : 1.0 + 2.0 * (1.0 - ((t - 0.15) / 0.85)); // decay to 1.0
        coreArr[idx] = intensity;
        glowArr[idx] = intensity;
      }
      dirty = true;
    }

    // Persist the selected star's extra glow once any flare on it has finished.
    if (this.selectedIndex >= 0 && !this.flareTargets.has(this.selectedIndex)) {
      coreArr[this.selectedIndex] = StarField.SELECTED_INTENSITY;
      glowArr[this.selectedIndex] = StarField.SELECTED_INTENSITY;
      dirty = true;
    }

    if (dirty) {
      this.highlightAttr.needsUpdate = true;
      this.glowHighlightAttr.needsUpdate = true;
    }
  }

  updatePositions(positions: Float32Array) {
    const arr = this.positionAttr.array as Float32Array;
    const glowArr = this.glowPositionAttr.array as Float32Array;
    for (let i = 0; i < this.nodeOrder.length * 3; i++) {
      arr[i] = positions[i];
      glowArr[i] = positions[i];
    }
    this.positionAttr.needsUpdate = true;
    this.glowPositionAttr.needsUpdate = true;
  }

  /**
   * Trigger a flare animation on a specific star (e.g. search result).
   */
  triggerFlare(index: number, duration: number = 2.0) {
    this.flareTargets.set(index, {
      start: this.coreUniforms.uTime.value,
      duration,
    });
  }

  /**
   * Mark a star as selected; gives it persistent extra glow until cleared
   * or another star is selected. Pass -1 to clear.
   */
  setSelected(index: number) {
    if (this.selectedIndex === index) return;
    if (this.selectedIndex >= 0) {
      // Restore the previously-selected star to normal brightness.
      (this.highlightAttr.array as Float32Array)[this.selectedIndex] = 1.0;
      (this.glowHighlightAttr.array as Float32Array)[this.selectedIndex] = 1.0;
      this.highlightAttr.needsUpdate = true;
      this.glowHighlightAttr.needsUpdate = true;
    }
    this.selectedIndex = index;
  }

  getSelected(): number {
    return this.selectedIndex;
  }

  /**
   * Set highlight values for all stars.
   * Pass null to reset all to 1.0 (fully visible).
   */
  setHighlights(values: Float32Array | null) {
    const coreArr = this.highlightAttr.array as Float32Array;
    const glowArr = this.glowHighlightAttr.array as Float32Array;
    const count = this.nodeOrder.length;

    if (values === null) {
      for (let i = 0; i < count; i++) {
        coreArr[i] = 1.0;
        glowArr[i] = 1.0;
      }
    } else {
      for (let i = 0; i < count; i++) {
        coreArr[i] = values[i];
        glowArr[i] = values[i];
      }
    }
    this.highlightAttr.needsUpdate = true;
    this.glowHighlightAttr.needsUpdate = true;
  }

  /**
   * Get position of a star by index (for camera warp target).
   */
  getPosition(index: number): THREE.Vector3 | null {
    if (index < 0 || index >= this.nodeOrder.length) return null;
    const arr = this.positionAttr.array as Float32Array;
    return new THREE.Vector3(arr[index * 3], arr[index * 3 + 1], arr[index * 3 + 2]);
  }

  raycast(raycaster: THREE.Raycaster): number {
    const threshold = 2.0;
    const positions = this.positionAttr.array as Float32Array;
    const highlights = this.highlightAttr.array as Float32Array;
    const count = this.nodeOrder.length;
    let closestIdx = -1;
    let closestDist = Infinity;
    const origin = raycaster.ray.origin;
    const dir = raycaster.ray.direction;
    const tmpVec = new THREE.Vector3();

    for (let i = 0; i < count; i++) {
      // Skip nearly invisible stars for hover
      if (highlights[i] < 0.2) continue;

      tmpVec.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      const v = tmpVec.clone().sub(origin);
      const projLen = v.dot(dir);
      if (projLen < 0) continue;
      const closest = origin.clone().add(dir.clone().multiplyScalar(projLen));
      const dist = tmpVec.distanceTo(closest);
      const starThreshold = threshold + this.baseScales[i] * 0.5;
      if (dist < starThreshold && dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
      }
    }
    return closestIdx;
  }

  getNode(index: number): GraphNode | null {
    return this.nodeOrder[index] ?? null;
  }

  getNodeCount(): number {
    return this.nodeOrder.length;
  }

  dispose() {
    this.corePoints.geometry.dispose();
    (this.corePoints.material as THREE.Material).dispose();
    this.glowPoints.geometry.dispose();
    (this.glowPoints.material as THREE.Material).dispose();
  }
}
