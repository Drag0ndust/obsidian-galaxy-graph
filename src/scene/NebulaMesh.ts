import * as THREE from "three";
import { GraphNode } from "../layout/GraphBuilder";
import { Community } from "../layout/Clustering";

/**
 * Deep-space nebula palette — each community gets a distinct color.
 * 16 colors to handle vaults with many organic clusters.
 */
const NEBULA_PALETTE = [
  0x4fc3f7, // cyan
  0xba68c8, // violet
  0xffb74d, // amber
  0x81c784, // green
  0xef5350, // coral
  0x64b5f6, // blue
  0xfff176, // yellow
  0xf06292, // pink
  0x4db6ac, // teal
  0xff8a65, // deep orange
  0x7986cb, // indigo
  0xaed581, // light green
  0xe57373, // red
  0x4dd0e1, // light cyan
  0xce93d8, // light purple
  0xdce775, // lime
];

interface NebulaCluster {
  communityId: number;
  color: THREE.Color;
  nodeIndices: number[];
}

/**
 * NebulaMesh — soft, glowing sprites placed at the centroid of each
 * Louvain-detected community. These glow behind organic clusters of
 * densely connected notes, creating real nebula formations.
 *
 * Larger communities get bigger, brighter nebulae.
 * Each nebula has two layers: a tight inner core and a diffuse outer halo.
 */
export class NebulaMesh {
  group: THREE.Group;
  private clusters: NebulaCluster[];
  private innerSprites: THREE.Sprite[];  // tight, brighter core
  private outerSprites: THREE.Sprite[];  // diffuse, larger halo
  private timeOffset: number;

  private static glowTexture: THREE.Texture | null = null;

  // Radial-gradient alpha texture, shared across all sprites in all instances,
  // so nebulae fade softly from center to edge instead of rendering as flat quads.
  private static getGlowTexture(): THREE.Texture {
    if (NebulaMesh.glowTexture) return NebulaMesh.glowTexture;

    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;

    const gradient = ctx.createRadialGradient(
      size / 2, size / 2, 0,
      size / 2, size / 2, size / 2
    );
    gradient.addColorStop(0.0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.25, "rgba(255,255,255,0.55)");
    gradient.addColorStop(0.6, "rgba(255,255,255,0.15)");
    gradient.addColorStop(1.0, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    NebulaMesh.glowTexture = tex;
    return tex;
  }

  constructor(nodes: GraphNode[], communities: Community[]) {
    this.group = new THREE.Group();
    this.timeOffset = Math.random() * 100;
    this.clusters = [];
    this.innerSprites = [];
    this.outerSprites = [];

    const glowMap = NebulaMesh.getGlowTexture();

    for (const community of communities) {
      // Skip tiny communities (< 3 nodes) — they don't form visible nebulae
      if (community.nodeIndices.length < 3) continue;

      const color = new THREE.Color(
        NEBULA_PALETTE[community.id % NEBULA_PALETTE.length]
      );

      this.clusters.push({
        communityId: community.id,
        color,
        nodeIndices: community.nodeIndices,
      });

      // Inner glow: brighter, tighter
      const innerMat = new THREE.SpriteMaterial({
        map: glowMap,
        color: color,
        transparent: true,
        opacity: 0.1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const inner = new THREE.Sprite(innerMat);
      this.innerSprites.push(inner);
      this.group.add(inner);

      // Outer halo: dimmer, much larger, atmospheric
      const outerMat = new THREE.SpriteMaterial({
        map: glowMap,
        color: color,
        transparent: true,
        opacity: 0.04,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const outer = new THREE.Sprite(outerMat);
      outer.renderOrder = -2;
      this.outerSprites.push(outer);
      this.group.add(outer);
    }
  }

  /**
   * Get the community color for a given community ID.
   * Used by StarField to optionally color stars by community.
   */
  static getCommunityColor(communityId: number): THREE.Color {
    return new THREE.Color(NEBULA_PALETTE[communityId % NEBULA_PALETTE.length]);
  }

  /**
   * Get the full palette (for legend / filter UI).
   */
  static getPalette(): number[] {
    return NEBULA_PALETTE;
  }

  updatePositions(nodePositions: Float32Array, time: number) {
    for (let ci = 0; ci < this.clusters.length; ci++) {
      const cluster = this.clusters[ci];
      const inner = this.innerSprites[ci];
      const outer = this.outerSprites[ci];
      const indices = cluster.nodeIndices;
      const n = indices.length;

      // Compute centroid
      let cx = 0, cy = 0, cz = 0;
      for (const idx of indices) {
        cx += nodePositions[idx * 3];
        cy += nodePositions[idx * 3 + 1];
        cz += nodePositions[idx * 3 + 2];
      }
      cx /= n;
      cy /= n;
      cz /= n;

      // Compute spread (average distance from centroid)
      let avgSpread = 0;
      let maxSpread = 0;
      for (const idx of indices) {
        const dx = nodePositions[idx * 3] - cx;
        const dy = nodePositions[idx * 3 + 1] - cy;
        const dz = nodePositions[idx * 3 + 2] - cz;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        avgSpread += dist;
        if (dist > maxSpread) maxSpread = dist;
      }
      avgSpread /= n;

      // Organic breathing animation — each community breathes at its own rate
      const breatheRate = 0.3 + (cluster.communityId % 5) * 0.08;
      const breathe = 1.0 + 0.12 * Math.sin(time * breatheRate + this.timeOffset + ci * 1.7);

      // Inner sprite: covers the cluster core
      const innerSize = Math.max(25, avgSpread * 2.0) * breathe;
      inner.position.set(cx, cy, cz);
      inner.scale.set(innerSize, innerSize, 1);

      // Opacity scales slightly with community size (bigger = more visible)
      const sizeFactor = Math.min(1.0, n / 20);
      const innerMat = inner.material as THREE.SpriteMaterial;
      innerMat.opacity = (0.06 + 0.06 * sizeFactor) *
        (1.0 + 0.15 * Math.sin(time * 0.25 + ci * 1.1));

      // Outer halo: extends well beyond the cluster
      const outerSize = Math.max(50, maxSpread * 3.0) * breathe;
      outer.position.set(cx, cy, cz);
      outer.scale.set(outerSize, outerSize, 1);

      const outerMat = outer.material as THREE.SpriteMaterial;
      outerMat.opacity = (0.02 + 0.03 * sizeFactor) *
        (1.0 + 0.1 * Math.sin(time * 0.18 + ci * 0.7));
    }
  }

  getClusters(): NebulaCluster[] {
    return this.clusters;
  }

  dispose() {
    for (const sprite of this.innerSprites) {
      (sprite.material as THREE.Material).dispose();
    }
    for (const sprite of this.outerSprites) {
      (sprite.material as THREE.Material).dispose();
    }
  }
}
