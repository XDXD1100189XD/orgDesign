'use client';

import { useState, useMemo } from 'react';
import type { PendingData, ChartBlock, TableBlock } from '@/lib/story/types';
import { validateChartability } from '@/lib/story/chartability';
import { computePivot, CHART_COLORS } from '@/lib/story/pivotUtils';
import type { PivotConfig } from '@/lib/story/pivotUtils';
import { PivotChart } from '@/components/shared/PivotChart';
import type { ChartType, AggFn } from '@/lib/types';

interface Props {
  data: PendingData;
  onConfirm: (block: ChartBlock | TableBlock) => void;
  onDismiss: () => void;
}

type Mode = 'table' | 'chart';

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

  // Chart config
  const [chartType, setChartType] = useState<ChartType>(
    chartability.suggestedTypes[0] ?? 'bar',
  );
  const [xField, setXField] = useState<string>(
    data.pivotConfig?.rowField ?? chartability.recommendedRowField ?? data.columns[0] ?? '',
  );
  const [yField, setYField] = useState<string>(
    data.pivotConfig?.valueField ?? chartability.recommendedValueField ?? '',
  );
  const [aggFn, setAggFn] = useState<AggFn>(
    data.pivotConfig?.aggFn ?? chartability.recommendedAggFn ?? 'count',
  );

  // Live chart preview
  const pivotConfig: PivotConfig = useMemo(() => ({
    rowField: xField || null,
    colField: null,
    valueField: yField || null,
    aggFn,
    chartType,
    palette: CHART_COLORS,
  }), [xField, yField, aggFn, chartType]);

  const pivotData = useMemo(() => {
    if (data.pivotData && mode === 'chart' &&
        xField === (data.pivotConfig?.rowField ?? '') &&
        yField === (data.pivotConfig?.valueField ?? '')) {
      // Use pre-computed pivotData from Analytics Studio
      return data.pivotData;
    }
    return computePivot(data.rows as Parameters<typeof computePivot>[0], pivotConfig);
  }, [data.rows, data.pivotData, data.pivotConfig, pivotConfig, mode, xField, yField]);

  function toggleCol(col: string) {
    setSelectedCols(prev =>
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col],
    );
  }

  function handleConfirm() {
    const now = new Date().toISOString();

    if (mode === 'table') {
      const block: TableBlock = {
        type: 'table',
        id: crypto.randomUUID(),
        title: blockTitle || undefined,
        columns: selectedCols.length ? selectedCols : data.columns,
        rows: data.rows,
        maxDisplayRows: rowLimit,
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
          valueField: yField || undefined,
          aggFn,
          chartType,
          sqlQuery: data.source.label,
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
                {(['table', 'chart'] as Mode[]).map(m => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    style={{
                      flex: 1, padding: '6px 0', fontSize: 12, fontWeight: 600,
                      border: 'none', cursor: 'pointer',
                      background: mode === m ? 'var(--teal, #006b6b)' : '#fff',
                      color: mode === m ? '#fff' : '#666',
                      textTransform: 'capitalize',
                    }}
                  >
                    {m === 'table' ? '⊞ Table' : '▦ Chart'}
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

            {mode === 'table' && (
              <>
                {/* Column selection */}
                <div>
                  <label style={labelStyle}>Columns to show</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 200, overflowY: 'auto' }}>
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
                  <label style={labelStyle}>Max rows</label>
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

            {mode === 'chart' && (
              <>
                {/* X axis */}
                <div>
                  <label style={labelStyle}>X axis (group by)</label>
                  <select value={xField} onChange={e => setXField(e.target.value)} style={inputStyle}>
                    <option value="">— select —</option>
                    {allCols.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                {/* Y axis */}
                <div>
                  <label style={labelStyle}>Y axis (value)</label>
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

                {/* Chart type */}
                <div>
                  <label style={labelStyle}>Chart type</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {(['bar', 'line', 'area', 'pie'] as ChartType[]).map(ct => (
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
                          textTransform: 'capitalize',
                        }}
                      >
                        {ct}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Chartability warnings */}
                {chartability.warnings.length > 0 && (
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
                    {data.rows.slice(0, rowLimit).map((row, i) => (
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
                {data.rows.length > rowLimit && (
                  <div style={{ fontSize: 10, color: '#aaa', padding: '6px 8px', fontStyle: 'italic' }}>
                    Showing {rowLimit} of {data.rows.length} rows
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
