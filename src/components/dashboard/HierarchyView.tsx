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
  onDataChange: (data: DashboardData) => void;
}

const NODE_W = 200;
const GAP_X = 40;
const GAP_Y = 140;

// Track user-created node IDs
const userCreatedNodes = new Set<string>();

function getOrphans(
  V: Record<string, NormalizedVertex>,
  m: DashboardData["metrics"],
): string[] {
  const connected = new Set<string>();
  m.basic.roots.forEach((r) => connected.add(r));
  Object.keys(m.parent).forEach((k) => {
    connected.add(k);
    connected.add(m.parent[k]);
  });
  Object.keys(m.children).forEach((k) => {
    connected.add(k);
    (m.children[k] || []).forEach((c) => connected.add(c));
  });
  return Object.keys(V).filter((id) => !connected.has(id));
}

function buildFlowGraph(
  data: DashboardData,
  collapsedSet: Set<string>,
  handlers: {
    onDelete: (id: string) => void;
    onAdd: (parentId: string) => void;
    onToggleCollapse: (id: string) => void;
  },
): { nodes: Node[]; edges: Edge[] } {
  const { vertices: V, metrics: m, edges: rawEdges } = data;
  const root = m.basic.roots[0];
  const flowNodes: Node[] = [];
  const flowEdges: Edge[] = [];

  if (!root) return { nodes: flowNodes, edges: flowEdges };

  // Build subtree widths considering collapse
  const widths: Record<string, number> = {};
  function calcWidth(id: string): number {
    if (collapsedSet.has(id)) {
      widths[id] = NODE_W;
      return NODE_W;
    }
    const kids = m.children[id] || [];
    if (kids.length === 0) {
      widths[id] = NODE_W;
      return NODE_W;
    }
    const total = kids.reduce((s, k) => s + calcWidth(k) + GAP_X, -GAP_X);
    widths[id] = Math.max(NODE_W, total);
    return widths[id];
  }
  calcWidth(root);

  function place(id: string, x: number, y: number) {
    const v = V[id];
    if (!v) return;
    const isCollapsed = collapsedSet.has(id);
    const kids = isCollapsed ? [] : m.children[id] || [];
    const totalKids = (m.children[id] || []).length;

    const nodeData: OrgNodeData & Record<string, unknown> = {
      tempId: id,
      displayName: v.display_name,
      role: v.role,
      empId: v.id,
      grade: v.grade,
      unnamed: v.unnamed,
      span: m.span[id] ?? 0,
      depth: m.depth[id] ?? 0,
      openRole: v.open_role,
      isUserCreated: userCreatedNodes.has(id),
      isOrphan: false,
      onDelete: handlers.onDelete,
      onAdd: handlers.onAdd,
      onToggleCollapse: handlers.onToggleCollapse,
      collapsed: isCollapsed,
      childCount: totalKids,
    };

    flowNodes.push({ id, type: "org", position: { x, y }, data: nodeData });

    let cx = x - ((widths[id] || NODE_W) - NODE_W) / 2;
    kids.forEach((kid) => {
      // Detect user-created edges
      const edgeObj = rawEdges.find(
        (e) => e.employee_temp_id === kid && e.manager_temp_id === id,
      );
      const isUserEdge =
        edgeObj && edgeObj.edge_confidence === 1.0 && userCreatedNodes.has(kid);

      flowEdges.push({
        id: `${id}-${kid}`,
        source: id,
        target: kid,
        type: "smoothstep",
        style: {
          stroke: isUserEdge ? "#6366f1" : "#b8b5a8",
          strokeWidth: isUserEdge ? 2 : 1.5,
          strokeDasharray: isUserEdge ? "6 3" : undefined,
        },
        label: isUserEdge ? "user added" : undefined,
        labelStyle: isUserEdge
          ? {
              fill: "#6366f1",
              fontSize: 9,
              fontFamily: "var(--font-mono)",
              fontWeight: 600,
            }
          : undefined,
        labelBgStyle: isUserEdge
          ? { fill: "#f4f1e8", fillOpacity: 0.9 }
          : undefined,
      });
      place(kid, cx + ((widths[kid] || NODE_W) - NODE_W) / 2, y + GAP_Y);
      cx += (widths[kid] || NODE_W) + GAP_X;
    });
  }

  place(root, 0, 0);

  // Orphan nodes — place in a separate row below
  const orphans = getOrphans(V, m);
  if (orphans.length > 0) {
    const minY =
      flowNodes.length > 0
        ? Math.max(...flowNodes.map((n) => n.position.y)) + GAP_Y + 60
        : 0;
    orphans.forEach((id, i) => {
      const v = V[id];
      if (!v) return;
      flowNodes.push({
        id,
        type: "org",
        position: { x: i * (NODE_W + GAP_X), y: minY },
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
          isUserCreated: userCreatedNodes.has(id),
          isOrphan: true,
          onDelete: handlers.onDelete,
          onAdd: handlers.onAdd,
          onToggleCollapse: handlers.onToggleCollapse,
          collapsed: false,
          childCount: 0,
        } as OrgNodeData & Record<string, unknown>,
      });
    });
  }

  return { nodes: flowNodes, edges: flowEdges };
}

