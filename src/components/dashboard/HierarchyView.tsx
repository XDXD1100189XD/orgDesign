"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type {
  DashboardData,
  NormalizedVertex,
  OrgNodeData,
  RawEdge,
  CompMatrix,
  CompTransition,
} from "@/lib/types";
import type { ColumnMapping, CanonicalField } from "@/lib/fieldDictionary";
import { FIELD_GROUPS } from "@/lib/fieldDictionary";
import type { ExcelRow } from "@/lib/parseExcel";
import { computeMetrics } from "@/lib/metrics";
import {
  addPositionRow,
  deletePositionRowsWithReassignment,
  editPositionRow,
  getTopLevelTransferIds,
  transferPositionRows,
  validateTransferTarget,
  type HierarchyPositionPayload,
} from "@/lib/hierarchyRows";
import { getPositionPath, searchHierarchyPositions } from "./hierarchySearch";
import OrgNode from "./OrgNode";
import styles from "./HierarchyView.module.css";

const nodeTypes = { org: OrgNode };
interface Props {
  data: DashboardData;
  onDataChange: (d: DashboardData) => void;
  columnMapping?: ColumnMapping | null;
  rows?: ExcelRow[] | null;
  onRowsChange?: (
    rows: ExcelRow[],
    meta?: {
      source: "hierarchy";
      action: "add" | "edit" | "delete" | "transfer";
      label?: string;
      affected?: number;
      target?: "as-is" | "to-be";
    },
  ) => void;
  stateKey: "as-is" | "to-be";
}

const NODE_W = 200;
const GAP_X = 40;
const GAP_Y = 140;
const LAYER_LIMIT = 3;

function getOrphans(
  V: Record<string, NormalizedVertex>,
  m: DashboardData["metrics"],
): string[] {
  const c = new Set<string>();
  m.basic.roots.forEach((r) => c.add(r));
  Object.keys(m.parent).forEach((k) => {
    c.add(k);
    c.add(m.parent[k]);
  });
  Object.keys(m.children).forEach((k) => {
    c.add(k);
    (m.children[k] || []).forEach((x) => c.add(x));
  });
  return Object.keys(V).filter((id) => !c.has(id));
}

const CORE_FIELDS = new Set<CanonicalField>([
  "Employee ID",
  "Manager ID",
  "Full Name",
  "Business Title",
  "Position Status",
  "Department Name",
  "Compensation Grade",
  "Location",
  "Country",
  "Region",
]);

function mappedFieldList(columnMapping?: ColumnMapping | null): CanonicalField[] {
  if (!columnMapping) return [];
  return FIELD_GROUPS.flatMap((group) => group.fields).filter((field) => !!columnMapping[field]?.column);
}

function positionPayloadFromVertex(
  data: DashboardData,
  nodeId: string,
): HierarchyPositionPayload | null {
  const v = data.vertices[nodeId];
  if (!v) return null;
  const managerId = data.metrics.parent[nodeId];
  return {
    employeeId: v.id || nodeId,
    managerId: managerId ? data.vertices[managerId]?.id || "" : "",
    name: v.open_role ? "" : v.display_name,
    role: v.role || "",
    department: v.dept || "",
    grade: v.grade || "",
    location: v.geo || "",
    country: "",
    region: "",
    status: v.open_role ? "Open" : "Filled",
    extraFields: {},
  };
}

function buildGraph(
  data: DashboardData,
  viewRoot: string,
  localCollapsed: Set<string>,
  onToggle: (id: string) => void,
  onDrillDown: (id: string) => void,
  userCreatedIds: Set<string>,
  selectedNodeIds: Set<string>,
  activeSearchResultId: string | null,
  highlightedPathIds: Set<string>,
): { nodes: Node[]; edges: Edge[] } {
  const { vertices: V, metrics: m } = data;
  const out: { nodes: Node[]; edges: Edge[] } = { nodes: [], edges: [] };
  if (!viewRoot || !V[viewRoot]) return out;

  const w: Record<string, number> = {};
  function cw(id: string, layer: number): number {
    if (localCollapsed.has(id) || layer >= LAYER_LIMIT - 1) {
      w[id] = NODE_W;
      return NODE_W;
    }
    const kids = m.children[id] || [];
    if (!kids.length) { w[id] = NODE_W; return NODE_W; }
    const t = kids.reduce((s, k) => s + cw(k, layer + 1) + GAP_X, -GAP_X);
    w[id] = Math.max(NODE_W, t);
    return w[id];
  }
  cw(viewRoot, 0);

  function place(id: string, x: number, y: number, layer: number) {
    const v = V[id];
    if (!v) return;
    const allKids = m.children[id] || [];
    const isCol = localCollapsed.has(id);
    const isBoundary = layer >= LAYER_LIMIT - 1 && allKids.length > 0;
    const visibleKids = (isBoundary || isCol) ? [] : allKids;
    const pathIndex = [...highlightedPathIds].indexOf(id);
    const isPathBoundary = isBoundary && pathIndex >= 0 && allKids.some((kid) => highlightedPathIds.has(kid));

    out.nodes.push({
      id,
      type: "org",
      position: { x, y },
      draggable: true,
      data: {
        tempId: id,
        displayName: v.display_name,
        role: v.role,
        empId: v.id,
        grade: v.grade,
        geo: v.geo ?? null,
        unnamed: v.unnamed,
        span: m.span[id] ?? 0,
        depth: m.depth[id] ?? 0,
        openRole: v.open_role,
        isUserCreated: userCreatedIds.has(id),
        isOrphan: false,
        isBoundary,
        isSelected: selectedNodeIds.has(id),
        isSearchTarget: activeSearchResultId === id,
        isPathHighlighted: highlightedPathIds.has(id),
        isPathBoundary,
        subtreeCount: m.subtree_count[id] ?? 0,
        onToggleCollapse: onToggle,
        onDrillDown,
        collapsed: isCol,
        childCount: allKids.length,
      } as OrgNodeData & Record<string, unknown>,
    });

    let cx = x - ((w[id] || NODE_W) - NODE_W) / 2;
    visibleKids.forEach((kid) => {
      const isU = userCreatedIds.has(kid);
      const fromPathIdx = [...highlightedPathIds].indexOf(id);
      const isPathEdge = fromPathIdx >= 0 && [...highlightedPathIds][fromPathIdx + 1] === kid;
      out.edges.push({
        id: `${id}->${kid}`,
        source: id,
        target: kid,
        type: "straight",
        style: {
          stroke: isPathEdge ? "#d97706" : isU ? "#6366f1" : "#b8b5a8",
          strokeWidth: isPathEdge ? 3 : isU ? 2 : 1.5,
          strokeDasharray: isPathEdge ? undefined : isU ? "6 3" : undefined,
        },
        label: isU ? "user created" : undefined,
        labelStyle: isU ? { fill: "#6366f1", fontSize: 9, fontWeight: 700 } : undefined,
        labelBgStyle: isU ? { fill: "#f4f1e8", fillOpacity: 0.9 } : undefined,
        labelBgPadding: isU ? ([4, 6] as [number, number]) : undefined,
      });
      place(kid, cx + ((w[kid] || NODE_W) - NODE_W) / 2, y + GAP_Y, layer + 1);
      cx += (w[kid] || NODE_W) + GAP_X;
    });
  }
  place(viewRoot, 0, 0, 0);

  // Show orphans only in the global root view
  const globalRoot = m.basic.roots[0];
  if (viewRoot === globalRoot) {
    const orphans = getOrphans(V, m);
    if (orphans.length) {
      const maxY = out.nodes.length
        ? Math.max(...out.nodes.map((n) => n.position.y)) + GAP_Y + 80
        : 0;
      orphans.forEach((id, i) => {
        const v = V[id];
        if (!v) return;
        out.nodes.push({
          id,
          type: "org",
          draggable: true,
          position: { x: i * (NODE_W + GAP_X), y: maxY },
          data: {
            tempId: id,
            displayName: v.display_name,
            role: v.role,
            empId: v.id,
            grade: v.grade,
            unnamed: v.unnamed,
            span: 0,
            depth: -1,
            openRole: v.open_role,
            isUserCreated: userCreatedIds.has(id),
            isOrphan: true,
            isBoundary: false,
            isSelected: selectedNodeIds.has(id),
            isSearchTarget: activeSearchResultId === id,
            isPathHighlighted: highlightedPathIds.has(id),
            isPathBoundary: false,
            onToggleCollapse: onToggle,
            onDrillDown,
            collapsed: false,
            childCount: 0,
          } as OrgNodeData & Record<string, unknown>,
        });
      });
    }
  }
  return out;
}

