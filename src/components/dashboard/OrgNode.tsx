'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { OrgNodeData } from '@/lib/types';
import styles from './OrgNode.module.css';

interface Props {
  data: OrgNodeData & {
    onDelete?: (id: string) => void;
    onAdd?: (parentId: string) => void;
    onToggleCollapse?: (id: string) => void;
    collapsed?: boolean;
    childCount?: number;
  };
}

function OrgNode({ data }: Props) {
  const isRoot = data.depth === 0;
  const isLeaf = data.span === 0;
  const depthClass = `depth${Math.min(data.depth, 4)}`;

  const cls = [
    styles.node,
    styles[depthClass] || '',
    isRoot ? styles.isRoot : '',
    isLeaf ? styles.isLeaf : '',
    data.openRole ? styles.openRole : '',
    data.isOrphan ? styles.orphanNode : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={cls}>
      <Handle type="target" position={Position.Top} className={styles.handle} />

      <div className={styles.header}>
        <div className={styles.name}>
          {data.openRole && <span className={styles.openBadge}>OPEN</span>}
          {data.unnamed ? <i>{data.displayName}</i> : data.displayName}
        </div>
        <div className={styles.actions}>
          <button className={styles.addBtn} onClick={(e) => { e.stopPropagation(); data.onAdd?.(data.tempId); }} title="Add report">+</button>
          {!isRoot && (
            <button className={styles.delBtn} onClick={(e) => { e.stopPropagation(); data.onDelete?.(data.tempId); }} title="Remove node">×</button>
          )}
        </div>
      </div>

      <div className={styles.role}>{data.role}</div>

      <div className={styles.meta}>
        {data.empId && <span className={styles.id}>{data.empId}</span>}
        {data.grade && <span className={styles.grade}>{data.grade}</span>}
        {data.isUserCreated && <span className={styles.userBadge}>USER</span>}
        {data.isOrphan && <span className={styles.orphanBadge}>ORPHAN</span>}
        {data.span > 0 && <span className={styles.spanBadge}>{data.span} ↓</span>}
      </div>

      {/* Collapse toggle */}
      {(data.childCount ?? 0) > 0 && (
        <button
          className={styles.collapseBtn}
          onClick={(e) => { e.stopPropagation(); data.onToggleCollapse?.(data.tempId); }}
          title={data.collapsed ? 'Expand subtree' : 'Collapse subtree'}
        >
          {data.collapsed ? `▸ ${data.childCount}` : '▾'}
        </button>
      )}

      <Handle type="source" position={Position.Bottom} className={styles.handle} />
    </div>
  );
}

export default memo(OrgNode);
