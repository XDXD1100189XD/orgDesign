'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const alasql = require('alasql') as any;
import { DndContext, DragOverlay, useDroppable, useDraggable } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts';
import { parseExcelFile } from '@/lib/parseExcel';
import type { ExcelRow } from '@/lib/parseExcel';
import type { DashboardData, AIChartRequest, AggFn as SharedAggFn, ChartType as SharedChartType } from '@/lib/types';
import type { WorkCapabilityDataset } from '@/lib/workCapabilityDataset';
import { fmtNum } from '@/lib/costSchema';
import styles from './AnalyticsStudioView.module.css';

// ── Types ─────────────────────────────────────────────────────────────────────

type AggFn    = SharedAggFn;
type ChartType = SharedChartType;

interface PivotConfig {
  rowField: string | null;
  colField: string | null;
  valueField: string | null;
  aggFn: AggFn;
  chartType: ChartType;
  palette: string[];
}

interface PivotRow {
  rowKey: string;
  values: Record<string, number | null>;
  total: number | null;
}

interface PivotData {
  colKeys: string[];
  rows: PivotRow[];
}

interface SavedView {
  id: string;
  name: string;
  config: PivotConfig;
  pivotData: PivotData;
}

type SqlResult =
  | { type: 'rows';     data: Record<string, unknown>[]; rowCount: number }
  | { type: 'affected'; count: number }
  | { type: 'error';    message: string };

