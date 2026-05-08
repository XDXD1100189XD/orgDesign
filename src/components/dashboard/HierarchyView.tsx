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
import { computeMetrics } from "@/lib/metrics";
import OrgNode from "./OrgNode";
import styles from "./HierarchyView.module.css";

const nodeTypes = { org: OrgNode };
interface Props {
  data: DashboardData;
  onDataChange: (d: DashboardData) => void;
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

function buildGraph(
  data: DashboardData,
  viewRoot: string,
  localCollapsed: Set<string>,
  onDel: (id: string) => void,
  onAdd: (id: string) => void,
  onEdit: (id: string) => void,
  onToggle: (id: string) => void,
  onDrillDown: (id: string) => void,
  userCreatedIds: Set<string>,
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
        subtreeCount: m.subtree_count[id] ?? 0,
        onDelete: onDel,
        onAdd,
        onEdit,
        onToggleCollapse: onToggle,
        onDrillDown,
        collapsed: isCol,
        childCount: allKids.length,
      } as OrgNodeData & Record<string, unknown>,
    });

    let cx = x - ((w[id] || NODE_W) - NODE_W) / 2;
    visibleKids.forEach((kid) => {
      const isU = userCreatedIds.has(kid);
      out.edges.push({
        id: `${id}->${kid}`,
        source: id,
        target: kid,
        type: "straight",
        style: {
          stroke: isU ? "#6366f1" : "#b8b5a8",
          strokeWidth: isU ? 2 : 1.5,
          strokeDasharray: isU ? "6 3" : undefined,
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
            onDelete: onDel,
            onAdd,
            onEdit,
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
}

function NodeFormModal({
  mode,
  parentName,
  initialData,
  compMatrix,
  onConfirm,
  onCancel,
}: {
  mode: "add" | "edit-status";
  parentName?: string;
  initialData?: { isOpen: boolean; name: string; jobId: string; role: string; grade: string; geo: string; dept: string };
  compMatrix?: CompMatrix;
  onConfirm: (p: NodePayload) => void;
  onCancel: () => void;
}) {
  const startOpen = mode === "edit-status" ? !initialData!.isOpen : false;
  const [isOpen, setIsOpen] = useState(startOpen);
  const [name,  setName]  = useState(mode === "edit-status" && !initialData!.isOpen ? initialData!.name : "");
  const [jobId, setJobId] = useState(initialData?.jobId || "");
  const [role,  setRole]  = useState(initialData?.role  || "");
  const [grade, setGrade] = useState(initialData?.grade || "");
  const [geo,   setGeo]   = useState(initialData?.geo   || "");
  const [dept,  setDept]  = useState(initialData?.dept  || "");

  const knownGeos = compMatrix
    ? [...new Set(Object.values(compMatrix).flatMap((g) => (g ? Object.keys(g) : [])))]
    : [];
  const lookupBand = compMatrix && grade.trim() && geo.trim()
    ? compMatrix[grade.trim()]?.[geo.trim()] ?? null
    : null;

  const canConfirm = isOpen ? !!jobId.trim() : !!name.trim();

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <h3 className={styles.modalTitle}>
          {mode === "add" ? "Add report under" : "Edit node"}
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
          Employee / Job ID {isOpen && <span className={styles.reqMark}>*</span>}
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

        <div className={styles.modalActions}>
          <button className={styles.cancelBtn} onClick={onCancel}>
            {mode === "add" ? "Cancel" : "Back"}
          </button>
          <button
            className={styles.confirmBtn}
            disabled={!canConfirm}
            onClick={() => onConfirm({ name: name.trim(), jobId: jobId.trim(), role: role.trim(), grade: grade.trim(), geo: geo.trim(), dept: dept.trim(), isOpen })}
          >
            {mode === "add" ? "Add Node" : "Save Changes"}
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
        <h3 className={styles.modalTitle}>Remove node</h3>
        <p className={styles.modalParent}>{nodeName}</p>
        {childIds.length > 0 ? (
          <>
            <p className={styles.modalWarn}>
              {childIds.length} direct report{childIds.length > 1 ? "s" : ""}{" "}
              will be reassigned.
            </p>
            <label className={styles.fieldLabel}>Reassign to</label>
            <select
              className={styles.fieldSelect}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">— make orphan —</option>
              {candidates.map((id) => (
                <option key={id} value={id}>
                  {V[id].display_name} ({V[id].role}) — L{m.depth[id] ?? "?"}
                </option>
              ))}
            </select>
          </>
        ) : (
          <p className={styles.modalNote}>
            No direct reports. Node will be removed.
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
            {childIds.length > 0 ? "Reassign & Remove" : "Remove"}
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
  onSave,
  onCancel,
}: {
  nodeId: string;
  data: DashboardData;
  userCreatedIds: Set<string>;
  onSave: (newData: DashboardData) => void;
  onCancel: () => void;
}) {
  const { vertices: V, metrics: m, edges: rawEdges } = data;
  const v = V[nodeId];
  const [op, setOp] = useState<EditOp>("menu");
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
      // No manager = make orphan
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
          <h3 className={styles.modalTitle}>Edit node</h3>
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
            <button className={styles.cancelBtn} onClick={() => setOp("menu")}>
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
        compMatrix={data.compMatrix}
        onConfirm={handleToggleStatus}
        onCancel={() => setOp("menu")}
      />
    );
  }

  return null;
}

// ── Inner ──
function Inner({ data, onDataChange }: Props) {
  const { vertices: V, metrics: m, edges: dataEdges } = data;
  const rf = useReactFlow();
  const mounted = useRef(false);
  const userCreatedIds = useRef(new Set<string>());

  // Undo / Redo
  const [history, setHistory] = useState<DashboardData[]>([data]);
  const [histIdx, setHistIdx] = useState(0);

  const pushState = useCallback(
    (d: DashboardData) => {
      setHistory((prev) => {
        const trimmed = prev.slice(0, histIdx + 1);
        return [...trimmed, d];
      });
      setHistIdx((i) => i + 1);
      onDataChange(d);
    },
    [histIdx, onDataChange],
  );

  const canUndo = histIdx > 0;
  const canRedo = histIdx < history.length - 1;

  const undo = useCallback(() => {
    if (!canUndo) return;
    const prev = history[histIdx - 1];
    setHistIdx((i) => i - 1);
    onDataChange(prev);
  }, [canUndo, history, histIdx, onDataChange]);

  const redo = useCallback(() => {
    if (!canRedo) return;
    const next = history[histIdx + 1];
    setHistIdx((i) => i + 1);
    onDataChange(next);
  }, [canRedo, history, histIdx, onDataChange]);

  // Keep history in sync when external data changes (initial load)
  useEffect(() => {
    if (history.length === 1 && history[0] !== data) {
      setHistory([data]);
      setHistIdx(0);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const onDel = useCallback((id: string) => setDeletingId(id), []);
  const onAddN = useCallback((id: string) => setAddingTo(id), []);
  const onEditN = useCallback((id: string) => setEditingId(id), []);
  const onToggle = useCallback((id: string) => {
    setLocalCollapsed((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }, []);

  const graph = useMemo(
    () => buildGraph(data, viewRoot, localCollapsed, onDel, onAddN, onEditN, onToggle, handleDrillDown, userCreatedIds.current),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, viewRoot, localCollapsed, onDel, onAddN, onEditN, onToggle, handleDrillDown],
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
    ({ name, jobId, role, grade, geo, dept, isOpen }: NodePayload) => {
      const pid = addingTo!;
      const nid = `e${Date.now()}`;
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
      setAddingTo(null);
    },
    [addingTo, V, dataEdges, data, pushState],
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
      pushState({
        ...data,
        vertices: nVerts,
        edges: nEdges,
        metrics: computeMetrics(nEdges),
      });
      setDeletingId(null);
    },
    [deletingId, V, dataEdges, data, pushState],
  );

  // Edit save
  const doEditSave = useCallback(
    (newData: DashboardData) => {
      pushState(newData);
      setEditingId(null);
    },
    [pushState],
  );

  const orphans = getOrphans(V, m);

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
                <span className={i === viewHistory.length ? styles.viewPathCurrent : styles.viewPathStep}>
                  {V[id]?.display_name ?? id}
                  {m.depth[id] !== undefined && (
                    <span className={styles.viewDepthTag}>L{m.depth[id]}</span>
                  )}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
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
              Orphan
            </span>
          )}
        </div>
        <div className={styles.stats}>
          <button
            className={styles.fitBtn}
            onClick={undo}
            disabled={!canUndo}
            title="Undo"
          >
            ↩ Undo
          </button>
          <button
            className={styles.fitBtn}
            onClick={redo}
            disabled={!canRedo}
            title="Redo"
          >
            ↪ Redo
          </button>
          <span className={styles.stat}>{Object.keys(V).length} nodes</span>
          <span className={styles.stat}>{dataEdges.length} edges</span>
          {orphans.length > 0 && (
            <span className={styles.statWarn}>
              {orphans.length} orphan{orphans.length > 1 ? "s" : ""}
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

      <div className={styles.flowWrap}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
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

      {addingTo && (
        <NodeFormModal
          mode="add"
          parentName={V[addingTo]?.display_name || addingTo}
          compMatrix={data.compMatrix}
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
      {editingId && (
        <EditModal
          nodeId={editingId}
          data={data}
          userCreatedIds={userCreatedIds.current}
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
