import type { ColumnMapping } from "./fieldDictionary";
import type { ExcelRow } from "./parseExcel";
import { buildHierarchyFromMapping } from "./buildHierarchy";
import type { ChangeRecord } from "./changeManagement";
import type { CompMatrix, DashboardData } from "./types";

export type OrgStateId = "baseline" | "asIs" | "toBe";
export type EditableOrgStateId = "asIs" | "toBe";
export type OrgMutationTarget = EditableOrgStateId | "both";

export type OrgMutationSource =
  | "employees-table"
  | "analytics-sql"
  | "analytics-reset"
  | "ai"
  | "ai-sql"
  | "hierarchy"
  | "comp"
  | "mapping"
  | "upload"
  | "session";

export interface OrgState {
  stateId: OrgStateId;
  label: string;
  rows: ExcelRow[];
  headers: string[];
  mapping: ColumnMapping;
  data: DashboardData;
  compMatrix: CompMatrix;
  revision: number;
  updatedAt: string;
}

export interface OrgDataset {
  datasetId: string;
  sourceFileName?: string;
  uploadedAt: string;
  baselineRows: ExcelRow[];
  baselineHeaders: string[];
  defaultMapping: ColumnMapping;
  states: {
    baseline: OrgState;
    asIs: OrgState;
    toBe?: OrgState;
  };
  activeStateBySurface: {
    table: EditableOrgStateId;
    studio: EditableOrgStateId;
    hierarchy: EditableOrgStateId;
    ai: EditableOrgStateId;
  };
  changeLog: ChangeRecord[];
  revision: number;
}

export interface HeaderGroups {
  source: string[];
  derived: string[];
}

export type OrgMutation =
  | {
      target: OrgMutationTarget;
      source: OrgMutationSource;
      action: "replaceRows";
      rows: ExcelRow[];
    }
  | {
      target: EditableOrgStateId;
      source: OrgMutationSource;
      action: "updateMapping";
      mapping: ColumnMapping;
    }
  | {
      target: OrgMutationTarget;
      source: OrgMutationSource;
      action: "updateCompMatrix";
      compMatrix: CompMatrix;
    }
  | {
      target: "asIs";
      source: OrgMutationSource;
      action: "resetAsIsFromBaseline";
    }
  | {
      target: "toBe";
      source: OrgMutationSource;
      action: "copyFromAsIs" | "removeToBe";
    }
  | {
      target: "toBe";
      source: OrgMutationSource;
      action: "replaceToBeFromUpload";
      rows: ExcelRow[];
      headers?: string[];
      mapping?: ColumnMapping;
      sourceFileName?: string;
    }
  | {
      target: OrgMutationTarget;
      source: OrgMutationSource;
      action: "setActiveState";
      surface: keyof OrgDataset["activeStateBySurface"];
      state: EditableOrgStateId;
    };

function clone<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function cloneOrgDataset(dataset: OrgDataset): OrgDataset {
  return clone(dataset);
}

