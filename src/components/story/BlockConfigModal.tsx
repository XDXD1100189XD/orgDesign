'use client';

import { useState, useMemo } from 'react';
import type { PendingData, ChartBlock, TableBlock } from '@/lib/story/types';
import { validateChartability } from '@/lib/story/chartability';
import { computePivot, CHART_COLORS } from '@/lib/story/pivotUtils';
import type { PivotConfig } from '@/lib/story/pivotUtils';

const PALETTES: { name: string; label: string; colors: string[] }[] = [
  { name: 'default', label: 'Default', colors: CHART_COLORS },
  { name: 'ocean',   label: 'Ocean',   colors: ['#1a73e8','#00bcd4','#4db6ac','#0288d1','#26a69a','#42a5f5'] },
  { name: 'warm',    label: 'Warm',    colors: ['#e53935','#f4511e','#fb8c00','#fdd835','#e91e63','#d81b60'] },
  { name: 'earth',   label: 'Earth',   colors: ['#558b2f','#6d4c41','#5d4037','#33691e','#827717','#4e342e'] },
];
import { PivotChart } from '@/components/shared/PivotChart';
import type { ChartType, AggFn } from '@/lib/types';

interface Props {
  data: PendingData;
  onConfirm: (block: ChartBlock | TableBlock) => void;
  onDismiss: () => void;
}

type Mode = 'table' | 'pivotTable' | 'chart';

