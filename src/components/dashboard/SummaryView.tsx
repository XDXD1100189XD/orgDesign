'use client';

import type { DashboardData } from '@/lib/types';
import styles from './SummaryView.module.css';

interface Props { data: DashboardData; }

export default function SummaryView({ data }: Props) {
  const { metrics: m, vertices: V } = data;
  const tot = m.basic.total_nodes;
  const M = m.management.manager_count;
  const IC = tot - M;
  const mgrPct = tot > 0 ? Math.round((M / tot) * 100) : 0;

  // Role composition
  const allVerts = Object.values(V);
  const openCount = allVerts.filter((v) => v.open_role).length;
  const filledCount = tot - openCount;
  const openPct = tot > 0 ? Math.round((openCount / tot) * 100) : 0;

  // Orphan nodes (in vertices but not in any edge)
  const nodesInEdges = new Set<string>();
  Object.keys(m.parent).forEach((k) => nodesInEdges.add(k));
  Object.keys(m.children).forEach((k) => { nodesInEdges.add(k); (m.children[k] || []).forEach((c) => nodesInEdges.add(c)); });
  m.basic.roots.forEach((r) => nodesInEdges.add(r));
  const orphans = Object.keys(V).filter((id) => !nodesInEdges.has(id));

  // Span distribution buckets
  const spanValues = Object.values(m.span);
  const spanBuckets = [
    { label: '0', count: spanValues.filter((s) => s === 0).length },
    { label: '1–2', count: spanValues.filter((s) => s >= 1 && s <= 2).length },
    { label: '3–5', count: spanValues.filter((s) => s >= 3 && s <= 5).length },
    { label: '5+', count: spanValues.filter((s) => s > 5).length },
  ];
  const spanMax = Math.max(...spanBuckets.map((b) => b.count), 1);

  // Width per layer (for funnel)
  const widths = m.org_structure.width_per_level;
  const levels = Object.keys(widths).map(Number).sort((a, b) => a - b);
  const maxWidth = Math.max(...Object.values(widths), 1);

  // Layer composition: mgr vs IC per layer
  const layerComp = levels.map((L) => {
    const nodesAtLevel = Object.entries(m.depth).filter(([, d]) => d === L).map(([id]) => id);
    const mgrs = nodesAtLevel.filter((id) => (m.span[id] ?? 0) > 0).length;
    const ics = nodesAtLevel.length - mgrs;
    return { level: L, total: nodesAtLevel.length, mgrs, ics };
  });

  return (
    <div className={styles.root}>
      {/* Row 1: Key numbers */}
      <div className={styles.topRow}>
        <div className={`${styles.card} ${styles.cTeal}`}>
          <div className={styles.big}>{tot}</div>
          <div className={styles.label}>Total Headcount</div>
          <div className={styles.sub}>{M} managers · {IC} ICs</div>
        </div>

        <div className={`${styles.card} ${styles.cCream}`}>
          <div className={styles.big}>{m.management.avg_span.toFixed(2)}</div>
          <div className={styles.label}>Avg. Span of Control</div>
          <div className={styles.sub}>1 : {m.management.avg_span.toFixed(2)} direct reports</div>
        </div>

        <div className={`${styles.card} ${styles.cOlive}`}>
          <div className={styles.big}>{m.org_structure.org_depth + 1}<sup>layers</sup></div>
          <div className={styles.label}>Organizational Depth</div>
          <div className={styles.sub}>{levels.length} populated levels</div>
        </div>

        {/* Manager / IC split */}
        <div className={styles.splitCard}>
          <div className={styles.splitLeft}>
            <div className={styles.big}>{mgrPct}<sup>%</sup></div>
            <div className={styles.label}>Managers</div>
          </div>
          <div className={styles.splitRight}>
            <div className={styles.big}>{100 - mgrPct}<sup>%</sup></div>
            <div className={styles.label}>ICs</div>
          </div>
        </div>
      </div>

      {/* Row 2: Role composition + Orphans */}
      <div className={styles.row2}>
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Role Composition</h3>
          <div className={styles.roleBar}>
            <div className={styles.roleBarFilled} style={{ width: `${100 - openPct}%` }}>
              <span>{filledCount} filled</span>
            </div>
            {openCount > 0 && (
              <div className={styles.roleBarOpen} style={{ width: `${openPct}%` }}>
                <span>{openCount} open</span>
              </div>
            )}
          </div>
          <div className={styles.roleLegend}>
            <span><span className={styles.dotFilled} /> Filled Roles ({100 - openPct}%)</span>
            <span><span className={styles.dotOpen} /> Open Roles ({openPct}%)</span>
          </div>
        </div>

        <div className={`${styles.panel} ${orphans.length > 0 ? styles.panelWarn : ''}`}>
          <h3 className={styles.panelTitle}>Orphan Nodes</h3>
          {orphans.length === 0 ? (
            <div className={styles.orphanOk}>
              <span className={styles.checkmark}>✓</span>
              <span>No orphan nodes — all employees connected</span>
            </div>
          ) : (
            <div className={styles.orphanList}>
              <div className={styles.orphanCount}>{orphans.length}</div>
              <div className={styles.orphanDetail}>
                {orphans.map((id) => (
                  <span key={id} className={styles.orphanTag}>
                    {V[id]?.display_name || id}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Row 3: Span Distribution + Hierarchy Funnel */}
      <div className={styles.row3}>
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Span Distribution</h3>
          <div className={styles.spanChart}>
            {spanBuckets.map((b) => (
              <div key={b.label} className={styles.spanCol}>
                <div className={styles.spanValue}>{b.count}</div>
                <div className={styles.spanBarWrap}>
                  <div
                    className={styles.spanBarFill}
                    style={{ height: `${(b.count / spanMax) * 100}%` }}
                  />
                </div>
                <div className={styles.spanLabel}>{b.label}</div>
              </div>
            ))}
          </div>
          <div className={styles.chartCaption}>Direct reports per manager</div>
        </div>

        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Hierarchy Shape</h3>
          <div className={styles.funnel}>
            {levels.map((L) => {
              const w = widths[L];
              const pct = (w / maxWidth) * 100;
              return (
                <div key={L} className={styles.funnelRow}>
                  <span className={styles.funnelLabel}>L{L}</span>
                  <div className={styles.funnelBarWrap}>
                    <div className={styles.funnelBar} style={{ width: `${pct}%` }}>
                      <span>{w}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className={styles.chartCaption}>Headcount per layer (inverted pyramid)</div>
        </div>
      </div>

      {/* Row 4: Layer Composition */}
      <div className={styles.panel} style={{ marginTop: 12 }}>
        <h3 className={styles.panelTitle}>Layer Composition — Manager vs IC</h3>
        <div className={styles.layerTable}>
          <div className={styles.layerHeader}>
            <span className={styles.layerHCell}>Level</span>
            <span className={styles.layerHCell}>Total</span>
            <span className={styles.layerHCell}>Managers</span>
            <span className={styles.layerHCell}>ICs</span>
            <span className={styles.layerHCell} style={{ flex: 3 }}>Distribution</span>
          </div>
          {layerComp.map((lc) => {
            const mPct = lc.total > 0 ? (lc.mgrs / lc.total) * 100 : 0;
            return (
              <div key={lc.level} className={styles.layerRow}>
                <span className={styles.layerCell}>L{lc.level}</span>
                <span className={styles.layerCell}>{lc.total}</span>
                <span className={`${styles.layerCell} ${styles.layerMgr}`}>{lc.mgrs}</span>
                <span className={`${styles.layerCell} ${styles.layerIc}`}>{lc.ics}</span>
                <span className={styles.layerCell} style={{ flex: 3 }}>
                  <div className={styles.layerBar}>
                    {mPct > 0 && <div className={styles.layerBarMgr} style={{ width: `${mPct}%` }} />}
                    <div className={styles.layerBarIc} style={{ width: `${100 - mPct}%` }} />
                  </div>
                </span>
              </div>
            );
          })}
        </div>
        <div className={styles.layerLegend}>
          <span><span className={styles.dotMgr} /> Manager</span>
          <span><span className={styles.dotIc} /> Individual Contributor</span>
        </div>
      </div>
    </div>
  );
}
