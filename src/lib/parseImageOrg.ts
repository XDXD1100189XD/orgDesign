import type { RawEdge, RawVertex } from "./types";

export interface ShapeInput {
  shape_number: number;
  is_vacant_marker: boolean;
  fields: string[];
}

export interface CanonicalRecord {
  shape_number: number;
  is_position: boolean;
  is_vacant?: boolean;
  name?: string | null;
  employee_id?: string | null;
  role?: string | null;
  team?: string | null;
  grade?: string | null;
  department?: string | null;
  job_id?: string | null;
  location?: string | null;
  raw_text?: string;
  confidence?: "high" | "medium" | "low";
  filter_reason?: string;
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "_");
}

export function parseEntityRawToShapes(text: string): ShapeInput[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const shapes: ShapeInput[] = [];
  let shapeNumber = 1;
  for (const line of lines) {
    let working = line;
    if (working.endsWith(";")) working = working.slice(0, -1).trim();
    if (!working) continue;
    let isVacant = false;
    if (working.startsWith("VACANT:")) {
      isVacant = true;
      working = working.slice("VACANT:".length).trim();
    }
    const fields = working.split(" | ").map((f) => f.trim()).filter(Boolean);
    if (fields.length > 0) {
      shapes.push({ shape_number: shapeNumber++, is_vacant_marker: isVacant, fields });
    }
  }
  return shapes;
}

export function resolveToWebhookResponse(
  canonicalRecords: CanonicalRecord[],
  relationshipText: string,
): { vertex_lookup: Record<string, RawVertex>; resolved_edges: RawEdge[]; warnings: string[] } {
  const warnings: string[] = [];
  const positions = canonicalRecords.filter((r) => r.is_position);

  // Count roles to decide whether to add role-based lookup (only if unique)
  const roleCounts = new Map<string, number>();
  for (const r of positions) {
    if (r.role) roleCounts.set(slugify(r.role), (roleCounts.get(slugify(r.role)) ?? 0) + 1);
  }

  type RecordWithId = CanonicalRecord & { _temp_id: string };
  const recordsWithId: RecordWithId[] = [];
  const identifierMap = new Map<string, RecordWithId>();

  for (const r of positions) {
    const tempId = r.employee_id
      ? r.employee_id
      : r.name
        ? slugify(r.name)
        : r.role
          ? slugify(`${r.role}${r.team ? "_" + r.team : ""}`)
          : `shape_${r.shape_number}`;
    const record: RecordWithId = { ...r, _temp_id: tempId };
    recordsWithId.push(record);
    if (r.name) identifierMap.set(slugify(r.name), record);
    if (r.employee_id) identifierMap.set(slugify(r.employee_id), record);
    if (r.role && (roleCounts.get(slugify(r.role)) ?? 0) <= 1) {
      identifierMap.set(slugify(r.role), record);
    }
  }

  const vertex_lookup: Record<string, RawVertex> = {};
  for (const r of recordsWithId) {
    vertex_lookup[r._temp_id] = {
      temp_id: r._temp_id,
      display_name: r.name ?? r.role ?? r._temp_id,
      role: r.role ?? "",
      id: r.employee_id ?? null,
      grade: r.grade ?? undefined,
      dept: r.team ?? r.department ?? undefined,
      open_role: r.is_vacant ?? false,
      unnamed: !r.name && !r.employee_id,
    };
  }

  const resolved_edges: RawEdge[] = [];
  for (const line of relationshipText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.includes(" -> ")) continue;
    const arrowIdx = trimmed.indexOf(" -> ");
    const topId = trimmed.slice(0, arrowIdx).trim();
    const rest = trimmed.slice(arrowIdx + 4).trim();
    const pipeIdx = rest.indexOf(" | ");
    const bottomId = (pipeIdx >= 0 ? rest.slice(0, pipeIdx) : rest).trim();
    const lineType = pipeIdx >= 0 ? rest.slice(pipeIdx + 3).trim().toUpperCase() : "SOLID";

    const managerRecord = identifierMap.get(slugify(topId));
    const employeeRecord = identifierMap.get(slugify(bottomId));

    if (!managerRecord) {
      warnings.push(`Unresolved manager identifier: "${topId}"`);
      continue;
    }
    if (!employeeRecord) {
      warnings.push(`Unresolved employee identifier: "${bottomId}"`);
      continue;
    }
    if (managerRecord._temp_id === employeeRecord._temp_id) continue;

    resolved_edges.push({
      manager_temp_id: managerRecord._temp_id,
      employee_temp_id: employeeRecord._temp_id,
      manager_original: topId,
      employee_original: bottomId,
      edge_confidence: lineType === "DASHED" || lineType === "UNCLEAR" ? 0.5 : 1.0,
    });
  }

  return { vertex_lookup, resolved_edges, warnings };
}