interface Props {
  file: File | null;
  data?: DashboardData | null;
  rows?: ExcelRow[];
  onRowsChange?: (rows: ExcelRow[] | null, meta?: { source: 'analytics-sql' | 'analytics-reset'; query?: string; affected?: number }) => void;
  externalChartRequest?: AIChartRequest | null;
  workCapabilityDataset?: WorkCapabilityDataset | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CHART_COLORS = ['#006b6b', '#c0a800', '#5b8a8a', '#b05500', '#3d7a8b', '#8b3d7a', '#3d8b4a', '#8b3d3d'];

const PALETTES: { label: string; colors: string[] }[] = [
  { label: 'Default', colors: ['#006b6b','#c0a800','#5b8a8a','#b05500','#3d7a8b','#8b3d7a','#3d8b4a','#8b3d3d'] },
  { label: 'Warm',    colors: ['#c0392b','#e67e22','#f1c40f','#e74c3c','#d35400','#c0a800','#922b21','#784212'] },
  { label: 'Cool',    colors: ['#2980b9','#1abc9c','#3498db','#16a085','#2471a3','#148f77','#1f618d','#0e6655'] },
  { label: 'Mono',    colors: ['#111111','#333333','#555555','#777777','#999999','#aaaaaa','#bbbbbb','#cccccc'] },
];

// ── Table source (org data vs WorkCapability tables) ─────────────────────────

type TableSource =
  | 'org'
  | 'activity_library'
  | 'activity_assignments'
  | 'skill_library'
  | 'role_skill_requirements'
  | 'employee_skills'
  | 'activity_skill_requirements';

interface TableSourceOption { group: string; key: TableSource; label: string }

const TABLE_SOURCE_OPTIONS: TableSourceOption[] = [
  { group: 'Org Data',             key: 'org',                         label: 'Organisation Data'           },
  { group: 'Activity Analysis',    key: 'activity_library',            label: 'Activity Library'            },
  { group: 'Activity Analysis',    key: 'activity_assignments',        label: 'Activity Assignments'        },
  { group: 'Skill & Capability',   key: 'skill_library',               label: 'Skill Library'               },
  { group: 'Skill & Capability',   key: 'employee_skills',             label: 'Employee Skills'             },
  { group: 'Skill & Capability',   key: 'activity_skill_requirements', label: 'Activity Skill Requirements' },
  { group: 'Succession & Talent',  key: 'role_skill_requirements',     label: 'Role Skill Requirements'     },
];

const TABLE_SOURCE_GROUPS = Array.from(
  new Set(TABLE_SOURCE_OPTIONS.map(o => o.group))
);

function getWcRows(dataset: WorkCapabilityDataset, source: TableSource): ExcelRow[] {
  switch (source) {
    case 'activity_library':            return dataset.shared.activityLibrary            as ExcelRow[];
    case 'activity_assignments':        return dataset.states.asIs.activityAssignments   as ExcelRow[];
    case 'skill_library':               return dataset.shared.skillLibrary               as ExcelRow[];
    case 'role_skill_requirements':     return dataset.states.asIs.roleSkillRequirements as ExcelRow[];
    case 'employee_skills':             return dataset.states.asIs.employeeSkills        as ExcelRow[];
    case 'activity_skill_requirements': return dataset.shared.activitySkillRequirements  as ExcelRow[];
    default: return [];
  }
}

const WC_TABLE_NAMES: Exclude<TableSource, 'org'>[] = [
  'activity_library',
  'activity_assignments',
  'skill_library',
  'role_skill_requirements',
  'employee_skills',
  'activity_skill_requirements',
];

// Derived fields added to each WC table via cross-table join (not present in raw rows)
const WC_DERIVED_FIELDS: Partial<Record<Exclude<TableSource, 'org'>, string[]>> = {
  activity_library:            ['assigned_people', 'required_skills'],
  activity_assignments:        ['activity_name', 'activity_criticality'],
  skill_library:               ['employees_with_skill', 'employees_at_level_3_plus', 'activities_requiring_skill', 'roles_requiring_skill', 'single_point_risk'],
  role_skill_requirements:     ['skill_name', 'skill_family'],
  employee_skills:             ['skill_name', 'skill_family', 'skill_criticality'],
  activity_skill_requirements: ['skill_name', 'activity_name'],
};

const WC_PRIMARY_KEYS: Partial<Record<Exclude<TableSource, 'org'>, string>> = {
  activity_library:            'activity_id',
  activity_assignments:        'assignment_id',
  skill_library:               'skill_id',
  role_skill_requirements:     'requirement_id',
  employee_skills:             'employee_skill_id',
  activity_skill_requirements: 'activity_skill_requirement_id',
};

const WC_SCHEMA_RELATIONSHIPS: { from: string; to: string; key: string }[] = [
  { from: 'activity_assignments',        to: 'activity_library', key: 'activity_id'  },
  { from: 'activity_assignments',        to: 'org data',         key: 'employee_id'  },
  { from: 'activity_skill_requirements', to: 'activity_library', key: 'activity_id'  },
  { from: 'activity_skill_requirements', to: 'skill_library',    key: 'skill_id'     },
  { from: 'employee_skills',             to: 'skill_library',    key: 'skill_id'     },
  { from: 'employee_skills',             to: 'org data',         key: 'employee_id'  },
  { from: 'role_skill_requirements',     to: 'skill_library',    key: 'skill_id'     },
];

function computeWcDerived(dataset: WorkCapabilityDataset, source: Exclude<TableSource, 'org'>): ExcelRow[] {
  const base = getWcRows(dataset, source);
  switch (source) {
    case 'activity_library': {
      const assignments = dataset.states.asIs.activityAssignments;
      const actSkillReqs = dataset.shared.activitySkillRequirements;
      const assignedPeople = new Map<string, Set<string>>();
      for (const a of assignments) {
        const aid = String(a.activity_id ?? '');
        if (!assignedPeople.has(aid)) assignedPeople.set(aid, new Set());
        assignedPeople.get(aid)!.add(String(a.employee_id ?? ''));
      }
      const reqCounts = new Map<string, number>();
      for (const r of actSkillReqs) {
        const aid = String(r.activity_id ?? '');
        reqCounts.set(aid, (reqCounts.get(aid) ?? 0) + 1);
      }
      return base.map(row => ({
        ...row,
        assigned_people: assignedPeople.get(String(row.activity_id ?? ''))?.size ?? 0,
        required_skills: reqCounts.get(String(row.activity_id ?? '')) ?? 0,
      }));
    }

    case 'activity_assignments': {
      const actById = new Map(
        dataset.shared.activityLibrary.map(a => [String(a.activity_id ?? ''), a])
      );
      return base.map(row => {
        const act = actById.get(String(row.activity_id ?? ''));
        return {
          ...row,
          activity_name: act ? String(act.activity_name ?? '') : '',
          activity_criticality: act ? String(act.criticality ?? '') : '',
        };
      });
    }

    case 'skill_library': {
      const empSkills = dataset.states.asIs.employeeSkills;
      const actReqs = dataset.shared.activitySkillRequirements;
      const roleReqs = dataset.states.asIs.roleSkillRequirements;
      const empSet = new Map<string, Set<string>>();
      const emp3Set = new Map<string, Set<string>>();
      for (const es of empSkills) {
        const sid = String(es.skill_id ?? '');
        const eid = String(es.employee_id ?? '');
        const lvl = Number(es.current_level ?? 0);
        if (!empSet.has(sid)) empSet.set(sid, new Set());
        empSet.get(sid)!.add(eid);
        if (lvl >= 3) {
          if (!emp3Set.has(sid)) emp3Set.set(sid, new Set());
          emp3Set.get(sid)!.add(eid);
        }
      }
      const actCount = new Map<string, number>();
      for (const r of actReqs) {
        const sid = String(r.skill_id ?? '');
        actCount.set(sid, (actCount.get(sid) ?? 0) + 1);
      }
      const roleCount = new Map<string, number>();
      for (const r of roleReqs) {
        const sid = String(r.skill_id ?? '');
        roleCount.set(sid, (roleCount.get(sid) ?? 0) + 1);
      }
      return base.map(row => {
        const sid = String(row.skill_id ?? '');
        const ews = empSet.get(sid)?.size ?? 0;
        return {
          ...row,
          employees_with_skill: ews,
          employees_at_level_3_plus: emp3Set.get(sid)?.size ?? 0,
          activities_requiring_skill: actCount.get(sid) ?? 0,
          roles_requiring_skill: roleCount.get(sid) ?? 0,
          single_point_risk: ews <= 1 ? 'High' : ews <= 3 ? 'Medium' : 'Low',
        };
      });
    }

    case 'role_skill_requirements': {
      const skillById = new Map(
        dataset.shared.skillLibrary.map(s => [String(s.skill_id ?? ''), s])
      );
      return base.map(row => {
        const skill = skillById.get(String(row.skill_id ?? ''));
        return {
          ...row,
          skill_name: skill ? String(skill.skill_name ?? '') : '',
          skill_family: skill ? String(skill.skill_family ?? '') : '',
        };
      });
    }

    case 'employee_skills': {
      const skillById = new Map(
        dataset.shared.skillLibrary.map(s => [String(s.skill_id ?? ''), s])
      );
      return base.map(row => {
        const skill = skillById.get(String(row.skill_id ?? ''));
        return {
          ...row,
          skill_name: skill ? String(skill.skill_name ?? '') : '',
          skill_family: skill ? String(skill.skill_family ?? '') : '',
          skill_criticality: skill ? String(skill.criticality ?? '') : '',
        };
      });
    }

    case 'activity_skill_requirements': {
      const skillById = new Map(
        dataset.shared.skillLibrary.map(s => [String(s.skill_id ?? ''), s])
      );
      const actById = new Map(
        dataset.shared.activityLibrary.map(a => [String(a.activity_id ?? ''), a])
      );
      return base.map(row => {
        const skill = skillById.get(String(row.skill_id ?? ''));
        const act = actById.get(String(row.activity_id ?? ''));
        return {
          ...row,
          skill_name: skill ? String(skill.skill_name ?? '') : '',
          activity_name: act ? String(act.activity_name ?? '') : '',
        };
      });
    }

    default:
      return base;
  }
}

const DERIVED_KEYS = ['span', 'depth', 'subtree_count'] as const;
type DerivedKey = typeof DERIVED_KEYS[number];

const ID_KEYS   = ['employeeid','empid','id','workerid','staffid','personid'];
const NAME_KEYS = ['name','employeename','fullname','displayname','workername','employee'];

function mergeWithDerived(raw: ExcelRow[], data: DashboardData): ExcelRow[] {
  const { vertices: V, metrics: m } = data;
  const byEmpId = new Map<string, Record<DerivedKey, number>>();
  const byName  = new Map<string, Record<DerivedKey, number>>();

  for (const [vid, v] of Object.entries(V)) {
    const derived: Record<DerivedKey, number> = {
      span:          m.span[vid]          ?? 0,
      depth:         m.depth[vid]         ?? 0,
      subtree_count: m.subtree_count[vid] ?? 0,
    };
    if (v.id)           byEmpId.set(String(v.id).trim().toLowerCase(), derived);
    if (v.display_name) byName.set(v.display_name.trim().toLowerCase(), derived);
  }

  const headers = raw.length ? Object.keys(raw[0]) : [];
  const idKey   = headers.find(h => ID_KEYS.includes(h.toLowerCase().replace(/[\s_-]/g, '')));
  const nameKey = headers.find(h => NAME_KEYS.includes(h.toLowerCase().replace(/[\s_-]/g, '')));

  return raw.map(row => {
    const idVal   = idKey   ? String(row[idKey]   ?? '').trim().toLowerCase() : '';
    const nameVal = nameKey ? String(row[nameKey] ?? '').trim().toLowerCase() : '';
    const match   = (idVal && byEmpId.get(idVal)) || (nameVal && byName.get(nameVal));
    return match ? { ...row, ...match } : row;
  });
}

const AGG_LABELS: Record<AggFn, string> = {
  sum: 'Sum', count: 'Count', avg: 'Average', min: 'Min', max: 'Max',
};

const CHART_TYPES: { key: ChartType; label: string }[] = [
  { key: 'bar',        label: 'Bar'         },
  { key: 'stackedBar', label: 'Stacked Bar' },
  { key: 'line',       label: 'Line'        },
  { key: 'area',       label: 'Area'        },
  { key: 'pie',        label: 'Pie'         },
  { key: 'radar',      label: 'Radar'       },
];

const DEFAULT_CONFIG: PivotConfig = {
  rowField: null, colField: null, valueField: null,
  aggFn: 'count', chartType: 'bar', palette: CHART_COLORS,
};

// ── Pivot computation ─────────────────────────────────────────────────────────

function computePivot(rows: ExcelRow[], config: PivotConfig): PivotData {
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

function pivotToChartData(pivotData: PivotData) {
  return pivotData.rows.map(r => ({
    name: r.rowKey,
    ...Object.fromEntries(pivotData.colKeys.map(ck => [ck, r.values[ck] ?? 0])),
  }));
}

// ── Drag + Drop sub-components ────────────────────────────────────────────────

function DraggableField({ field, derived = false }: { field: string; derived?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `field::${field}` });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`${styles.fieldChip} ${isDragging ? styles.fieldChipDragging : ''} ${derived ? styles.fieldChipDerived : ''}`}
    >
      {derived && <span className={styles.derivedMark}>≈</span>}
      {field}
    </div>
  );
}

