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
const userCreatedIds = new Set<string>();

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
  collapsed: Set<string>,
  onDel: (id: string) => void,
  onAdd: (id: string) => void,
  onEdit: (id: string) => void,
  onToggle: (id: string) => void,
): { nodes: Node[]; edges: Edge[] } {
  const { vertices: V, metrics: m } = data;
  const root = m.basic.roots[0];
  const out: { nodes: Node[]; edges: Edge[] } = { nodes: [], edges: [] };
  if (!root) return out;

  const w: Record<string, number> = {};
  function cw(id: string): number {
    if (collapsed.has(id)) {
      w[id] = NODE_W;
      return NODE_W;
    }
    const kids = m.children[id] || [];
    if (!kids.length) {
      w[id] = NODE_W;
      return NODE_W;
    }
    const t = kids.reduce((s, k) => s + cw(k) + GAP_X, -GAP_X);
    w[id] = Math.max(NODE_W, t);
    return w[id];
  }
  cw(root);

  function place(id: string, x: number, y: number) {
    const v = V[id];
    if (!v) return;
    const isCol = collapsed.has(id);
    const kids = isCol ? [] : m.children[id] || [];
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
        unnamed: v.unnamed,
        span: m.span[id] ?? 0,
        depth: m.depth[id] ?? 0,
        openRole: v.open_role,
        isUserCreated: userCreatedIds.has(id),
        isOrphan: false,
        onDelete: onDel,
        onAdd,
        onEdit,
        onToggleCollapse: onToggle,
        collapsed: isCol,
        childCount: (m.children[id] || []).length,
      } as OrgNodeData & Record<string, unknown>,
    });
    let cx = x - ((w[id] || NODE_W) - NODE_W) / 2;
    kids.forEach((kid) => {
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
        labelStyle: isU
          ? { fill: "#6366f1", fontSize: 9, fontWeight: 700 }
          : undefined,
        labelBgStyle: isU ? { fill: "#f4f1e8", fillOpacity: 0.9 } : undefined,
        labelBgPadding: isU ? ([4, 6] as [number, number]) : undefined,
      });
      place(kid, cx + ((w[kid] || NODE_W) - NODE_W) / 2, y + GAP_Y);
      cx += (w[kid] || NODE_W) + GAP_X;
    });
  }
  place(root, 0, 0);

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
          onDelete: onDel,
          onAdd,
          onEdit,
          onToggleCollapse: onToggle,
          collapsed: false,
          childCount: 0,
        } as OrgNodeData & Record<string, unknown>,
      });
    });
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

