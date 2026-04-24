"use client";

import { useState, useRef, useCallback } from "react";
import type { DashboardData } from "@/lib/types";
import UploadModal from "@/components/upload/UploadModal";
import SummaryView from "@/components/dashboard/SummaryView";
import HierarchyView from "@/components/dashboard/HierarchyView";
import TableView from "@/components/dashboard/TableView";
import styles from "./page.module.css";

type Tab = "summary" | "tree" | "table";

const TABS: { key: Tab; num: string; label: string }[] = [
  { key: "summary", num: "01", label: "Summary" },
  { key: "tree", num: "02", label: "Hierarchy" },
  { key: "table", num: "03", label: "Employees" },
];

export default function HomePage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("summary");
  const [downloading, setDownloading] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);

  const handleDataReady = useCallback((d: DashboardData) => {
    setData(d);
    setActiveTab("summary");
  }, []);

  const handleDataChange = useCallback((d: DashboardData) => {
    setData(d);
  }, []);

  const handleDownload = async () => {
    return;
  };

  if (!data) {
    return (
      <>
        <div
          className={styles.shell}
          style={{ filter: "blur(8px)", pointerEvents: "none" }}
        >
          <ShellSkeleton />
        </div>
        <UploadModal onDataReady={handleDataReady} />
      </>
    );
  }

  return (
    <div className={styles.shell} ref={shellRef}>
      <header className={styles.header}>
        <div className={styles.brandmark}>
          <div className={styles.bar} />
          <div className={styles.brandName}>Org Analytics · Menu Tech</div>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.crumbs}>
            Portfolio <b>· Item Vista</b>
          </div>
          <button
            className={`${styles.downloadBtn} ${downloading ? styles.spinning : ""}`}
            onClick={handleDownload}
            disabled={downloading}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {downloading ? "Preparing…" : "Download PDF"}
          </button>
        </div>
      </header>

      <h1 className={styles.title}>
        Org design <em>by the numbers</em>
      </h1>
      <p className={styles.subtitle}>
        A snapshot of the Menu Data (Item Vista) portfolio — headcount, span,
        depth, and distribution — rendered from the latest resolved hierarchy
        graph.
      </p>

      <nav className={styles.tabs}>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`${styles.tab} ${activeTab === t.key ? styles.tabActive : ""}`}
            onClick={() => setActiveTab(t.key)}
          >
            <span className={styles.tabNum}>{t.num}</span>
            {t.label}
          </button>
        ))}
      </nav>

      <div
        data-view="summary"
        style={{ display: activeTab === "summary" ? "block" : "none" }}
      >
        <SummaryView data={data} />
      </div>
      <div
        data-view="tree"
        data-export-title="Hierarchy Tree"
        style={{ display: activeTab === "tree" ? "block" : "none" }}
      >
        <HierarchyView data={data} onDataChange={handleDataChange} />
      </div>
      <div
        data-view="table"
        data-export-title="Employee Directory"
        style={{ display: activeTab === "table" ? "block" : "none" }}
      >
        <TableView data={data} />
      </div>

      <footer className={styles.footer}>
        <div>Confidential · Internal Analytics · 2026</div>
        <div>menu-tech / item-vista · snapshot.v1</div>
      </footer>
    </div>
  );
}

function ShellSkeleton() {
  return (
    <>
      <header className={styles.header}>
        <div className={styles.brandmark}>
          <div className={styles.bar} />
          <div className={styles.brandName}>Org Analytics · Menu Tech</div>
        </div>
      </header>
      <h1 className={styles.title}>
        Org design <em>by the numbers</em>
      </h1>
      <p className={styles.subtitle}>Upload an org chart to get started.</p>
    </>
  );
}