function idForDataset(): string {
  return `org_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function headersFromRows(rows: ExcelRow[], preferred: string[] = []): string[] {
  const headers = new Set(preferred);
  for (const row of rows) {
    Object.keys(row).forEach((key) => headers.add(key));
  }
  return [...headers];
}

function buildData(rows: ExcelRow[], mapping: ColumnMapping, compMatrix: CompMatrix = {}): DashboardData {
  const data = buildHierarchyFromMapping(rows, mapping);
  return { ...data, compMatrix };
}

function createState(args: {
  stateId: OrgStateId;
  label: string;
  rows: ExcelRow[];
  headers?: string[];
  mapping: ColumnMapping;
  compMatrix?: CompMatrix;
  revision?: number;
  updatedAt?: string;
}): OrgState {
  const rows = clone(args.rows);
  const mapping = clone(args.mapping);
  const compMatrix = clone(args.compMatrix ?? {});
  const headers = headersFromRows(rows, args.headers);
  return {
    stateId: args.stateId,
    label: args.label,
    rows,
    headers,
    mapping,
    compMatrix,
    data: buildData(rows, mapping, compMatrix),
    revision: args.revision ?? 0,
    updatedAt: args.updatedAt ?? new Date().toISOString(),
  };
}

export function createOrgDataset(args: {
  rows: ExcelRow[];
  headers: string[];
  mapping: ColumnMapping;
  sourceFileName?: string;
}): OrgDataset {
  const uploadedAt = new Date().toISOString();
  const baselineRows = clone(args.rows);
  const baselineHeaders = headersFromRows(baselineRows, args.headers);
  const defaultMapping = clone(args.mapping);
  const baseline = createState({
    stateId: "baseline",
    label: "Uploaded Baseline",
    rows: baselineRows,
    headers: baselineHeaders,
    mapping: defaultMapping,
    updatedAt: uploadedAt,
  });
  const asIs = createState({
    stateId: "asIs",
    label: "As-Is",
    rows: baselineRows,
    headers: baselineHeaders,
    mapping: defaultMapping,
    updatedAt: uploadedAt,
  });

  return {
    datasetId: idForDataset(),
    sourceFileName: args.sourceFileName,
    uploadedAt,
    baselineRows,
    baselineHeaders,
    defaultMapping,
    states: { baseline, asIs },
    activeStateBySurface: {
      table: "asIs",
      studio: "asIs",
      hierarchy: "asIs",
      ai: "asIs",
    },
    changeLog: [],
    revision: 0,
  };
}

function bumpState(state: OrgState, patch: Partial<Pick<OrgState, "rows" | "headers" | "mapping" | "compMatrix">>): OrgState {
  const rows = patch.rows ? clone(patch.rows) : clone(state.rows);
  const mapping = patch.mapping ? clone(patch.mapping) : clone(state.mapping);
  const compMatrix = patch.compMatrix ? clone(patch.compMatrix) : clone(state.compMatrix);
  const headers = headersFromRows(rows, patch.headers ?? state.headers);
  return {
    ...state,
    rows,
    headers,
    mapping,
    compMatrix,
    data: buildData(rows, mapping, compMatrix),
    revision: state.revision + 1,
    updatedAt: new Date().toISOString(),
  };
}

function targetsFor(target: OrgMutationTarget): EditableOrgStateId[] {
  return target === "both" ? ["asIs", "toBe"] : [target];
}

export function applyOrgMutation(dataset: OrgDataset, mutation: OrgMutation): OrgDataset {
  let next = cloneOrgDataset(dataset);

  if (mutation.action === "setActiveState") {
    next.activeStateBySurface[mutation.surface] = mutation.state;
    return { ...next, revision: next.revision + 1 };
  }

  if (mutation.action === "copyFromAsIs") {
    next.states.toBe = createState({
      stateId: "toBe",
      label: "To-Be",
      rows: next.states.asIs.rows,
      headers: next.states.asIs.headers,
      mapping: next.states.asIs.mapping,
      compMatrix: next.states.asIs.compMatrix,
      revision: 0,
    });
    return { ...next, revision: next.revision + 1 };
  }

  if (mutation.action === "removeToBe") {
    delete next.states.toBe;
    Object.entries(next.activeStateBySurface).forEach(([surface, state]) => {
      if (state === "toBe") {
        next.activeStateBySurface[surface as keyof OrgDataset["activeStateBySurface"]] = "asIs";
      }
    });
    return { ...next, revision: next.revision + 1 };
  }

  if (mutation.action === "replaceToBeFromUpload") {
    next.states.toBe = createState({
      stateId: "toBe",
      label: mutation.sourceFileName ? `To-Be - ${mutation.sourceFileName}` : "To-Be",
      rows: mutation.rows,
      headers: mutation.headers,
      mapping: mutation.mapping ?? next.states.asIs.mapping,
      compMatrix: next.states.asIs.compMatrix,
    });
    return { ...next, revision: next.revision + 1 };
  }

  if (mutation.action === "resetAsIsFromBaseline") {
    next.states.asIs = bumpState(next.states.asIs, {
      rows: next.baselineRows,
      headers: next.baselineHeaders,
      mapping: next.defaultMapping,
      compMatrix: next.states.asIs.compMatrix,
    });
    return { ...next, revision: next.revision + 1 };
  }

  for (const target of targetsFor(mutation.target)) {
    const state = next.states[target] ?? (target === "toBe" ? createState({
      stateId: "toBe",
      label: "To-Be",
      rows: next.states.asIs.rows,
      headers: next.states.asIs.headers,
      mapping: next.states.asIs.mapping,
      compMatrix: next.states.asIs.compMatrix,
    }) : null);
    if (!state) continue;

    if (mutation.action === "replaceRows") {
      next.states[target] = bumpState(state, { rows: mutation.rows });
    }
    if (mutation.action === "updateMapping") {
      next.states[target] = bumpState(state, { mapping: mutation.mapping });
    }
    if (mutation.action === "updateCompMatrix") {
      next.states[target] = bumpState(state, { compMatrix: mutation.compMatrix });
    }
  }

  next.revision += 1;
  return next;
}

export function stateHeadersForMapping(dataset: OrgDataset, stateId: OrgStateId): HeaderGroups {
  const state = dataset.states[stateId];
  if (!state) return { source: [...dataset.baselineHeaders], derived: [] };
  const source = dataset.baselineHeaders.filter((header) => state.headers.includes(header));
  const sourceSet = new Set(dataset.baselineHeaders);
  const derived = state.headers.filter((header) => !sourceSet.has(header));
  return { source, derived };
}

export function restoreOrgDataset(value: unknown): OrgDataset | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<OrgDataset>;
  if (!raw.states?.asIs || !Array.isArray(raw.baselineRows) || !raw.defaultMapping) return null;

  const baselineHeaders = headersFromRows(raw.baselineRows, raw.baselineHeaders ?? []);
  const defaultMapping = clone(raw.defaultMapping);
  const baseline = createState({
    stateId: "baseline",
    label: raw.states.baseline?.label ?? "Uploaded Baseline",
    rows: raw.baselineRows,
    headers: baselineHeaders,
    mapping: raw.states.baseline?.mapping ?? defaultMapping,
    compMatrix: raw.states.baseline?.compMatrix ?? {},
    revision: raw.states.baseline?.revision ?? 0,
    updatedAt: raw.states.baseline?.updatedAt,
  });
  const asIs = createState({
    stateId: "asIs",
    label: raw.states.asIs.label ?? "As-Is",
    rows: raw.states.asIs.rows ?? raw.baselineRows,
    headers: raw.states.asIs.headers ?? baselineHeaders,
    mapping: raw.states.asIs.mapping ?? defaultMapping,
    compMatrix: raw.states.asIs.compMatrix ?? {},
    revision: raw.states.asIs.revision ?? 0,
    updatedAt: raw.states.asIs.updatedAt,
  });
  const toBe = raw.states.toBe ? createState({
    stateId: "toBe",
    label: raw.states.toBe.label ?? "To-Be",
    rows: raw.states.toBe.rows ?? asIs.rows,
    headers: raw.states.toBe.headers ?? asIs.headers,
    mapping: raw.states.toBe.mapping ?? asIs.mapping,
    compMatrix: raw.states.toBe.compMatrix ?? asIs.compMatrix,
    revision: raw.states.toBe.revision ?? 0,
    updatedAt: raw.states.toBe.updatedAt,
  }) : undefined;

  const active = raw.activeStateBySurface ?? {
    table: "asIs",
    studio: "asIs",
    hierarchy: "asIs",
    ai: "asIs",
  };

  return {
    datasetId: raw.datasetId ?? idForDataset(),
    sourceFileName: raw.sourceFileName,
    uploadedAt: raw.uploadedAt ?? new Date().toISOString(),
    baselineRows: clone(raw.baselineRows),
    baselineHeaders,
    defaultMapping,
    states: { baseline, asIs, ...(toBe ? { toBe } : {}) },
    activeStateBySurface: {
      table: active.table === "toBe" && toBe ? "toBe" : "asIs",
      studio: active.studio === "toBe" && toBe ? "toBe" : "asIs",
      hierarchy: active.hierarchy === "toBe" && toBe ? "toBe" : "asIs",
      ai: active.ai === "toBe" && toBe ? "toBe" : "asIs",
    },
    changeLog: raw.changeLog ?? [],
    revision: raw.revision ?? 0,
  };
}
