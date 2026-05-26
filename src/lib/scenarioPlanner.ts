import type { ScenarioAction, ActionPreview, ValidatedPlan, CompMatrix } from './types';
import type { ColumnMapping } from './fieldDictionary';
import type { ExcelRow } from './parseExcel';
import { buildHierarchyFromMapping } from './buildHierarchy';
import { computeStateMetrics } from './computeStateMetrics';

type SimRows = ExcelRow[];
type RowIndex = Map<string, number>; // empId → index in sim array

function buildRowIndex(sim: SimRows, empIdCol: string): RowIndex {
  const idx = new Map<string, number>();
  sim.forEach((row, i) => {
    const empId = String(row[empIdCol] ?? '').trim();
    if (empId) idx.set(empId, i);
  });
  return idx;
}

function getName(sim: SimRows, rowIdx: number, nameCol: string | null): string {
  if (!nameCol || rowIdx < 0 || rowIdx >= sim.length) return 'Unknown';
  return String(sim[rowIdx][nameCol] ?? '').trim() || 'Unknown';
}

function isAncestorOf(
  candidateAncestor: string,
  node: string,
  mgrIdCol: string,
  sim: SimRows,
  rowByEmpId: RowIndex,
): boolean {
  let current = node;
  const visited = new Set<string>();
  while (true) {
    const idx = rowByEmpId.get(current);
    if (idx === undefined) return false;
    const mgr = String(sim[idx][mgrIdCol] ?? '').trim();
    if (!mgr || mgr === current) return false;
    if (mgr === candidateAncestor) return true;
    if (visited.has(mgr)) return false; // existing cycle guard
    visited.add(mgr);
    current = mgr;
  }
}

function generateUniqueId(base: string, rowByEmpId: RowIndex): string {
  if (!rowByEmpId.has(base)) return base;
  let counter = 1;
  while (rowByEmpId.has(`${base}-${counter}`)) counter++;
  return `${base}-${counter}`;
}

// ── Validation ────────────────────────────────────────────────────────────────

function validateAction(
  action: ScenarioAction,
  sim: SimRows,
  rowByEmpId: RowIndex,
  empIdCol: string,
  mgrIdCol: string,
  statusCol: string | null,
): { ok: true } | { ok: false; error: string; suggestion: string } {
  switch (action.type) {
    case 'reparent': {
      if (!rowByEmpId.has(action.node_id))
        return { ok: false, error: `node_id "${action.node_id}" not found`, suggestion: 'Use find_employees to get the exact employee ID.' };
      if (!rowByEmpId.has(action.new_parent_id))
        return { ok: false, error: `new_parent_id "${action.new_parent_id}" not found`, suggestion: 'Use find_employees to verify the parent ID.' };
      if (action.node_id === action.new_parent_id)
        return { ok: false, error: 'A node cannot be reparented to itself.', suggestion: 'Choose a different parent.' };
      if (isAncestorOf(action.new_parent_id, action.node_id, mgrIdCol, sim, rowByEmpId))
        return { ok: false, error: `Reparenting "${action.node_id}" under "${action.new_parent_id}" would create a cycle — the new parent is a descendant.`, suggestion: 'Reparent descendants first, or choose a different parent.' };
      return { ok: true };
    }
    case 'delete': {
      if (!rowByEmpId.has(action.node_id))
        return { ok: false, error: `node_id "${action.node_id}" not found`, suggestion: 'Use find_employees to get the exact employee ID.' };
      if (action.reassign_to && !rowByEmpId.has(action.reassign_to))
        return { ok: false, error: `reassign_to "${action.reassign_to}" not found`, suggestion: 'Use find_employees to verify the reassignment target.' };
      return { ok: true };
    }
    case 'create': {
      if (!rowByEmpId.has(action.parent_id))
        return { ok: false, error: `parent_id "${action.parent_id}" not found`, suggestion: 'Use find_employees to verify the parent ID.' };
      return { ok: true };
    }
    case 'update': {
      if (!rowByEmpId.has(action.node_id))
        return { ok: false, error: `node_id "${action.node_id}" not found`, suggestion: 'Use find_employees to get the exact employee ID.' };
      if (!action.fields || Object.keys(action.fields).length === 0)
        return { ok: false, error: 'No fields provided for update.', suggestion: 'Provide at least one field to update using exact Excel column names.' };
      if (sim.length > 0) {
        const validCols = new Set(Object.keys(sim[0]));
        const invalid = Object.keys(action.fields).filter(k => !validCols.has(k));
        if (invalid.length > 0)
          return { ok: false, error: `Unknown column(s): ${invalid.join(', ')}`, suggestion: `Valid columns: ${Array.from(validCols).slice(0, 10).join(', ')}… Call get_schema for the full list.` };
      }
      return { ok: true };
    }
    case 'toggle_open': {
      if (!rowByEmpId.has(action.node_id))
        return { ok: false, error: `node_id "${action.node_id}" not found`, suggestion: 'Use find_employees to get the exact employee ID.' };
      if (!statusCol)
        return { ok: false, error: 'Position Status field is not mapped. Cannot toggle vacancy directly.', suggestion: 'Use an update action on the relevant status column instead, or map Position Status in Data Readiness.' };
      return { ok: true };
    }
    default:
      return { ok: false, error: `Unknown action type: "${(action as ScenarioAction).type}"`, suggestion: 'Valid types: reparent, delete, create, update, toggle_open.' };
  }
}

