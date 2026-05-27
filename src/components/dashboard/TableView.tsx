"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import type { DashboardData, MetricFilter, FilterOperator } from "@/lib/types";

const INITIAL_METRIC_FILTERS: MetricFilter[] = [
  { metric: "span", operator: "any" as FilterOperator, value: 0 },
  { metric: "depth", operator: "any" as FilterOperator, value: 0 },
  { metric: "open_role", operator: "any" as FilterOperator, value: 0 },
];
import { parseExcelFile } from "@/lib/parseExcel";
import type { ExcelRow } from "@/lib/parseExcel";
import MetricFilters, { applyMetricFilters } from "./MetricFilters";
import styles from "./TableView.module.css";

// ── Types ─────────────────────────────────────────────────────────────────────

type GenRow = Record<string, string | number | boolean | null>;
type SortDir = "asc" | "desc";

interface ColDef {
  key: string;
  label: string;
  type: "string" | "number" | "boolean";
  visible: boolean;
}

interface BulkState {
  col: string;
  value: string;
}

interface Props {
  data: DashboardData;
  file?: File | null;
  jumpToId?: string | null;
  isActive?: boolean;
  onJumpComplete?: () => void;
  externalRows?: ExcelRow[] | null;
  onRowsChange?: (
    rows: ExcelRow[] | null,
    meta?: {
      source: "employees-table";
      action: "cell-edit" | "bulk-edit" | "undo" | "reset";
      label?: string;
    },
  ) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;
const UNDO_LIMIT = 20;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtHeader(k: string): string {
  return k
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_\-\.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function cellStr(v: unknown): string {
  if (v == null) return "";
  return String(v);
}

function inferType(
  rows: GenRow[],
  key: string,
): "string" | "number" | "boolean" {
  for (const r of rows.slice(0, 80)) {
    const v = r[key];
    if (typeof v === "number" && !isNaN(v)) return "number";
    if (typeof v === "boolean") return "boolean";
  }
  return "string";
}

function buildColDefs(rows: GenRow[]): ColDef[] {
  if (!rows.length) return [];
  return Object.keys(rows[0])
    .filter((k) => k !== "_id")
    .map((k) => ({
      key: k,
      label: fmtHeader(k),
      type: inferType(rows, k),
      visible: true,
    }));
}

function buildFromDashboard(data: DashboardData): GenRow[] {
  const { vertices: V, metrics: m } = data;
  return Object.keys(V).map((id) => {
    const v = V[id];
    const mid = m.parent[id];
    const mgr = mid ? V[mid] : null;
    return {
      _id: id,
      name: v.display_name,
      emp_id: v.id ?? "",
      role: v.role,
      grade: v.grade ?? "",
      department: v.dept ?? "",
      manager: mgr ? mgr.display_name : "",
      depth: m.depth[id] ?? 0,
      span: m.span[id] ?? 0,
      open_role: v.open_role,
    };
  });
}

// Merge Excel rows with DashboardData.
// Server guarantees 1-to-1 correspondence: v.id == the employee ID column in Excel.
// We detect the ID column, look up each row in the vertex map, and attach
// depth / span / open_role so MetricFilters always has something to work with.
function mergeExcelWithDashboard(
  excelRows: import("@/lib/parseExcel").ExcelRow[],
  data: DashboardData,
): GenRow[] {
  const { vertices: V, metrics: m } = data;

  // Build lookup: normalised employee-id → computed fields
  const byEmpId = new Map<
    string,
    { depth: number; span: number; open_role: boolean; manager: string }
  >();
  const byName = new Map<
    string,
    { depth: number; span: number; open_role: boolean; manager: string }
  >();

  for (const [vid, v] of Object.entries(V)) {
    const mid = m.parent[vid];
    const mgr = mid ? V[mid] : null;
    const extra = {
      depth: m.depth[vid] ?? 0,
      span: m.span[vid] ?? 0,
      open_role: v.open_role,
      manager: mgr ? mgr.display_name : "",
    };
    if (v.id) byEmpId.set(String(v.id).trim().toLowerCase(), extra);
    if (v.display_name) byName.set(v.display_name.trim().toLowerCase(), extra);
  }

  // Detect which column in the Excel row is the employee ID / name
  const ID_KEYS = [
    "employee_id",
    "emp_id",
    "id",
    "worker_id",
    "staff_id",
    "person_id",
  ];
  const NAME_KEYS = [
    "name",
    "employee_name",
    "full_name",
    "display_name",
    "worker_name",
    "employee",
  ];

  const headers = excelRows.length ? Object.keys(excelRows[0]) : [];
  const idKey = headers.find((h) =>
    ID_KEYS.includes(h.toLowerCase().replace(/[\s_-]/g, "")),
  );
  const nameKey = headers.find((h) =>
    NAME_KEYS.includes(h.toLowerCase().replace(/[\s_-]/g, "")),
  );

  return excelRows.map((row, i) => {
    const idVal = idKey
      ? String(row[idKey] ?? "")
          .trim()
          .toLowerCase()
      : "";
    const nameVal = nameKey
      ? String(row[nameKey] ?? "")
          .trim()
          .toLowerCase()
      : "";

    const match =
      (idVal && byEmpId.get(idVal)) || (nameVal && byName.get(nameVal));

    const merged: GenRow = { _id: String(i), ...(row as GenRow) };
    if (match) {
      merged.depth = match.depth;
      merged.span = match.span;
      merged.open_role = match.open_role;
      // Add manager only if the Excel doesn't already have it
      if (!("manager" in row)) merged.manager = match.manager;
    }
    return merged;
  });
}

function downloadCSV(rows: GenRow[], cols: ColDef[]) {
  const vis = cols.filter((c) => c.visible);
  const head = vis.map((c) => `"${c.label}"`).join(",");
  const body = rows
    .map((r) =>
      vis.map((c) => `"${cellStr(r[c.key]).replace(/"/g, '""')}"`).join(","),
    )
    .join("\n");
  const blob = new Blob([head + "\n" + body], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: "employees.csv",
  });
  a.click();
  URL.revokeObjectURL(url);
}

function pageNums(cur: number, total: number): (number | -1)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const nums: (number | -1)[] = [1];
  if (cur > 3) nums.push(-1);
  for (let p = Math.max(2, cur - 1); p <= Math.min(total - 1, cur + 1); p++)
    nums.push(p);
  if (cur < total - 2) nums.push(-1);
  nums.push(total);
  return nums;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TableView({
  data,
  file,
  jumpToId,
  isActive,
  onJumpComplete,
  externalRows,
  onRowsChange,
}: Props) {
  const [rows, setRows] = useState<GenRow[]>([]);
  const [origRows, setOrigRows] = useState<GenRow[]>([]);
  const [colDefs, setColDefs] = useState<ColDef[]>([]);
  const [colOrder, setColOrder] = useState<string[]>([]);
  const [sort, setSort] = useState<{ key: string; dir: SortDir }>({
    key: "",
    dir: "asc",
  });
  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editCell, setEditCell] = useState<{
    rowId: string;
    col: string;
  } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [undoStack, setUndoStack] = useState<GenRow[][]>([]);
  const [bulk, setBulk] = useState<BulkState | null>(null);
  const [bulkMode, setBulkMode] = useState<"selected" | "filtered">("selected");
  const [showColMenu, setShowColMenu] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(false);
  const [metricFilters, setMetricFilters] = useState<MetricFilter[]>(
    INITIAL_METRIC_FILTERS,
  );
  const [usingExcel, setUsingExcel] = useState(false);

