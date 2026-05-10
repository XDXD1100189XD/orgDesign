'use client';

import { useEffect, useState } from 'react';
import { parseExcelFile } from '@/lib/parseExcel';
import styles from './DataReadinessView.module.css';

interface MissingRow {
  rowIndex: number;
  rowData: Record<string, string | number | boolean | null>;
  missingColumns: string[];
}

interface ColumnReport {
  name: string;
  totalMissing: number;
  missingRows: MissingRow[];
}

interface Props {
  file: File;
  onNavigateToEmployee?: (rowId: string) => void;
}

function isMissing(v: string | number | boolean | null | undefined): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

export default function DataReadinessView({ file, onNavigateToEmployee }: Props) {
  const [columns, setColumns] = useState<ColumnReport[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCol, setExpandedCol] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setColumns([]);
    setExpandedCol(null);

    parseExcelFile(file)
      .then((rows) => {
        setTotalRows(rows.length);
        if (rows.length === 0) { setColumns([]); setLoading(false); return; }

        const headers = Object.keys(rows[0]);
        const colMap: Record<string, ColumnReport> = {};
        headers.forEach((h) => { colMap[h] = { name: h, totalMissing: 0, missingRows: [] }; });

        rows.forEach((row, idx) => {
          const missingCols = headers.filter((h) => isMissing(row[h]));
          if (missingCols.length > 0) {
            const entry: MissingRow = { rowIndex: idx + 2, rowData: row, missingColumns: missingCols };
            missingCols.forEach((col) => {
              colMap[col].totalMissing++;
              colMap[col].missingRows.push(entry);
            });
          }
        });

        setColumns(Object.values(colMap));
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to parse file.');
        setLoading(false);
      });
  }, [file]);

  const completeColumns = columns.filter((c) => c.totalMissing === 0);
  const incompleteColumns = columns.filter((c) => c.totalMissing > 0).sort((a, b) => b.totalMissing - a.totalMissing);
  const totalMissingCells = incompleteColumns.reduce((s, c) => s + c.totalMissing, 0);
  const totalCells = totalRows * columns.length;
  const completenessNum = totalCells > 0 ? ((totalCells - totalMissingCells) / totalCells) * 100 : 100;
  const completeness = completenessNum.toFixed(1);

  const ext = file.name.split('.').pop()?.toUpperCase() ?? 'FILE';

  if (loading) {
    return (
      <div className={styles.centerState}>
        <div className={styles.drSpinner} />
        <p className={styles.stateText}>Scanning <strong>{file.name}</strong> for missing values…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorBox}>
        <span className={styles.errorIcon}>!</span>
        <div>
          <strong>Could not parse file.</strong>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>

      {/* ── File badge ── */}
      <div className={styles.fileBadge}>
        <span className={styles.fileExt}>{ext}</span>
        <span className={styles.fileName}>{file.name}</span>
        <span className={styles.fileRows}>{totalRows.toLocaleString()} rows · {columns.length} columns</span>
      </div>

      {/* ── Health bar ── */}
      <div className={styles.healthWrap}>
        <div className={styles.healthLabel}>
          <span>Data completeness</span>
          <span className={completenessNum >= 95 ? styles.pctGood : completenessNum >= 75 ? styles.pctWarn : styles.pctBad}>
            {completeness}%
          </span>
        </div>
        <div className={styles.healthTrack}>
          <div
            className={`${styles.healthFill} ${completenessNum >= 95 ? styles.fillGood : completenessNum >= 75 ? styles.fillWarn : styles.fillBad}`}
            style={{ width: `${completeness}%` }}
          />
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className={styles.stats}>
        {[
          { label: 'Total rows', val: totalRows.toLocaleString(), accent: false },
          { label: 'Columns', val: columns.length, accent: false },
          { label: 'Missing cells', val: totalMissingCells.toLocaleString(), accent: totalMissingCells > 0 },
          { label: 'Affected columns', val: incompleteColumns.length, accent: incompleteColumns.length > 0 },
          { label: 'Clean columns', val: completeColumns.length, accent: false, green: true },
        ].map((s) => (
          <div key={s.label} className={styles.statCard}>
            <div className={`${styles.statVal} ${s.accent ? styles.statRed : s.green ? styles.statGreen : ''}`}>
              {s.val}
            </div>
            <div className={styles.statLabel}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── All clean ── */}
      {incompleteColumns.length === 0 ? (
        <div className={styles.allGood}>
          <div className={styles.allGoodIcon}>✓</div>
          <div className={styles.allGoodText}>All {columns.length} columns are fully populated</div>
          <div className={styles.allGoodSub}>No missing values detected in {file.name}</div>
        </div>
      ) : (
        <>
          <div className={styles.sectionRow}>
            <h3 className={styles.sectionHead}>Columns with missing values</h3>
            <span className={styles.sectionCount}>{incompleteColumns.length} of {columns.length} columns affected</span>
          </div>

          <div className={styles.colTable}>
            {/* header */}
            <div className={styles.colHeader}>
              <div className={styles.ch} style={{ flex: 3 }}>Column</div>
              <div className={styles.ch}>Missing</div>
              <div className={styles.ch} style={{ flex: 2 }}>Coverage</div>
              <div className={styles.ch} style={{ minWidth: 120 }} />
            </div>

            {incompleteColumns.map((col) => {
              const pct = (col.totalMissing / totalRows) * 100;
              const fillPct = 100 - pct;
              return (
                <div key={col.name} className={styles.colBlock}>
                  <div className={styles.colRow}>
                    <div className={styles.colName} style={{ flex: 3 }}>
                      {col.name}
                    </div>
                    <div className={styles.colMissing}>
                      <span className={styles.missingBadge}>{col.totalMissing}</span>
                      <span className={styles.missingPct}>{pct.toFixed(1)}%</span>
                    </div>
                    <div className={styles.colBar} style={{ flex: 2 }}>
                      <div className={styles.miniTrack}>
                        <div
                          className={`${styles.miniFill} ${fillPct < 75 ? styles.miniBad : fillPct < 95 ? styles.miniWarn : styles.miniGood}`}
                          style={{ width: `${fillPct}%` }}
                        />
                      </div>
                      <span className={styles.miniPct}>{fillPct.toFixed(0)}% filled</span>
                    </div>
                    <div style={{ minWidth: 120, display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        className={`${styles.expandBtn} ${expandedCol === col.name ? styles.expandBtnActive : ''}`}
                        onClick={() => {
                          setExpandedCol(expandedCol === col.name ? null : col.name);
                        }}
                      >
                        {expandedCol === col.name ? '▲ Hide' : '▼ View rows'}
                      </button>
                    </div>
                  </div>

                  {expandedCol === col.name && (
                    <div className={styles.rowsPanel}>
                      <div className={styles.rowsPanelHead}>
                        {col.totalMissing} row{col.totalMissing !== 1 ? 's' : ''} missing <em>{col.name}</em>
                      </div>
                      <div className={styles.rowsList}>
                        {col.missingRows.map((mr) => (
                            <div key={mr.rowIndex} className={styles.rowEntry}>
                              <span className={styles.rowNum}>Row {mr.rowIndex}</span>
                              <span className={styles.rowGaps}>
                                {mr.missingColumns.map((mc) => (
                                  <span key={mc} className={styles.gapTag}>{mc}</span>
                                ))}
                              </span>
                              <button
                                className={styles.reviewBtn}
                                onClick={() => onNavigateToEmployee?.(String(mr.rowIndex - 2))}
                              >
                                Review →
                              </button>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Clean columns ── */}
      {completeColumns.length > 0 && (
        <div className={styles.cleanSection}>
          <span className={styles.cleanLabel}>Complete columns</span>
          <div className={styles.cleanTags}>
            {completeColumns.map((c) => (
              <span key={c.name} className={styles.cleanTag}>{c.name}</span>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
