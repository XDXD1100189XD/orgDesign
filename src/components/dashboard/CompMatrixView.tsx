"use client";

import { useState } from "react";
import type { DashboardData, CompMatrix } from "@/lib/types";
import styles from "./CompMatrixView.module.css";

interface Props {
  data: DashboardData;
  onDataChange: (d: DashboardData) => void;
}

interface MatrixRow {
  grade: string;
  geo: string;
  min: number;
  max: number;
  currency: string;
}

function flattenMatrix(m: CompMatrix): MatrixRow[] {
  const rows: MatrixRow[] = [];
  Object.entries(m).forEach(([grade, geos]) => {
    if (!geos) return;
    Object.entries(geos).forEach(([geo, band]) => {
      if (!band) return;
      rows.push({ grade, geo, min: band.min, max: band.max, currency: band.currency });
    });
  });
  return rows.sort((a, b) => a.grade.localeCompare(b.grade) || a.geo.localeCompare(b.geo));
}

export default function CompMatrixView({ data, onDataChange }: Props) {
  const matrix = data.compMatrix ?? {};
  const rows = flattenMatrix(matrix);

  const [grade, setGrade] = useState("");
  const [geo, setGeo] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [error, setError] = useState("");

  const knownGrades = [
    ...new Set(
      Object.values(data.vertices)
        .map((v) => v.grade)
        .filter((g): g is string => !!g),
    ),
  ].sort();

  const minN = Number(min);
  const maxN = Number(max);
  const canAdd =
    grade.trim() && geo.trim() && min.trim() && max.trim() && currency.trim() &&
    !isNaN(minN) && !isNaN(maxN) && minN > 0 && maxN > minN;

  const handleAdd = () => {
    const g = grade.trim();
    const g2 = geo.trim();
    if (matrix[g]?.[g2]) {
      setError(`Band for ${g} × ${g2} already exists. Delete it first.`);
      return;
    }
    const newMatrix: CompMatrix = {
      ...matrix,
      [g]: { ...(matrix[g] ?? {}), [g2]: { min: minN, max: maxN, currency: currency.trim() } },
    };
    onDataChange({ ...data, compMatrix: newMatrix });
    setGrade(""); setGeo(""); setMin(""); setMax(""); setCurrency("USD"); setError("");
  };

  const handleDelete = (g: string, g2: string) => {
    const geos = { ...(matrix[g] ?? {}) };
    delete geos[g2];
    const newMatrix: CompMatrix = { ...matrix };
    if (Object.keys(geos).length === 0) {
      delete newMatrix[g];
    } else {
      newMatrix[g] = geos;
    }
    onDataChange({ ...data, compMatrix: newMatrix });
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Compensation Bands</h2>
          <p className={styles.desc}>
            Define expected comp ranges by grade × geography. Used as the reference when roles are opened,
            filled, or transitioned to a different location. Changes here do not retroactively alter
            transition records — those are snapshots of the band at the time of change.
          </p>
        </div>
        <span className={styles.count}>
          {rows.length} {rows.length === 1 ? "band" : "bands"}
        </span>
      </div>

      {rows.length > 0 ? (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Grade</th>
              <th>Geography</th>
              <th className={styles.numHead}>Min</th>
              <th className={styles.numHead}>Max</th>
              <th>Currency</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.grade}|${r.geo}`}>
                <td><span className={styles.gradeBadge}>{r.grade}</span></td>
                <td>{r.geo}</td>
                <td className={styles.numCell}>{r.min.toLocaleString()}</td>
                <td className={styles.numCell}>{r.max.toLocaleString()}</td>
                <td>{r.currency}</td>
                <td>
                  <button
                    className={styles.delRowBtn}
                    onClick={() => handleDelete(r.grade, r.geo)}
                    title="Delete band"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className={styles.empty}>No bands defined yet — add one below.</div>
      )}

      <div className={styles.addSection}>
        <h3 className={styles.addTitle}>Add Band</h3>
        {error && <p className={styles.addError}>{error}</p>}
        <div className={styles.addRow}>
          <div className={styles.addField}>
            <label className={styles.addLabel}>
              Grade <span className={styles.req}>*</span>
            </label>
            <input
              className={styles.addInput}
              placeholder="e.g. L5"
              value={grade}
              onChange={(e) => { setGrade(e.target.value); setError(""); }}
              list="cmp-grade-list"
            />
            <datalist id="cmp-grade-list">
              {knownGrades.map((g) => <option key={g} value={g} />)}
            </datalist>
          </div>
          <div className={styles.addField}>
            <label className={styles.addLabel}>
              Geography <span className={styles.req}>*</span>
            </label>
            <input
              className={styles.addInput}
              placeholder="e.g. IN-GCC, US, UK"
              value={geo}
              onChange={(e) => { setGeo(e.target.value); setError(""); }}
            />
          </div>
          <div className={styles.addField}>
            <label className={styles.addLabel}>
              Min <span className={styles.req}>*</span>
            </label>
            <input
              className={styles.addInput}
              type="number"
              placeholder="e.g. 80000"
              value={min}
              onChange={(e) => setMin(e.target.value)}
            />
          </div>
          <div className={styles.addField}>
            <label className={styles.addLabel}>
              Max <span className={styles.req}>*</span>
            </label>
            <input
              className={styles.addInput}
              type="number"
              placeholder="e.g. 120000"
              value={max}
              onChange={(e) => setMax(e.target.value)}
            />
          </div>
          <div className={styles.addField}>
            <label className={styles.addLabel}>
              Currency <span className={styles.req}>*</span>
            </label>
            <input
              className={styles.addInput}
              placeholder="USD"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              list="cmp-currency-list"
            />
            <datalist id="cmp-currency-list">
              {["USD", "INR", "GBP", "EUR", "AED", "SGD"].map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div className={styles.addField} style={{ justifyContent: "flex-end" }}>
            <label className={styles.addLabel}>&nbsp;</label>
            <button className={styles.addBtn} disabled={!canAdd} onClick={handleAdd}>
              + Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