/* ── Add Node Modal ── */
function AddNodeModal({
  parentName,
  onConfirm,
  onCancel,
}: {
  parentName: string;
  onConfirm: (name: string, role: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <h3 className={styles.modalTitle}>Add report under</h3>
        <p className={styles.modalParent}>{parentName}</p>
        <label className={styles.fieldLabel}>Name</label>
        <input
          className={styles.fieldInput}
          placeholder="Employee name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <label className={styles.fieldLabel}>Role</label>
        <input
          className={styles.fieldInput}
          placeholder="Job title / role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        />
        <div className={styles.modalActions}>
          <button className={styles.cancelBtn} onClick={onCancel}>
            Cancel
          </button>
          <button
            className={styles.confirmBtn}
            disabled={!name.trim()}
            onClick={() => onConfirm(name.trim(), role.trim() || "New Role")}
          >
            Add Node
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Delete / Reassign Modal ── */
function DeleteModal({
  nodeName,
  nodeId,
  children: childIds,
  V,
  m,
  onConfirm,
  onCancel,
}: {
  nodeName: string;
  nodeId: string;
  children: string[];
  V: Record<string, NormalizedVertex>;
  m: DashboardData["metrics"];
  onConfirm: (reassignTo: string | null) => void;
  onCancel: () => void;
}) {
  const parentId = m.parent[nodeId];
  const [target, setTarget] = useState<string>(parentId || "");

  // Candidates: all nodes except the node being deleted and its subtree
  const subtree = new Set<string>();
  function collectSubtree(id: string) {
    subtree.add(id);
    (m.children[id] || []).forEach(collectSubtree);
  }
  collectSubtree(nodeId);
  const candidates = Object.keys(V).filter((id) => !subtree.has(id));

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <h3 className={styles.modalTitle}>Remove node</h3>
        <p className={styles.modalParent}>{nodeName}</p>

        {childIds.length > 0 ? (
          <>
            <p className={styles.modalWarn}>
              This node has {childIds.length} direct report
              {childIds.length > 1 ? "s" : ""}. Choose where to reassign them:
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
          <p className={styles.modalNote}>This node has no direct reports.</p>
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

/* ── Inner component (needs useReactFlow) ── */
function HierarchyInner({ data, onDataChange }: Props) {
  const { vertices: V, metrics: m, edges: dataEdges } = data;
  const { fitView } = useReactFlow();
  const hasFit = useRef(false);

  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [collapsedSet, setCollapsedSet] = useState<Set<string>>(new Set());

  const handleDelete = useCallback((id: string) => setDeletingId(id), []);
  const handleAdd = useCallback(
    (parentId: string) => setAddingTo(parentId),
    [],
  );
  const handleToggleCollapse = useCallback((id: string) => {
    setCollapsedSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const flowGraph = useMemo(
    () =>
      buildFlowGraph(data, collapsedSet, {
        onDelete: handleDelete,
        onAdd: handleAdd,
        onToggleCollapse: handleToggleCollapse,
      }),
    [data, collapsedSet, handleDelete, handleAdd, handleToggleCollapse],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(flowGraph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowGraph.edges);

  useEffect(() => {
    setNodes(flowGraph.nodes);
    setEdges(flowGraph.edges);
    // Auto-fit after graph rebuilds
    setTimeout(() => fitView({ padding: 0.25, duration: 300 }), 50);
  }, [flowGraph, setNodes, setEdges, fitView]);

  // Initial fit
  useEffect(() => {
    if (!hasFit.current && nodes.length > 0) {
      hasFit.current = true;
      setTimeout(() => fitView({ padding: 0.3, duration: 400 }), 100);
    }
  }, [nodes, fitView]);

  const confirmAdd = useCallback(
    (name: string, role: string) => {
      const parentId = addingTo!;
      const newId = `e${Date.now()}`;
      userCreatedNodes.add(newId);

      const newVertex: NormalizedVertex = {
        display_name: name,
        role,
        id: null,
        grade: null,
        unnamed: false,
        dept: null,
        open_role: false,
      };
      const newEdge: RawEdge = {
        employee_temp_id: newId,
        manager_temp_id: parentId,
        edge_confidence: 1.0,
      };
      const newVertices = { ...V, [newId]: newVertex };
      const newRawEdges = [...dataEdges, newEdge];
      const newMetrics = computeMetrics(newRawEdges);
      onDataChange({
        ...data,
        vertices: newVertices,
        edges: newRawEdges,
        metrics: newMetrics,
      });
      setAddingTo(null);
    },
    [addingTo, V, dataEdges, data, onDataChange],
  );

  const confirmDelete = useCallback(
    (reassignTo: string | null) => {
      const id = deletingId!;
      const childIds = m.children[id] || [];

      const newVertices = { ...V };
      delete newVertices[id];

      // Remove the deleted node's own edge
      let newRawEdges = dataEdges.filter((e) => e.employee_temp_id !== id);

      // Reassign children
      if (reassignTo) {
        newRawEdges = newRawEdges.map((e) =>
          e.manager_temp_id === id ? { ...e, manager_temp_id: reassignTo } : e,
        );
      } else {
        // Make orphans: remove edges where manager is the deleted node
        newRawEdges = newRawEdges.filter((e) => e.manager_temp_id !== id);
      }

      const newMetrics = computeMetrics(newRawEdges);
      onDataChange({
        ...data,
        vertices: newVertices,
        edges: newRawEdges,
        metrics: newMetrics,
      });
      setDeletingId(null);
    },
    [deletingId, V, m, dataEdges, data, onDataChange],
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
            L1
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
                style={{
                  background: "var(--accent)",
                  border: "1px dashed var(--red)",
                }}
              />{" "}
              Orphan
            </span>
          )}
        </div>
        <div className={styles.stats}>
          <span className={styles.stat}>{Object.keys(V).length} nodes</span>
          <span className={styles.stat}>{dataEdges.length} edges</span>
          {orphans.length > 0 && (
            <span className={styles.statWarn}>
              {orphans.length} orphan{orphans.length > 1 ? "s" : ""}
            </span>
          )}
          <button
            className={styles.fitBtn}
            onClick={() => fitView({ padding: 0.3, duration: 400 })}
            title="Reset view"
          >
            ⌖ Fit
          </button>
          <button
            className={styles.fitBtn}
            onClick={() => setCollapsedSet(new Set())}
            title="Expand all"
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
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.1}
          maxZoom={2.5}
          proOptions={{ hideAttribution: true }}
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
        <AddNodeModal
          parentName={V[addingTo]?.display_name || addingTo}
          onConfirm={confirmAdd}
          onCancel={() => setAddingTo(null)}
        />
      )}
      {deletingId && (
        <DeleteModal
          nodeName={V[deletingId]?.display_name || deletingId}
          nodeId={deletingId}
          children={m.children[deletingId] || []}
          V={V}
          m={m}
          onConfirm={confirmDelete}
          onCancel={() => setDeletingId(null)}
        />
      )}
    </div>
  );
}

/* ── Wrapper with ReactFlowProvider ── */
export default function HierarchyView(props: Props) {
  return (
    <ReactFlowProvider>
      <HierarchyInner {...props} />
    </ReactFlowProvider>
  );
}
