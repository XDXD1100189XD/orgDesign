import type { CanonicalField, ColumnMapping } from "./fieldDictionary";
import type { ExcelRow } from "./parseExcel";
import type { DashboardData } from "./types";

export interface HierarchyPositionPayload {
  employeeId: string;
  managerId: string;
  name: string;
  role: string;
  department: string;
  grade: string;
  location: string;
  country: string;
  region: string;
  status: string;
  extraFields?: Partial<Record<CanonicalField, string>>;
}

function mappedColumn(mapping: ColumnMapping, field: CanonicalField): string | null {
  return mapping[field]?.column ?? null;
}

function fieldValue(payload: HierarchyPositionPayload, field: CanonicalField): string {
  const extra = payload.extraFields?.[field];
  if (extra != null) return extra;

  switch (field) {
    case "Employee ID":
      return payload.employeeId;
    case "Manager ID":
      return payload.managerId;
    case "Full Name":
      return payload.name;
    case "Business Title":
      return payload.role;
    case "Department Name":
      return payload.department;
    case "Compensation Grade":
      return payload.grade;
    case "Location":
      return payload.location;
    case "Country":
      return payload.country;
    case "Region":
      return payload.region;
    case "Position Status":
      return payload.status;
    default:
      return "";
  }
}

function cloneRows(rows: ExcelRow[]): ExcelRow[] {
  return rows.map((row) => ({ ...row }));
}

function employeeIdColumn(mapping: ColumnMapping): string {
  const col = mappedColumn(mapping, "Employee ID");
  if (!col) throw new Error("Employee ID is not mapped.");
  return col;
}

function managerIdColumn(mapping: ColumnMapping): string {
  const col = mappedColumn(mapping, "Manager ID");
  if (!col) throw new Error("Manager ID is not mapped.");
  return col;
}

export function rowFromPositionPayload(
  mapping: ColumnMapping,
  payload: HierarchyPositionPayload,
): ExcelRow {
  const row: ExcelRow = {};
  for (const [field, entry] of Object.entries(mapping) as [CanonicalField, ColumnMapping[CanonicalField]][]) {
    if (!entry.column) continue;
    const value = fieldValue(payload, field);
    if (value !== "") row[entry.column] = value;
  }
  return row;
}

export function addPositionRow(
  rows: ExcelRow[],
  mapping: ColumnMapping,
  payload: HierarchyPositionPayload,
): ExcelRow[] {
  const idCol = employeeIdColumn(mapping);
  const employeeId = payload.employeeId.trim();
  if (!employeeId) throw new Error("Employee ID is required.");
  if (rows.some((row) => String(row[idCol] ?? "").trim() === employeeId)) {
    throw new Error(`Employee ID ${employeeId} already exists.`);
  }

  return [...cloneRows(rows), rowFromPositionPayload(mapping, { ...payload, employeeId })];
}

export function editPositionRow(
  rows: ExcelRow[],
  mapping: ColumnMapping,
  currentEmployeeId: string,
  payload: HierarchyPositionPayload,
): ExcelRow[] {
  const idCol = employeeIdColumn(mapping);
  const nextRowPatch = rowFromPositionPayload(mapping, payload);
  return rows.map((row) => {
    const rowId = String(row[idCol] ?? "").trim();
    return rowId === currentEmployeeId ? { ...row, ...nextRowPatch } : { ...row };
  });
}

function isDescendant(data: DashboardData, possibleAncestorId: string, possibleDescendantId: string): boolean {
  let current = data.metrics.parent[possibleDescendantId];
  const seen = new Set<string>();
  while (current) {
    if (current === possibleAncestorId) return true;
    if (seen.has(current)) return false;
    seen.add(current);
    current = data.metrics.parent[current];
  }
  return false;
}

export function getTopLevelTransferIds(data: DashboardData, selectedIds: string[]): string[] {
  return selectedIds.filter((id) => {
    if (!data.vertices[id]) return false;
    return !selectedIds.some((otherId) => otherId !== id && isDescendant(data, otherId, id));
  });
}

function collectSubtreeIds(data: DashboardData, rootId: string): Set<string> {
  const ids = new Set<string>();
  const walk = (id: string) => {
    ids.add(id);
    (data.metrics.children[id] || []).forEach(walk);
  };
  walk(rootId);
  return ids;
}

export function validateTransferTarget(
  data: DashboardData,
  selectedIds: string[],
  targetId: string,
): { ok: true } | { ok: false; reason: string } {
  if (!targetId) return { ok: true };
  if (!data.vertices[targetId]) return { ok: false, reason: "Target manager was not found." };

  const topLevelIds = getTopLevelTransferIds(data, selectedIds);
  for (const id of topLevelIds) {
    if (collectSubtreeIds(data, id).has(targetId)) {
      return { ok: false, reason: "Target manager is inside a selected subtree." };
    }
  }
  return { ok: true };
}

export function transferPositionRows(
  rows: ExcelRow[],
  mapping: ColumnMapping,
  data: DashboardData,
  selectedIds: string[],
  targetManagerId: string,
): ExcelRow[] {
  const idCol = employeeIdColumn(mapping);
  const managerCol = managerIdColumn(mapping);
  const targetEmployeeId = targetManagerId ? data.vertices[targetManagerId]?.id ?? "" : "";
  const sourceEmployeeIds = new Set(
    getTopLevelTransferIds(data, selectedIds)
      .map((id) => data.vertices[id]?.id)
      .filter((id): id is string => !!id),
  );

  return rows.map((row) => {
    const rowEmployeeId = String(row[idCol] ?? "").trim();
    return sourceEmployeeIds.has(rowEmployeeId)
      ? { ...row, [managerCol]: targetEmployeeId }
      : { ...row };
  });
}

export function deletePositionRows(
  rows: ExcelRow[],
  mapping: ColumnMapping,
  employeeIds: string[],
): ExcelRow[] {
  const idCol = employeeIdColumn(mapping);
  const deleted = new Set(employeeIds.map((id) => id.trim()).filter(Boolean));
  return rows.filter((row) => !deleted.has(String(row[idCol] ?? "").trim())).map((row) => ({ ...row }));
}

export function deletePositionRowsWithReassignment(
  rows: ExcelRow[],
  mapping: ColumnMapping,
  deletedEmployeeId: string,
  directReportEmployeeIds: string[],
  targetManagerEmployeeId: string,
): ExcelRow[] {
  const managerCol = managerIdColumn(mapping);
  const directReports = new Set(directReportEmployeeIds.map((id) => id.trim()).filter(Boolean));
  return deletePositionRows(rows, mapping, [deletedEmployeeId]).map((row) => {
    const idCol = employeeIdColumn(mapping);
    const rowEmployeeId = String(row[idCol] ?? "").trim();
    return directReports.has(rowEmployeeId)
      ? { ...row, [managerCol]: targetManagerEmployeeId }
      : row;
  });
}
