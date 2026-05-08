import type { DashboardData, NormalizedVertex, RawEdge } from './types';
import type { ColumnMapping } from './fieldDictionary';
import type { ExcelRow } from './parseExcel';
import { computeMetrics } from './metrics';

function cellStr(row: ExcelRow, col: string | null): string {
  if (!col) return '';
  const v = row[col];
  return v == null ? '' : String(v).trim();
}

const OPEN_TERMS = ['open', 'vacant', 'unfilled', 'in progress', 'recruiting', 'posted', 'active req', 'open req', 'active position'];
const FILLED_TERMS = ['filled', 'closed', 'inactive', 'frozen', 'cancelled', 'canceled', 'active'];

function isOpenPosition(status: string): boolean {
  const s = status.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim();
  if (OPEN_TERMS.some(t => s.includes(t))) return true;
  if (FILLED_TERMS.some(t => s.includes(t))) return false;
  return false;
}

export function buildHierarchyFromMapping(
  rows: ExcelRow[],
  mapping: ColumnMapping,
): DashboardData {
  const empIdCol   = mapping['Employee ID'].column;
  const mgrIdCol   = mapping['Manager ID'].column;
  const nameCol    = mapping['Full Name'].column;
  const titleCol   = mapping['Business Title'].column;
  const gradeCol   = mapping['Compensation Grade'].column;
  const deptCol    = mapping['Department Name'].column;
  const statusCol  = mapping['Position Status'].column;

  const vertices: Record<string, NormalizedVertex> = {};
  const empIdToTempId = new Map<string, string>();
  const seenEmpIds = new Set<string>();

  // First pass — build vertices
  rows.forEach((row, idx) => {
    const empId = cellStr(row, empIdCol);
    const tempId = empId || `__row_${idx}`;

    if (empId && seenEmpIds.has(empId)) return;
    if (empId) {
      seenEmpIds.add(empId);
      empIdToTempId.set(empId, tempId);
    }

    const name = cellStr(row, nameCol);
    const statusRaw = cellStr(row, statusCol);

    vertices[tempId] = {
      display_name: name || empId || `Employee ${idx + 1}`,
      role:         cellStr(row, titleCol) || '—',
      id:           empId || null,
      grade:        cellStr(row, gradeCol) || null,
      unnamed:      !name,
      dept:         cellStr(row, deptCol) || null,
      open_role:    statusRaw ? isOpenPosition(statusRaw) : false,
    };
  });

  // Second pass — build edges
  const edges: RawEdge[] = [];
  const addedEdges = new Set<string>();

  rows.forEach((row) => {
    const empId = cellStr(row, empIdCol);
    const mgrId = cellStr(row, mgrIdCol);
    if (!empId || !mgrId || mgrId === empId) return;

    const empTempId = empIdToTempId.get(empId);
    const mgrTempId = empIdToTempId.get(mgrId);
    if (!empTempId || !mgrTempId) return;

    const key = `${mgrTempId}→${empTempId}`;
    if (addedEdges.has(key)) return;
    addedEdges.add(key);

    edges.push({
      employee_temp_id: empTempId,
      manager_temp_id:  mgrTempId,
      employee_original: empId,
      manager_original:  mgrId,
      edge_confidence:   1,
    });
  });

  return {
    vertices,
    metrics: computeMetrics(edges),
    warnings: [],
    edges,
  };
}