function DropZone({ id, label, sub, field, onClear }: {
  id: string; label: string; sub: string; field: string | null; onClear: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={[
        styles.dropZone,
        isOver  ? styles.dropZoneOver   : '',
        field   ? styles.dropZoneFilled : '',
      ].join(' ')}
    >
      <div className={styles.dzLabel}>{label}</div>
      <div className={styles.dzSub}>{sub}</div>
      {field ? (
        <div className={styles.dzField}>
          <span className={styles.dzFieldName}>{field}</span>
          <button className={styles.dzClear} onClick={onClear}>×</button>
        </div>
      ) : (
        <div className={styles.dzEmpty}>Drop a field here</div>
      )}
    </div>
  );
}

// ── CSV export helpers ────────────────────────────────────────────────────────

function triggerDownload(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}

function exportPivotCsv(pivotData: PivotData, config: PivotConfig) {
  const { colKeys, rows } = pivotData;
  const hasTotal = colKeys.length > 1;
  const colLabel = (ck: string) => ck === 'value' ? (config.valueField ?? 'Count') : ck;
  const esc = (v: string | number | null) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const headers = [esc(config.rowField ?? 'Row'), ...colKeys.map(ck => esc(colLabel(ck))), ...(hasTotal ? ['"Total"'] : [])];
  const body = rows.map(r => [
    esc(r.rowKey),
    ...colKeys.map(ck => r.values[ck] ?? ''),
    ...(hasTotal ? [r.total ?? ''] : []),
  ].join(','));
  triggerDownload([headers.join(','), ...body].join('\n'), 'pivot.csv');
}

function exportSqlCsv(data: Record<string, unknown>[]) {
  if (!data.length) return;
  const keys = Object.keys(data[0]);
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = keys.map(k => esc(k)).join(',');
  const body = data.map(row => keys.map(k => esc(row[k])).join(','));
  triggerDownload([head, ...body].join('\n'), 'sql-results.csv');
}

// ── Charts ────────────────────────────────────────────────────────────────────

const tickFmt = (v: number | string) => fmtNum(Number(v));
const tooltipFmt = (v: unknown) => typeof v === 'number' ? fmtNum(v) : String(v ?? '');