  const [highlightId, setHighlightId] = useState<string | null>(null);

  const dataRef = useRef(data);
  const colMenuRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const jumpRowRef = useRef<HTMLTableRowElement | null>(null);
  const wasDragging = useRef(false);
  const dragKey = useRef<string | null>(null);
  const isJumping = useRef(false);

  dataRef.current = data;

  // ── Load rows ───────────────────────────────────────────────────────────────

  function initRows(r: GenRow[]) {
    setRows(r);
    setOrigRows(r);
    setUndoStack([]);
    setSelected(new Set());
    setColFilters({});
    setSearch("");
    setPage(1);
    setSort({ key: "", dir: "asc" });
    setEditCell(null);
    setMetricFilters(INITIAL_METRIC_FILTERS);
    const defs = buildColDefs(r);
    setColDefs(defs);
    setColOrder(defs.map((d) => d.key));
  }

  useEffect(() => {
    if (file) {
      setLoading(true);
      parseExcelFile(file)
        .then((excelRows) => {
          initRows(mergeExcelWithDashboard(excelRows, dataRef.current));
          setUsingExcel(true);
        })
        .catch(() => {
          initRows(buildFromDashboard(dataRef.current));
          setUsingExcel(false);
        })
        .finally(() => setLoading(false));
    } else {
      initRows(buildFromDashboard(dataRef.current));
      setUsingExcel(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // ── Sync rows when Analytics Studio SQL mutations are applied / reset ────────

  useEffect(() => {
    if (externalRows === undefined) return;
    if (externalRows === null) {
      // reset: reload from file (or dashboard data)
      if (file) {
        setLoading(true);
        parseExcelFile(file)
          .then((raw) => {
            initRows(mergeExcelWithDashboard(raw, dataRef.current));
            setUsingExcel(true);
          })
          .catch(() => {
            initRows(buildFromDashboard(dataRef.current));
            setUsingExcel(false);
          })
          .finally(() => setLoading(false));
      } else {
        initRows(buildFromDashboard(dataRef.current));
        setUsingExcel(false);
      }
    } else {
      initRows(mergeExcelWithDashboard(externalRows, dataRef.current));
      setUsingExcel(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalRows]);

  // ── Click-outside for col menu ───────────────────────────────────────────────

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node))
        setShowColMenu(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // ── Focus edit input ────────────────────────────────────────────────────────

  useEffect(() => {
    if (editCell)
      setTimeout(() => {
        editInputRef.current?.focus();
        editInputRef.current?.select();
      }, 0);
  }, [editCell]);

  // ── Jump to row from Data Readiness ─────────────────────────────────────────

  useEffect(() => {
    if (!jumpToId) return;
    isJumping.current = true;
    setSearch("");
    setColFilters({});
    setSort({ key: "", dir: "asc" });
    setMetricFilters(INITIAL_METRIC_FILTERS);
    const idx = rows.findIndex((r) => r._id === jumpToId);
    if (idx !== -1) {
      setPage(Math.ceil((idx + 1) / PAGE_SIZE));
      setHighlightId(jumpToId);
    }
    onJumpComplete?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpToId]);

  useEffect(() => {
    if (!highlightId || !jumpRowRef.current) return;
    jumpRowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId]);

  useEffect(() => {
    if (!isActive) {
      const t = setTimeout(() => setHighlightId(null), 0);
      return () => clearTimeout(t);
    }
  }, [isActive]);

  // ── Derived: ordered visible cols ───────────────────────────────────────────

  const defMap = useMemo(
    () => Object.fromEntries(colDefs.map((d) => [d.key, d])),
    [colDefs],
  );
  const orderedCols = useMemo(
    () =>
      colOrder.map((k) => defMap[k]).filter((d): d is ColDef => !!d?.visible),
    [colOrder, defMap],
  );

  // ── Derived: filter dropdown options ────────────────────────────────────────

  const filterOpts = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const col of colDefs) {
      if (col.type !== "string") continue;
      const vals = new Set<string>();
      for (const r of rows) {
        const v = cellStr(r[col.key]);
        if (v) vals.add(v);
        if (vals.size > 50) break;
      }
      if (vals.size > 0 && vals.size <= 50) out[col.key] = [...vals].sort();
    }
    return out;
  }, [rows, colDefs]);

  // ── Derived: filtered + sorted rows ─────────────────────────────────────────

  const filteredRows = useMemo(() => {
    let r = rows;

    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter((row) =>
        Object.values(row).some((v) => cellStr(v).toLowerCase().includes(q)),
      );
    }

    for (const [key, val] of Object.entries(colFilters)) {
      if (!val) continue;
      r = r.filter((row) => cellStr(row[key]) === val);
    }

    r = applyMetricFilters(r, metricFilters) as GenRow[];

    if (sort.key) {
      r = [...r].sort((a, b) => {
        const av = a[sort.key],
          bv = b[sort.key];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === "number" && typeof bv === "number")
          return sort.dir === "asc" ? av - bv : bv - av;
        const cmp = cellStr(av).localeCompare(cellStr(bv));
        return sort.dir === "asc" ? cmp : -cmp;
      });
    }
    return r;
  }, [rows, search, colFilters, sort, metricFilters, usingExcel]);

