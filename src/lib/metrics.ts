import type { RawEdge, ComputedMetrics } from './types';

export function computeMetrics(edges: RawEdge[]): ComputedMetrics {
  const children: Record<string, string[]> = {};
  const parent: Record<string, string> = {};
  const nodes = new Set<string>();

  edges.forEach((e) => {
    const u = e.manager_temp_id;
    const v = e.employee_temp_id;
    if (!children[u]) children[u] = [];
    children[u].push(v);
    parent[v] = u;
    nodes.add(u);
    nodes.add(v);
  });

  const nodeList = Array.from(nodes);
  const roots = nodeList.filter((n) => !(n in parent));

  // Span
  const span: Record<string, number> = {};
  nodeList.forEach((n) => (span[n] = children[n] ? children[n].length : 0));

  // Depth (BFS)
  const depth: Record<string, number> = {};
  roots.forEach((root) => {
    const q: [string, number][] = [[root, 0]];
    while (q.length) {
      const [node, d] = q.shift()!;
      depth[node] = d;
      (children[node] || []).forEach((c) => q.push([c, d + 1]));
    }
  });

  const orgDepth = Object.values(depth).length
    ? Math.max(...Object.values(depth))
    : 0;

  // Width per level
  const width: Record<string, number> = {};
  Object.values(depth).forEach((d) => {
    width[d] = (width[d] || 0) + 1;
  });

  // Managers
  const managers = nodeList.filter((n) => span[n] > 0);
  const M = managers.length;
  const avgSpan = M > 0 ? managers.reduce((s, n) => s + span[n], 0) / M : 0;
  const spanVar =
    M > 0
      ? managers.reduce((s, n) => s + Math.pow(span[n] - avgSpan, 2), 0) / M
      : 0;

  // Gini
  let gini = 0;
  if (M > 0) {
    const spans = managers.map((n) => span[n]);
    const tot = spans.reduce((a, b) => a + b, 0);
    if (tot > 0) {
      let diff = 0;
      for (let i = 0; i < M; i++)
        for (let j = 0; j < M; j++) diff += Math.abs(spans[i] - spans[j]);
      gini = diff / (2 * M * tot);
    }
  }

  const T = 5;
  const overloaded = managers.filter((n) => span[n] > T).length;
  const SOI = M > 0 ? overloaded / M : 0;
  const LES = orgDepth > 0 ? nodeList.length / orgDepth : 0;

  // Diameter (2-BFS)
  const graph: Record<string, string[]> = {};
  nodeList.forEach((n) => (graph[n] = []));
  edges.forEach((e) => {
    graph[e.manager_temp_id].push(e.employee_temp_id);
    graph[e.employee_temp_id].push(e.manager_temp_id);
  });

  function bfs(start: string) {
    const visited = new Set([start]);
    const q: [string, number][] = [[start, 0]];
    let far = start,
      maxD = 0;
    while (q.length) {
      const [n, d] = q.shift()!;
      if (d > maxD) {
        maxD = d;
        far = n;
      }
      graph[n].forEach((nei) => {
        if (!visited.has(nei)) {
          visited.add(nei);
          q.push([nei, d + 1]);
        }
      });
    }
    return { far, maxD };
  }

  let diameter = 0;
  if (nodeList.length) {
    const a = bfs(nodeList[0]);
    const b = bfs(a.far);
    diameter = b.maxD;
  }

  const avgConfidence =
    edges.length > 0
      ? edges.reduce((s, e) => s + (e.edge_confidence || 0), 0) / edges.length
      : 0;

  return {
    basic: {
      total_nodes: nodeList.length,
      total_edges: edges.length,
      root_count: roots.length,
      roots,
    },
    span,
    depth,
    children,
    parent,
    org_structure: {
      org_depth: orgDepth,
      width_per_level: width,
      layer_efficiency_score: LES,
      diameter,
    },
    management: {
      manager_count: M,
      avg_span: avgSpan,
      span_variance: spanVar,
      span_gini: gini,
      span_overload_index: SOI,
      overload_threshold: T,
      overloaded,
    },
    avg_confidence: avgConfidence,
  };
}