// ── Cycle detection ──
function findCycle(
  edges: RawEdge[],
  nodeId: string,
  newMgrId: string,
): string[] | null {
  // Build adjacency from edges, pretending the nodeId->newMgrId edge exists
  const parent: Record<string, string> = {};
  edges.forEach((e) => {
    if (e.employee_temp_id === nodeId) return; // skip old edge for this node
    parent[e.employee_temp_id] = e.manager_temp_id;
  });
  parent[nodeId] = newMgrId; // proposed edge
  // Walk up from newMgrId — if we reach nodeId, it's a cycle
  const path: string[] = [nodeId];
  let cur = newMgrId;
  const visited = new Set<string>([nodeId]);
  while (cur) {
    path.push(cur);
    if (visited.has(cur)) return path; // cycle found
    visited.add(cur);
    cur = parent[cur];
  }
  return null;
}

// ── Shared node form (Add + Edit status) ──
interface NodePayload {
  name: string;
  jobId: string;
  role: string;
  grade: string;
  geo: string;
  dept: string;
  isOpen: boolean;
  extraFields: Partial<Record<CanonicalField, string>>;
}

function NodeFormModal({
  mode,
  parentName,
  initialData,
  startOpenOverride,
  compMatrix,
  columnMapping,
  onConfirm,
  onCancel,
}: {
  mode: "add" | "edit-status";
  parentName?: string;
  initialData?: { isOpen: boolean; name: string; jobId: string; role: string; grade: string; geo: string; dept: string };
  startOpenOverride?: boolean;
  compMatrix?: CompMatrix;
  columnMapping?: ColumnMapping | null;
  onConfirm: (p: NodePayload, addAnother?: boolean) => void;
  onCancel: () => void;
}) {
  const startOpen = mode === "edit-status" ? (startOpenOverride ?? !initialData!.isOpen) : false;
  const [isOpen, setIsOpen] = useState(startOpen);
  const [name,  setName]  = useState(mode === "edit-status" && !initialData!.isOpen ? initialData!.name : "");
  const [jobId, setJobId] = useState(initialData?.jobId || "");
  const [role,  setRole]  = useState(initialData?.role  || "");
  const [grade, setGrade] = useState(initialData?.grade || "");
  const [geo,   setGeo]   = useState(initialData?.geo   || "");
  const [dept,  setDept]  = useState(initialData?.dept  || "");
  const [extraFields, setExtraFields] = useState<Partial<Record<CanonicalField, string>>>({});

  const knownGeos = compMatrix
    ? [...new Set(Object.values(compMatrix).flatMap((g) => (g ? Object.keys(g) : [])))]
    : [];
  const lookupBand = compMatrix && grade.trim() && geo.trim()
    ? compMatrix[grade.trim()]?.[geo.trim()] ?? null
    : null;

  const requiresEmployeeId = !!columnMapping?.["Employee ID"]?.column;
  const canConfirm = (requiresEmployeeId ? !!jobId.trim() : (isOpen ? !!jobId.trim() : true)) && (isOpen || !!name.trim());
  const advancedGroups = FIELD_GROUPS
    .map((group) => ({
      ...group,
      fields: group.fields.filter((field) => columnMapping?.[field]?.column && !CORE_FIELDS.has(field)),
    }))
    .filter((group) => group.fields.length > 0);

  const buildPayload = (): NodePayload => ({
    name: name.trim(),
    jobId: jobId.trim(),
    role: role.trim(),
    grade: grade.trim(),
    geo: geo.trim(),
    dept: dept.trim(),
    isOpen,
    extraFields: Object.fromEntries(
      Object.entries(extraFields).map(([field, value]) => [field, String(value ?? "").trim()]),
    ) as Partial<Record<CanonicalField, string>>,
  });

  const resetForNext = () => {
    setName("");
    setJobId("");
    setRole("");
    setGrade("");
    setGeo("");
    setDept("");
    setExtraFields({});
  };

  const submit = (addAnother = false) => {
    onConfirm(buildPayload(), addAnother);
    if (addAnother) resetForNext();
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <h3 className={styles.modalTitle}>
          {mode === "add" ? "Add direct report under" : "Edit position"}
        </h3>
        {mode === "add"
          ? <p className={styles.modalParent}>{parentName}</p>
          : <p className={styles.modalParent}>{initialData?.name || initialData?.jobId}</p>
        }

        {mode === "edit-status" && (
          <p className={styles.modalNote}>
            Review all fields. If changing role status, update compensation separately.
          </p>
        )}

        <label className={styles.fieldLabel}>Status <span className={styles.reqMark}>*</span></label>
        <div className={styles.statusToggle}>
          <button
            type="button"
            className={`${styles.statusOpt} ${!isOpen ? styles.statusFilledActive : ""}`}
            onClick={() => setIsOpen(false)}
          >
            ● Filled
          </button>
          <button
            type="button"
            className={`${styles.statusOpt} ${isOpen ? styles.statusOpenActive : ""}`}
            onClick={() => setIsOpen(true)}
          >
            ○ Open
          </button>
        </div>

        <label className={styles.fieldLabel}>
          Name {!isOpen && <span className={styles.reqMark}>*</span>}
          {isOpen && <span className={styles.hint}> — not applicable for open roles</span>}
        </label>
        <input
          className={styles.fieldInput}
          placeholder={isOpen ? "—" : "Employee name"}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isOpen}
          autoFocus={!isOpen}
        />

        <label className={styles.fieldLabel}>
          Employee / Job ID {(isOpen || requiresEmployeeId) && <span className={styles.reqMark}>*</span>}
        </label>
        <input
          className={styles.fieldInput}
          placeholder={isOpen ? "Job ID (required)" : "Employee ID (optional)"}
          value={jobId}
          onChange={(e) => setJobId(e.target.value)}
          autoFocus={isOpen}
        />

        <label className={styles.fieldLabel}>Job Title / Role</label>
        <input
          className={styles.fieldInput}
          placeholder="e.g. Senior Engineer"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        />

        <label className={styles.fieldLabel}>Grade / Level</label>
        <input
          className={styles.fieldInput}
          placeholder="e.g. L5, IC4, M2"
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
        />

        <label className={styles.fieldLabel}>Geography / Location</label>
        <input
          className={styles.fieldInput}
          placeholder="e.g. US, IN-GCC, UK"
          value={geo}
          onChange={(e) => setGeo(e.target.value)}
          list="nf-geo-list"
        />
        {knownGeos.length > 0 && (
          <datalist id="nf-geo-list">
            {knownGeos.map((g) => <option key={g} value={g} />)}
          </datalist>
        )}
        {grade.trim() && geo.trim() && compMatrix && (
          lookupBand ? (
            <div className={styles.compBandInfo}>
              Expected: {lookupBand.currency} {lookupBand.min.toLocaleString()} – {lookupBand.max.toLocaleString()}
            </div>
          ) : (
            <div className={styles.compBandWarn}>
              No band for {grade.trim()} × {geo.trim()} — define in Comp Setup tab.
            </div>
          )
        )}

        <label className={styles.fieldLabel}>Department</label>
        <input
          className={styles.fieldInput}
          placeholder="e.g. Engineering, Design"
          value={dept}
          onChange={(e) => setDept(e.target.value)}
        />

        {advancedGroups.length > 0 && (
          <div className={styles.advancedFields}>
            {advancedGroups.map((group) => (
              <details key={group.label} className={styles.fieldGroup}>
                <summary>{group.label} mapped fields</summary>
                {group.fields.map((field) => (
                  <label key={field} className={styles.fieldLabel}>
                    {field}
                    <input
                      className={styles.fieldInput}
                      value={extraFields[field] ?? ""}
                      placeholder={columnMapping?.[field]?.column || field}
                      onChange={(e) => setExtraFields((prev) => ({ ...prev, [field]: e.target.value }))}
                    />
                  </label>
                ))}
              </details>
            ))}
          </div>
        )}

        <div className={styles.modalActions}>
          <button className={styles.cancelBtn} onClick={onCancel}>
            {mode === "add" ? "Cancel" : "Back"}
          </button>
          {mode === "add" && (
            <button
              className={styles.cancelBtn}
              disabled={!canConfirm}
              onClick={() => submit(true)}
            >
              Save and add another
            </button>
          )}
          <button
            className={styles.confirmBtn}
            disabled={!canConfirm}
            onClick={() => submit(false)}
          >
            {mode === "add" ? "Save and close" : "Save position"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Modal ──
function DeleteModal({
  nodeName,
  nodeId,
  childIds,
  V,
  m,
  onConfirm,
  onCancel,
}: {
  nodeName: string;
  nodeId: string;
  childIds: string[];
  V: Record<string, NormalizedVertex>;
  m: DashboardData["metrics"];
  onConfirm: (target: string | null) => void;
  onCancel: () => void;
}) {
  const parentId = m.parent[nodeId];
  const [target, setTarget] = useState<string>(parentId || "");
  const sub = new Set<string>();
  function walk(id: string) {
    sub.add(id);
    (m.children[id] || []).forEach(walk);
  }
  walk(nodeId);
  const candidates = Object.keys(V).filter((id) => !sub.has(id));
  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <h3 className={styles.modalTitle}>Remove position</h3>
        <p className={styles.modalParent}>{nodeName}</p>
        {childIds.length > 0 ? (
          <>
            <p className={styles.modalWarn}>
              {childIds.length} direct report{childIds.length > 1 ? "s" : ""}{" "}
              will be reassigned.
            </p>
            <label className={styles.fieldLabel}>Reassign direct reports to</label>
            <select
              className={styles.fieldSelect}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">Make unassigned</option>
              {candidates.map((id) => (
                <option key={id} value={id}>
                  {V[id].display_name} ({V[id].role}) — L{m.depth[id] ?? "?"}
                </option>
              ))}
            </select>
          </>
        ) : (
          <p className={styles.modalNote}>
            No direct reports. This position will be removed.
          </p>
        )}
        <div className={styles.modalActions}>
          <button className={styles.cancelBtn} onClick={onCancel}>
            Cancel
          </button>
          <button
            className={styles.deleteBtn}
            onClick={() => onConfirm(target || null)}
          >
            {childIds.length > 0 ? "Reassign & remove" : "Remove position"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit Modal ──
type EditOp = null | "menu" | "reassign" | "cycle-warn" | "toggle-status";

function EditModal({
  nodeId,
  data,
  userCreatedIds,
  columnMapping,
  initialOp = "menu",
  toggleStatusOnOpen = true,
  onSave,
  onCancel,
}: {
  nodeId: string;
  data: DashboardData;
  userCreatedIds: Set<string>;
  columnMapping?: ColumnMapping | null;
  initialOp?: EditOp;
  toggleStatusOnOpen?: boolean;
  onSave: (newData: DashboardData) => void;
  onCancel: () => void;
}) {
  const { vertices: V, metrics: m, edges: rawEdges } = data;
  const v = V[nodeId];
  const [op, setOp] = useState<EditOp>(initialOp);
  const [newMgr, setNewMgr] = useState<string>(m.parent[nodeId] || "");
  const [cyclePath, setCyclePath] = useState<string[] | null>(null);
  const [breakEdge, setBreakEdge] = useState<string>("");

  if (!v) {
    onCancel();
    return null;
  }

  const currentMgr = m.parent[nodeId];
  const isOpen = v.open_role;
  const displayId = v.id || "—";

  // All potential managers (everyone except self)
  const allCandidates = Object.keys(V).filter((id) => id !== nodeId);

  // ── Reassign: check cycle when user picks a manager
  const handleReassignConfirm = () => {
    if (!newMgr) {
      // No manager = make unassigned
      const nEdges = rawEdges.filter((e) => e.employee_temp_id !== nodeId);
      onSave({ ...data, edges: nEdges, metrics: computeMetrics(nEdges) });
      return;
    }
    const cycle = findCycle(rawEdges, nodeId, newMgr);
    if (cycle) {
      setCyclePath(cycle);
      // Default to break the edge that would close the cycle
      const cycleEdges = [];
      for (let i = 0; i < cycle.length - 1; i++) {
        const from = cycle[i + 1]; // manager
        const to = cycle[i]; // employee
        const eIdx = rawEdges.findIndex(
          (e) => e.employee_temp_id === to && e.manager_temp_id === from,
        );
        if (eIdx >= 0) cycleEdges.push(`${from}|${to}`);
      }
      if (cycleEdges.length) setBreakEdge(cycleEdges[0]);
      setOp("cycle-warn");
    } else {
      // No cycle — just reassign
      let nEdges = rawEdges.filter((e) => e.employee_temp_id !== nodeId);
      nEdges = [
        ...nEdges,
        {
          employee_temp_id: nodeId,
          manager_temp_id: newMgr,
          edge_confidence: 1.0,
        },
      ];
      userCreatedIds.add(nodeId);
      onSave({ ...data, edges: nEdges, metrics: computeMetrics(nEdges) });
    }
  };

  const handleCycleBreakConfirm = () => {
    if (!breakEdge) return;
    const [bMgr, bEmp] = breakEdge.split("|");
    // Remove the edge user chose to break
    let nEdges = rawEdges.filter(
      (e) => !(e.employee_temp_id === bEmp && e.manager_temp_id === bMgr),
    );
    // Also remove old edge for nodeId, add new one
    nEdges = nEdges.filter((e) => e.employee_temp_id !== nodeId);
    nEdges = [
      ...nEdges,
      {
        employee_temp_id: nodeId,
        manager_temp_id: newMgr,
        edge_confidence: 1.0,
      },
    ];
    userCreatedIds.add(nodeId);
    onSave({ ...data, edges: nEdges, metrics: computeMetrics(nEdges) });
  };

  // ── Toggle open/filled (writes M3 transition record on status/geo change)
  const handleToggleStatus = (payload: NodePayload) => {
    const { name, jobId, role, grade, geo, dept, isOpen: newIsOpen } = payload;
    const prevGeo = v.geo ?? null;
    const newGeo  = geo || null;
    const prevBand = data.compMatrix && v.grade && prevGeo
      ? data.compMatrix[v.grade]?.[prevGeo] ?? null : null;
    const resolvedGrade = grade || v.grade;
    const newBand = data.compMatrix && resolvedGrade && newGeo
      ? data.compMatrix[resolvedGrade]?.[newGeo] ?? null : null;
    const hasChange = isOpen !== newIsOpen || prevGeo !== newGeo;
    const transition: CompTransition | null = hasChange ? {
      from_open: isOpen,
      from_geo: prevGeo,
      from_band_min: prevBand?.min ?? null,
      from_band_max: prevBand?.max ?? null,
      from_currency: prevBand?.currency ?? null,
      to_open: newIsOpen,
      to_geo: newGeo,
      to_band_min: newBand?.min ?? null,
      to_band_max: newBand?.max ?? null,
      to_currency: newBand?.currency ?? null,
      changed_at: new Date().toISOString(),
    } : (v.transition ?? null);
    const displayName = newIsOpen ? (jobId || v.display_name) : name;
    const nVerts = {
      ...V,
      [nodeId]: {
        ...v,
        display_name: displayName,
        role: role || v.role,
        grade: grade || null,
        geo: newGeo,
        dept: dept || null,
        open_role: newIsOpen,
        unnamed: newIsOpen,
        id: jobId || v.id || null,
        transition,
      },
    };
    onSave({ ...data, vertices: nVerts });
  };

  // ── Menu
  if (op === "menu") {
    const band = v.grade && v.geo && data.compMatrix
      ? (data.compMatrix[v.grade]?.[v.geo] ?? null)
      : null;
    return (
      <div className={styles.modalOverlay}>
        <div className={styles.modal}>
          <h3 className={styles.modalTitle}>Edit position</h3>
          <p className={styles.modalParent}>{v.display_name}</p>
          <p className={styles.modalNote}>
            {v.role} · {isOpen ? "○ Open Role" : "● Filled Role"} · {displayId}
          </p>
          {(v.geo || v.transition) && (
            <div className={styles.transitionRecord}>
              {v.geo && (
                <div className={styles.transitionRow}>
                  <span className={styles.transitionLabel}>Location</span>
                  <span className={styles.transitionDetail}>{v.geo}</span>
                  {band && (
                    <span className={styles.transitionBand}>
                      {band.currency} {band.min.toLocaleString()}–{band.max.toLocaleString()}
                    </span>
                  )}
                </div>
              )}
              {v.transition && (
                <div className={styles.transitionRow}>
                  <span className={styles.transitionLabel}>Last change</span>
                  <span className={styles.transitionDetail}>
                    {v.transition.from_open ? "○ Open" : "● Filled"} → {v.transition.to_open ? "○ Open" : "● Filled"}
                    {v.transition.from_geo !== v.transition.to_geo && (
                      <> · {v.transition.from_geo || "—"} → {v.transition.to_geo || "—"}</>
                    )}
                  </span>
                  {(v.transition.from_band_min != null || v.transition.to_band_min != null) && (
                    <span className={styles.transitionBand}>
                      {v.transition.from_band_min != null
                        ? `${v.transition.from_currency} ${v.transition.from_band_min.toLocaleString()}–${v.transition.from_band_max?.toLocaleString()}`
                        : "—"}
                      {" → "}
                      {v.transition.to_band_min != null
                        ? `${v.transition.to_currency} ${v.transition.to_band_min.toLocaleString()}–${v.transition.to_band_max?.toLocaleString()}`
                        : "—"}
                    </span>
                  )}
                  <span className={styles.transitionDate}>
                    {new Date(v.transition.changed_at).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          )}
          <div className={styles.editMenu}>
            <button
              className={styles.editMenuItem}
              onClick={() => setOp("reassign")}
            >
              <span className={styles.editIcon}>↗</span>
              <span>
                <b>Change Reporting Line</b>
                <br />
                <small>Move this node under a different manager</small>
              </span>
            </button>
            <button
              className={styles.editMenuItem}
              onClick={() => setOp("toggle-status")}
            >
              <span className={styles.editIcon}>{isOpen ? "●" : "○"}</span>
              <span>
                <b>{isOpen ? "Mark as Filled" : "Mark as Open Role"}</b>
                <br />
                <small>
                  {isOpen
                    ? "Assign this position to an employee"
                    : "Convert to an unfilled vacancy"}
                </small>
              </span>
            </button>
          </div>
          <div className={styles.modalActions}>
            <button className={styles.cancelBtn} onClick={onCancel}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Reassign
  if (op === "reassign") {
    return (
      <div className={styles.modalOverlay}>
        <div className={styles.modal}>
          <h3 className={styles.modalTitle}>Change reporting line</h3>
          <p className={styles.modalParent}>{v.display_name}</p>
          {currentMgr && (
            <p className={styles.modalNote}>
              Currently reports to: <b>{V[currentMgr]?.display_name}</b>
            </p>
          )}
          <label className={styles.fieldLabel}>New manager</label>
          <select
            className={styles.fieldSelect}
            value={newMgr}
            onChange={(e) => setNewMgr(e.target.value)}
          >
            <option value="">— no manager (orphan) —</option>
            {allCandidates.map((id) => (
              <option key={id} value={id}>
                {V[id].display_name} ({V[id].role}) — L{m.depth[id] ?? "?"}
              </option>
            ))}
          </select>
          <div className={styles.modalActions}>
            <button className={styles.cancelBtn} onClick={() => initialOp === "menu" ? setOp("menu") : onCancel()}>
              Back
            </button>
            <button
              className={styles.confirmBtn}
              onClick={handleReassignConfirm}
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Cycle warning
  if (op === "cycle-warn" && cyclePath) {
    // Build list of edges in the cycle that can be broken
    const breakable: { key: string; label: string }[] = [];
    for (let i = 0; i < cyclePath.length - 1; i++) {
      const mgr = cyclePath[i + 1];
      const emp = cyclePath[i];
      if (
        rawEdges.some(
          (e) => e.employee_temp_id === emp && e.manager_temp_id === mgr,
        )
      ) {
        breakable.push({
          key: `${mgr}|${emp}`,
          label: `${V[emp]?.display_name || emp} → ${V[mgr]?.display_name || mgr}`,
        });
      }
    }
    return (
      <div className={styles.modalOverlay}>
        <div className={styles.modal}>
          <h3 className={styles.modalTitle}>Cycle detected</h3>
          <p className={styles.modalWarn}>
            Moving <b>{v.display_name}</b> under{" "}
            <b>{V[newMgr]?.display_name}</b> creates a cycle. You must break one
            existing edge to proceed.
          </p>
          <div className={styles.cyclePath}>
            {cyclePath.map((id, i) => (
              <span key={i}>
                {V[id]?.display_name || id}
                {i < cyclePath.length - 1 ? " → " : " ↺"}
              </span>
            ))}
          </div>
          <label className={styles.fieldLabel}>
            Break this edge <span className={styles.hint}>(mandatory)</span>
          </label>
          <select
            className={styles.fieldSelect}
            value={breakEdge}
            onChange={(e) => setBreakEdge(e.target.value)}
          >
            <option value="">— select edge to break —</option>
            {breakable.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </select>
          <div className={styles.modalActions}>
            <button
              className={styles.cancelBtn}
              onClick={() => {
                setOp("reassign");
                setCyclePath(null);
              }}
            >
              Back
            </button>
            <button
              className={styles.deleteBtn}
              disabled={!breakEdge}
              onClick={handleCycleBreakConfirm}
            >
              Break Edge & Reassign
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Toggle status
  if (op === "toggle-status") {
    return (
      <NodeFormModal
        mode="edit-status"
        initialData={{
          isOpen,
          name: isOpen ? "" : v.display_name,
          jobId: v.id || "",
          role: v.role || "",
          grade: v.grade || "",
          geo: v.geo || "",
          dept: v.dept || "",
        }}
        startOpenOverride={toggleStatusOnOpen ? undefined : isOpen}
        compMatrix={data.compMatrix}
        columnMapping={columnMapping}
        onConfirm={handleToggleStatus}
        onCancel={() => initialOp === "menu" ? setOp("menu") : onCancel()}
      />
    );
  }

  return null;
}

// ── Inner ──
function MultiTransferModal({
  data,
  topLevelIds,
  nestedSelectionCount,
  onApply,
  onCancel,
}: {
  data: DashboardData;
  topLevelIds: string[];
  nestedSelectionCount: number;
  onApply: (targetManagerId: string) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const [targetId, setTargetId] = useState("");
  const validation = validateTransferTarget(data, topLevelIds, targetId);
  const selectedSet = new Set(topLevelIds);
  const targetOptions = query.trim()
    ? searchHierarchyPositions(data, query).map((result) => result.id)
    : Object.keys(data.vertices);
  const candidates = targetOptions.filter((id) => !selectedSet.has(id)).slice(0, 20);

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <h3 className={styles.modalTitle}>Transfer selected positions</h3>
        <p className={styles.modalParent}>
          {topLevelIds.length} move source{topLevelIds.length === 1 ? "" : "s"}
        </p>
        {nestedSelectionCount > 0 && (
          <p className={styles.modalNote}>
            {nestedSelectionCount} nested selection{nestedSelectionCount === 1 ? "" : "s"} will move inside an already selected subtree.
          </p>
        )}
        <div className={styles.transferPreview}>
          {topLevelIds.map((id) => (
            <span key={id}>{data.vertices[id]?.display_name || id}</span>
          ))}
        </div>
        <label className={styles.fieldLabel}>Search new manager</label>
        <input
          className={styles.fieldInput}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search manager by name, title, ID, department..."
        />
        <label className={styles.fieldLabel}>New manager</label>
        <select
          className={styles.fieldSelect}
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
        >
          <option value="">Unassigned</option>
          {candidates.map((id) => (
            <option key={id} value={id}>
              {data.vertices[id].display_name} ({data.vertices[id].role}) - L{data.metrics.depth[id] ?? "?"}
            </option>
          ))}
        </select>
        {!validation.ok && <p className={styles.modalWarn}>{validation.reason}</p>}
        <div className={styles.modalActions}>
          <button className={styles.cancelBtn} onClick={onCancel}>
            Cancel
          </button>
          <button
            className={styles.confirmBtn}
            disabled={!validation.ok || topLevelIds.length === 0}
            onClick={() => onApply(targetId)}
          >
            Apply transfer
          </button>
        </div>
      </div>
    </div>
  );
}

function Inner({ data, onDataChange, columnMapping, rows, onRowsChange, stateKey }: Props) {
  const { vertices: V, metrics: m, edges: dataEdges } = data;
  const rf = useReactFlow();
  const mounted = useRef(false);
  const userCreatedIds = useRef(new Set<string>());

  const pushState = useCallback(
    (d: DashboardData) => {
      onDataChange(d);
    },
    [onDataChange],
  );

  // ── View navigation (3-layer windowed view) ──
  const [viewRoot, setViewRoot] = useState<string>(m.basic.roots[0] || "");
  const [viewHistory, setViewHistory] = useState<string[]>([]);
  const [localCollapsed, setLocalCollapsed] = useState<Set<string>>(new Set());

  // Reset viewRoot if it was deleted
  useEffect(() => {
    if (viewRoot && !data.vertices[viewRoot]) {
      setViewRoot(data.metrics.basic.roots[0] || "");
      setViewHistory([]);
      setLocalCollapsed(new Set());
    }
    if (selectedNodeId && !data.vertices[selectedNodeId]) {
      setSelectedNodeId(null);
    }
    setSelectedNodeIds((prev) => new Set([...prev].filter((id) => !!data.vertices[id])));
    if (activeSearchResultId && !data.vertices[activeSearchResultId]) {
      setActiveSearchResultId(null);
      setHighlightedPathIds(new Set());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const handleDrillDown = useCallback((id: string) => {
    setViewHistory((h) => [...h, viewRoot]);
    setViewRoot(id);
    setLocalCollapsed(new Set());
  }, [viewRoot]);

  const handleBack = useCallback(() => {
    setViewHistory((h) => {
      const prev = h[h.length - 1];
      if (prev !== undefined) setViewRoot(prev);
      return h.slice(0, -1);
    });
    setLocalCollapsed(new Set());
  }, []);

  const handleBreadcrumbJump = useCallback((id: string) => {
    const path = [...viewHistory, viewRoot];
    const idx = path.indexOf(id);
    if (idx < 0) return;
    setViewRoot(id);
    setViewHistory(path.slice(0, idx));
    setLocalCollapsed(new Set());
  }, [viewHistory, viewRoot]);

  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editInitialOp, setEditInitialOp] = useState<EditOp>("menu");
  const [editToggleStatus, setEditToggleStatus] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearchResultId, setActiveSearchResultId] = useState<string | null>(null);
  const [highlightedPathIds, setHighlightedPathIds] = useState<Set<string>>(new Set());
  const [transferring, setTransferring] = useState(false);
  const [rowSyncError, setRowSyncError] = useState<string | null>(null);

  const canSyncRows = !!columnMapping && !!rows && !!onRowsChange;

  const publishRows = useCallback((nextRows: ExcelRow[], action: "add" | "edit" | "delete" | "transfer", label: string, affected = 1) => {
    onRowsChange?.(nextRows, { source: "hierarchy", action, label, affected, target: stateKey });
  }, [onRowsChange, stateKey]);

  const searchResults = useMemo(
    () => searchHierarchyPositions(data, searchQuery).slice(0, 12),
    [data, searchQuery],
  );

  const selectSearchResult = useCallback((id: string) => {
    const path = getPositionPath(data, id);
    setSelectedNodeId(id);
    setSelectedNodeIds((prev) => new Set(prev).add(id));
    setActiveSearchResultId(id);
    setHighlightedPathIds(new Set(path));
    setLocalCollapsed(new Set());
    if (path.length > 0) {
      setViewRoot(path[0]);
      setViewHistory([]);
    }
    setTimeout(() => rf.fitView({ padding: 0.3, duration: 300 }), 80);
  }, [data, rf]);

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setActiveSearchResultId(null);
    setHighlightedPathIds(new Set());
  }, []);

  const openEdit = useCallback((id: string, op: EditOp, toggleStatusOnOpen = true) => {
    setEditInitialOp(op);
    setEditToggleStatus(toggleStatusOnOpen);
    setEditingId(id);
  }, []);

  const onToggle = useCallback((id: string) => {
    setLocalCollapsed((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }, []);

  const graph = useMemo(
    () => buildGraph(
      data,
      viewRoot,
      localCollapsed,
      onToggle,
      handleDrillDown,
      userCreatedIds.current,
      selectedNodeIds,
      activeSearchResultId,
      highlightedPathIds,
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, viewRoot, localCollapsed, onToggle, handleDrillDown, selectedNodeIds, activeSearchResultId, highlightedPathIds],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges);

  useEffect(() => {
    setNodes(graph.nodes);
    setEdges(graph.edges);
  }, [graph, setNodes, setEdges]);
  useEffect(() => {
    const t = setTimeout(
      () => rf.fitView({ padding: 0.25, duration: 300 }),
      mounted.current ? 80 : 300,
    );
    mounted.current = true;
    return () => clearTimeout(t);
  }, [graph, rf]);

  // Add
  const doAdd = useCallback(
    ({ name, jobId, role, grade, geo, dept, isOpen, extraFields }: NodePayload, addAnother = false) => {
      const pid = addingTo!;
      const nid = jobId || `e${Date.now()}`;
      setRowSyncError(null);
      if (canSyncRows && columnMapping && rows) {
        try {
          const nextRows = addPositionRow(rows, columnMapping, {
            employeeId: nid,
            managerId: V[pid]?.id || "",
            name,
            role,
            department: dept,
            grade,
            location: geo,
            country: "",
            region: "",
            status: isOpen ? "Open" : "Filled",
            extraFields,
          });
          publishRows(nextRows, "add", `Added ${isOpen ? jobId || "open position" : name} under ${V[pid]?.display_name || "selected manager"}`);
          setSelectedNodeId(nid);
          setSelectedNodeIds((prev) => new Set(prev).add(nid));
          if (!addAnother) setAddingTo(null);
          return;
        } catch (err) {
          setRowSyncError(err instanceof Error ? err.message : "Could not update mapped rows.");
          return;
        }
      }
      userCreatedIds.current.add(nid);
      const displayName = isOpen ? (jobId || "Open Role") : name;
      const nv: NormalizedVertex = {
        display_name: displayName,
        role: role || "New Role",
        id: jobId || null,
        grade: grade || null,
        geo: geo || null,
        unnamed: isOpen,
        dept: dept || null,
        open_role: isOpen,
      };
      const ne: RawEdge = {
        employee_temp_id: nid,
        manager_temp_id: pid,
        edge_confidence: 1.0,
      };
      const nVerts = { ...V, [nid]: nv };
      const nEdges = [...dataEdges, ne];
      pushState({
        ...data,
        vertices: nVerts,
        edges: nEdges,
        metrics: computeMetrics(nEdges),
      });
      setSelectedNodeId(nid);
      setSelectedNodeIds((prev) => new Set(prev).add(nid));
      if (!addAnother) setAddingTo(null);
    },
    [addingTo, V, canSyncRows, columnMapping, rows, dataEdges, data, pushState, publishRows],
  );

  // Delete
  const doDel = useCallback(
    (target: string | null) => {
      const id = deletingId!;
      const nVerts = { ...V };
      delete nVerts[id];
      let nEdges = dataEdges.filter((e) => e.employee_temp_id !== id);
      if (target) {
        nEdges = nEdges.map((e) =>
          e.manager_temp_id === id ? { ...e, manager_temp_id: target } : e,
        );
      } else {
        nEdges = nEdges.filter((e) => e.manager_temp_id !== id);
      }
      if (canSyncRows && columnMapping && rows) {
        const deletedEmployeeId = V[id]?.id;
        const targetEmployeeId = target ? V[target]?.id || "" : "";
        const childEmployeeIds = (m.children[id] || []).map((childId) => V[childId]?.id).filter((childId): childId is string => !!childId);
        const nextRows = deletedEmployeeId
          ? deletePositionRowsWithReassignment(rows, columnMapping, deletedEmployeeId, childEmployeeIds, targetEmployeeId)
          : rows.map((row) => ({ ...row }));
        publishRows(nextRows, "delete", `Removed ${V[id]?.display_name || "position"}`, 1);
      } else {
        pushState({
          ...data,
          vertices: nVerts,
          edges: nEdges,
          metrics: computeMetrics(nEdges),
        });
      }
      setSelectedNodeId(null);
      setSelectedNodeIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (activeSearchResultId === id) {
        setActiveSearchResultId(null);
        setHighlightedPathIds(new Set());
      }
      setDeletingId(null);
    },
    [deletingId, V, m.children, dataEdges, data, pushState, activeSearchResultId, canSyncRows, columnMapping, rows, publishRows],
  );

  // Edit save
  const doEditSave = useCallback(
    (newData: DashboardData) => {
      setRowSyncError(null);
      if (canSyncRows && columnMapping && rows && editingId) {
        const oldEmployeeId = V[editingId]?.id || editingId;
        const payload = positionPayloadFromVertex(newData, editingId);
        if (payload) {
          try {
            const nextRows = editPositionRow(rows, columnMapping, oldEmployeeId, payload);
            publishRows(nextRows, "edit", `Updated ${newData.vertices[editingId]?.display_name || "position"}`);
          } catch (err) {
            setRowSyncError(err instanceof Error ? err.message : "Could not update mapped rows.");
            return;
          }
        } else {
          pushState(newData);
        }
      } else {
        pushState(newData);
      }
      setEditingId(null);
    },
    [V, canSyncRows, columnMapping, editingId, publishRows, pushState, rows],
  );

  const applyMultiTransfer = useCallback((targetManagerId: string) => {
    const sourceIds = getTopLevelTransferIds(data, [...selectedNodeIds]);
    const validation = validateTransferTarget(data, sourceIds, targetManagerId);
    if (!validation.ok) {
      setRowSyncError(validation.reason);
      return;
    }
    setRowSyncError(null);

    if (canSyncRows && columnMapping && rows) {
      try {
        const nextRows = transferPositionRows(rows, columnMapping, data, sourceIds, targetManagerId);
        publishRows(nextRows, "transfer", `Moved ${sourceIds.length} position${sourceIds.length === 1 ? "" : "s"}`, sourceIds.length);
        setTransferring(false);
        return;
      } catch (err) {
        setRowSyncError(err instanceof Error ? err.message : "Could not update mapped rows.");
        return;
      }
    }

    let nextEdges = dataEdges.filter((edge) => !sourceIds.includes(edge.employee_temp_id));
    if (targetManagerId) {
      nextEdges = [
        ...nextEdges,
        ...sourceIds.map((id) => ({
          employee_temp_id: id,
          manager_temp_id: targetManagerId,
          edge_confidence: 1.0,
        })),
      ];
    }
    sourceIds.forEach((id) => userCreatedIds.current.add(id));
    pushState({ ...data, edges: nextEdges, metrics: computeMetrics(nextEdges) });
    setTransferring(false);
  }, [canSyncRows, columnMapping, data, dataEdges, publishRows, pushState, rows, selectedNodeIds]);

  const orphans = getOrphans(V, m);
  const selectedPositions = [...selectedNodeIds].filter((id) => !!V[id]);
  const selectedNode = selectedNodeId && V[selectedNodeId] ? V[selectedNodeId] : selectedPositions[0] ? V[selectedPositions[0]] : null;
  const activeActionId = selectedNodeId && selectedNodeIds.has(selectedNodeId) ? selectedNodeId : selectedPositions[0] || null;
  const selectedIsRoot = !!activeActionId && m.basic.roots.includes(activeActionId);
  const canUseSelection = selectedPositions.length === 1 && !!activeActionId;
  const canTransferSelection = selectedPositions.length > 0;
  const topLevelTransferIds = getTopLevelTransferIds(data, selectedPositions);
  const nestedSelectionCount = selectedPositions.length - topLevelTransferIds.length;

  return (
    <div style={{ animation: "fade 0.4s ease" }}>
      {viewHistory.length > 0 && (
        <div className={styles.viewBar}>
          <button className={styles.viewBackBtn} onClick={handleBack}>
            ← Back to {V[viewHistory[viewHistory.length - 1]]?.display_name ?? "Root"}
          </button>
          <div className={styles.viewPath}>
            {[...viewHistory, viewRoot].map((id, i) => (
              <span key={id}>
                {i > 0 && <span className={styles.viewSep}> › </span>}
                <button
                  type="button"
                  className={`${styles.viewPathLink} ${i === viewHistory.length ? styles.viewPathCurrent : styles.viewPathStep} ${highlightedPathIds.has(id) ? styles.viewPathHighlighted : ""}`}
                  onClick={() => handleBreadcrumbJump(id)}
                >
                  {V[id]?.display_name ?? id}
                  {m.depth[id] !== undefined && (
                    <span className={styles.viewDepthTag}>L{m.depth[id]}</span>
                  )}
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
      <div className={styles.commandBar}>
        <div className={styles.searchArea}>
          <div className={styles.searchBox}>
            <span className={styles.searchIcon}>Search</span>
            <input
              className={styles.searchInput}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, role, ID, department, grade, geo..."
            />
            {searchQuery && (
              <button className={styles.clearSearchBtn} onClick={clearSearch} title="Clear search">
                Clear
              </button>
            )}
          </div>
          {searchQuery.trim() && (
            <div className={styles.searchResults}>
              {searchResults.length > 0 ? (
                searchResults.map((result) => (
                  <button
                    key={result.id}
                    className={`${styles.searchResult} ${activeSearchResultId === result.id ? styles.searchResultActive : ""}`}
                    onClick={() => selectSearchResult(result.id)}
                  >
                    <strong>{result.title}</strong>
                    <span>{result.subtitle}</span>
                    <small>
                      {result.context}
                      {result.managerName ? ` · Manager: ${result.managerName}` : result.isUnassigned ? " · Unassigned" : ""}
                    </small>
                  </button>
                ))
              ) : (
                <div className={styles.searchEmpty}>No matching positions</div>
              )}
            </div>
          )}
        </div>

        <div className={styles.actionArea}>
          <div className={styles.selectionSummary}>
            {selectedNode ? (
              <>
                <b>{selectedPositions.length === 1 ? selectedNode.display_name : `${selectedPositions.length} positions selected`}</b>
                <span>{selectedPositions.length === 1 ? selectedNode.role : `${topLevelTransferIds.length} top-level move source${topLevelTransferIds.length === 1 ? "" : "s"}`}</span>
              </>
            ) : (
              <span>Select positions to use actions</span>
            )}
          </div>
          <button className={styles.fitBtn} disabled={!canUseSelection} onClick={() => activeActionId && setAddingTo(activeActionId)}>
            Add position
          </button>
          <button className={styles.fitBtn} disabled={!canUseSelection} onClick={() => activeActionId && openEdit(activeActionId, "toggle-status", false)}>
            Edit details
          </button>
          <button className={styles.fitBtn} disabled={!canUseSelection || selectedIsRoot} onClick={() => activeActionId && setDeletingId(activeActionId)}>
            Delete position
          </button>
          <button className={styles.fitBtn} disabled={!canTransferSelection} onClick={() => setTransferring(true)}>
            Transfer
          </button>
          <button className={styles.fitBtn} disabled={!canUseSelection} onClick={() => activeActionId && openEdit(activeActionId, "toggle-status", true)}>
            {selectedNode?.open_role ? "Mark filled" : "Mark open"}
          </button>
        </div>
      </div>
      <div className={styles.toolbar}>
        <div className={styles.legend}>
          <span>
            <span
              className={styles.dot}
              style={{ background: "var(--teal)" }}
            />{" "}
            Root
          </span>
          <span>
            <span
              className={styles.dot}
              style={{ background: "var(--olive)" }}
            />{" "}
            L1–L2
          </span>
          <span>
            <span
              className={styles.dot}
              style={{ background: "var(--slate)" }}
            />{" "}
            L3+
          </span>
          {orphans.length > 0 && (
            <span>
              <span
                className={styles.dot}
                style={{ background: "var(--accent)" }}
              />{" "}
              Unassigned
            </span>
          )}
        </div>
        <div className={styles.stats}>
          <span className={styles.stat}>{Object.keys(V).length} positions</span>
          <span className={styles.stat}>{dataEdges.length} reporting lines</span>
          {orphans.length > 0 && (
            <span className={styles.statWarn}>
              {orphans.length} unassigned
            </span>
          )}
          <button
            className={styles.fitBtn}
            onClick={() => rf.fitView({ padding: 0.3, duration: 400 })}
          >
            ⌖ Fit
          </button>
          <button
            className={styles.fitBtn}
            onClick={() => setLocalCollapsed(new Set())}
          >
            ↕ Expand
          </button>
        </div>
      </div>

      {rowSyncError && <div className={styles.inlineError}>{rowSyncError}</div>}

      <div className={styles.workbench}>
        <div className={styles.flowWrap}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={(_, node) => {
              setSelectedNodeId(node.id);
              setSelectedNodeIds((prev) => new Set(prev).add(node.id));
            }}
            onPaneClick={() => setSelectedNodeId(null)}
            nodeTypes={nodeTypes}
            nodesDraggable
            nodesConnectable={false}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            minZoom={0.1}
            maxZoom={2.5}
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{ type: "straight" }}
          >
            <Background gap={20} size={1} color="rgba(0,0,0,0.04)" />
            <Controls showInteractive={false} />
            <MiniMap
              nodeColor={(n: any) => {
                const d = n.data as OrgNodeData;
                if (d.isOrphan) return "#d97706";
                if (d.depth === 0) return "#006b6b";
                if (d.depth <= 2) return "#8a9a2f";
                return "#3a4148";
              }}
              maskColor="rgba(244,241,232,0.7)"
              style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 2 }}
            />
          </ReactFlow>
        </div>

        <aside className={styles.selectionTray}>
          <div className={styles.trayHeader}>
            <div>
              <b>Selection tray</b>
              <span>{selectedPositions.length} position{selectedPositions.length === 1 ? "" : "s"}</span>
            </div>
            <button
              className={styles.trayTextBtn}
              disabled={!selectedPositions.length}
              onClick={() => {
                setSelectedNodeIds(new Set());
                setSelectedNodeId(null);
              }}
            >
              Clear
            </button>
          </div>
          {nestedSelectionCount > 0 && (
            <div className={styles.trayNotice}>
              {nestedSelectionCount} nested selection{nestedSelectionCount === 1 ? "" : "s"} will be included inside a selected subtree.
            </div>
          )}
          <div className={styles.trayList}>
            {selectedPositions.length ? selectedPositions.map((id) => {
              const v = V[id];
              const managerId = m.parent[id];
              return (
                <div key={id} className={`${styles.trayItem} ${selectedNodeId === id ? styles.trayItemActive : ""}`}>
                  <button
                    className={styles.trayItemMain}
                    onClick={() => {
                      setSelectedNodeId(id);
                      const path = getPositionPath(data, id);
                      setHighlightedPathIds(new Set(path));
                      setActiveSearchResultId(id);
                    }}
                  >
                    <b>{v.display_name}</b>
                    <span>{v.role || "Position"} · {v.id || id}</span>
                    <small>
                      {v.dept || "Unassigned department"} · {v.geo || "No geo"} · Manager: {managerId ? V[managerId]?.display_name : "Unassigned"} · L{m.depth[id] ?? "-"}
                    </small>
                  </button>
                  <button
                    className={styles.trayRemove}
                    onClick={() => {
                      setSelectedNodeIds((prev) => {
                        const next = new Set(prev);
                        next.delete(id);
                        return next;
                      });
                      if (selectedNodeId === id) setSelectedNodeId(null);
                    }}
                  >
                    Remove
                  </button>
                </div>
              );
            }) : (
              <div className={styles.trayEmpty}>
                Use search or click positions in the chart to build a working set.
              </div>
            )}
          </div>
          <div className={styles.trayActions}>
            <button className={styles.fitBtn} disabled={!canUseSelection} onClick={() => activeActionId && setAddingTo(activeActionId)}>
              Add direct report
            </button>
            <button className={styles.fitBtn} disabled={!canTransferSelection} onClick={() => setTransferring(true)}>
              Transfer selected
            </button>
          </div>
        </aside>
      </div>

      {addingTo && (
        <NodeFormModal
          mode="add"
          parentName={V[addingTo]?.display_name || addingTo}
          compMatrix={data.compMatrix}
          columnMapping={columnMapping}
          onConfirm={doAdd}
          onCancel={() => setAddingTo(null)}
        />
      )}
      {deletingId && (
        <DeleteModal
          nodeName={V[deletingId]?.display_name || deletingId}
          nodeId={deletingId}
          childIds={m.children[deletingId] || []}
          V={V}
          m={m}
          onConfirm={doDel}
          onCancel={() => setDeletingId(null)}
        />
      )}
      {transferring && (
        <MultiTransferModal
          data={data}
          topLevelIds={topLevelTransferIds}
          nestedSelectionCount={nestedSelectionCount}
          onApply={applyMultiTransfer}
          onCancel={() => setTransferring(false)}
        />
      )}
      {editingId && (
        <EditModal
          nodeId={editingId}
          data={data}
          userCreatedIds={userCreatedIds.current}
          columnMapping={columnMapping}
          initialOp={editInitialOp}
          toggleStatusOnOpen={editToggleStatus}
          onSave={doEditSave}
          onCancel={() => setEditingId(null)}
        />
      )}
    </div>
  );
}

export default function HierarchyView(props: Props) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}
