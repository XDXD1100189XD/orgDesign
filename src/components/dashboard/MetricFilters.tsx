"use client";

import { useState } from "react";
import type { MetricFilter, FilterOperator } from "@/lib/types";
import styles from "./MetricFilters.module.css";

const METRICS = [
  { key: "span", label: "Span of Control" },
  { key: "depth", label: "Org Level (Depth)" },
  { key: "open_role", label: "Position Status" },
];

const OPERATORS: { key: FilterOperator; label: string; symbol: string }[] = [
  { key: "any", label: "Any", symbol: "∗" },
  { key: "eq", label: "Equals", symbol: "=" },
  { key: "lt", label: "Less than", symbol: "<" },
  { key: "gt", label: "Greater than", symbol: ">" },
  { key: "between", label: "Between", symbol: "↔" },
];

interface Props {
  filters: MetricFilter[];
  onChange: (filters: MetricFilter[]) => void;
}

export default function MetricFilters({ filters, onChange }: Props) {
  const [expanded, setExpanded] = useState(false);

  const activeCount = filters.filter((f) => f.operator !== "any").length;

  const updateFilter = (metric: string, patch: Partial<MetricFilter>) => {
    const next = filters.map((f) =>
      f.metric === metric ? { ...f, ...patch } : f,
    );
    // If metric doesn't exist yet, add it
    if (!next.find((f) => f.metric === metric)) {
      next.push({ metric, operator: "any", value: 0, ...patch });
    }
    onChange(next);
  };

  const clearAll = () => {
    onChange(
      METRICS.map((m) => ({
        metric: m.key,
        operator: "any" as FilterOperator,
        value: 0,
      })),
    );
  };

  return (
    <div className={styles.wrap}>
      <button
        className={`${styles.toggle} ${expanded ? styles.toggleOpen : ""}`}
        onClick={() => setExpanded(!expanded)}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
        <span>Metric Filters</span>
        {activeCount > 0 && <span className={styles.badge}>{activeCount}</span>}
      </button>

      {expanded && (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>Filter by metrics</span>
            {activeCount > 0 && (
              <button className={styles.clearBtn} onClick={clearAll}>
                Clear all
              </button>
            )}
          </div>

          <div className={styles.filterGrid}>
            {METRICS.map((m) => {
              const f = filters.find((x) => x.metric === m.key) || {
                metric: m.key,
                operator: "any" as FilterOperator,
                value: 0,
              };
              if (m.key === "open_role") {
                return (
                  <div key={m.key} className={styles.filterRow}>
                    <div className={styles.metricLabel}>{m.label}</div>
                    <div className={styles.statusGroup}>
                      <button
                        className={`${styles.statusBtn} ${f.operator === "eq" && f.value === 1 ? styles.statusBtnActive : ""}`}
                        onClick={() => {
                          if (f.operator === "eq" && f.value === 1) {
                            updateFilter(m.key, { operator: "any", value: 0 });
                          } else {
                            updateFilter(m.key, { operator: "eq", value: 1 });
                          }
                        }}
                      >
                        Open
                      </button>
                      <button
                        className={`${styles.statusBtn} ${f.operator === "eq" && f.value === 0 ? styles.statusBtnActive : ""}`}
                        onClick={() => {
                          if (f.operator === "eq" && f.value === 0) {
                            updateFilter(m.key, { operator: "any", value: 0 });
                          } else {
                            updateFilter(m.key, { operator: "eq", value: 0 });
                          }
                        }}
                      >
                        Filled
                      </button>
                    </div>
                  </div>
                );
              }
              return (
                <div key={m.key} className={styles.filterRow}>
                  <div className={styles.metricLabel}>{m.label}</div>

                  <div className={styles.opGroup}>
                    {OPERATORS.map((op) => (
                      <button
                        key={op.key}
                        className={`${styles.opBtn} ${f.operator === op.key ? styles.opBtnActive : ""}`}
                        onClick={() =>
                          updateFilter(m.key, { operator: op.key })
                        }
                        title={op.label}
                      >
                        {op.symbol}
                      </button>
                    ))}
                  </div>

                  {f.operator !== "any" && (
                    <div className={styles.valueInputs}>
                      <input
                        type="number"
                        min={0}
                        className={styles.numInput}
                        placeholder={f.operator === "between" ? "Min" : "Value"}
                        value={f.value || ""}
                        onChange={(e) =>
                          updateFilter(m.key, { value: Number(e.target.value) })
                        }
                      />
                      {f.operator === "between" && (
                        <>
                          <span className={styles.toLabel}>to</span>
                          <input
                            type="number"
                            min={0}
                            className={styles.numInput}
                            placeholder="Max"
                            value={f.valueTo || ""}
                            onChange={(e) =>
                              updateFilter(m.key, {
                                valueTo: Number(e.target.value),
                              })
                            }
                          />
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** Apply metric filters to table rows. Pure function, used by TableView. */
export function applyMetricFilters(rows: any, filters: MetricFilter[]) {
  return rows.filter((row: any) => {
    return filters.every((f) => {
      if (f.operator === "any") return true;
      const val = f.metric === 'open_role' ? (row.open_role ? 1 : 0) : (row[f.metric] ?? 0);
      switch (f.operator) {
        case "eq":
          return val === f.value;
        case "lt":
          return val < f.value;
        case "gt":
          return val > f.value;
        case "between":
          return val >= f.value && val <= (f.valueTo ?? f.value);
        default:
          return true;
      }
    });
  });
}
