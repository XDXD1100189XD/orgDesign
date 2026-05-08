"use client";

import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { OrgNodeData } from "@/lib/types";
import styles from "./OrgNode.module.css";

interface Props {
  data: OrgNodeData & {
    onDelete?: (id: string) => void;
    onAdd?: (parentId: string) => void;
    onEdit?: (id: string) => void;
    onToggleCollapse?: (id: string) => void;
    onDrillDown?: (id: string) => void;
    collapsed?: boolean;
    childCount?: number;
    isBoundary?: boolean;
  };
}

function OrgNode({ data }: Props) {
  const isRoot = data.depth === 0;
  const isLeaf = data.span === 0;
  const depthClass = `depth${Math.min(data.depth, 4)}`;

  const cls = [
    styles.node,
    styles[depthClass] || "",
    isRoot ? styles.isRoot : "",
    isLeaf ? styles.isLeaf : "",
    data.openRole ? styles.openRole : "",
    data.isOrphan ? styles.orphanNode : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls}>
      <Handle type="target" position={Position.Top} className={styles.handle} />

      <div className={styles.header}>
        <div className={styles.name}>
          {data.openRole && <span className={styles.openBadge}>OPEN</span>}
          {data.unnamed ? <i>{data.displayName}</i> : data.displayName}
        </div>
        <div className={styles.actions}>
          <button
            className={styles.editBtn}
            onClick={(e) => {
              e.stopPropagation();
              data.onEdit?.(data.tempId);
            }}
            title="Edit node"
          >
            ✎
          </button>
          <button
            className={styles.addBtn}
            onClick={(e) => {
              e.stopPropagation();
              data.onAdd?.(data.tempId);
            }}
            title="Add report"
          >
            +
          </button>
          {!isRoot && (
            <button
              className={styles.delBtn}
              onClick={(e) => {
                e.stopPropagation();
                data.onDelete?.(data.tempId);
              }}
              title="Remove node"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <div className={styles.role}>{data.role}</div>

      <div className={styles.meta}>
        {data.empId && <span className={styles.id}>{data.empId}</span>}
        {data.grade && <span className={styles.grade}>{data.grade}</span>}
        {data.geo && <span className={styles.geoBadge}>{data.geo}</span>}
        {data.isUserCreated && <span className={styles.userBadge}>USER</span>}
        {data.isOrphan && <span className={styles.orphanBadge}>ORPHAN</span>}
        {data.span > 0 && (
          <span className={styles.spanBadge}>{data.span} ↓</span>
        )}
        {(data.subtreeCount ?? 0) > 0 && (
          <span className={styles.subtreeBadge}>{data.subtreeCount} ⬇</span>
        )}
      </div>

      {(data.childCount ?? 0) > 0 && (
        <button
          className={`${styles.collapseBtn} ${data.isBoundary ? styles.drillBtn : ""}`}
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
              ? `Drill into subtree (${data.childCount} reports below)`
              : data.collapsed
                ? `Open as head view`
                : "Collapse subtree"
          }
        >
          {data.isBoundary
            ? `↓ ${data.childCount}`
            : data.collapsed
              ? `▸ ${data.childCount}`
              : "▾"}
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