// ── Apply (single action) ─────────────────────────────────────────────────────

interface ActionResult {
  preview: ActionPreview;
  affectedNode: { node_id: string; name: string; change: string };
}

function applyActionToRows(
  action: ScenarioAction,
  actionIdx: number,
  sim: SimRows,
  rowByEmpId: RowIndex,
  empIdCol: string,
  mgrIdCol: string,
  nameCol: string | null,
  statusCol: string | null,
  planId: string,
): ActionResult {
  switch (action.type) {
    case 'reparent': {
      const rowIdx = rowByEmpId.get(action.node_id)!;
      const oldMgrId = String(sim[rowIdx][mgrIdCol] ?? '').trim();
      const oldMgrIdx = rowByEmpId.get(oldMgrId);
      const oldMgrName = oldMgrIdx !== undefined && nameCol ? String(sim[oldMgrIdx][nameCol] ?? oldMgrId) : oldMgrId || '(none)';
      const newMgrIdx = rowByEmpId.get(action.new_parent_id);
      const newMgrName = newMgrIdx !== undefined && nameCol ? String(sim[newMgrIdx][nameCol] ?? action.new_parent_id) : action.new_parent_id;
      const nodeName = getName(sim, rowIdx, nameCol);
      sim[rowIdx] = { ...sim[rowIdx], [mgrIdCol]: action.new_parent_id };
      return {
        preview: { action_index: actionIdx, type: 'reparent', summary: `${nodeName} reparented from ${oldMgrName} to ${newMgrName}`, before: { [mgrIdCol]: oldMgrId }, after: { [mgrIdCol]: action.new_parent_id } },
        affectedNode: { node_id: action.node_id, name: nodeName, change: `reparented to ${newMgrName}` },
      };
    }

    case 'delete': {
      const rowIdx = rowByEmpId.get(action.node_id)!;
      const nodeName = getName(sim, rowIdx, nameCol);
      const nodeParentId = String(sim[rowIdx][mgrIdCol] ?? '').trim() || null;
      // Reassign direct children only (not all descendants)
      const directChildIndices: number[] = [];
      sim.forEach((r, i) => {
        if (String(r[mgrIdCol] ?? '').trim() === action.node_id) directChildIndices.push(i);
      });
      const reassignTo = action.reassign_to ?? nodeParentId;
      for (const ci of directChildIndices) {
        sim[ci] = { ...sim[ci], [mgrIdCol]: reassignTo ?? '' };
      }
      // Remove from map, splice array, re-index subsequent entries
      rowByEmpId.delete(action.node_id);
      sim.splice(rowIdx, 1);
      const toUpdate = Array.from(rowByEmpId.entries()).filter(([, i]) => i > rowIdx);
      for (const [id, i] of toUpdate) rowByEmpId.set(id, i - 1);

      const changeDesc = directChildIndices.length > 0
        ? `deleted (${directChildIndices.length} direct report(s) reassigned to ${reassignTo ?? 'none'})`
        : 'deleted';
      return {
        preview: { action_index: actionIdx, type: 'delete', summary: `${nodeName} deleted${directChildIndices.length > 0 ? ` (${directChildIndices.length} direct report(s) → ${reassignTo ?? 'none'})` : ''}` },
        affectedNode: { node_id: action.node_id, name: nodeName, change: changeDesc },
      };
    }

    case 'create': {
      const newId = generateUniqueId(`PLAN-${planId}-${actionIdx}`, rowByEmpId);
      const newRow: ExcelRow = { ...(action.fields as ExcelRow), [empIdCol]: newId, [mgrIdCol]: action.parent_id };
      const newName = nameCol ? String(action.fields[nameCol] ?? '(Open Role)') : '(Open Role)';
      const parentIdx = rowByEmpId.get(action.parent_id);
      const parentName = parentIdx !== undefined && nameCol ? String(sim[parentIdx][nameCol] ?? action.parent_id) : action.parent_id;
      sim.push(newRow);
      rowByEmpId.set(newId, sim.length - 1);
      return {
        preview: { action_index: actionIdx, type: 'create', summary: `New "${newName}" created under ${parentName}`, after: { [empIdCol]: newId, [mgrIdCol]: action.parent_id, ...action.fields } },
        affectedNode: { node_id: newId, name: newName, change: `created under ${parentName}` },
      };
    }

    case 'update': {
      const rowIdx = rowByEmpId.get(action.node_id)!;
      const nodeName = getName(sim, rowIdx, nameCol);
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(action.fields)) { before[k] = sim[rowIdx][k]; after[k] = v; }
      sim[rowIdx] = { ...sim[rowIdx], ...(action.fields as ExcelRow) };
      const changedFields = Object.keys(action.fields).join(', ');
      return {
        preview: { action_index: actionIdx, type: 'update', summary: `${nodeName}: updated ${changedFields}`, before, after },
        affectedNode: { node_id: action.node_id, name: nodeName, change: `updated: ${changedFields}` },
      };
    }

    case 'toggle_open': {
      const rowIdx = rowByEmpId.get(action.node_id)!;
      const nodeName = getName(sim, rowIdx, nameCol);
      const oldVal = String(sim[rowIdx][statusCol!] ?? '');
      const newVal = action.set_to === 'open' ? 'open' : 'filled';
      sim[rowIdx] = { ...sim[rowIdx], [statusCol!]: newVal };
      return {
        preview: { action_index: actionIdx, type: 'toggle_open', summary: `${nodeName} marked as ${action.set_to}`, before: { [statusCol!]: oldVal }, after: { [statusCol!]: newVal } },
        affectedNode: { node_id: action.node_id, name: nodeName, change: `set to ${action.set_to}` },
      };
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface ValidationFailure {
  valid: false;
  error: string;
  failed_action_index: number;
  suggestion: string;
}

export interface SimulationSuccess {
  valid: true;
  plan: ValidatedPlan;
  simulatedRows: ExcelRow[];
}

export type SimulationResult = ValidationFailure | SimulationSuccess;

function fmtDelta(before: number, after: number, fmt: (n: number) => string, unit = ''): string {
  const diff = after - before;
  if (diff === 0) return `\xb10${unit}`;
  return (diff > 0 ? '+' : '-') + fmt(Math.abs(diff)) + unit;
}

export function validateAndSimulate(
  actions: ScenarioAction[],
  rows: ExcelRow[],
  mapping: ColumnMapping,
  compMatrix: CompMatrix | null,
  planId: string,
  graphVersion: number,
  target: 'as-is' | 'to-be',
  description: string,
): SimulationResult {
  const empIdCol  = mapping['Employee ID']?.column ?? null;
  const mgrIdCol  = mapping['Manager ID']?.column ?? null;
  const nameCol   = mapping['Full Name']?.column ?? null;
  const statusCol = mapping['Position Status']?.column ?? null;

  if (!empIdCol) return { valid: false, error: 'Employee ID field is not mapped. Cannot identify nodes.', failed_action_index: -1, suggestion: 'Map the Employee ID field in Data Readiness.' };
  if (!mgrIdCol) return { valid: false, error: 'Manager ID field is not mapped. Cannot apply reparent or delete actions.', failed_action_index: -1, suggestion: 'Map the Manager ID field in Data Readiness.' };

  const sim: SimRows = rows.map(r => ({ ...r }));
  const rowByEmpId = buildRowIndex(sim, empIdCol);

  const beforeData = buildHierarchyFromMapping(rows, mapping);
  if (compMatrix) beforeData.compMatrix = compMatrix;
  const beforeMetrics = computeStateMetrics(beforeData);

  const previews: ActionPreview[] = [];
  const affectedNodes: Array<{ node_id: string; name: string; change: string }> = [];

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const validation = validateAction(action, sim, rowByEmpId, empIdCol, mgrIdCol, statusCol);
    if (!validation.ok) {
      return {
        valid: false,
        error: `Action ${i + 1} (${action.type}${'node_id' in action ? ` on "${action.node_id}"` : ''}): ${validation.error}`,
        failed_action_index: i,
        suggestion: validation.suggestion,
      };
    }
    const result = applyActionToRows(action, i, sim, rowByEmpId, empIdCol, mgrIdCol, nameCol, statusCol, planId);
    previews.push(result.preview);
    affectedNodes.push(result.affectedNode);
  }

  const afterData = buildHierarchyFromMapping(sim, mapping);
  if (compMatrix) afterData.compMatrix = compMatrix;
  const afterMetrics = computeStateMetrics(afterData);

  const deltas: Record<string, string> = {
    avg_span:  fmtDelta(beforeMetrics.avgSpan,   afterMetrics.avgSpan,   n => n.toFixed(1)),
    layers:    fmtDelta(beforeMetrics.layers,     afterMetrics.layers,    n => String(Math.round(n))),
    headcount: fmtDelta(beforeMetrics.headcount,  afterMetrics.headcount, n => String(Math.round(n))),
    ic_ratio:  fmtDelta(beforeMetrics.icRatio,    afterMetrics.icRatio,   n => n.toFixed(0), 'pp'),
    mgr_ratio: fmtDelta(beforeMetrics.mgrRatio,   afterMetrics.mgrRatio,  n => n.toFixed(0), 'pp'),
  };
  if (beforeMetrics.totalCost !== null && afterMetrics.totalCost !== null) {
    const diff = afterMetrics.totalCost - beforeMetrics.totalCost;
    deltas.total_cost = (diff === 0 ? '\xb1' : diff > 0 ? '+' : '-') + '$' + Math.round(Math.abs(diff) / 1000) + 'K';
  }

  // Warnings
  const warnings: string[] = [];
  for (const [empId, spanVal] of Object.entries(afterData.metrics.span)) {
    const prevSpan = beforeData.metrics.span[empId] ?? 0;
    if (spanVal > 8 && spanVal > prevSpan) {
      const v = afterData.vertices[empId];
      warnings.push(`${v?.display_name ?? empId} span will be ${spanVal} after this scenario (above recommended 8).`);
    }
  }
  if (afterMetrics.headcount < beforeMetrics.headcount * 0.9) {
    const dropped = beforeMetrics.headcount - afterMetrics.headcount;
    warnings.push(`Headcount drops by ${dropped} (${Math.round((dropped / beforeMetrics.headcount) * 100)}%).`);
  }
  if (afterData.metrics.basic.root_count > beforeData.metrics.basic.root_count) {
    warnings.push(`Top-level nodes (roots) increase from ${beforeData.metrics.basic.root_count} to ${afterData.metrics.basic.root_count} — some nodes may become disconnected.`);
  }

  if (afterMetrics.missingCompBands.length > 0) {
    const sample = afterMetrics.missingCompBands
      .slice(0, 5)
      .map((band) => `${band.employeeId}: ${band.grade} x ${band.geo ?? 'blank geo'}`)
      .join(', ');
    warnings.push(`Total cost cannot be fully calculated because ${afterMetrics.missingCompBands.length} role(s) have no compensation band (${sample}).`);
  }

  const now = new Date();
  const plan: ValidatedPlan = {
    plan_id: planId,
    description,
    target,
    actions,
    impact: {
      before: { avg_span: beforeMetrics.avgSpan, layers: beforeMetrics.layers, total_cost: beforeMetrics.totalCost, headcount: beforeMetrics.headcount, ic_ratio: beforeMetrics.icRatio, mgr_ratio: beforeMetrics.mgrRatio },
      after:  { avg_span: afterMetrics.avgSpan,  layers: afterMetrics.layers,  total_cost: afterMetrics.totalCost,  headcount: afterMetrics.headcount,  ic_ratio: afterMetrics.icRatio,  mgr_ratio: afterMetrics.mgrRatio  },
      deltas,
    },
    action_previews: previews,
    affected_nodes: affectedNodes,
    warnings,
    base_graph_version: graphVersion,
    expires_at: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
    status: 'pending_approval',
    created_at: now.toISOString(),
  };

  return { valid: true, plan, simulatedRows: sim };
}

export function applyActions(
  actions: ScenarioAction[],
  rows: ExcelRow[],
  mapping: ColumnMapping,
): ExcelRow[] {
  const empIdCol  = mapping['Employee ID']?.column ?? '';
  const mgrIdCol  = mapping['Manager ID']?.column ?? '';
  const nameCol   = mapping['Full Name']?.column ?? null;
  const statusCol = mapping['Position Status']?.column ?? null;

  if (!empIdCol || !mgrIdCol) return rows;

  const sim: SimRows = rows.map(r => ({ ...r }));
  const rowByEmpId = buildRowIndex(sim, empIdCol);

  for (let i = 0; i < actions.length; i++) {
    applyActionToRows(actions[i], i, sim, rowByEmpId, empIdCol, mgrIdCol, nameCol, statusCol, 'apply');
  }

  return sim;
}
