"use client";

import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { OrgNodeData } from "@/lib/types";
import styles from "./OrgNode.module.css";

interface Props {
  data: OrgNodeData & {
    onToggleCollapse?: (id: string) => void;
    onDrillDown?: (id: string) => void;
    collapsed?: boolean;
    childCount?: number;
    isBoundary?: boolean;
    dept?: string | null;
    visibleFields?: string[];
  };
}

function OrgNode({ data }: Props) {
  const isRoot = data.depth === 0;
  const isLeaf = data.span === 0;
  const depthClass = `depth${Math.min(data.depth, 4)}`;
  const visible = new Set(data.visibleFields ?? ['role', 'empId', 'grade', 'geo']);

  const cls = [
    styles.node,
    styles[depthClass] || "",
    isRoot ? styles.isRoot : "",
    isLeaf ? styles.isLeaf : "",
    data.openRole ? styles.openRole : "",
    data.isOrphan ? styles.orphanNode : "",
    data.isPathHighlighted ? styles.pathNode : "",
    data.isSelected ? styles.selectedNode : "",
    data.isSearchTarget ? styles.searchTargetNode : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={cls}
      style={data.filterColor && !isRoot
        ? { borderLeftColor: data.filterColor, borderLeftWidth: 4, borderLeftStyle: "solid" }
        : undefined
      }
    >
      <Handle type="target" position={Position.Top} className={styles.handle} />

      <div className={styles.header}>
        <div className={styles.name}>
          {data.openRole && <span className={styles.openBadge}>OPEN</span>}
          {data.unnamed ? <i>{data.displayName}</i> : data.displayName}
        </div>
        {data.filterColor && (
          <span
            style={{
              width: 8, height: 8, borderRadius: "50%",
              background: data.filterColor, flexShrink: 0,
              display: "inline-block", marginTop: 2,
            }}
          />
        )}
      </div>

      {visible.has('role') && <div className={styles.role}>{data.role}</div>}

      <div className={styles.meta}>
        {visible.has('empId') && data.empId && <span className={styles.id}>{data.empId}</span>}
        {visible.has('grade') && data.grade && <span className={styles.grade}>{data.grade}</span>}
        {visible.has('geo') && data.geo && <span className={styles.geoBadge}>{data.geo}</span>}
        {visible.has('dept') && data.dept && <span className={styles.deptBadge}>{data.dept}</span>}
        {data.isUserCreated && <span className={styles.userBadge}>USER</span>}
        {data.isOrphan && <span className={styles.orphanBadge}>UNASSIGNED</span>}
        {data.span > 0 && (
          <span className={styles.spanBadge}>{data.span} direct</span>
        )}
        {(data.subtreeCount ?? 0) > 0 && (
          <span className={styles.subtreeBadge}>{data.subtreeCount} below</span>
        )}
      </div>

      {(data.childCount ?? 0) > 0 && (
        <button
          className={`${styles.collapseBtn} ${data.isBoundary ? styles.drillBtn : ""} ${data.isPathBoundary ? styles.pathDrillBtn : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            if (data.isBoundary || data.collapsed) {
              data.onDrillDown?.(data.tempId);
            } else {
              data.onToggleCollapse?.(data.tempId);
            }
          }}
          title={
            data.isBoundary
              ? data.isPathBoundary
                ? `Continue highlighted path (${data.childCount} direct reports below)`
                : `Drill into subtree (${data.childCount} direct reports below)`
              : data.collapsed
                ? "Open as head view"
                : "Collapse subtree"
          }
        >
          {data.isBoundary && data.isPathBoundary
            ? `Continue ${data.childCount}`
            : data.isBoundary
              ? `Down ${data.childCount}`
              : data.collapsed
                ? `Open ${data.childCount}`
                : "Collapse"}
        </button>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className={styles.handle}
      />
    </div>
  );
}

export default memo(OrgNode);