  // ── Derived: validation map ──────────────────────────────────────────────────

  const validMap = useMemo(() => {
    const idKey = colDefs.find((c) =>
      /^(emp_?id|employee_?id|id)$/i.test(c.key),
    )?.key;
    const nameKey = colDefs.find((c) =>
      /^(name|display_?name|employee_?name|full_?name)$/i.test(c.key),
    )?.key;
    const roleKey = colDefs.find((c) =>
      /^(role|title|job_?title|position)$/i.test(c.key),
    )?.key;

    const idCount: Record<string, number> = {};
    if (idKey) {
      for (const r of rows) {
        const v = cellStr(r[idKey]);
        if (v) idCount[v] = (idCount[v] ?? 0) + 1;
      }
    }

    const map: Record<string, string[]> = {};
    for (const r of rows) {
      const id = cellStr(r._id);
      const flags: string[] = [];
      if (nameKey && !cellStr(r[nameKey])) flags.push("Missing name");
      if (roleKey && !cellStr(r[roleKey])) flags.push("Missing role / title");
      if (idKey) {
        const v = cellStr(r[idKey]);
        if (!v) flags.push("Missing ID");
        else if (idCount[v] > 1) flags.push("Duplicate ID");
      }
      if (flags.length) map[id] = flags;
    }
    return map;
  }, [rows, colDefs]);