export function BlockConfigModal({ data, onConfirm, onDismiss }: Props) {
  const chartability = useMemo(
    () => validateChartability(data.rows),
    [data.rows],
  );

  // Default mode: chart if we have pivotData pre-computed, else table
  const [mode, setMode] = useState<Mode>(data.pivotData ? 'chart' : 'table');
  const [blockTitle, setBlockTitle] = useState('');

  // Table config
  const [selectedCols, setSelectedCols] = useState<string[]>(data.columns);
  const [rowLimit, setRowLimit] = useState(10);
  const [excludedRowIndices, setExcludedRowIndices] = useState<Set<number>>(new Set());

  // Chart / pivotTable config
  const [chartType, setChartType] = useState<ChartType>(
    chartability.suggestedTypes[0] ?? 'bar',
  );
  const [xField, setXField] = useState<string>(
    data.pivotConfig?.rowField ?? chartability.recommendedRowField ?? data.columns[0] ?? '',
  );
  const [yField, setYField] = useState<string>(
    data.pivotConfig?.valueField ?? chartability.recommendedValueField ?? '',
  );
  const [colField, setColField] = useState<string>('');
  const [aggFn, setAggFn] = useState<AggFn>(
    data.pivotConfig?.aggFn ?? chartability.recommendedAggFn ?? 'count',
  );
  const [paletteName, setPaletteName] = useState<string>('default');

  const palette = PALETTES.find(p => p.name === paletteName)?.colors ?? CHART_COLORS;

  // Rows filtered by selection
  const filteredRows = useMemo(
    () => data.rows.filter((_, i) => !excludedRowIndices.has(i)),
    [data.rows, excludedRowIndices],
  );

  // Live chart/pivot preview
  const pivotConfig: PivotConfig = useMemo(() => ({
    rowField: xField || null,
    colField: colField || null,
    valueField: yField || null,
    aggFn,
    chartType,
    palette,
  }), [xField, colField, yField, aggFn, chartType, palette]);

  const pivotData = useMemo(() => {
    if (data.pivotData && excludedRowIndices.size === 0 &&
        mode !== 'pivotTable' &&
        xField === (data.pivotConfig?.rowField ?? '') &&
        yField === (data.pivotConfig?.valueField ?? '')) {
      return data.pivotData;
    }
    const sourceRows = filteredRows;
    return computePivot(sourceRows as Parameters<typeof computePivot>[0], pivotConfig);
  }, [data.rows, data.pivotData, data.pivotConfig, pivotConfig, mode, xField, yField, excludedRowIndices, filteredRows]);

  function toggleCol(col: string) {
    setSelectedCols(prev =>
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col],
    );
  }

  function toggleRow(idx: number) {
    setExcludedRowIndices(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function handleConfirm() {
    const now = new Date().toISOString();

    if (mode === 'table') {
      const block: TableBlock = {
        type: 'table',
        id: crypto.randomUUID(),
        title: blockTitle || undefined,
        columns: selectedCols.length ? selectedCols : data.columns,
        rows: filteredRows,
        maxDisplayRows: rowLimit,
        source: data.source,
      };
      onConfirm(block);
    } else if (mode === 'pivotTable') {
      const cols = [xField, ...pivotData.colKeys];
      const rows = pivotData.rows.map(r => ({
        [xField]: r.rowKey,
        ...Object.fromEntries(pivotData.colKeys.map(ck => [ck, r.values[ck] ?? 0])),
      }));
      const block: TableBlock = {
        type: 'table',
        id: crypto.randomUUID(),
        title: blockTitle || undefined,
        columns: cols,
        rows,
        maxDisplayRows: rows.length,
        source: data.source,
      };
      onConfirm(block);
    } else {
      const block: ChartBlock = {
        type: 'chart',
        id: crypto.randomUUID(),
        title: blockTitle || undefined,
        spec: {
          rowField: xField,
          colField: colField || undefined,
          valueField: yField || undefined,
          aggFn,
          chartType,
          sqlQuery: data.source.label,
          palette,
        },
        snapshot: {
          rows: data.rows,
          pivotData: pivotData,
          capturedAt: now,
        },
        source: data.source,
      };
      onConfirm(block);
    }
  }

  const allCols = data.columns;
  // Rows shown in selection list (all, up to 50)
  const rowSelectionList = data.rows.slice(0, 50);
  const allSelected = excludedRowIndices.size === 0;

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onDismiss(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{
        background: '#fff',
        borderRadius: 6,
        width: 900,
        maxWidth: '96vw',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 8px 48px rgba(0,0,0,0.22)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '1px solid rgba(0,0,0,0.09)',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Configure Data Block</div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
              {data.label} · {data.rows.length} rows
            </div>
          </div>
          <button
            onClick={onDismiss}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#666', padding: 4, lineHeight: 1 }}
          >✕</button>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {/* Left: config panel */}
          <div style={{
            width: 300, flexShrink: 0, borderRight: '1px solid rgba(0,0,0,0.09)',
            overflowY: 'auto', padding: '16px 16px',
            display: 'flex', flexDirection: 'column', gap: 16,
          }}>
            {/* Mode toggle */}
            <div>
              <div style={labelStyle}>Display as</div>
              <div style={{ display: 'flex', gap: 0, border: '1px solid rgba(0,0,0,0.15)', borderRadius: 3, overflow: 'hidden' }}>
                {(['table', 'pivotTable', 'chart'] as Mode[]).map(m => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    style={{
                      flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 600,
                      border: 'none', cursor: 'pointer',
                      background: mode === m ? 'var(--teal, #006b6b)' : '#fff',
                      color: mode === m ? '#fff' : '#666',
                    }}
                  >
                    {m === 'table' ? '⊞ Table' : m === 'pivotTable' ? '⊟ Pivot' : '▦ Chart'}
                  </button>
                ))}
              </div>
            </div>

            {/* Block title */}
            <div>
              <label style={labelStyle}>Block title (optional)</label>
              <input
                type="text"
                value={blockTitle}
                onChange={e => setBlockTitle(e.target.value)}
                placeholder="e.g. Headcount by Department"
                style={inputStyle}
              />
            </div>

            {/* Row selection — all modes */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>
                  Select rows {excludedRowIndices.size > 0 && <span style={{ color: 'var(--teal,#006b6b)', fontWeight: 700 }}>({data.rows.length - excludedRowIndices.size}/{data.rows.length})</span>}
                </label>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => setExcludedRowIndices(new Set())} style={miniBtn}>All</button>
                  <button onClick={() => setExcludedRowIndices(new Set(data.rows.map((_, i) => i)))} style={miniBtn}>None</button>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 160, overflowY: 'auto', border: '1px solid rgba(0,0,0,0.09)', borderRadius: 3, padding: '4px 6px' }}>
                {rowSelectionList.map((row, i) => (
                  <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, cursor: 'pointer', padding: '1px 0' }}>
                    <input
                      type="checkbox"
                      checked={!excludedRowIndices.has(i)}
                      onChange={() => toggleRow(i)}
                      style={{ accentColor: 'var(--teal, #006b6b)' }}
                    />
                    <span style={{ color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {String(row[allCols[0]] ?? `Row ${i + 1}`)}
                    </span>
                  </label>
                ))}
                {data.rows.length > 50 && (
                  <div style={{ fontSize: 9, color: '#aaa', padding: '3px 2px', fontStyle: 'italic' }}>
                    Showing first 50 rows
                  </div>
                )}
              </div>
            </div>

            {mode === 'table' && (
              <>
                {/* Column selection */}
                <div>
                  <label style={labelStyle}>Columns to show</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 160, overflowY: 'auto' }}>
                    {allCols.map(col => (
                      <label key={col} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', padding: '2px 0' }}>
                        <input
                          type="checkbox"
                          checked={selectedCols.includes(col)}
                          onChange={() => toggleCol(col)}
                          style={{ accentColor: 'var(--teal, #006b6b)' }}
                        />
                        <span style={{ color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Row limit */}
                <div>
                  <label style={labelStyle}>Max rows to show</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="range" min={1} max={50} value={rowLimit}
                      onChange={e => setRowLimit(Number(e.target.value))}
                      style={{ flex: 1, accentColor: 'var(--teal, #006b6b)' }}
                    />
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--teal, #006b6b)', width: 28, textAlign: 'right' }}>{rowLimit}</span>
                  </div>
                </div>
              </>
            )}

            {(mode === 'chart' || mode === 'pivotTable') && (
              <>
                {/* X axis / Group by */}
                <div>
                  <label style={labelStyle}>{mode === 'pivotTable' ? 'Group by (rows)' : 'X axis (group by)'}</label>
                  <select value={xField} onChange={e => setXField(e.target.value)} style={inputStyle}>
                    <option value="">— select —</option>
                    {allCols.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                {/* Color by / column dimension */}
                <div>
                  <label style={labelStyle}>Color by / break down (optional)</label>
                  <select value={colField} onChange={e => setColField(e.target.value)} style={inputStyle}>
                    <option value="">— none —</option>
                    {allCols.filter(c => c !== xField).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                {/* Y axis */}
                <div>
                  <label style={labelStyle}>{mode === 'pivotTable' ? 'Value' : 'Y axis (value)'}</label>
                  <select value={yField} onChange={e => setYField(e.target.value)} style={inputStyle}>
                    <option value="">Count rows</option>
                    {chartability.numericColumns.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                {/* Aggregation */}
                {yField && (
                  <div>
                    <label style={labelStyle}>Aggregation</label>
                    <select value={aggFn} onChange={e => setAggFn(e.target.value as AggFn)} style={inputStyle}>
                      <option value="sum">Sum</option>
                      <option value="avg">Average</option>
                      <option value="count">Count</option>
                      <option value="min">Min</option>
                      <option value="max">Max</option>
                    </select>
                  </div>
                )}

                {/* Chart type — chart mode only */}
                {mode === 'chart' && (
                  <div>
                    <label style={labelStyle}>Chart type</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {(['bar', 'stackedBar', 'line', 'area', 'pie'] as ChartType[]).map(ct => (
                        <button
                          key={ct}
                          onClick={() => setChartType(ct)}
                          style={{
                            padding: '4px 10px', fontSize: 11, borderRadius: 3, cursor: 'pointer',
                            border: '1px solid',
                            borderColor: chartType === ct ? 'var(--teal, #006b6b)' : 'rgba(0,0,0,0.15)',
                            background: chartType === ct ? 'rgba(0,107,107,0.08)' : '#fff',
                            color: chartType === ct ? 'var(--teal, #006b6b)' : '#555',
                            fontWeight: chartType === ct ? 600 : 400,
                          }}
                        >
                          {ct === 'stackedBar' ? 'Stacked' : ct.charAt(0).toUpperCase() + ct.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Color palette */}
                {mode === 'chart' && (
                  <div>
                    <label style={labelStyle}>Color palette</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {PALETTES.map(p => (
                        <button
                          key={p.name}
                          onClick={() => setPaletteName(p.name)}
                          title={p.label}
                          style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                            padding: '5px 6px', borderRadius: 4, cursor: 'pointer', border: '1.5px solid',
                            borderColor: paletteName === p.name ? 'var(--teal,#006b6b)' : 'rgba(0,0,0,0.12)',
                            background: paletteName === p.name ? 'rgba(0,107,107,0.07)' : '#fff',
                          }}
                        >
                          <div style={{ display: 'flex', gap: 2 }}>
                            {p.colors.slice(0, 5).map((c, i) => (
                              <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />
                            ))}
                          </div>
                          <span style={{ fontSize: 8, color: '#888', fontWeight: 600 }}>{p.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Chartability warnings */}
                {mode === 'chart' && chartability.warnings.length > 0 && (
                  <div style={{ fontSize: 10, color: '#b05500', background: 'rgba(176,85,0,0.06)', borderRadius: 3, padding: '6px 8px', lineHeight: 1.5 }}>
                    {chartability.warnings[0]}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Right: preview */}
          <div style={{ flex: 1, padding: 20, overflowY: 'auto', background: '#fafaf8', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Preview
            </div>

            {mode === 'table' && (
              <div style={{ overflow: 'auto', flex: 1 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr>
                      {(selectedCols.length ? selectedCols : allCols).map(col => (
                        <th key={col} style={{
                          textAlign: 'left', padding: '5px 8px',
                          background: 'var(--teal, #006b6b)', color: '#fff',
                          fontWeight: 600, fontSize: 10, whiteSpace: 'nowrap',
                        }}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.slice(0, rowLimit).map((row, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : 'rgba(0,107,107,0.03)' }}>
                        {(selectedCols.length ? selectedCols : allCols).map(col => (
                          <td key={col} style={{ padding: '4px 8px', borderBottom: '1px solid rgba(0,0,0,0.05)', color: '#333' }}>
                            {String(row[col] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredRows.length > rowLimit && (
                  <div style={{ fontSize: 10, color: '#aaa', padding: '6px 8px', fontStyle: 'italic' }}>
                    Showing {rowLimit} of {filteredRows.length} selected rows
                  </div>
                )}
                {!allSelected && (
                  <div style={{ fontSize: 10, color: 'var(--teal,#006b6b)', padding: '4px 8px' }}>
                    {excludedRowIndices.size} row{excludedRowIndices.size !== 1 ? 's' : ''} excluded
                  </div>
                )}
              </div>
            )}

            {mode === 'pivotTable' && (
              <div style={{ overflow: 'auto', flex: 1 }}>
                {xField ? (
                  pivotData.rows.length > 0 ? (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', padding: '5px 8px', background: 'var(--teal,#006b6b)', color: '#fff', fontWeight: 600, fontSize: 10, whiteSpace: 'nowrap' }}>
                            {xField}
                          </th>
                          {pivotData.colKeys.map(ck => (
                            <th key={ck} style={{ textAlign: 'right', padding: '5px 8px', background: 'var(--teal,#006b6b)', color: '#fff', fontWeight: 600, fontSize: 10, whiteSpace: 'nowrap' }}>
                              {ck === 'value' ? (yField || 'Count') : ck}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pivotData.rows.map((r, i) => (
                          <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : 'rgba(0,107,107,0.03)' }}>
                            <td style={{ padding: '4px 8px', borderBottom: '1px solid rgba(0,0,0,0.05)', color: '#333', fontWeight: 500 }}>
                              {r.rowKey}
                            </td>
                            {pivotData.colKeys.map(ck => (
                              <td key={ck} style={{ padding: '4px 8px', borderBottom: '1px solid rgba(0,0,0,0.05)', color: '#555', textAlign: 'right' }}>
                                {r.values[ck] != null ? Number(r.values[ck]).toLocaleString() : '—'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 150, color: '#aaa', fontSize: 12 }}>
                      No data to aggregate
                    </div>
                  )
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 150, color: '#aaa', fontSize: 12 }}>
                    Select a Group by field to preview
                  </div>
                )}
              </div>
            )}

            {mode === 'chart' && (
              <div style={{ flex: 1, minHeight: 280 }}>
                {xField ? (
                  <PivotChart pivotData={pivotData} config={pivotConfig} />
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#aaa', fontSize: 12 }}>
                    Select an X axis to preview the chart
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          gap: 10, padding: '12px 20px', borderTop: '1px solid rgba(0,0,0,0.09)',
          flexShrink: 0,
        }}>
          <button
            onClick={onDismiss}
            style={{
              background: 'none', border: '1px solid rgba(0,0,0,0.18)', borderRadius: 3,
              padding: '7px 18px', fontSize: 12, cursor: 'pointer', color: '#555',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            style={{
              background: 'var(--teal, #006b6b)', color: '#fff', border: 'none',
              borderRadius: 3, padding: '7px 20px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Place in slide →
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 600,
  color: '#888', textTransform: 'uppercase',
  letterSpacing: '0.06em', marginBottom: 5,
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 8px', fontSize: 12,
  border: '1px solid rgba(0,0,0,0.15)', borderRadius: 3,
  background: '#fff', color: 'var(--ink, #1a1d20)',
  boxSizing: 'border-box', outline: 'none',
};

const miniBtn: React.CSSProperties = {
  fontSize: 9, fontWeight: 600, padding: '2px 7px',
  border: '1px solid rgba(0,0,0,0.18)', borderRadius: 2,
  background: '#fff', cursor: 'pointer', color: '#555',
};
