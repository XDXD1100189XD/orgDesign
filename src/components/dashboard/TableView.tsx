'use client';

import { useState, useMemo } from 'react';
import type { DashboardData, TableRow, MetricFilter, FilterOperator } from '@/lib/types';
import { initials } from '@/lib/utils';
import MetricFilters, { applyMetricFilters } from './MetricFilters';
import styles from './TableView.module.css';

interface Props { data: DashboardData; }

const INITIAL_FILTERS: MetricFilter[] = [
  { metric: 'span', operator: 'any' as FilterOperator, value: 0 },
  { metric: 'depth', operator: 'any' as FilterOperator, value: 0 },
];

export default function TableView({ data }: Props) {
  const { vertices: V, metrics: m } = data;
  const [sortKey, setSortKey] = useState<keyof TableRow>('depth');
  const [sortDir, setSortDir] = useState(1);
  const [filter, setFilter] = useState('');
  const [metricFilters, setMetricFilters] = useState<MetricFilter[]>(INITIAL_FILTERS);

  const allRows: TableRow[] = useMemo(() => {
    return Object.keys(V).map((id) => {
      const v = V[id];
      const mgrId = m.parent[id];
      const mgr = mgrId ? V[mgrId] : null;
      return {
        id,
        name: v.display_name,
        unnamed: v.unnamed,
        emp_id: v.id || '—',
        role: v.role,
        grade: v.grade || '—',
        manager: mgr ? mgr.display_name : null,
        manager_id: mgrId,
        depth: m.depth[id] ?? 0,
        span: m.span[id] ?? 0,
      };
    });
  }, [V, m]);

  const filtered = useMemo(() => {
    let rows = allRows;

    // Text search
    if (filter) {
      const f = filter.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(f) ||
          r.role.toLowerCase().includes(f) ||
          r.emp_id.toLowerCase().includes(f) ||
          (r.manager || '').toLowerCase().includes(f) ||
          r.grade.toLowerCase().includes(f)
      );
    }

    // Metric filters
    rows = applyMetricFilters(rows, metricFilters) as TableRow[];

    // Sort
    rows.sort((a, b) => {
      let av: string | number = a[sortKey] as string | number;
      let bv: string | number = b[sortKey] as string | number;
      if (av === null || av === undefined || av === '—') av = sortDir === 1 ? 'zzz' : '';
      if (bv === null || bv === undefined || bv === '—') bv = sortDir === 1 ? 'zzz' : '';
      if (typeof av === 'string' && typeof bv === 'string') return sortDir * av.localeCompare(bv);
      return sortDir * ((av as number) - (bv as number));
    });
    return rows;
  }, [allRows, filter, sortKey, sortDir, metricFilters]);

  const handleSort = (key: keyof TableRow) => {
    if (sortKey === key) setSortDir((d) => d * -1);
    else { setSortKey(key); setSortDir(1); }
  };

  const columns: { key: keyof TableRow; label: string }[] = [
    { key: 'name', label: 'Employee' },
    { key: 'emp_id', label: 'ID' },
    { key: 'role', label: 'Role' },
    { key: 'grade', label: 'Grade' },
    { key: 'manager', label: 'Manager' },
    { key: 'depth', label: 'Level' },
    { key: 'span', label: 'Span' },
  ];

  return (
    <div style={{ animation: 'fade 0.4s ease' }}>
      {/* Metric filters */}
      <MetricFilters filters={metricFilters} onChange={setMetricFilters} />

      <div className={styles.toolbar}>
        <input
          type="text"
          placeholder="Search by name, role, id, manager…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className={styles.search}
        />
        <div className={styles.count}>
          Showing <b>{filtered.length}</b> of {allRows.length}
        </div>
      </div>
      <div className={styles.wrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={sortKey === col.key ? styles.sorted : ''}
                >
                  {col.label}{' '}
                  <span className={styles.arrow}>
                    {sortKey === col.key ? (sortDir === 1 ? '↑' : '↓') : '↕'}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td className={styles.nameCell}>
                  {r.unnamed ? <i style={{ color: 'var(--slate-light)' }}>{r.name}</i> : r.name}
                </td>
                <td className={styles.idCell}>{r.emp_id}</td>
                <td><span className={styles.roleTag}>{r.role}</span></td>
                <td>
                  {r.grade !== '—'
                    ? <span className={styles.gradeTag}>{r.grade}</span>
                    : <span style={{ color: 'var(--slate-light)' }}>—</span>}
                </td>
                <td>
                  {r.manager ? (
                    <div className={styles.mgrChip}>
                      <div className={styles.avatar}>{initials(r.manager)}</div>
                      <span>{r.manager}</span>
                    </div>
                  ) : (
                    <span className={styles.mgrNone}>— root —</span>
                  )}
                </td>
                <td>
                  <span className={styles.depthPill}>
                    {Array.from({ length: r.depth + 1 }).map((_, i) => (
                      <span key={i} className={styles.dd} />
                    ))}
                    L{r.depth}
                  </span>
                </td>
                <td className={`${styles.spanCell} ${r.span === 0 ? styles.zero : r.span > 5 ? styles.over : ''}`}>
                  {r.span === 0 ? '—' : `${r.span} ↓`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