// ── Add Modal ──
function AddModal({
  parentName,
  onConfirm,
  onCancel,
}: {
  parentName: string;
  onConfirm: (name: string, role: string, jobId: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [jobId, setJobId] = useState("");
  const hasInput = name.trim() || jobId.trim();
  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <h3 className={styles.modalTitle}>Add report under</h3>
        <p className={styles.modalParent}>{parentName}</p>

        <label className={styles.fieldLabel}>
          Name <span className={styles.hint}>(filled role)</span>
        </label>
        <input
          className={styles.fieldInput}
          placeholder="Employee name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />

        <label className={styles.fieldLabel}>
          Job ID <span className={styles.hint}>(open role if no name)</span>
        </label>
        <input
          className={styles.fieldInput}
          placeholder="e.g. EDAA1234"
          value={jobId}
          onChange={(e) => setJobId(e.target.value)}
        />

        <label className={styles.fieldLabel}>Role / Title</label>
        <input
          className={styles.fieldInput}
          placeholder="Job title"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        />

        {hasInput && (
          <div className={styles.statusPreview}>
            {name.trim() ? (
              <span className={styles.previewFilled}>
                ● Will be created as <b>Filled</b> role
              </span>
            ) : (
              <span className={styles.previewOpen}>
                ○ Will be created as <b>Open</b> role
                {jobId.trim() ? ` (${jobId.trim()})` : ""}
              </span>
            )}
          </div>
        )}

        <div className={styles.modalActions}>
          <button className={styles.cancelBtn} onClick={onCancel}>
            Cancel
          </button>
          <button
            className={styles.confirmBtn}
            disabled={!hasInput}
            onClick={() =>
              onConfirm(name.trim(), role.trim() || "New Role", jobId.trim())
            }
          >
            Add Node
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
  onSave,
  onCancel,
}: {
  nodeId: string;
  data: DashboardData;
  onSave: (newData: DashboardData) => void;
  onCancel: () => void;
}) {
  const { vertices: V, metrics: m, edges: rawEdges } = data;
  const v = V[nodeId];
  const [op, setOp] = useState<EditOp>("menu");
  const [newMgr, setNewMgr] = useState<string>(m.parent[nodeId] || "");
  const [cyclePath, setCyclePath] = useState<string[] | null>(null);
  const [breakEdge, setBreakEdge] = useState<string>("");
  const [nameInput, setNameInput] = useState<string>("");
  const [jobIdInput, setJobIdInput] = useState<string>("");

  if (!v) {
    onCancel();
    return null;
  }

  const currentMgr = m.parent[nodeId];
  const isOpen = v.open_role;
  const displayId = v.id || "—";

  useEffect(() => {
    if (op === "toggle-status") {
      setNameInput(v.unnamed ? "" : v.display_name);
      setJobIdInput(v.id || "");
    }
  }, [op, v.display_name, v.id, v.unnamed]);

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

  // ── Toggle open/filled
  const handleToggleStatus = () => {
    const nVerts = { ...V };

    if (isOpen) {
      const name = nameInput.trim();
      if (!name) return;
      nVerts[nodeId] = {
        ...v,
        display_name: name,
        open_role: false,
        unnamed: false,
        id: v.id ?? null,
      };
    } else {
      const jobId = jobIdInput.trim() || v.id || "";
      if (!jobId) return;
      nVerts[nodeId] = {
        ...v,
        display_name: jobId,
        open_role: true,
        unnamed: true,
        id: jobId,
      };
    }

    onSave({ ...data, vertices: nVerts });
  };

  // ── Menu
  if (op === "menu") {
    return (
      <div className={styles.modalOverlay}>
        <div className={styles.modal}>
          <h3 className={styles.modalTitle}>Edit node</h3>
          <p className={styles.modalParent}>{v.display_name}</p>
          <p className={styles.modalNote}>
            {v.role} · {isOpen ? "○ Open Role" : "● Filled Role"} · {displayId}
          </p>
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
      <div className={styles.modalOverlay}>
        <div className={styles.modal}>
          <h3 className={styles.modalTitle}>
            {isOpen ? "Mark as filled" : "Mark as open role"}
          </h3>
          <p className={styles.modalParent}>{v.display_name}</p>
          {isOpen ? (
            <>
              <p className={styles.modalNote}>
                This position will be marked as <b>filled</b>. Please enter the
                employee name to complete the update.
              </p>
              <label className={styles.fieldLabel}>
                Employee name <span className={styles.hint}>(required)</span>
              </label>
              <input
                className={styles.fieldInput}
                placeholder="Employee name"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                autoFocus
              />
            </>
          ) : (
            <>
              <p className={styles.modalNote}>
                This position will be marked as <b>open (vacant)</b>.
              </p>
              <label className={styles.fieldLabel}>
                Job ID{" "}
                <span className={styles.hint}>(required if none exists)</span>
              </label>
              <input
                className={styles.fieldInput}
                placeholder="Job ID"
                value={jobIdInput}
                onChange={(e) => setJobIdInput(e.target.value)}
                autoFocus={!v.id}
              />
              {!v.id && (
                <p className={styles.modalWarn}>
                  A Job ID is required for open roles so the position remains
                  traceable.
                </p>
              )}
            </>
          )}
          <div className={styles.modalActions}>
            <button className={styles.cancelBtn} onClick={() => setOp("menu")}>
              Back
            </button>
            <button
              className={styles.confirmBtn}
              disabled={
                isOpen ? !nameInput.trim() : !jobIdInput.trim() && !v.id
              }
              onClick={handleToggleStatus}
            >
              {isOpen ? "● Mark Filled" : "○ Mark Open"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// ── Inner ──
function Inner({ data, onDataChange }: Props) {
  const { vertices: V, metrics: m, edges: dataEdges } = data;
  const rf = useReactFlow();
  const mounted = useRef(false);

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

  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const onDel = useCallback((id: string) => setDeletingId(id), []);
  const onAddN = useCallback((id: string) => setAddingTo(id), []);
  const onEditN = useCallback((id: string) => setEditingId(id), []);
  const onToggle = useCallback((id: string) => {
    setCollapsed((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }, []);

  const graph = useMemo(
    () => buildGraph(data, collapsed, onDel, onAddN, onEditN, onToggle),
    [data, collapsed, onDel, onAddN, onEditN, onToggle],
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
    (name: string, role: string, jobId: string) => {
      const pid = addingTo!;
      const nid = `e${Date.now()}`;
      userCreatedIds.add(nid);
      const isOpen = !name && !!jobId;
      const displayName = name || jobId;
      const nv: NormalizedVertex = {
        display_name: displayName,
        role,
        id: jobId || null,
        grade: null,
        unnamed: isOpen,
        dept: null,
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
            onClick={() => setCollapsed(new Set())}
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
        <AddModal
          parentName={V[addingTo]?.display_name || addingTo}
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