  // ── Pagination ───────────────────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pagedRows = filteredRows.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  // Reset page when search/filters/sort change, but not when a jump triggered the reset
  useEffect(() => {
    if (isJumping.current) {
      isJumping.current = false;
      return;
    }
    setPage(1);
  }, [search, colFilters, sort]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  function pushUndo(snapshot: GenRow[]) {
    setUndoStack((s) => [snapshot, ...s].slice(0, UNDO_LIMIT));
  }

  function publishRows(
    nextRows: GenRow[],
    action: "cell-edit" | "bulk-edit" | "undo" | "reset",
    label?: string,
  ) {
    if (action === "reset") {
      onRowsChange?.(null, { source: "employees-table", action, label });
      return;
    }
    const cleanRows = nextRows.map(({ _id, ...row }) => row as ExcelRow);
    onRowsChange?.(cleanRows, { source: "employees-table", action, label });
  }

  function undo() {
    if (!undoStack.length) return;
    const nextRows = undoStack[0];
    setRows(nextRows);
    setUndoStack((s) => s.slice(1));
    setSelected(new Set());
    setEditCell(null);
    publishRows(nextRows, "undo", "Undo employee table edit");
  }

  function reset() {
    pushUndo(rows);
    setRows([...origRows]);
    setSelected(new Set());
    setColFilters({});
    setSearch("");
    setPage(1);
    setEditCell(null);
    publishRows(origRows, "reset", "Reset employee table edits");
  }

  function commitEdit() {
    if (!editCell) return;
    pushUndo(rows);
    const label = `Edited ${editCell.col}`;
    const nextRows = rows.map((r) =>
      cellStr(r._id) === editCell.rowId
        ? { ...r, [editCell.col]: editValue }
        : r,
    );
    setRows(nextRows);
    setEditCell(null);
    publishRows(nextRows, "cell-edit", label);
  }

  function applyBulk(mode: "selected" | "filtered") {
    if (!bulk) return;
    pushUndo(rows);
    const ids =
      mode === "selected"
        ? selected
        : new Set(filteredRows.map((r) => cellStr(r._id)));
    const nextRows = rows.map((r) =>
      ids.has(cellStr(r._id)) ? { ...r, [bulk.col]: bulk.value } : r,
    );
    setRows(nextRows);
    setBulk(null);
    if (mode === "selected") setSelected(new Set());
    publishRows(nextRows, "bulk-edit", `Bulk edited ${bulk.col}`);
  }

  function toggleSort(key: string) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
  }

