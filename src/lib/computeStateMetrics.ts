import type { DashboardData, CompMatrix } from './types';

export interface StateMetrics {
  avgSpan: number;
  layers: number;
  totalCost: number | null;
  icRatio: number;
  headcount: number;
  mgrRatio: number;
}

export function computeStateMetrics(d: DashboardData, compMatrix?: CompMatrix | null): StateMetrics {
  const m = d.metrics;
  const total  = m.basic.total_nodes;
  const mgrCnt = m.management.manager_count;

  const matrix = compMatrix ?? d.compMatrix ?? null;
  let totalCost: number | null = null;
  if (matrix) {
    let cost = 0; let hasAny = false;
    for (const v of Object.values(d.vertices)) {
      if (!v.grade) continue;
      const gradeMatrix = matrix[v.grade];
      if (!gradeMatrix) continue;
      const band = (v.geo ? gradeMatrix[v.geo] : null) ?? Object.values(gradeMatrix)[0] ?? null;
      if (band) { cost += (band.min + band.max) / 2; hasAny = true; }
    }
    if (hasAny) totalCost = cost;
  }

  return {
    avgSpan:   m.management.avg_span,
    layers:    m.org_structure.org_depth,
    totalCost,
    icRatio:   total > 0 ? ((total - mgrCnt) / total) * 100 : 0,
    headcount: total,
    mgrRatio:  total > 0 ? (mgrCnt / total) * 100 : 0,
  };
}

export function fmtCost(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${Math.round(n / 1e6)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}k`;
  return `$${Math.round(n)}`;
}
