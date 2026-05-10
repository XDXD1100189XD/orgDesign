"use client";

import { useState } from "react";
import type { ChangeRecord } from "@/lib/changeManagement";
import styles from "./ChangeManagementDrawer.module.css";

interface Props {
  changes: ChangeRecord[];
  onClose: () => void;
  onRevert: (change: ChangeRecord) => void;
}

function scopeLabel(scope: ChangeRecord["scope"]): string {
  if (scope === "as-is") return "As-Is";
  if (scope === "to-be") return "To-Be";
  if (scope === "compensation") return "Comp";
  if (scope === "mapping") return "Mapping";
  if (scope === "rows") return "Rows";
  return "Session";
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatDelta(n: number): string {
  if (n === 0) return "0";
  return n > 0 ? `+${n}` : String(n);
}

export default function ChangeManagementDrawer({ changes, onClose, onRevert }: Props) {
  const [pendingRevert, setPendingRevert] = useState<{ change: ChangeRecord; index: number } | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const latest = changes[changes.length - 1];
  const affectedCount = pendingRevert ? changes.length - pendingRevert.index : 0;

  function closeConfirm() {
    setPendingRevert(null);
    setConfirmText("");
  }

  function commitRevert() {
    if (!pendingRevert || confirmText.trim().toLowerCase() !== "revert") return;
    onRevert(pendingRevert.change);
    closeConfirm();
  }

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <aside className={styles.drawer} aria-label="Change management">
        <div className={styles.header}>
          <div>
            <div className={styles.eyebrow}>Change Management</div>
            <h2 className={styles.title}>Decision trail</h2>
            <p className={styles.subtitle}>
              Changes read from start to finish. The latest item appears at the bottom.
            </p>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close change management">
            x
          </button>
        </div>

        <div className={styles.summaryStrip}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryValue}>{changes.length}</span>
            <span className={styles.summaryLabel}>Total</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryValue}>{latest ? changes.length : 0}</span>
            <span className={styles.summaryLabel}>Latest Item</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryValue}>{latest ? scopeLabel(latest.scope) : "-"}</span>
            <span className={styles.summaryLabel}>Latest Scope</span>
          </div>
        </div>

        <div className={styles.timeline}>
          {changes.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyTitle}>No changes yet</div>
              <p>Upload data or edit the hierarchy to begin the audit trail.</p>
            </div>
          ) : (
            changes.map((change, index) => (
              <article
                key={change.id}
                className={`${styles.item} ${change.reverted ? styles.itemReverted : ""}`}
              >
                <span className={styles.marker} />
                <div className={styles.card}>
                  <div className={styles.metaRow}>
                    <span className={styles.scope}>Item {index + 1} / {scopeLabel(change.scope)} / {change.action}</span>
                    <time className={styles.time} dateTime={change.timestamp}>{formatTime(change.timestamp)}</time>
                  </div>
                  <div className={styles.changeTitle}>{change.title}</div>
                  <p className={styles.summary}>{change.summary}</p>

                  {change.details.length > 0 && (
                    <ul className={styles.details}>
                      {change.details.slice(0, 6).map((detail, index) => (
                        <li key={index} className={styles.detail}>{detail}</li>
                      ))}
                    </ul>
                  )}

                  {change.impact && (
                    <div className={styles.impact}>
                      <div className={styles.impactBox}>
                        <span className={styles.impactLabel}>Nodes</span>
                        <span className={styles.impactValue}>
                          {change.impact.afterNodes.toLocaleString()} ({formatDelta(change.impact.nodeDelta)})
                        </span>
                      </div>
                      <div className={styles.impactBox}>
                        <span className={styles.impactLabel}>Lines</span>
                        <span className={styles.impactValue}>
                          {change.impact.afterEdges.toLocaleString()} ({formatDelta(change.impact.edgeDelta)})
                        </span>
                      </div>
                    </div>
                  )}

                  <div className={styles.actions}>
                    <span className={styles.actor}>{change.actor}</span>
                    <button
                      className={styles.revertBtn}
                      onClick={() => setPendingRevert({ change, index })}
                      disabled={latest?.id === change.id && change.action === "initialize"}
                    >
                      Revert
                    </button>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </aside>
      {pendingRevert && (
        <div className={styles.confirmOverlay} role="dialog" aria-modal="true" aria-label="Confirm revert">
          <div className={styles.confirmModal}>
            <div className={styles.confirmEyebrow}>Confirm Revert</div>
            <h3 className={styles.confirmTitle}>Revert item {pendingRevert.index + 1}</h3>
            <p className={styles.confirmText}>
              This will restore the dashboard to the state before item {pendingRevert.index + 1}.
              Item {pendingRevert.index + 1}
              {affectedCount > 1 ? ` through item ${changes.length}` : ""} will be removed from the change log.
            </p>
            <p className={styles.confirmWarn}>
              Type <b>revert</b> to confirm.
            </p>
            <input
              className={styles.confirmInput}
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              autoFocus
              placeholder="revert"
            />
            <div className={styles.confirmActions}>
              <button className={styles.cancelRevertBtn} onClick={closeConfirm}>
                Cancel
              </button>
              <button
                className={styles.confirmRevertBtn}
                onClick={commitRevert}
                disabled={confirmText.trim().toLowerCase() !== "revert"}
              >
                Revert {affectedCount} item{affectedCount === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
