import * as THREE from "three";
import { GraphEdge, GraphNode } from "../layout/GraphBuilder";
import { linkVertexShader, linkFragmentShader } from "./Shaders";
import { NebulaMesh } from "./NebulaMesh";

export class LinkLines {
  line: THREE.LineSegments;
  private edgeIndices: { srcIdx: number; tgtIdx: number }[];
  private posAttr: THREE.BufferAttribute;
  private linkHighlightAttr: THREE.BufferAttribute;
  private timeUniform: { value: number };

  constructor(nodes: GraphNode[], edges: GraphEdge[], _folders: string[]) {
    const pathToIndex = new Map<string, number>();
    nodes.forEach((n, i) => pathToIndex.set(n.id, i));

    this.edgeIndices = [];
    for (const edge of edges) {
      const si = pathToIndex.get(edge.source);
      const ti = pathToIndex.get(edge.target);
      if (si !== undefined && ti !== undefined) {
        this.edgeIndices.push({ srcIdx: si, tgtIdx: ti });
      }
    }

    const edgeCount = this.edgeIndices.length;
    const vertCount = edgeCount * 2;

    const positions = new Float32Array(vertCount * 3);
    const edgeProgress = new Float32Array(vertCount);
    const sourceColors = new Float32Array(vertCount * 3);
    const targetColors = new Float32Array(vertCount * 3);
    const linkHighlights = new Float32Array(vertCount);

    const col = new THREE.Color();

    for (let i = 0; i < edgeCount; i++) {
      const { srcIdx, tgtIdx } = this.edgeIndices[i];
      const srcNode = nodes[srcIdx];
      const tgtNode = nodes[tgtIdx];

      edgeProgress[i * 2] = 0.0;
      edgeProgress[i * 2 + 1] = 1.0;

      // Default: fully visible
      linkHighlights[i * 2] = 1.0;
      linkHighlights[i * 2 + 1] = 1.0;

      const srcColor = NebulaMesh.getCommunityColor(srcNode.communityId);
      const tgtColor = NebulaMesh.getCommunityColor(tgtNode.communityId);

      col.copy(srcColor);
      sourceColors[i * 6] = col.r; sourceColors[i * 6 + 1] = col.g; sourceColors[i * 6 + 2] = col.b;
      sourceColors[i * 6 + 3] = col.r; sourceColors[i * 6 + 4] = col.g; sourceColors[i * 6 + 5] = col.b;

      col.copy(tgtColor);
      targetColors[i * 6] = col.r; targetColors[i * 6 + 1] = col.g; targetColors[i * 6 + 2] = col.b;
      targetColors[i * 6 + 3] = col.r; targetColors[i * 6 + 4] = col.g; targetColors[i * 6 + 5] = col.b;
    }

    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(positions, 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("position", this.posAttr);
    geo.setAttribute("aEdgeProgress", new THREE.BufferAttribute(edgeProgress, 1));
    geo.setAttribute("aSourceColor", new THREE.BufferAttribute(sourceColors, 3));
    geo.setAttribute("aTargetColor", new THREE.BufferAttribute(targetColors, 3));

    this.linkHighlightAttr = new THREE.BufferAttribute(linkHighlights, 1);
    this.linkHighlightAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("aLinkHighlight", this.linkHighlightAttr);

    this.timeUniform = { value: 0 };

    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: this.timeUniform },
      vertexShader: linkVertexShader,
      fragmentShader: linkFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.line = new THREE.LineSegments(geo, mat);
  }

  updateTime(time: number) {
    this.timeUniform.value = time;
  }

  updatePositions(nodePositions: Float32Array) {
    const arr = this.posAttr.array as Float32Array;
    for (let i = 0; i < this.edgeIndices.length; i++) {
      const { srcIdx, tgtIdx } = this.edgeIndices[i];
      const base = i * 6;
      arr[base] = nodePositions[srcIdx * 3];
      arr[base + 1] = nodePositions[srcIdx * 3 + 1];
      arr[base + 2] = nodePositions[srcIdx * 3 + 2];
      arr[base + 3] = nodePositions[tgtIdx * 3];
      arr[base + 4] = nodePositions[tgtIdx * 3 + 1];
      arr[base + 5] = nodePositions[tgtIdx * 3 + 2];
    }
    this.posAttr.needsUpdate = true;
  }

  /**
   * Set per-edge highlight values based on node visibility.
   * An edge is visible if BOTH endpoints are visible.
   */
  setHighlightsFromNodes(nodeHighlights: Float32Array | null) {
    const arr = this.linkHighlightAttr.array as Float32Array;

    if (nodeHighlights === null) {
      arr.fill(1.0);
    } else {
      for (let i = 0; i < this.edgeIndices.length; i++) {
        const { srcIdx, tgtIdx } = this.edgeIndices[i];
        const val = Math.min(nodeHighlights[srcIdx], nodeHighlights[tgtIdx]);
        arr[i * 2] = val;
        arr[i * 2 + 1] = val;
      }
    }
    this.linkHighlightAttr.needsUpdate = true;
  }

  /**
   * Highlight all edges connected to a specific node (for search flare).
   * Resets previously-highlighted edges so only the current selection animates.
   */
  highlightEdgesForNode(nodeIndex: number, intensity: number) {
    const arr = this.linkHighlightAttr.array as Float32Array;
    for (let i = 0; i < this.edgeIndices.length; i++) {
      const { srcIdx, tgtIdx } = this.edgeIndices[i];
      const connected = srcIdx === nodeIndex || tgtIdx === nodeIndex;
      const value = connected ? intensity : 1.0;
      arr[i * 2] = value;
      arr[i * 2 + 1] = value;
    }
    this.linkHighlightAttr.needsUpdate = true;
  }

  getEdgeIndices(): { srcIdx: number; tgtIdx: number }[] {
    return this.edgeIndices;
  }

  dispose() {
    this.line.geometry.dispose();
    (this.line.material as THREE.Material).dispose();
  }
}
