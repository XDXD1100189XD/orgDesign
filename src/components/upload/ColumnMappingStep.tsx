"use client";

import { useState } from "react";
import { FIELD_GROUPS, REQUIRED_FIELDS } from "@/lib/fieldDictionary";
import type { ColumnMapping, CanonicalField } from "@/lib/fieldDictionary";
import styles from "./ColumnMappingStep.module.css";

interface Props {
  headers: string[];
  sourceHeaders?: string[];
  derivedHeaders?: string[];
  mapping: ColumnMapping;
  onConfirm: (mapping: ColumnMapping) => void;
  onBack: () => void;
}

export default function ColumnMappingStep({ headers, sourceHeaders, derivedHeaders, mapping, onConfirm, onBack }: Props) {
  const [draft, setDraft] = useState<ColumnMapping>(() => ({ ...mapping }));
  const groupedHeaders = !!sourceHeaders || !!derivedHeaders;
  const source = sourceHeaders ?? headers;
  const derived = derivedHeaders ?? [];

  const updateField = (field: CanonicalField, col: string | null) => {
    setDraft(prev => ({
      ...prev,
      [field]: {
        column:     col,
        confidence: col && col === mapping[field].column ? mapping[field].confidence : col ? 1 : 0,
        isManual:   col !== mapping[field].column,
      },
    }));
  };

  const missingRequired = REQUIRED_FIELDS.filter(f => !draft[f].column);
  const canConfirm = missingRequired.length === 0;

  return (
    <div className={styles.wrap}>
      <div className={styles.hero}>
        <div className={styles.diamond} />
        <p className={styles.kicker}>Step 02 · Map Columns</p>
        <h2>Review the<br /><em>column mapping.</em></h2>
      </div>

      <div className={styles.body}>
        <p className={styles.help}>
          We matched your Excel columns to the data model using fuzzy search.
          Review and adjust below — required fields must be mapped to continue.
        </p>

        {missingRequired.length > 0 && (
          <div className={styles.warning}>
            Required: <b>{missingRequired.join(" · ")}</b> must be mapped to build the hierarchy.
          </div>
        )}

        <div className={styles.groups}>
          {FIELD_GROUPS.map(group => (
            <div key={group.label} className={styles.group}>
              <div className={styles.groupLabel}>{group.label}</div>
              {group.fields.map(field => {
                const entry = draft[field];
                const isRequired = REQUIRED_FIELDS.includes(field as CanonicalField);
                const isMissing  = isRequired && !entry.column;
                return (
                  <div key={field} className={`${styles.row} ${isMissing ? styles.rowMissing : ""}`}>
                    <div className={styles.fieldName}>
                      {field}
                      {isRequired && <span className={styles.reqBadge}>REQ</span>}
                    </div>
                    <select
                      className={styles.select}
                      value={entry.column ?? ""}
                      onChange={e => updateField(field as CanonicalField, e.target.value || null)}
                    >
                      <option value="">— None —</option>
                      {groupedHeaders ? (
                        <>
                          {source.length > 0 && (
                            <optgroup label="Source">
                              {source.map(h => (
                                <option key={h} value={h}>{h}</option>
                              ))}
                            </optgroup>
                          )}
                          {derived.length > 0 && (
                            <optgroup label="Derived">
                              {derived.map(h => (
                                <option key={h} value={h}>{h}</option>
                              ))}
                            </optgroup>
                          )}
                        </>
                      ) : headers.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                    <ConfBadge
                      confidence={entry.column ? entry.confidence : 0}
                      isManual={entry.isManual}
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className={styles.actions}>
          <button className={styles.backBtn} onClick={onBack}>← Back</button>
          <button
            className={styles.confirmBtn}
            disabled={!canConfirm}
            onClick={() => onConfirm(draft)}
          >
            Confirm &amp; Build →
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfBadge({ confidence, isManual }: { confidence: number; isManual: boolean }) {
  if (confidence === 0) return <div className={`${styles.conf} ${styles.confNone}`}>None</div>;
  if (isManual)        return <div className={`${styles.conf} ${styles.confHigh}`}>Manual</div>;
  const pct = Math.round(confidence * 100);
  const cls  = pct >= 80 ? styles.confHigh : pct >= 50 ? styles.confMid : styles.confLow;
  return <div className={`${styles.conf} ${cls}`}>{pct}%</div>;
}
