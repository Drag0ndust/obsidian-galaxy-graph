/**
 * Clustering.ts — Louvain community detection for vault graphs.
 *
 * Discovers organic clusters purely from link structure. Notes that
 * heavily cross-link end up in the same community regardless of which
 * folder they live in. This produces far more meaningful nebulae than
 * folder-based grouping.
 *
 * The Louvain algorithm works in two phases, repeated until convergence:
 *
 *  Phase 1 (local moves): For each node, try moving it to each neighbor's
 *  community. Accept the move that gives the biggest increase in modularity.
 *  Repeat until no move improves modularity.
 *
 *  Phase 2 (aggregation): Collapse each community into a single super-node.
 *  Edges between communities become weighted edges between super-nodes.
 *  Then go back to Phase 1 on the coarsened graph.
 *
 * Modularity Q measures: (fraction of edges within communities) minus
 * (expected fraction if edges were random). Higher Q = better partition.
 *
 * Time complexity: near-linear O(n log n) in practice.
 */

export interface Community {
  id: number;
  nodeIndices: number[];  // indices into the original node array
}

export interface ClusterResult {
  /** community assignment per node (same length as input nodes) */
  assignments: number[];
  /** list of communities with their member indices */
  communities: Community[];
  /** modularity score (0–1, higher = more structure) */
  modularity: number;
}

/**
 * Run Louvain community detection on a graph.
 *
 * @param nodeCount  Number of nodes
 * @param edges      Array of [sourceIndex, targetIndex] pairs
 * @returns          Community assignments and metadata
 */
export function detectCommunities(
  nodeCount: number,
  edges: [number, number][]
): ClusterResult {
  if (nodeCount === 0) {
    return { assignments: [], communities: [], modularity: 0 };
  }

  // Build adjacency with weights
  // For unweighted graphs, all weights = 1
  const adj: Map<number, number>[] = new Array(nodeCount);
  for (let i = 0; i < nodeCount; i++) {
    adj[i] = new Map();
  }

  let totalWeight = 0;

  for (const [s, t] of edges) {
    if (s === t) continue; // skip self-loops
    if (s < 0 || s >= nodeCount || t < 0 || t >= nodeCount) continue;

    // Undirected: add both directions
    const existing_st = adj[s].get(t) || 0;
    adj[s].set(t, existing_st + 1);
    const existing_ts = adj[t].get(s) || 0;
    adj[t].set(s, existing_ts + 1);
    totalWeight += 2; // each undirected edge contributes 2 to total
  }

  if (totalWeight === 0) {
    // No edges: every node is its own community
    const assignments = Array.from({ length: nodeCount }, (_, i) => i);
    const communities = assignments.map((_, i) => ({ id: i, nodeIndices: [i] }));
    return { assignments, communities, modularity: 0 };
  }

  const m = totalWeight / 2; // total edge weight (undirected)

  // ── Phase 1: Local moves ──

  // Initial: each node in its own community
  const community = new Array(nodeCount);
  for (let i = 0; i < nodeCount; i++) community[i] = i;

  // Weighted degree of each node
  const degree = new Float64Array(nodeCount);
  for (let i = 0; i < nodeCount; i++) {
    let d = 0;
    for (const w of adj[i].values()) d += w;
    degree[i] = d;
  }

  // Sum of degrees in each community
  const sigmaTot = new Float64Array(nodeCount);
  for (let i = 0; i < nodeCount; i++) sigmaTot[i] = degree[i];

  // Sum of internal edges in each community
  const sigmaIn = new Float64Array(nodeCount); // starts at 0

  let improved = true;
  let passes = 0;
  const MAX_PASSES = 20;

  while (improved && passes < MAX_PASSES) {
    improved = false;
    passes++;

    // Shuffle node order for better convergence
    const order = Array.from({ length: nodeCount }, (_, i) => i);
    shuffleArray(order);

    for (const node of order) {
      const currentComm = community[node];
      const ki = degree[node]; // degree of this node

      // Compute ki_in for current community: sum of edge weights from node to current community
      let ki_in_current = 0;
      for (const [neighbor, weight] of adj[node]) {
        if (community[neighbor] === currentComm) ki_in_current += weight;
      }

      // "Remove" node from its community
      sigmaTot[currentComm] -= ki;
      sigmaIn[currentComm] -= 2 * ki_in_current; // internal edges counted twice

      // Try each neighboring community
      let bestComm = currentComm;
      let bestDeltaQ = 0;

      // Collect unique neighbor communities
      const neighborComms = new Map<number, number>(); // comm → sum of edge weights to that comm
      for (const [neighbor, weight] of adj[node]) {
        const nc = community[neighbor];
        neighborComms.set(nc, (neighborComms.get(nc) || 0) + weight);
      }

      for (const [targetComm, ki_in_target] of neighborComms) {
        // Modularity gain of moving node to targetComm
        // ΔQ = [ki_in_target / m] - [sigmaTot[targetComm] * ki / (2m²)]
        const deltaQ =
          ki_in_target / m -
          (sigmaTot[targetComm] * ki) / (2 * m * m);

        if (deltaQ > bestDeltaQ) {
          bestDeltaQ = deltaQ;
          bestComm = targetComm;
        }
      }

      // Also consider staying in current (now empty of this node) community
      // This is already handled since bestDeltaQ starts at 0

      // Move node to best community
      community[node] = bestComm;

      // Recompute ki_in for the best community
      let ki_in_best = 0;
      for (const [neighbor, weight] of adj[node]) {
        if (community[neighbor] === bestComm) ki_in_best += weight;
      }

      sigmaTot[bestComm] += ki;
      sigmaIn[bestComm] += 2 * ki_in_best;

      if (bestComm !== currentComm) {
        improved = true;
      }
    }
  }

  // ── Collect results ──

  // Remap community IDs to 0..N-1
  const commIdMap = new Map<number, number>();
  let nextId = 0;
  const assignments = new Array(nodeCount);

  for (let i = 0; i < nodeCount; i++) {
    const c = community[i];
    if (!commIdMap.has(c)) commIdMap.set(c, nextId++);
    assignments[i] = commIdMap.get(c)!;
  }

  // Build community objects
  const communityMap = new Map<number, number[]>();
  for (let i = 0; i < nodeCount; i++) {
    const cid = assignments[i];
    if (!communityMap.has(cid)) communityMap.set(cid, []);
    communityMap.get(cid)!.push(i);
  }

  const communities: Community[] = [];
  for (const [id, nodeIndices] of communityMap) {
    communities.push({ id, nodeIndices });
  }

  // Sort by size (largest first) for consistent coloring
  communities.sort((a, b) => b.nodeIndices.length - a.nodeIndices.length);

  // Reassign IDs after sort
  for (let i = 0; i < communities.length; i++) {
    communities[i].id = i;
    for (const ni of communities[i].nodeIndices) {
      assignments[ni] = i;
    }
  }

  // Compute final modularity
  const modularity = computeModularity(nodeCount, adj, assignments, m);

  return { assignments, communities, modularity };
}

function computeModularity(
  nodeCount: number,
  adj: Map<number, number>[],
  assignments: number[],
  m: number
): number {
  if (m === 0) return 0;

  let q = 0;
  for (let i = 0; i < nodeCount; i++) {
    let ki = 0;
    for (const w of adj[i].values()) ki += w;

    for (const [j, wij] of adj[i]) {
      if (assignments[i] !== assignments[j]) continue;
      let kj = 0;
      for (const w of adj[j].values()) kj += w;
      q += wij - (ki * kj) / (2 * m);
    }
  }

  return q / (2 * m);
}

function shuffleArray(arr: number[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