  function toggleColVisible(key: string) {
    setColDefs((prev) =>
      prev.map((d) => (d.key === key ? { ...d, visible: !d.visible } : d)),
    );
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function toggleSelectPage() {
    const allSel = pagedRows.every((r) => selected.has(cellStr(r._id)));
    setSelected((prev) => {
      const n = new Set(prev);
      pagedRows.forEach((r) =>
        allSel ? n.delete(cellStr(r._id)) : n.add(cellStr(r._id)),
      );
      return n;
    });
  }

  // column drag-reorder
  function onThDragStart(key: string) {
    wasDragging.current = false;
    dragKey.current = key;
  }
  function onThDrag() {
    wasDragging.current = true;
  }
  function onThDrop(targetKey: string) {
    const from = dragKey.current;
    if (!from || from === targetKey) return;
    setColOrder((prev) => {
      const n = [...prev];
      const fi = n.indexOf(from);
      const ti = n.indexOf(targetKey);
      if (fi === -1 || ti === -1) return prev;
      n.splice(fi, 1);
      n.splice(ti, 0, from);
      return n;
    });
    dragKey.current = null;
  }
  function onThClick(key: string) {
    if (wasDragging.current) {
      wasDragging.current = false;
      return;
    }
    toggleSort(key);
  }

  // ── Render helpers ───────────────────────────────────────────────────────────

  const activeFilters = Object.values(colFilters).filter(Boolean).length;
  const filterableCols = orderedCols.filter((c) => filterOpts[c.key]);
  const allPageSel =
    pagedRows.length > 0 &&
    pagedRows.every((r) => selected.has(cellStr(r._id)));
  const flagCount = Object.keys(validMap).length;

  // ── Loading state ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={styles.loadingState}>
        <div className={styles.spinner} />
        Parsing file…
      </div>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────────

  return (
    <div className={styles.root}>
      {/* ── Top toolbar ── */}
      <div className={styles.toolbar}>
        {/* Search */}
        <div className={styles.searchWrap}>
          <svg
            className={styles.searchIcon}
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <circle cx="8.5" cy="8.5" r="5.5" />
            <path d="m13.5 13.5 3.5 3.5" />
          </svg>
          <input
            className={styles.searchInput}
            placeholder="Search across all columns…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className={styles.clearX} onClick={() => setSearch("")}>
              ×
            </button>
          )}
        </div>

        <div className={styles.toolbarRight}>
          {/* Filters */}
          <button
            className={`${styles.tbBtn} ${showFilters || activeFilters ? styles.tbBtnOn : ""}`}
            onClick={() => setShowFilters((s) => !s)}
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              width="14"
              height="14"
            >
              <path d="M3 5h14M6 10h8M9 15h2" />
            </svg>
            Filters
            {activeFilters > 0 && (
              <em className={styles.chip}>{activeFilters}</em>
            )}
          </button>

