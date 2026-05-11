import type { ColumnMapping } from "./fieldDictionary";
import type { ExcelRow } from "./parseExcel";
import type { DashboardData } from "./types";

export type ChangeScope = "as-is" | "to-be" | "compensation" | "mapping" | "rows" | "session";
export type ChangeAction =
  | "initialize"
  | "upload"
  | "copy"
  | "reset"
  | "hierarchy"
  | "metadata"
  | "compensation"
  | "mapping"
  | "rows"
  | "revert";

export interface ChangeSnapshot {
  data?: DashboardData | null;
  toBeData?: DashboardData | null;
  columnMapping?: ColumnMapping | null;
  excelRows?: ExcelRow[] | null;
  studioRows?: ExcelRow[] | null;
  asIsRows?: ExcelRow[] | null;
  toBeRows?: ExcelRow[] | null;
}

export interface ChangeImpact {
  beforeNodes: number;
  afterNodes: number;
  nodeDelta: number;
  beforeEdges: number;
  afterEdges: number;
  edgeDelta: number;
}

export interface ChangeRecord {
  id: string;
  timestamp: string;
  actor: string;
  scope: ChangeScope;
  action: ChangeAction;
  title: string;
  summary: string;
  details: string[];
  before: ChangeSnapshot;
  after: ChangeSnapshot;
  impact: ChangeImpact | null;
  reverted?: boolean;
  revertedAt?: string;
  revertOf?: string;
}

function clone<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function cloneSnapshot(snapshot: ChangeSnapshot): ChangeSnapshot {
  const out: ChangeSnapshot = {};
  if ("data" in snapshot) out.data = clone(snapshot.data ?? null);
  if ("toBeData" in snapshot) out.toBeData = clone(snapshot.toBeData ?? null);
  if ("columnMapping" in snapshot) out.columnMapping = clone(snapshot.columnMapping ?? null);
  if ("excelRows" in snapshot) out.excelRows = clone(snapshot.excelRows ?? null);
  if ("studioRows" in snapshot) out.studioRows = clone(snapshot.studioRows ?? null);
  if ("asIsRows" in snapshot) out.asIsRows = clone(snapshot.asIsRows ?? null);
  if ("toBeRows" in snapshot) out.toBeRows = clone(snapshot.toBeRows ?? null);
  return out;
}

