"use client";

import type { DashboardData } from "@/lib/types";
import styles from "./SummaryView.module.css";

interface Props {
  data: DashboardData;
}

export default function SummaryView({ data }: Props) {
  const { metrics: m, vertices: V } = data;
  const tot = m.basic.total_nodes;
  const M = m.management.manager_count;
  const IC = tot - M;
  const mgrPct = tot > 0 ? Math.round((M / tot) * 100) : 0;

  const allVerts = Object.values(V);
  const openCount = allVerts.filter((v) => v.open_role).length;
  const filledCount = tot - openCount;
  const openPct = tot > 0 ? Math.round((openCount / tot) * 100) : 0;

  // Orphans
  const nodesInEdges = new Set<string>();
  Object.keys(m.parent).forEach((k) => nodesInEdges.add(k));
  Object.keys(m.children).forEach((k) => {
    nodesInEdges.add(k);
    (m.children[k] || []).forEach((c) => nodesInEdges.add(c));
  });
  m.basic.roots.forEach((r) => nodesInEdges.add(r));
  const orphans = Object.keys(V).filter((id) => !nodesInEdges.has(id));

  // Span distribution
  const spanValues = Object.values(m.span);
  const spanBuckets = [
    { label: "0", count: spanValues.filter((s) => s === 0).length },
    { label: "1–2", count: spanValues.filter((s) => s >= 1 && s <= 2).length },
    { label: "3–5", count: spanValues.filter((s) => s >= 3 && s <= 5).length },
    { label: "5+", count: spanValues.filter((s) => s > 5).length },
  ];
  const spanMax = Math.max(...spanBuckets.map((b) => b.count), 1);

  // Per-level data
  const widths = m.org_structure.width_per_level;
  const levels = Object.keys(widths)
    .map(Number)
    .sort((a, b) => a - b);
  const maxWidth = Math.max(...Object.values(widths), 1);

  const levelData = levels.map((L) => {
    const ids = Object.entries(m.depth)
      .filter(([, d]) => d === L)
      .map(([id]) => id);
    const openAt = ids.filter((id) => V[id]?.open_role).length;
    const mgrs = ids.filter((id) => (m.span[id] ?? 0) > 0).length;
    return {
      level: L,
      total: ids.length,
      filled: ids.length - openAt,
      open: openAt,
      mgrs,
      ics: ids.length - mgrs,
    };
  });

  // ─── Reverse funnel SVG ───
  // Bottom org level (deepest) at top = narrowest; top level (L0) at bottom = widest
  // This shows the "shape" of the org: few at bottom levels, many at leaf levels
  // We reverse so the *deepest* level renders first (at the top of the SVG)
  const reversed = [...levelData].reverse();
  const numLevels = reversed.length;

  // Adaptive sizing
  const rowH = Math.max(32, Math.min(52, 260 / Math.max(numLevels, 1)));
  const svgPadY = 16;
  const svgPadX = 80; // space for side labels
  const svgContentW = 320;
  const svgW = svgContentW + svgPadX * 2;
  const svgH = numLevels * rowH + svgPadY * 2;
  const centerX = svgW / 2;

  // Color: single hue (olive-green), darkest at widest (bottom of SVG = L0), lightest at narrowest (top = deepest level)
  function tierColor(indexFromTop: number): string {
    const t = numLevels > 1 ? indexFromTop / (numLevels - 1) : 0;
    const lightness = 82 - t * 40; // 82% (light) → 42% (rich green)
    return `hsl(78, 52%, ${lightness}%)`;
  }

  return (
    <div className={styles.root}>
      {/* Row 1 */}
      <div className={styles.topRow}>
        <div className={`${styles.card} ${styles.cTeal}`}>
          <div className={styles.big}>{tot}</div>
          <div className={styles.label}>Total Headcount</div>
          <div className={styles.sub}>
            {M} managers · {IC} ICs
          </div>
        </div>
        <div className={`${styles.card} ${styles.cCream}`}>
          <div className={styles.big}>{m.management.avg_span.toFixed(2)}</div>
          <div className={styles.label}>Avg. Span of Control</div>
          <div className={styles.sub}>
            1 : {m.management.avg_span.toFixed(2)} direct reports
          </div>
        </div>
        <div className={`${styles.card} ${styles.cOlive}`}>
          <div className={styles.big}>
            {m.org_structure.org_depth + 1}
            <sup>layers</sup>
          </div>
          <div className={styles.label}>Organizational Depth</div>
          <div className={styles.sub}>{levels.length} populated levels</div>
        </div>
        <div className={styles.splitCard}>
          <div className={styles.splitLeft}>
            <div className={styles.big}>
              {mgrPct}
              <sup>%</sup>
            </div>
            <div className={styles.label}>Managers</div>
          </div>
          <div className={styles.splitRight}>
            <div className={styles.big}>
              {100 - mgrPct}
              <sup>%</sup>
            </div>
            <div className={styles.label}>ICs</div>
          </div>
        </div>
      </div>

      {/* Row 2: Role bar + Orphans */}
      <div className={styles.row2}>
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Role Composition</h3>
          <div className={styles.roleBar}>
            <div
              className={styles.roleBarFilled}
              style={{ width: `${100 - openPct}%` }}
            >
              <span>{filledCount} filled</span>
            </div>
            {openCount > 0 && (
              <div
                className={styles.roleBarOpen}
                style={{ width: `${Math.max(openPct, 8)}%` }}
              >
                <span>{openCount} open</span>
              </div>
            )}
          </div>
          <div className={styles.roleLegend}>
            <span>
              <span className={styles.dotFilled} /> Filled ({100 - openPct}%)
            </span>
            <span>
              <span className={styles.dotOpen} /> Open ({openPct}%)
            </span>
          </div>
        </div>
        <div
          className={`${styles.panel} ${orphans.length > 0 ? styles.panelWarn : ""}`}
        >
          <h3 className={styles.panelTitle}>Orphan Nodes</h3>
          {orphans.length === 0 ? (
            <div className={styles.orphanOk}>
              <span className={styles.checkmark}>✓</span>
              <span>No orphan nodes — all connected</span>
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

      {/* Row 3: Span distribution + Funnel */}
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

        {/* ── Reverse Funnel ── */}
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Org Shape — Reverse Funnel</h3>
          <svg
            viewBox={`0 0 ${svgW} ${svgH}`}
            className={styles.funnelSvg}
            preserveAspectRatio="xMidYMid meet"
          >
            {reversed.map((ld, i) => {
              // Width proportional to headcount at this level
              const pct = ld.total / maxWidth;
              const halfW = (pct * svgContentW) / 2;

              // Next tier width (below in SVG = next index = one step toward L0 = wider)
              const nextPct =
                i < numLevels - 1 ? reversed[i + 1].total / maxWidth : pct;
              const nextHalfW = (nextPct * svgContentW) / 2;

              const y1 = svgPadY + i * rowH;
              const y2 = y1 + rowH;

              // Trapezoid: top edge is this tier's width, bottom edge is next tier's width
              const topLeft = centerX - halfW;
              const topRight = centerX + halfW;
              const botLeft = centerX - nextHalfW;
              const botRight = centerX + nextHalfW;

              const fill = tierColor(i);
              const textColor = i >= numLevels * 0.6 ? "#fff" : "var(--ink)";

              return (
                <g key={ld.level}>
                  <polygon
                    points={`${topLeft},${y1} ${topRight},${y1} ${botRight},${y2} ${botLeft},${y2}`}
                    fill={fill}
                  />
                  {/* Center label */}
                  <text
                    x={centerX}
                    y={y1 + rowH / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={textColor}
                    fontSize={Math.min(13, rowH * 0.38)}
                    fontWeight="700"
                    fontFamily="'JetBrains Mono', monospace"
                  >
                    L{ld.level} · {ld.total}
                  </text>
                  {/* Left: Managers */}
                  <text
                    x={topLeft - 8}
                    y={y1 + rowH / 2}
                    textAnchor="end"
                    dominantBaseline="central"
                    fill="var(--olive)"
                    fontSize={Math.min(11, rowH * 0.3)}
                    fontWeight="600"
                    fontFamily="'JetBrains Mono', monospace"
                  >
                    {ld.mgrs} mgr
                  </text>
                  {/* Right: ICs */}
                  <text
                    x={topRight + 8}
                    y={y1 + rowH / 2}
                    textAnchor="start"
                    dominantBaseline="central"
                    fill="var(--slate-2)"
                    fontSize={Math.min(11, rowH * 0.3)}
                    fontWeight="600"
                    fontFamily="'JetBrains Mono', monospace"
                  >
                    {ld.ics} IC
                  </text>
                </g>
              );
            })}
          </svg>
          <div className={styles.funnelMeta}>
            <span>← Managers</span>
            <span className={styles.chartCaption}>
              Deepest level at top · shade lightens upward
            </span>
            <span>ICs →</span>
          </div>
        </div>
      </div>

      {/* Row 4: Open vs Filled per Layer */}
      <div className={styles.panel} style={{ marginTop: 12 }}>
        <h3 className={styles.panelTitle}>
          Layer Composition — Open vs Filled Roles
        </h3>
        <div className={styles.layerTable}>
          <div className={styles.layerHeader}>
            <span className={styles.layerHCell}>Level</span>
            <span className={styles.layerHCell}>Total</span>
            <span className={styles.layerHCell}>Filled</span>
            <span className={styles.layerHCell}>Open</span>
            <span className={styles.layerHCell} style={{ flex: 3 }}>
              Distribution
            </span>
          </div>
          {levelData.map((lc) => {
            const fPct = lc.total > 0 ? (lc.filled / lc.total) * 100 : 100;
            return (
              <div key={lc.level} className={styles.layerRow}>
                <span className={styles.layerCell}>L{lc.level}</span>
                <span className={styles.layerCell}>{lc.total}</span>
                <span className={`${styles.layerCell} ${styles.layerFilled}`}>
                  {lc.filled}
                </span>
                <span className={`${styles.layerCell} ${styles.layerOpen}`}>
                  {lc.open}
                </span>
                <span className={styles.layerCell} style={{ flex: 3 }}>
                  <div className={styles.layerBar}>
                    <div
                      className={styles.layerBarFilled}
                      style={{ width: `${fPct}%` }}
                    />
                    {lc.open > 0 && (
                      <div
                        className={styles.layerBarOpen}
                        style={{ width: `${100 - fPct}%` }}
                      />
                    )}
                  </div>
                </span>
              </div>
            );
          })}
        </div>
        <div className={styles.layerLegend}>
          <span>
            <span className={styles.dotFilled} /> Filled
          </span>
          <span>
            <span className={styles.dotOpen} /> Open
          </span>
        </div>
      </div>
    </div>
  );
}
