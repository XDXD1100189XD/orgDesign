import type { DashboardData } from "../../lib/types";

export interface HierarchySearchResult {
  id: string;
  title: string;
  subtitle: string;
  context: string;
  managerName: string | null;
  depth: number | null;
  pathIds: string[];
  isUnassigned: boolean;
}

export function getPositionPath(
  data: DashboardData,
  id: string,
  rootId?: string,
): string[] {
  if (!data.vertices[id]) return [];

  const path: string[] = [];
  const seen = new Set<string>();
  let cur: string | undefined = id;

  while (cur && data.vertices[cur] && !seen.has(cur)) {
    path.push(cur);
    if (cur === rootId) break;
    seen.add(cur);
    cur = data.metrics.parent[cur];
  }

  const ordered = path.reverse();
  if (!rootId) return ordered;

  const rootIdx = ordered.indexOf(rootId);
  return rootIdx >= 0 ? ordered.slice(rootIdx) : ordered;
}

export function searchHierarchyPositions(
  data: DashboardData,
  query: string,
): HierarchySearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return Object.entries(data.vertices)
    .filter(([id, v]) => {
      const fields = [
        id,
        v.display_name,
        v.role,
        v.id,
        v.dept,
        v.grade,
        v.geo,
      ].filter((part): part is string => Boolean(part));
      if (q.length <= 2) {
        return fields.some((field) => field.toLowerCase() === q);
      }
      return fields.join(" ").toLowerCase().includes(q);
    })
    .map(([id, v]) => {
      const parentId = data.metrics.parent[id];
      const manager = parentId ? data.vertices[parentId] : undefined;
      const depth = data.metrics.depth[id] ?? null;
      const contextParts = [
        v.dept,
        v.geo,
        v.grade,
        depth != null ? `Layer ${depth}` : "Unassigned",
      ].filter((part): part is string => Boolean(part));

      return {
        id,
        title: v.unnamed || v.open_role ? v.role || v.display_name : v.display_name,
        subtitle: v.unnamed || v.open_role ? "Open position" : v.role,
        context: contextParts.join(" · "),
        managerName: manager?.display_name ?? null,
        depth,
        pathIds: getPositionPath(data, id),
        isUnassigned: !parentId && !data.metrics.basic.roots.includes(id),
      };
    })
    .sort((a, b) => {
      const depthA = a.depth ?? Number.MAX_SAFE_INTEGER;
      const depthB = b.depth ?? Number.MAX_SAFE_INTEGER;
      if (depthA !== depthB) return depthA - depthB;
      return a.title.localeCompare(b.title);
    });
}