function PivotChart({ pivotData, config, mini = false }: {
  pivotData: PivotData; config: PivotConfig; mini?: boolean;
}) {
  const chartData = pivotToChartData(pivotData);
  const { colKeys } = pivotData;
  const { chartType, valueField } = config;
  const palette = config.palette.length ? config.palette : CHART_COLORS;
  const clr = (i: number) => palette[i % palette.length];
  const h = mini ? 100 : 320;
  const margin = mini
    ? { top: 2, right: 2, left: 2, bottom: 2 }
    : { top: 10, right: 20, left: 10, bottom: 64 };

  if (!chartData.length || !colKeys.length) {
    return mini ? null : <div className={styles.chartEmpty}>Configure a pivot to see the chart</div>;
  }

  const colLabel = (ck: string) => ck === 'value' ? (valueField ?? 'Count') : ck;

  if (chartType === 'pie') {
    const pieData = pivotData.rows.map(r => ({
      name: r.rowKey,
      value: colKeys.length === 1 ? (r.values[colKeys[0]] ?? 0) : (r.total ?? 0),
    }));
    return (
      <ResponsiveContainer width="100%" height={h}>
        <PieChart>
          <Pie
            data={pieData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={mini ? 38 : 110}
            label={mini ? undefined : ({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
            labelLine={!mini}
          >
            {pieData.map((_, i) => <Cell key={i} fill={clr(i)} />)}
          </Pie>
          {!mini && <Tooltip formatter={tooltipFmt} />}
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === 'radar') {
    return (
      <ResponsiveContainer width="100%" height={h}>
        <RadarChart data={chartData}>
          <PolarGrid stroke="rgba(0,0,0,0.07)" />
          <PolarAngleAxis dataKey="name" tick={mini ? false : { fontSize: 11, fill: '#666' }} />
          {!mini && <PolarRadiusAxis tick={{ fontSize: 9, fill: '#999' }} />}
          {colKeys.map((ck, i) => (
            <Radar
              key={ck}
              name={colLabel(ck)}
              dataKey={ck}
              stroke={clr(i)}
              fill={clr(i)}
              fillOpacity={0.15}
            />
          ))}
          {!mini && <Legend />}
          {!mini && <Tooltip formatter={tooltipFmt} />}
        </RadarChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === 'bar') {
    return (
      <ResponsiveContainer width="100%" height={h}>
        <BarChart data={chartData} margin={margin}>
          {!mini && <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />}
          {!mini && <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#555' }} angle={-35} textAnchor="end" interval={0} />}
          {!mini && <YAxis tick={{ fontSize: 11, fill: '#999' }} tickFormatter={tickFmt} />}
          {!mini && <Tooltip formatter={tooltipFmt} />}
          {!mini && colKeys.length > 1 && <Legend verticalAlign="top" />}
          {colKeys.map((ck, i) => (
            <Bar key={ck} dataKey={ck} name={colLabel(ck)} fill={clr(i)} radius={[2, 2, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === 'stackedBar') {
    return (
      <ResponsiveContainer width="100%" height={h}>
        <BarChart data={chartData} margin={margin}>
          {!mini && <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />}
          {!mini && <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#555' }} angle={-35} textAnchor="end" interval={0} />}
          {!mini && <YAxis tick={{ fontSize: 11, fill: '#999' }} tickFormatter={tickFmt} />}
          {!mini && <Tooltip formatter={tooltipFmt} />}
          {!mini && <Legend verticalAlign="top" />}
          {colKeys.map((ck, i) => (
            <Bar key={ck} dataKey={ck} name={colLabel(ck)} stackId="stack" fill={clr(i)} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === 'line') {
    return (
      <ResponsiveContainer width="100%" height={h}>
        <LineChart data={chartData} margin={margin}>
          {!mini && <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />}
          {!mini && <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#555' }} angle={-35} textAnchor="end" interval={0} />}
          {!mini && <YAxis tick={{ fontSize: 11, fill: '#999' }} tickFormatter={tickFmt} />}
          {!mini && <Tooltip formatter={tooltipFmt} />}
          {!mini && colKeys.length > 1 && <Legend verticalAlign="top" />}
          {colKeys.map((ck, i) => (
            <Line key={ck} type="monotone" dataKey={ck} name={colLabel(ck)}
              stroke={clr(i)} strokeWidth={mini ? 1.5 : 2}
              dot={mini ? false : { r: 3 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === 'area') {
    return (
      <ResponsiveContainer width="100%" height={h}>
        <AreaChart data={chartData} margin={margin}>
          {!mini && <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />}
          {!mini && <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#555' }} angle={-35} textAnchor="end" interval={0} />}
          {!mini && <YAxis tick={{ fontSize: 11, fill: '#999' }} tickFormatter={tickFmt} />}
          {!mini && <Tooltip formatter={tooltipFmt} />}
          {!mini && colKeys.length > 1 && <Legend verticalAlign="top" />}
          {colKeys.map((ck, i) => (
            <Area key={ck} type="monotone" dataKey={ck} name={colLabel(ck)}
              stroke={clr(i)}
              fill={clr(i)}
              fillOpacity={mini ? 0.2 : 0.1} strokeWidth={mini ? 1.5 : 2} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return null;
}

// ── Dynamic SQL examples ──────────────────────────────────────────────────────

function buildExamples(
  fields: string[],
  nameKey: string | null,
  idKey: string | null,
  grossCol: string | null,
  jobFamCol: string | null,
): [string, string][] {
  const q = (col: string) => `\`${col}\``;
  const out: [string, string][] = [];

  out.push(['All rows (first 20)', 'SELECT * FROM data LIMIT 20']);

  if (jobFamCol) {
    out.push([`Count by ${jobFamCol}`, `SELECT ${q(jobFamCol)}, COUNT(*) cnt FROM data GROUP BY ${q(jobFamCol)} ORDER BY cnt DESC`]);
  } else if (fields.length > 0) {
    out.push([`Count by ${fields[0]}`, `SELECT ${q(fields[0])}, COUNT(*) cnt FROM data GROUP BY ${q(fields[0])} ORDER BY cnt DESC`]);
  }

  if (grossCol && nameKey) {
    out.push(['Top salaries', `SELECT ${q(nameKey)}, ${q(grossCol)} FROM data ORDER BY ${q(grossCol)} DESC LIMIT 10`]);
  } else if (grossCol) {
    out.push(['Top salaries', `SELECT ${q(grossCol)} FROM data ORDER BY ${q(grossCol)} DESC LIMIT 10`]);
  }

  if (nameKey) {
    out.push(['Remove name nulls', `DELETE FROM data WHERE ${q(nameKey)} IS NULL`]);
  }

  return out;
}

// ── Main component ────────────────────────────────────────────────────────────

const DERIVED_KEYS_SET = new Set(['span', 'depth', 'subtree_count']);

function stripDerived(rows: ExcelRow[]): ExcelRow[] {
  return rows.map(r => Object.fromEntries(Object.entries(r).filter(([k]) => !DERIVED_KEYS_SET.has(k))) as ExcelRow);
}

function WcSchemaMapSvg({ hasOrg }: { hasOrg: boolean }) {
  const ARROW_ID = 'wcArrow';
  return (
    <svg
      viewBox="-8 -8 808 342"
      style={{ width: '100%', maxWidth: 800, height: 'auto', overflow: 'visible', display: 'block' }}
      aria-label="WC table relationship diagram"
    >
      <defs>
        <marker id={ARROW_ID} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#9aabbb" />
        </marker>
      </defs>

      {/* ── Connections (drawn behind boxes) ─────────────────────────── */}
      {/* activity_assignments → activity_library (activity_id) */}
      <line x1="225" y1="165" x2="344" y2="75" stroke="#9aabbb" strokeWidth="1.5" markerEnd={`url(#${ARROW_ID})`} />
      <text x="283" y="112" fontSize="8" fill="#7a8b9b" textAnchor="middle">activity_id</text>

      {/* activity_skill_requirements → activity_library (activity_id) */}
      <line x1="375" y1="165" x2="344" y2="75" stroke="#9aabbb" strokeWidth="1.5" markerEnd={`url(#${ARROW_ID})`} />
      <text x="352" y="108" fontSize="8" fill="#7a8b9b" textAnchor="middle">activity_id</text>

      {/* activity_skill_requirements → skill_library (skill_id) */}
      <line x1="483" y1="175" x2="637" y2="75" stroke="#9aabbb" strokeWidth="1.5" markerEnd={`url(#${ARROW_ID})`} />
      <text x="570" y="118" fontSize="8" fill="#7a8b9b" textAnchor="middle">skill_id</text>

      {/* role_skill_requirements → skill_library (skill_id) */}
      <line x1="652" y1="165" x2="637" y2="75" stroke="#9aabbb" strokeWidth="1.5" markerEnd={`url(#${ARROW_ID})`} />
      <text x="655" y="112" fontSize="8" fill="#7a8b9b" textAnchor="middle">skill_id</text>

      {/* activity_assignments → org data (employee_id) — only when org data is available */}
      {hasOrg && (
        <>
          <line x1="120" y1="165" x2="82" y2="75" stroke="#bbb" strokeWidth="1.5" strokeDasharray="4,3" markerEnd={`url(#${ARROW_ID})`} />
          <text x="88" y="115" fontSize="8" fill="#999" textAnchor="middle">employee_id</text>
        </>
      )}

      {/* employee_skills → org data (employee_id) — left-side routing */}
      {hasOrg && (
        <>
          <polyline points="20,295 4,295 4,55 20,55" fill="none" stroke="#bbb" strokeWidth="1.5" strokeDasharray="4,3" markerEnd={`url(#${ARROW_ID})`} />
          <text transform="rotate(-90 5 175)" x="5" y="175" textAnchor="middle" fontSize="8" fill="#999">employee_id</text>
        </>
      )}

      {/* employee_skills → skill_library (skill_id) — bottom-right routing */}
      <polyline points="195,295 786,295 786,55 715,55" fill="none" stroke="#9aabbb" strokeWidth="1.5" markerEnd={`url(#${ARROW_ID})`} />
      <text x="490" y="308" fontSize="8" fill="#7a8b9b" textAnchor="middle">skill_id</text>

      {/* ── Table boxes ─────────────────────────────────────────────── */}
      {/* Org Data (dashed, only when loaded) */}
      {hasOrg && (
        <g>
          <rect x="20" y="35" width="125" height="40" rx="4" fill="#f5f5f5" stroke="#999" strokeWidth="1.5" strokeDasharray="5,3" />
          <text x="82" y="52" textAnchor="middle" fontSize="11" fontWeight="600" fill="#666">Org Data</text>
          <text x="82" y="66" textAnchor="middle" fontSize="9" fill="#888" fontFamily="monospace">PK: Employee ID</text>
        </g>
      )}

      {/* activity_library */}
      <g>
        <rect x="257" y="35" width="175" height="40" rx="4" fill="#e8f2fc" stroke="#2a6da8" strokeWidth="1.5" />
        <text x="344" y="52" textAnchor="middle" fontSize="11" fontWeight="600" fill="#1a4a78">activity_library</text>
        <text x="344" y="66" textAnchor="middle" fontSize="9" fill="#2a6da8" fontFamily="monospace">PK: activity_id</text>
      </g>

      {/* skill_library */}
      <g>
        <rect x="562" y="35" width="155" height="40" rx="4" fill="#e8f5ec" stroke="#2a8a4a" strokeWidth="1.5" />
        <text x="639" y="52" textAnchor="middle" fontSize="11" fontWeight="600" fill="#1a5a2a">skill_library</text>
        <text x="639" y="66" textAnchor="middle" fontSize="9" fill="#2a8a4a" fontFamily="monospace">PK: skill_id</text>
      </g>

      {/* activity_assignments */}
      <g>
        <rect x="20" y="165" width="208" height="40" rx="4" fill="#d8e8f8" stroke="#2a6da8" strokeWidth="1.5" />
        <text x="124" y="182" textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#1a4a78">activity_assignments</text>
        <text x="124" y="196" textAnchor="middle" fontSize="9" fill="#2a6da8" fontFamily="monospace">PK: assignment_id</text>
      </g>

      {/* activity_skill_requirements */}
      <g>
        <rect x="270" y="165" width="218" height="40" rx="4" fill="#d8e8f8" stroke="#2a6da8" strokeWidth="1.5" />
        <text x="379" y="182" textAnchor="middle" fontSize="10" fontWeight="600" fill="#1a4a78">activity_skill_req.</text>
        <text x="379" y="196" textAnchor="middle" fontSize="9" fill="#2a6da8" fontFamily="monospace">PK: asr_id</text>
      </g>

      {/* role_skill_requirements */}
      <g>
        <rect x="560" y="165" width="190" height="40" rx="4" fill="#d8f0e0" stroke="#2a8a4a" strokeWidth="1.5" />
        <text x="655" y="182" textAnchor="middle" fontSize="10" fontWeight="600" fill="#1a5a2a">role_skill_req.</text>
        <text x="655" y="196" textAnchor="middle" fontSize="9" fill="#2a8a4a" fontFamily="monospace">PK: requirement_id</text>
      </g>

      {/* employee_skills */}
      <g>
        <rect x="20" y="275" width="175" height="40" rx="4" fill="#d8f0e0" stroke="#2a8a4a" strokeWidth="1.5" />
        <text x="107" y="292" textAnchor="middle" fontSize="11" fontWeight="600" fill="#1a5a2a">employee_skills</text>
        <text x="107" y="306" textAnchor="middle" fontSize="9" fill="#2a8a4a" fontFamily="monospace">PK: employee_skill_id</text>
      </g>
    </svg>
  );
}

export default function AnalyticsStudioView({ file, data, rows: propRows, onRowsChange, externalChartRequest, workCapabilityDataset }: Props) {
  const [rows, setRows]           = useState<ExcelRow[]>([]);
  const [fields, setFields]       = useState<string[]>([]);
  const [derivedFields, setDerivedFields] = useState<string[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [config, setConfig]       = useState<PivotConfig>(DEFAULT_CONFIG);
  const [externalPivotData, setExternalPivotData] = useState<PivotData | null>(null);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [saveName, setSaveName]   = useState('');
  const [showSave, setShowSave]   = useState(false);
  const [activeDragField, setActiveDragField] = useState<string | null>(null);
  const [sqlQuery, setSqlQuery]       = useState('SELECT * FROM data LIMIT 20');
  const [sqlResult, setSqlResult]     = useState<SqlResult | null>(null);
  const [showSchemaMap, setShowSchemaMap] = useState(false);
  const [tableSource, setTableSource] = useState<TableSource>('org');
  const originalRowsRef = useRef<ExcelRow[]>([]);
  const rawRowsRef      = useRef<ExcelRow[]>([]);
  const dataRef         = useRef(data);
  dataRef.current = data;
  const currentDerivedKeysRef = useRef<Set<string>>(new Set());

  function applyEnrichment(raw: ExcelRow[], currentData: DashboardData | null | undefined) {
    const enriched = currentData ? mergeWithDerived(raw, currentData) : raw;
    const excelHeaders = raw.length ? Object.keys(raw[0]) : [];
    const added = currentData
      ? (DERIVED_KEYS as readonly string[]).filter(k => !excelHeaders.includes(k) && enriched.some(r => k in r))
      : [];
    currentDerivedKeysRef.current = new Set(added);
    setRows(enriched);
    originalRowsRef.current = enriched;
    setFields([...excelHeaders].sort((a, b) => a.localeCompare(b)));
    setDerivedFields(added);
    alasql('DROP TABLE IF EXISTS data');
    alasql('CREATE TABLE data');
    alasql.tables.data.data = enriched.map((row: ExcelRow) => ({ ...row }));
  }

  function applyWcEnrichment(baseRows: ExcelRow[], enrichedRows: ExcelRow[], derivedKeys: string[]) {
    const excelHeaders = baseRows.length ? Object.keys(baseRows[0]) : [];
    const actual = derivedKeys.filter(k => enrichedRows.some(r => k in r));
    currentDerivedKeysRef.current = new Set(actual);
    setRows(enrichedRows);
    originalRowsRef.current = enrichedRows;
    setFields([...excelHeaders].sort((a, b) => a.localeCompare(b)));
    setDerivedFields(actual);
    alasql('DROP TABLE IF EXISTS data');
    alasql('CREATE TABLE data');
    alasql.tables.data.data = enrichedRows.map((r: ExcelRow) => ({ ...r }));
  }

  // Parse file whenever it changes; fall back to pre-parsed rows (restored session)
  useEffect(() => {
    setTableSource('org'); // always reset to org data when file/rows change
    if (file) {
      setLoading(true);
      setError(null);
      setConfig(DEFAULT_CONFIG);
      setSqlResult(null);
      parseExcelFile(file)
        .then(raw => {
          rawRowsRef.current = raw;
          applyEnrichment(raw, dataRef.current);
        })
        .catch((e: unknown) => {
          setError(e instanceof Error ? e.message : 'Failed to parse file.');
        })
        .finally(() => setLoading(false));
      return;
    }
    // No file — use pre-parsed rows from restored session
    if (propRows?.length) {
      rawRowsRef.current = propRows;
      applyEnrichment(propRows, dataRef.current);
    } else {
      rawRowsRef.current = [];
    }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, propRows]);

  // Register all WC tables in alasql (with derived fields) so SQL JOINs work
  useEffect(() => {
    if (!workCapabilityDataset) return;
    for (const tbl of WC_TABLE_NAMES) {
      const enrichedRows = computeWcDerived(workCapabilityDataset, tbl);
      alasql(`DROP TABLE IF EXISTS ${tbl}`);
      alasql(`CREATE TABLE ${tbl}`);
      alasql.tables[tbl].data = enrichedRows.map((r: ExcelRow) => ({ ...r }));
    }
  }, [workCapabilityDataset]);

  // Switch active rows when tableSource changes
  useEffect(() => {
    setConfig(DEFAULT_CONFIG);
    setSqlResult(null);
    setExternalPivotData(null);
    if (tableSource === 'org') {
      applyEnrichment(rawRowsRef.current, dataRef.current);
    } else if (workCapabilityDataset) {
      const src = tableSource as Exclude<TableSource, 'org'>;
      const baseRows = getWcRows(workCapabilityDataset, src);
      const enrichedRows = computeWcDerived(workCapabilityDataset, src);
      applyWcEnrichment(baseRows, enrichedRows, WC_DERIVED_FIELDS[src] ?? []);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableSource]);

  // Re-enrich without re-parsing when DashboardData changes (e.g. re-mapping)
  useEffect(() => {
    const raw = rawRowsRef.current;
    if (!raw.length) return;
    applyEnrichment(raw, data);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Apply AI-requested chart config
  useEffect(() => {
    if (!externalChartRequest) return;
    setConfig(prev => ({
      ...prev,
      rowField:   externalChartRequest.rowField,
      colField:   externalChartRequest.colField   ?? null,
      valueField: externalChartRequest.valueField ?? null,
      aggFn:      externalChartRequest.aggFn,
      chartType:  externalChartRequest.chartType,
    }));

    if (externalChartRequest.precomputedRows?.length) {
      const preRows  = externalChartRequest.precomputedRows;
      const rField   = externalChartRequest.rowField;
      const cols     = Object.keys(preRows[0] ?? {});
      const vField   = externalChartRequest.valueField ?? cols.find(c => c !== rField) ?? 'value';
      const pivotRows: PivotRow[] = preRows.map(row => {
        const v = typeof row[vField] === 'number'
          ? (row[vField] as number)
          : parseFloat(String(row[vField] ?? 0)) || 0;
        return { rowKey: String(row[rField] ?? '(blank)'), values: { value: v }, total: v };
      }).sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
      setExternalPivotData({ colKeys: ['value'], rows: pivotRows });
    } else {
      setExternalPivotData(null);
    }
  }, [externalChartRequest]);

  function runSql() {
    if (!sqlQuery.trim()) return;
    setSqlResult(null);
    try {
      const verb = sqlQuery.trim().toUpperCase().split(/[\s(]/)[0];
      const result = alasql(sqlQuery);
      if (['UPDATE', 'DELETE', 'INSERT'].includes(verb)) {
        const updated: ExcelRow[] = alasql.tables?.data?.data ?? [];
        setRows([...updated]);
        if (updated.length > 0) {
          const allKeys = Object.keys(updated[0]);
          setFields(allKeys.filter(k => !currentDerivedKeysRef.current.has(k)).sort((a, b) => a.localeCompare(b)));
          setDerivedFields(allKeys.filter(k => currentDerivedKeysRef.current.has(k)));
        }
        if (tableSource === 'org') {
          onRowsChange?.(stripDerived(updated), {
            source: 'analytics-sql',
            query: sqlQuery,
            affected: typeof result === 'number' ? result : updated.length,
          });
        }
        setSqlResult({ type: 'affected', count: typeof result === 'number' ? result : 0 });
      } else {
        const data = Array.isArray(result) ? result as Record<string, unknown>[] : [];
        setSqlResult({ type: 'rows', data, rowCount: data.length });
      }
    } catch (e) {
      setSqlResult({ type: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  function resetData() {
    const original = originalRowsRef.current;
    if (!original.length) return;
    setRows([...original]);
    alasql('DROP TABLE IF EXISTS data');
    alasql('CREATE TABLE data');
    alasql.tables.data.data = original.map((r: ExcelRow) => ({ ...r }));
    if (tableSource === 'org') {
      onRowsChange?.(null, { source: 'analytics-reset', affected: original.length });
    }
    setSqlResult({ type: 'affected', count: original.length });
  }

  const allFields = [...fields, ...derivedFields];

  const detectedCols = useMemo(() => {
    const norm = (h: string) => h.toLowerCase().replace(/[\s_-]/g, '');
    const GROSS = ['totalannualcompensation','totalcompensation','ctc','totalctc','grosssalary','grosspay','totalpay','annualctc','totalgross','salary','annualcompensation','annualrate'];
    const FAM   = ['jobfamily','function','department','dept','businessunit','team','division','jobfunction','orgunit','group'];
    return {
      nameCol:   fields.find(h => NAME_KEYS.includes(norm(h))) ?? null,
      idCol:     fields.find(h => ID_KEYS.includes(norm(h)))   ?? null,
      grossCol:  fields.find(h => GROSS.includes(norm(h)))     ?? null,
      jobFamCol: fields.find(h => FAM.includes(norm(h)))       ?? null,
    };
  }, [fields]);

  const computedPivotData = useMemo(() => computePivot(rows, config), [rows, config]);
  const pivotData = externalPivotData ?? computedPivotData;

  const isReady = !!(config.rowField && (config.aggFn === 'count' || config.valueField || externalPivotData));
  const hasData = isReady && pivotData.rows.length > 0;

  function handleDragStart(e: DragStartEvent) {
    setActiveDragField(String(e.active.id).replace('field::', ''));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveDragField(null);
    if (!e.over) return;
    const field = String(e.active.id).replace('field::', '');
    const zone  = String(e.over.id) as 'rowField' | 'colField' | 'valueField';
    if (!['rowField', 'colField', 'valueField'].includes(zone)) return;
    setConfig(prev => ({ ...prev, [zone]: field }));
    setExternalPivotData(null);
  }

  function saveView() {
    if (!saveName.trim() || !hasData) return;
    setSavedViews(prev => [{
      id: String(Date.now()),
      name: saveName.trim(),
      config: { ...config },
      pivotData,
    }, ...prev]);
    setSaveName('');
    setShowSave(false);
  }

  const configLabel = config.rowField
    ? `${AGG_LABELS[config.aggFn]}${config.valueField ? ` of ${config.valueField}` : ''} by ${config.rowField}${config.colField ? ` × ${config.colField}` : ''}`
    : 'Configure your pivot above';
  const hasInput = Boolean(file || propRows?.length || (tableSource !== 'org' && workCapabilityDataset));
  const datasetLabel = tableSource !== 'org'
    ? (TABLE_SOURCE_OPTIONS.find(o => o.key === tableSource)?.label ?? tableSource)
    : (file?.name ?? 'Current state');

  // No dataset state
  if (!hasInput) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyIcon}>⊞</div>
        <div className={styles.emptyTitle}>Analytics Studio</div>
        <div className={styles.emptySub}>Upload an Excel or CSV file to start building pivot views</div>
        {workCapabilityDataset && (
          <div className={styles.emptySub} style={{ marginTop: 12 }}>
            Or select a Work &amp; Capability table from the Data source dropdown above
          </div>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.asSpin} />
        <div className={styles.emptySub}>Loading {datasetLabel}…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyTitle}>Error</div>
        <div className={styles.emptySub}>{error}</div>
      </div>
    );
  }

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActiveDragField(null)}>
      <div className={styles.wrap}>

        {/* ── Studio header ── */}
        <div className={styles.studioHeader}>
          <div className={styles.studioTitle}>Analytics Studio</div>
          <div className={styles.studioSub}>
            {datasetLabel} · {rows.length.toLocaleString()} rows · {fields.length} fields
            {derivedFields.length > 0 && ` + ${derivedFields.length} derived`}
          </div>
        </div>

        {/* ── Data source selector ── */}
        <div className={styles.tableSourceRow}>
          <span className={styles.tableSourceLabel}>Data source</span>
          <select
            className={styles.tableSourceSelect}
            value={tableSource}
            onChange={e => setTableSource(e.target.value as TableSource)}
          >
            {TABLE_SOURCE_GROUPS.map(group => {
              const opts = TABLE_SOURCE_OPTIONS.filter(o => o.group === group);
              if (group !== 'Org Data' && !workCapabilityDataset) return null;
              return (
                <optgroup key={group} label={group}>
                  {opts.map(o => (
                    <option key={o.key} value={o.key}>{o.label}</option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          {tableSource !== 'org' && (
            <span className={styles.tableSourceBadge}>
              {TABLE_SOURCE_OPTIONS.find(o => o.key === tableSource)?.label}
            </span>
          )}
          {!workCapabilityDataset && (
            <span className={styles.tableSourceHint}>
              Upload Work &amp; Capability data to unlock more tables
            </span>
          )}
        </div>

        {/* ── Field palette ── */}
        <div className={styles.palette}>
          <div className={styles.paletteLabel}>Fields — drag to configure below</div>
          <div className={styles.paletteChips}>
            {fields.map(f => <DraggableField key={f} field={f} />)}
          </div>
          {derivedFields.length > 0 && (
            <>
              <div className={styles.paletteLabelDerived}>
                {tableSource === 'org' ? 'Derived · Hierarchy' : 'Derived · Analytics'}
              </div>
              <div className={styles.paletteChips}>
                {derivedFields.map(f => <DraggableField key={f} field={f} derived />)}
              </div>
            </>
          )}
        </div>

        {/* ── Drop zones ── */}
        <div className={styles.zones}>
          <DropZone
            id="rowField"
            label="Row Group"
            sub="Group rows by this field"
            field={config.rowField}
            onClear={() => { setConfig(p => ({ ...p, rowField: null })); setExternalPivotData(null); }}
          />
          <DropZone
            id="colField"
            label="Column Break"
            sub="Split by this field (optional)"
            field={config.colField}
            onClear={() => { setConfig(p => ({ ...p, colField: null })); setExternalPivotData(null); }}
          />
          <DropZone
            id="valueField"
            label="Value"
            sub="Numeric field to aggregate"
            field={config.valueField}
            onClear={() => { setConfig(p => ({ ...p, valueField: null })); setExternalPivotData(null); }}
          />
        </div>

        {/* ── Controls row ── */}
        <div className={styles.controls}>
          <div className={styles.controlGroup}>
            <span className={styles.controlLabel}>Aggregation</span>
            <div className={styles.btnRow}>
              {(['sum', 'count', 'avg', 'min', 'max'] as AggFn[]).map(fn => (
                <button
                  key={fn}
                  className={`${styles.ctrlBtn} ${config.aggFn === fn ? styles.ctrlBtnActive : ''}`}
                  onClick={() => setConfig(p => ({ ...p, aggFn: fn }))}
                >
                  {AGG_LABELS[fn]}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.controlGroup}>
            <span className={styles.controlLabel}>Chart type</span>
            <div className={styles.btnRow}>
              {CHART_TYPES.map(ct => (
                <button
                  key={ct.key}
                  className={`${styles.ctrlBtn} ${config.chartType === ct.key ? styles.ctrlBtnActive : ''}`}
                  onClick={() => setConfig(p => ({ ...p, chartType: ct.key }))}
                >
                  {ct.label}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.controlGroup}>
            <span className={styles.controlLabel}>Palette</span>
            <div className={styles.btnRow}>
              {PALETTES.map(p => (
                <button
                  key={p.label}
                  className={`${styles.ctrlBtn} ${config.palette[0] === p.colors[0] ? styles.ctrlBtnActive : ''}`}
                  onClick={() => setConfig(prev => ({ ...prev, palette: p.colors }))}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          {pivotData.colKeys.length > 0 && (
            <div className={styles.controlGroup}>
              <span className={styles.controlLabel}>Colors</span>
              <div className={styles.paletteRow}>
                {pivotData.colKeys.slice(0, 8).map((ck, i) => (
                  <label
                    key={ck}
                    className={styles.colorSwatch}
                    title={ck}
                    style={{ background: (config.palette.length ? config.palette : CHART_COLORS)[i % 8] }}
                  >
                    <input
                      type="color"
                      value={(config.palette.length ? config.palette : CHART_COLORS)[i % 8]}
                      onChange={e => {
                        const next = [...(config.palette.length ? config.palette : CHART_COLORS)];
                        next[i] = e.target.value;
                        setConfig(prev => ({ ...prev, palette: next }));
                      }}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Preview (chart + table + save) ── */}
        {hasData ? (
          <>
            <div className={styles.previewLabel}>{configLabel}</div>

            {/* Chart */}
            <div className={styles.chartWrap}>
              <PivotChart pivotData={pivotData} config={config} />
            </div>

            {/* Pivot table */}
            <div className={styles.tableWrap}>
              <div className={styles.tableWrapHeader}>
                <span className={styles.tableWrapTitle}>Pivot Table</span>
                <button className={styles.exportBtn} onClick={() => exportPivotCsv(pivotData, config)}>
                  ↓ Export CSV
                </button>
              </div>
              <div className={styles.ptScroll}>
                <table className={styles.pt}>
                  <thead>
                    <tr>
                      <th className={styles.ptTh}>{config.rowField}</th>
                      {pivotData.colKeys.map(ck => (
                        <th key={ck} className={styles.ptTh}>
                          {ck === 'value' ? (config.valueField ?? 'Count') : ck}
                        </th>
                      ))}
                      {pivotData.colKeys.length > 1 && <th className={styles.ptTh}>Total</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {pivotData.rows.map(row => (
                      <tr key={row.rowKey} className={styles.ptRow}>
                        <td className={styles.ptTdKey}>{row.rowKey}</td>
                        {pivotData.colKeys.map(ck => (
                          <td key={ck} className={styles.ptTd}>
                            {row.values[ck] != null ? fmtNum(row.values[ck]!) : <span className={styles.ptNull}>—</span>}
                          </td>
                        ))}
                        {pivotData.colKeys.length > 1 && (
                          <td className={`${styles.ptTd} ${styles.ptTdTotal}`}>
                            {row.total != null ? fmtNum(row.total) : '—'}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Save bar */}
            <div className={styles.saveBar}>
              {showSave ? (
                <>
                  <input
                    className={styles.saveInput}
                    placeholder="Name this view…"
                    value={saveName}
                    onChange={e => setSaveName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && saveView()}
                    autoFocus
                  />
                  <button className={styles.saveConfirm} onClick={saveView} disabled={!saveName.trim()}>
                    Save
                  </button>
                  <button className={styles.saveCancel} onClick={() => { setShowSave(false); setSaveName(''); }}>
                    Cancel
                  </button>
                </>
              ) : (
                <button className={styles.saveBtn} onClick={() => setShowSave(true)}>
                  + Save this view
                </button>
              )}
            </div>
          </>
        ) : (
          <div className={styles.configHint}>
            {!config.rowField
              ? <>Drop a field into <strong>Row Group</strong> to begin</>
              : config.aggFn !== 'count' && !config.valueField
                ? 'Drop a numeric field into Value to compute the aggregation'
                : 'No data found for this configuration'}
          </div>
        )}

        {/* ── Saved views gallery ── */}
        {savedViews.length > 0 && (
          <div className={styles.savedSection}>
            <div className={styles.savedHeader}>
              <span className={styles.savedTitle}>Saved Views</span>
              <span className={styles.savedBadge}>{savedViews.length}</span>
            </div>
            <div className={styles.savedGrid}>
              {savedViews.map(view => (
                <div key={view.id} className={styles.savedCard}>
                  <div className={styles.savedCardChart}>
                    {view.pivotData.rows.length > 0 && view.pivotData.colKeys.length > 0
                      ? <PivotChart pivotData={view.pivotData} config={view.config} mini />
                      : <div className={styles.savedChartEmpty} />}
                  </div>
                  <div className={styles.savedCardBody}>
                    <div className={styles.savedCardName}>{view.name}</div>
                    <div className={styles.savedCardMeta}>
                      {AGG_LABELS[view.config.aggFn]}
                      {view.config.valueField ? ` of ${view.config.valueField}` : ''}
                      {' by '}{view.config.rowField}
                      {view.config.colField ? ` × ${view.config.colField}` : ''}
                      {' · '}{view.config.chartType}
                    </div>
                    <div className={styles.savedCardRow}>{view.pivotData.rows.length} groups</div>
                    <div className={styles.savedCardActions}>
                      <button
                        className={styles.savedLoad}
                        onClick={() => { setConfig(view.config); setShowSave(false); }}
                      >
                        Load
                      </button>
                      <button
                        className={styles.savedDelete}
                        onClick={() => setSavedViews(prev => prev.filter(v => v.id !== view.id))}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* ── SQL Editor ── */}
        {rows.length > 0 && (
          <div className={styles.sqlSection}>
            <div className={styles.sqlSectionHead}>
              <div>
                <div className={styles.sqlSectionTitle}>SQL Editor</div>
                <div className={styles.sqlSectionMeta}>
                  Table: <code className={styles.sqlCode}>data</code>
                  {tableSource !== 'org' && (
                    <span className={styles.sqlTableAlias}> → {TABLE_SOURCE_OPTIONS.find(o => o.key === tableSource)?.label}</span>
                  )}
                  {' · '}{rows.length.toLocaleString()} rows
                  {' · '}{allFields.length} columns
                  {tableSource === 'org' && originalRowsRef.current.length !== rows.length && (
                    <span className={styles.sqlModified}> · modified</span>
                  )}
                </div>
                {workCapabilityDataset && (
                  <div className={styles.sqlWcTablesHint}>
                    Also available: {WC_TABLE_NAMES.map((t, i) => (
                      <span key={t}>
                        <code className={styles.sqlCode}>{t}</code>
                        {i < WC_TABLE_NAMES.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className={styles.sqlHeadActions}>
                {workCapabilityDataset && (
                  <button
                    className={`${styles.sqlResetBtn} ${showSchemaMap ? styles.sqlResetBtnActive : ''}`}
                    onClick={() => setShowSchemaMap(v => !v)}
                    title="Show/hide table relationship diagram"
                  >
                    {showSchemaMap ? '✕ Schema' : '⬡ Schema'}
                  </button>
                )}
                <button className={styles.sqlResetBtn} onClick={resetData}>
                  Reset data
                </button>
              </div>
            </div>

            {/* Schema relationship map */}
            {showSchemaMap && workCapabilityDataset && (
              <div className={styles.schemaMapPanel}>
                <div className={styles.schemaMapTitle}>Table Relationships</div>
                <WcSchemaMapSvg hasOrg={!!data} />
                <div className={styles.schemaMapLegend}>
                  <span className={styles.schemaMapLegendActivity}>■ Activity domain</span>
                  <span className={styles.schemaMapLegendSkill}>■ Skill domain</span>
                  {data && <span className={styles.schemaMapLegendOrg}>⬜ Org data (when loaded)</span>}
                  <span className={styles.schemaMapLegendLine}>── FK join  · · · cross-domain join</span>
                </div>
              </div>
            )}

            {/* Column chips — click to insert column name */}
            <div className={styles.sqlColWrap}>
              <span className={styles.sqlColLabel}>Columns</span>
              <div className={styles.sqlCols}>
                {allFields.map(f => (
                  <button
                    key={f}
                    className={`${styles.sqlColChip} ${derivedFields.includes(f) ? styles.sqlColChipDerived : ''}`}
                    onClick={() => setSqlQuery(q => {
                      const sep = q && !q.endsWith(' ') ? ' ' : '';
                      return q + sep + `\`${f}\``;
                    })}
                    title={derivedFields.includes(f) ? `Derived field: ${f}` : 'Click to insert column name'}
                  >
                    {derivedFields.includes(f) && <span className={styles.derivedMark}>≈</span>}
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* Dark editor */}
            <div className={styles.sqlEditorBox}>
              <textarea
                className={styles.sqlTextarea}
                value={sqlQuery}
                onChange={e => setSqlQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    runSql();
                  }
                }}
                rows={5}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                placeholder="SELECT * FROM data LIMIT 20"
              />
              <div className={styles.sqlToolbar}>
                <button className={styles.sqlRunBtn} onClick={runSql}>▶ Run</button>
                <span className={styles.sqlShortcut}>Ctrl + Enter</span>
                <div className={styles.sqlExamples}>
                  <span className={styles.sqlExLabel}>Examples:</span>
                  {buildExamples(fields, detectedCols.nameCol, detectedCols.idCol, detectedCols.grossCol, detectedCols.jobFamCol).map(([label, q]) => (
                    <button key={label} className={styles.sqlExBtn} onClick={() => setSqlQuery(q)}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Results */}
            {sqlResult && (
              <div className={styles.sqlResultBox}>
                {sqlResult.type === 'error' && (
                  <div className={styles.sqlError}>
                    <span className={styles.sqlErrorBadge}>SQL Error</span>
                    {sqlResult.message}
                  </div>
                )}
                {sqlResult.type === 'affected' && (
                  <div className={styles.sqlAffected}>
                    <span className={styles.sqlAffectedCheck}>✓</span>
                    {sqlResult.count} row{sqlResult.count !== 1 ? 's' : ''} affected
                    <span className={styles.sqlAffectedSub}>pivot view updated automatically</span>
                  </div>
                )}
                {sqlResult.type === 'rows' && (
                  <>
                    <div className={styles.sqlResultMeta}>
                      <span>
                        {sqlResult.rowCount.toLocaleString()} row{sqlResult.rowCount !== 1 ? 's' : ''} returned
                        {sqlResult.rowCount > 200 && <span className={styles.sqlTruncNote}> · showing first 200</span>}
                      </span>
                      <button className={styles.exportBtn} onClick={() => exportSqlCsv(sqlResult.data)}>
                        ↓ Export CSV
                      </button>
                    </div>
                    {sqlResult.data.length > 0 ? (
                      <div className={styles.sqlTableScroll}>
                        <table className={styles.sqlTable}>
                          <thead>
                            <tr>
                              {Object.keys(sqlResult.data[0]).map(k => (
                                <th key={k} className={styles.sqlTh}>{k}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {sqlResult.data.slice(0, 200).map((row, i) => (
                              <tr key={i} className={styles.sqlTr}>
                                {Object.values(row).map((v, j) => (
                                  <td key={j} className={styles.sqlTd}>
                                    {v == null
                                      ? <span className={styles.sqlNull}>NULL</span>
                                      : String(v)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className={styles.sqlEmpty}>No rows returned</div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Drag overlay — chip follows cursor */}
      <DragOverlay>
        {activeDragField
          ? <div className={`${styles.fieldChip} ${styles.fieldChipOverlay}`}>{activeDragField}</div>
          : null}
      </DragOverlay>
    </DndContext>
  );
}
