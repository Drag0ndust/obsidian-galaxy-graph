/**
 * ForceWorker — runs a simple force-directed layout off the main thread.
 *
 * We implement a lightweight force sim here instead of importing d3-force
 * to keep the bundle small and avoid worker bundling complexity.
 *
 * Messages IN:
 *   { type: "init", nodes: {id,linkCount}[], edges: {source,target}[] }
 *   { type: "stop" }
 *
 * Messages OUT:
 *   { type: "tick", positions: Float32Array }  // [x0,y0,z0, x1,y1,z1, ...]
 *   { type: "done" }
 */

interface SimNode {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  linkCount: number;
}

interface SimEdge {
  source: number; // index into nodes
  target: number;
}

let nodes: SimNode[] = [];
let edges: SimEdge[] = [];
let running = false;
let iteration = 0;
const MAX_ITERATIONS = 300;

// Tuning knobs
const REPULSION = 800;
const ATTRACTION = 0.005;
const DAMPING = 0.92;
const CENTER_GRAVITY = 0.01;
const GALAXY_FLATTEN = 0.3; // squash Z to create disc shape

self.onmessage = (e: MessageEvent) => {
  const msg = e.data;

  if (msg.type === "init") {
    const idToIndex = new Map<string, number>();
    nodes = msg.nodes.map((n: any, i: number) => {
      idToIndex.set(n.id, i);
      // Seed positions in a disc shape
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * 100 + 10;
      return {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        z: (Math.random() - 0.5) * 20,
        vx: 0,
        vy: 0,
        vz: 0,
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

  if (msg.type === "stop") {
    running = false;
  }
};

function tick() {
  if (!running || iteration >= MAX_ITERATIONS) {
    self.postMessage({ type: "done" });
    return;
  }

  const alpha = 1 - iteration / MAX_ITERATIONS; // cooling schedule
  const n = nodes.length;

  // --- Repulsion (Barnes-Hut would be better for 10k+, but brute force is fine up to ~3k) ---
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      const dz = nodes[i].z - nodes[j].z;
      const distSq = dx * dx + dy * dy + dz * dz + 1; // +1 to avoid zero
      const force = (REPULSION * alpha) / distSq;
      const fx = dx * force;
      const fy = dy * force;
      const fz = dz * force;
      nodes[i].vx += fx;
      nodes[i].vy += fy;
      nodes[i].vz += fz;
      nodes[j].vx -= fx;
      nodes[j].vy -= fy;
      nodes[j].vz -= fz;
    }
  }

  // --- Attraction along edges ---
  for (const edge of edges) {
    const s = nodes[edge.source];
    const t = nodes[edge.target];
    const dx = t.x - s.x;
    const dy = t.y - s.y;
    const dz = t.z - s.z;
    const fx = dx * ATTRACTION * alpha;
    const fy = dy * ATTRACTION * alpha;
    const fz = dz * ATTRACTION * alpha;
    s.vx += fx;
    s.vy += fy;
    s.vz += fz;
    t.vx -= fx;
    t.vy -= fy;
    t.vz -= fz;
  }

  // --- Center gravity + flatten Z + apply velocity ---
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const node = nodes[i];
    // Pull toward center
    node.vx -= node.x * CENTER_GRAVITY;
    node.vy -= node.y * CENTER_GRAVITY;
    node.vz -= node.z * CENTER_GRAVITY;
    // Flatten into disc
    node.vz *= GALAXY_FLATTEN;

    // Apply damping and integrate
    node.vx *= DAMPING;
    node.vy *= DAMPING;
    node.vz *= DAMPING;
    node.x += node.vx;
    node.y += node.vy;
    node.z += node.vz;

    positions[i * 3] = node.x;
    positions[i * 3 + 1] = node.y;
    positions[i * 3 + 2] = node.z;
  }

  self.postMessage({ type: "tick", positions }, [positions.buffer] as any);

  iteration++;
  // Use setTimeout to yield so we don't block the worker's event loop
  setTimeout(tick, 0);
}