function idForChange(): string {
  return `chg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function nodeCount(data?: DashboardData | null): number {
  return data ? Object.keys(data.vertices).length : 0;
}

function edgeCount(data?: DashboardData | null): number {
  return data?.edges.length ?? 0;
}

function parentMap(data?: DashboardData | null): Record<string, string> {
  const out: Record<string, string> = {};
  data?.edges.forEach((edge) => {
    out[edge.employee_temp_id] = edge.manager_temp_id;
  });
  return out;
}

function nameOf(data: DashboardData | null | undefined, id: string | undefined): string {
  if (!id) return "No manager";
  return data?.vertices[id]?.display_name || id;
}

function formatDelta(n: number): string {
  if (n === 0) return "0";
  return n > 0 ? `+${n}` : String(n);
}

function impactFor(before?: DashboardData | null, after?: DashboardData | null): ChangeImpact | null {
  if (!before && !after) return null;
  const beforeNodes = nodeCount(before);
  const afterNodes = nodeCount(after);
  const beforeEdges = edgeCount(before);
  const afterEdges = edgeCount(after);
  return {
    beforeNodes,
    afterNodes,
    nodeDelta: afterNodes - beforeNodes,
    beforeEdges,
    afterEdges,
    edgeDelta: afterEdges - beforeEdges,
  };
}

function describeDataChange(
  before: DashboardData | null | undefined,
  after: DashboardData | null | undefined,
  scopeLabel: string,
): { title: string; summary: string; details: string[]; impact: ChangeImpact | null } {
  const impact = impactFor(before, after);
  if (!before && after) {
    return {
      title: `${scopeLabel} initialized`,
      summary: `${nodeCount(after).toLocaleString()} nodes and ${edgeCount(after).toLocaleString()} reporting lines loaded.`,
      details: ["Baseline snapshot captured for future reverts."],
      impact,
    };
  }
  if (before && !after) {
    return {
      title: `${scopeLabel} reset`,
      summary: `${nodeCount(before).toLocaleString()} nodes removed from this state.`,
      details: ["The previous state remains available inside this change record."],
      impact,
    };
  }
  if (!before || !after) {
    return {
      title: `${scopeLabel} updated`,
      summary: "State snapshot changed.",
      details: [],
      impact,
    };
  }

  const beforeIds = new Set(Object.keys(before.vertices));
  const afterIds = new Set(Object.keys(after.vertices));
  const added = [...afterIds].filter((id) => !beforeIds.has(id));
  const removed = [...beforeIds].filter((id) => !afterIds.has(id));
  const shared = [...afterIds].filter((id) => beforeIds.has(id));
  const beforeParents = parentMap(before);
  const afterParents = parentMap(after);
  const moved = shared.filter((id) => beforeParents[id] !== afterParents[id]);
  const fieldChanged = shared.filter((id) => {
    const a = before.vertices[id];
    const b = after.vertices[id];
    return JSON.stringify({
      display_name: a.display_name,
      role: a.role,
      grade: a.grade,
      geo: a.geo ?? null,
      dept: a.dept,
      open_role: a.open_role,
      id: a.id,
    }) !== JSON.stringify({
      display_name: b.display_name,
      role: b.role,
      grade: b.grade,
      geo: b.geo ?? null,
      dept: b.dept,
      open_role: b.open_role,
      id: b.id,
    });
  });

  const details: string[] = [];
  added.slice(0, 5).forEach((id) => {
    details.push(`Added ${nameOf(after, id)} under ${nameOf(after, afterParents[id])}.`);
  });
  removed.slice(0, 5).forEach((id) => {
    details.push(`Removed ${nameOf(before, id)}.`);
  });
  moved.slice(0, 5).forEach((id) => {
    details.push(`Moved ${nameOf(after, id)} from ${nameOf(before, beforeParents[id])} to ${nameOf(after, afterParents[id])}.`);
  });
  fieldChanged.slice(0, 5).forEach((id) => {
    const a = before.vertices[id];
    const b = after.vertices[id];
    const fields: string[] = [];
    if (a.display_name !== b.display_name) fields.push("name");
    if (a.role !== b.role) fields.push("role");
    if (a.grade !== b.grade) fields.push("grade");
    if ((a.geo ?? null) !== (b.geo ?? null)) fields.push("location");
    if (a.dept !== b.dept) fields.push("department");
    if (a.open_role !== b.open_role) fields.push("status");
    if (a.id !== b.id) fields.push("id");
    details.push(`Updated ${nameOf(after, id)} (${fields.join(", ")}).`);
  });

  const hidden = added.length + removed.length + moved.length + fieldChanged.length - details.length;
  if (hidden > 0) details.push(`${hidden} additional item${hidden === 1 ? "" : "s"} changed.`);

  const counts: string[] = [];
  if (added.length) counts.push(`${added.length} added`);
  if (removed.length) counts.push(`${removed.length} removed`);
  if (moved.length) counts.push(`${moved.length} moved`);
  if (fieldChanged.length) counts.push(`${fieldChanged.length} edited`);
  if (!counts.length && impact) {
    if (impact.edgeDelta !== 0) counts.push(`${formatDelta(impact.edgeDelta)} reporting lines`);
    if (impact.nodeDelta !== 0) counts.push(`${formatDelta(impact.nodeDelta)} nodes`);
  }

  return {
    title: counts.length ? `${scopeLabel}: ${counts.join(", ")}` : `${scopeLabel} updated`,
    summary: impact
      ? `${impact.afterNodes.toLocaleString()} nodes (${formatDelta(impact.nodeDelta)}), ${impact.afterEdges.toLocaleString()} reporting lines (${formatDelta(impact.edgeDelta)}).`
      : "State snapshot changed.",
    details: details.length ? details : ["Snapshot changed with no structural delta."],
    impact,
  };
}

function describeMappingChange(
  before: ColumnMapping | null | undefined,
  after: ColumnMapping | null | undefined,
): { title: string; summary: string; details: string[] } {
  if (!before && after) {
    return {
      title: "Field mapping initialized",
      summary: `${Object.keys(after).length} mapped fields captured.`,
      details: Object.entries(after).slice(0, 6).map(([field, map]) => `${field}: ${map.column}`),
    };
  }
  if (!after) {
    return { title: "Field mapping cleared", summary: "Column mapping was removed.", details: [] };
  }
  const details = Object.entries(after)
    .filter(([field, map]) => before?.[field as keyof ColumnMapping]?.column !== map.column)
    .map(([field, map]) => `${field}: ${before?.[field as keyof ColumnMapping]?.column || "Unmapped"} -> ${map.column}`);
  return {
    title: details.length ? "Field mapping updated" : "Field mapping reviewed",
    summary: details.length ? `${details.length} field mapping${details.length === 1 ? "" : "s"} changed.` : "No field mapping differences detected.",
    details,
  };
}

export function createChangeRecord(args: {
  actor?: string;
  scope: ChangeScope;
  action: ChangeAction;
  title?: string;
  summary?: string;
  details?: string[];
  before: ChangeSnapshot;
  after: ChangeSnapshot;
  revertOf?: string;
}): ChangeRecord {
  const before = cloneSnapshot(args.before);
  const after = cloneSnapshot(args.after);
  const scopeLabel =
    args.scope === "as-is" ? "As-Is"
      : args.scope === "to-be" ? "To-Be"
          : args.scope === "compensation" ? "Compensation setup"
            : args.scope === "mapping" ? "Field mapping"
              : args.scope === "rows" ? "Employee rows"
                : "Session";

  const dataDescription =
    args.scope === "to-be"
      ? describeDataChange(before.toBeData, after.toBeData, scopeLabel)
      : describeDataChange(before.data, after.data, scopeLabel);
  const mappingDescription = args.scope === "mapping"
    ? describeMappingChange(before.columnMapping, after.columnMapping)
    : null;

  return {
    id: idForChange(),
    timestamp: new Date().toISOString(),
    actor: args.actor ?? "Dashboard user",
    scope: args.scope,
    action: args.action,
    title: args.title ?? mappingDescription?.title ?? dataDescription.title,
    summary: args.summary ?? mappingDescription?.summary ?? dataDescription.summary,
    details: args.details ?? mappingDescription?.details ?? dataDescription.details,
    before,
    after,
    impact: dataDescription.impact,
    revertOf: args.revertOf,
  };
}
