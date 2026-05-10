import { App } from "obsidian";
import { detectCommunities, Community } from "./Clustering";

export interface GraphNode {
  id: string;
  name: string;
  folder: string;
  linkCount: number;
  lastModified: number;
  tags: string[];
  communityId: number;  // assigned by Louvain algorithm
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface VaultGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  folders: string[];
  tags: string[];
  communities: Community[];  // detected clusters
  modularity: number;        // quality score (0–1)
}

export function buildVaultGraph(app: App): VaultGraph {
  const resolvedLinks = app.metadataCache.resolvedLinks;
  const nodeMap = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const folderSet = new Set<string>();
  const tagSet = new Set<string>();

  const files = app.vault.getMarkdownFiles();
  for (const file of files) {
    const folder = getTopFolder(file.path);
    folderSet.add(folder);

    const fileTags: string[] = [];
    const cache = app.metadataCache.getFileCache(file);
    if (cache) {
      if (cache.frontmatter?.tags) {
        const fmTags = cache.frontmatter.tags;
        if (Array.isArray(fmTags)) {
          fmTags.forEach((t: string) => {
            const clean = t.replace(/^#/, "").trim();
            if (clean) { fileTags.push(clean); tagSet.add(clean); }
          });
        } else if (typeof fmTags === "string") {
          const clean = fmTags.replace(/^#/, "").trim();
          if (clean) { fileTags.push(clean); tagSet.add(clean); }
        }
      }
      if (cache.tags) {
        for (const tagRef of cache.tags) {
          const clean = tagRef.tag.replace(/^#/, "").trim();
          if (clean && !fileTags.includes(clean)) {
            fileTags.push(clean);
            tagSet.add(clean);
          }
        }
      }
    }

    nodeMap.set(file.path, {
      id: file.path,
      name: file.basename,
      folder,
      linkCount: 0,
      lastModified: file.stat.mtime,
      tags: fileTags,
      communityId: 0, // will be set by Louvain
    });
  }

  for (const sourcePath in resolvedLinks) {
    const targets = resolvedLinks[sourcePath];
    if (!targets) continue;
    for (const targetPath in targets) {
      if (!nodeMap.has(sourcePath) || !nodeMap.has(targetPath)) continue;
      edges.push({ source: sourcePath, target: targetPath });
      nodeMap.get(sourcePath)!.linkCount++;
      nodeMap.get(targetPath)!.linkCount++;
    }
  }

  const nodes = Array.from(nodeMap.values());

  // ── Run Louvain community detection ──
  // Build index-based edge list for the algorithm
  const pathToIdx = new Map<string, number>();
  nodes.forEach((n, i) => pathToIdx.set(n.id, i));

  const indexEdges: [number, number][] = [];
  for (const edge of edges) {
    const si = pathToIdx.get(edge.source);
    const ti = pathToIdx.get(edge.target);
    if (si !== undefined && ti !== undefined) {
      indexEdges.push([si, ti]);
    }
  }

  const clusterResult = detectCommunities(nodes.length, indexEdges);

  // Assign community IDs back to nodes
  for (let i = 0; i < nodes.length; i++) {
    nodes[i].communityId = clusterResult.assignments[i];
  }

  return {
    nodes,
    edges,
    folders: Array.from(folderSet).sort(),
    tags: Array.from(tagSet).sort(),
    communities: clusterResult.communities,
    modularity: clusterResult.modularity,
  };
}

function getTopFolder(path: string): string {
  const parts = path.split("/");
  return parts.length > 1 ? parts[0] : "(root)";
}
