import type { AggFn, ChartType } from '@/lib/types';
import type { ExcelRow } from '@/lib/parseExcel';

export type { AggFn, ChartType };

export interface PivotConfig {
  rowField: string | null;
  colField: string | null;
  valueField: string | null;
  aggFn: AggFn;
  chartType: ChartType;
  palette: string[];
}

export interface PivotRow {
  rowKey: string;
  values: Record<string, number | null>;
  total: number | null;
}

export interface PivotData {
  colKeys: string[];
  rows: PivotRow[];
}

export const CHART_COLORS = [
  '#006b6b', '#c0a800', '#5b8a8a', '#b05500',
  '#3d7a8b', '#8b3d7a', '#3d8b4a', '#8b3d3d',
];

export const PALETTES: { label: string; colors: string[] }[] = [
  { label: 'Default', colors: ['#006b6b','#c0a800','#5b8a8a','#b05500','#3d7a8b','#8b3d7a','#3d8b4a','#8b3d3d'] },
  { label: 'Warm',    colors: ['#c0392b','#e67e22','#f1c40f','#e74c3c','#d35400','#c0a800','#922b21','#784212'] },
  { label: 'Cool',    colors: ['#2980b9','#1abc9c','#3498db','#16a085','#2471a3','#148f77','#1f618d','#0e6655'] },
  { label: 'Mono',    colors: ['#111111','#333333','#555555','#777777','#999999','#aaaaaa','#bbbbbb','#cccccc'] },
];

export function computePivot(rows: ExcelRow[], config: PivotConfig): PivotData {
  const { rowField, colField, valueField, aggFn } = config;
  if (!rowField) return { colKeys: [], rows: [] };
  if (aggFn !== 'count' && !valueField) return { colKeys: [], rows: [] };

  const groups = new Map<string, Map<string, number[]>>();

  for (const row of rows) {
    const rk = String(row[rowField] ?? '(blank)');
    const ck = colField ? String(row[colField] ?? '(blank)') : 'value';
    if (!groups.has(rk)) groups.set(rk, new Map());
    const sub = groups.get(rk)!;
    if (!sub.has(ck)) sub.set(ck, []);
    if (aggFn === 'count') {
      sub.get(ck)!.push(1);
    } else if (valueField) {
      const v = row[valueField];
      const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
      if (!isNaN(n)) sub.get(ck)!.push(n);
    }
  }

  const colKeySet = new Set<string>();
  for (const sub of groups.values()) for (const ck of sub.keys()) colKeySet.add(ck);
  const colKeys = [...colKeySet].sort();

  function agg(vals: number[]): number {
    if (!vals.length) return 0;
    switch (aggFn) {
      case 'sum':   return vals.reduce((a, b) => a + b, 0);
      case 'count': return vals.length;
      case 'avg':   return vals.reduce((a, b) => a + b, 0) / vals.length;
      case 'min':   return Math.min(...vals);
      case 'max':   return Math.max(...vals);
    }
  }

  const pivotRows = [...groups.entries()]
    .map(([rowKey, sub]) => {
      const values: Record<string, number | null> = {};
      const allVals: number[] = [];
      for (const ck of colKeys) {
        const vals = sub.get(ck) ?? [];
        values[ck] = vals.length ? agg(vals) : null;
        allVals.push(...vals);
      }
      return { rowKey, values, total: allVals.length ? agg(allVals) : null };
    })
    .sort((a, b) => (b.total ?? 0) - (a.total ?? 0));

  return { colKeys, rows: pivotRows };
}

export function pivotToChartData(pivotData: PivotData): Record<string, unknown>[] {
  return pivotData.rows.map(r => ({
    name: r.rowKey,
    ...Object.fromEntries(pivotData.colKeys.map(ck => [ck, r.values[ck] ?? 0])),
  }));
}