          {/* Columns */}
          <div className={styles.colMenuWrap} ref={colMenuRef}>
            <button
              className={styles.tbBtn}
              onClick={() => setShowColMenu((s) => !s)}
            >
              <svg
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                width="14"
                height="14"
              >
                <rect x="2" y="4" width="16" height="12" rx="1" />
                <line x1="8" y1="4" x2="8" y2="16" />
                <line x1="13" y1="4" x2="13" y2="16" />
              </svg>
              Columns
              <em className={styles.chip}>
                {colDefs.filter((c) => c.visible).length}/{colDefs.length}
              </em>
            </button>
            {showColMenu && (
              <div className={styles.colMenu}>
                <div className={styles.colMenuHead}>Show / Hide Columns</div>
                <div className={styles.colMenuList}>
                  {colOrder.map((key) => {
                    const col = defMap[key];
                    if (!col) return null;
                    return (
                      <label key={key} className={styles.colMenuRow}>
                        <input
                          type="checkbox"
                          checked={col.visible}
                          onChange={() => toggleColVisible(key)}
                        />
                        <span>{col.label}</span>
                      </label>
                    );
                  })}
                </div>
                <div className={styles.colMenuFoot}>
                  <button
                    onClick={() =>
                      setColDefs((d) => d.map((c) => ({ ...c, visible: true })))
                    }
                  >
                    Show all
                  </button>
                  <button
                    onClick={() =>
                      setColDefs((d) =>
                        d.map((c, i) => ({ ...c, visible: i < 6 })),
                      )
                    }
                  >
                    Hide extras
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Undo */}
          <button
            className={styles.tbBtn}
            onClick={undo}
            disabled={!undoStack.length}
            title="Undo"
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              width="14"
              height="14"
            >
              <path d="M4 7H13a4 4 0 0 1 0 8H7" />
              <path d="M7 4 4 7l3 3" />
            </svg>
            Undo
          </button>

          {/* Reset */}
          <button
            className={`${styles.tbBtn} ${styles.tbBtnDanger}`}
            onClick={reset}
            title="Reset all edits"
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              width="14"
              height="14"
            >
              <path d="M3.5 9A7 7 0 1 1 5 14.66" />
              <path d="M3 5v4h4" />
            </svg>
            Reset
          </button>

          {/* Export */}
          <button
            className={`${styles.tbBtn} ${styles.tbBtnPrimary}`}
            onClick={() => downloadCSV(filteredRows, colDefs)}
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              width="14"
              height="14"
            >
              <path d="M10 3v10M6 9l4 4 4-4" />
              <path d="M4 17h12" />
            </svg>
            Export CSV
          </button>
        </div>
      </div>

      {/* ── Filter panel ── */}
      {/* ── Metric filters ── */}
      <MetricFilters filters={metricFilters} onChange={setMetricFilters} />

      {showFilters && (
        <div className={styles.filterPanel}>
          <div className={styles.filterPanelInner}>
            {filterableCols.length === 0 ? (
              <span className={styles.filterEmpty}>
                No categorical columns detected for filtering
              </span>
            ) : (
              filterableCols.map((col) => (
                <div key={col.key} className={styles.filterItem}>
                  <label className={styles.filterLabel}>{col.label}</label>
                  <select
                    className={styles.filterSelect}
                    value={colFilters[col.key] || ""}
                    onChange={(e) =>
                      setColFilters((p) => ({
                        ...p,
                        [col.key]: e.target.value,
                      }))
                    }
                  >
                    <option value="">Any</option>
                    {filterOpts[col.key].map((v) => (
                      <option key={v} value={v}>
                        {v || "(blank)"}
                      </option>
                    ))}
                  </select>
                </div>
              ))
            )}
          </div>
          {activeFilters > 0 && (
            <button
              className={styles.clearFiltersBtn}
              onClick={() => setColFilters({})}
            >
              Clear {activeFilters} filter{activeFilters > 1 ? "s" : ""}
            </button>
          )}
        </div>
      )}

      {/* ── Status / action bar ── */}
      <div className={styles.statusBar}>
        <div className={styles.statusLeft}>
          <span className={styles.rowCount}>
            <b>{filteredRows.length.toLocaleString()}</b> /{" "}
            {rows.length.toLocaleString()} rows
          </span>
          {selected.size > 0 && (
            <span className={styles.selBadge}>{selected.size} selected</span>
          )}
          {flagCount > 0 && (
            <span className={styles.flagBadge}>⚠ {flagCount} rows flagged</span>
          )}
          {undoStack.length > 0 && (
            <span className={styles.editedBadge}>
              ● {undoStack.length} unsaved edit{undoStack.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className={styles.statusRight}>
          {selected.size > 0 && (
            <>
              <button
                className={`${styles.tbBtn} ${styles.tbBtnSmall}`}
                onClick={() => {
                  setBulk({ col: orderedCols[0]?.key ?? "", value: "" });
                  setBulkMode("selected");
                }}
              >
                Bulk edit {selected.size} selected
              </button>
              <button
                className={styles.clearSelBtn}
                onClick={() => setSelected(new Set())}
              >
                Clear selection
              </button>
            </>
          )}
          <button
            className={`${styles.tbBtn} ${styles.tbBtnSmall}`}
            onClick={() => {
              setBulk({ col: orderedCols[0]?.key ?? "", value: "" });
              setBulkMode("filtered");
            }}
          >
            Bulk edit filtered ({filteredRows.length.toLocaleString()})
          </button>
        </div>
      </div>

      {/* ── Bulk edit panel ── */}
      {bulk && (
        <div className={styles.bulkPanel}>
          <span className={styles.bulkLabel}>
            Set for{" "}
            <b>
              {bulkMode === "selected"
                ? `${selected.size} selected`
                : `all ${filteredRows.length.toLocaleString()} filtered`}
            </b>{" "}
            rows:
          </span>
          <select
            className={styles.bulkSelect}
            value={bulk.col}
            onChange={(e) =>
              setBulk((b) => (b ? { ...b, col: e.target.value } : null))
            }
          >
            {orderedCols.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <span className={styles.bulkTo}>→</span>
          <input
            className={styles.bulkInput}
            value={bulk.value}
            onChange={(e) =>
              setBulk((b) => (b ? { ...b, value: e.target.value } : null))
            }
            placeholder="New value…"
            onKeyDown={(e) => e.key === "Enter" && applyBulk(bulkMode)}
            autoFocus
          />
          <button
            className={styles.bulkApply}
            onClick={() => applyBulk(bulkMode)}
          >
            Apply
          </button>
          <button className={styles.bulkCancel} onClick={() => setBulk(null)}>
            Cancel
          </button>
        </div>
      )}

      {/* ── Table ── */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.checkTh}>
                <input
                  type="checkbox"
                  checked={allPageSel}
                  onChange={toggleSelectPage}
                />
              </th>
              <th className={styles.flagTh} title="Row validation status">
                ⚑
              </th>
              {orderedCols.map((col) => (
                <th
                  key={col.key}
                  className={`${styles.th} ${sort.key === col.key ? styles.thSorted : ""}`}
                  draggable
                  onDragStart={() => onThDragStart(col.key)}
                  onDrag={onThDrag}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onThDrop(col.key)}
                  onClick={() => onThClick(col.key)}
                >
                  <span className={styles.thGrip} title="Drag to reorder">
                    ⠿
                  </span>
                  <span className={styles.thLabel}>{col.label}</span>
                  <span className={styles.thSort}>
                    {sort.key === col.key
                      ? sort.dir === "asc"
                        ? " ↑"
                        : " ↓"
                      : ""}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={orderedCols.length + 2}
                  className={styles.emptyRow}
                >
                  No rows match current filters
                </td>
              </tr>
            ) : (
              pagedRows.map((row) => {
                const rowId = cellStr(row._id);
                const isSel = selected.has(rowId);
                const flags = validMap[rowId];
                const isJump = rowId === highlightId;
                return (
                  <tr
                    key={rowId}
                    ref={isJump ? jumpRowRef : null}
                    className={[
                      styles.tr,
                      isSel ? styles.trSel : "",
                      flags ? styles.trFlagged : "",
                      isJump ? styles.jumpHighlight : "",
                    ].join(" ")}
                  >
                    <td className={styles.checkTd}>
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => toggleSelect(rowId)}
                      />
                    </td>
                    <td className={styles.flagTd}>
                      {flags ? (
                        <span
                          className={styles.flagWarn}
                          title={flags.join("\n")}
                        >
                          ⚠
                        </span>
                      ) : (
                        <span className={styles.flagOk}>✓</span>
                      )}
                    </td>
                    {orderedCols.map((col) => {
                      const isEditing =
                        editCell?.rowId === rowId && editCell?.col === col.key;
                      const raw = row[col.key];
                      const display = cellStr(raw);
                      return (
                        <td
                          key={col.key}
                          className={`${styles.td} ${col.type === "number" ? styles.tdNum : ""}`}
                          onClick={() => {
                            if (!isEditing) {
                              setEditCell({ rowId, col: col.key });
                              setEditValue(display);
                            }
                          }}
                        >
                          {isEditing ? (
                            <input
                              ref={editInputRef}
                              className={styles.editInput}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={commitEdit}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitEdit();
                                if (e.key === "Escape") setEditCell(null);
                              }}
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : display ? (
                            <span className={styles.cellText}>{display}</span>
                          ) : (
                            <span className={styles.nullCell}>—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button
            className={styles.pgBtn}
            disabled={page === 1}
            onClick={() => setPage(1)}
          >
            «
          </button>
          <button
            className={styles.pgBtn}
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            ‹
          </button>
          {pageNums(page, totalPages).map((p, i) =>
            p === -1 ? (
              <span key={`e${i}`} className={styles.pgEllipsis}>
                …
              </span>
            ) : (
              <button
                key={p}
                className={`${styles.pgBtn} ${page === p ? styles.pgActive : ""}`}
                onClick={() => setPage(p)}
              >
                {p}
              </button>
            ),
          )}
          <button
            className={styles.pgBtn}
            disabled={page === totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            ›
          </button>
          <button
            className={styles.pgBtn}
            disabled={page === totalPages}
            onClick={() => setPage(totalPages)}
          >
            »
          </button>
          <span className={styles.pgInfo}>
            Page {page} of {totalPages} · rows {(page - 1) * PAGE_SIZE + 1}–
            {Math.min(page * PAGE_SIZE, filteredRows.length)} of{" "}
            {filteredRows.length.toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
}
