"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import {
  computeStateMetrics,
  fmtCost,
  type StateMetrics,
} from "@/lib/computeStateMetrics";
import type { CompMatrix, DashboardData, AIChartRequest } from "@/lib/types";
import type { ColumnMapping } from "@/lib/fieldDictionary";
import type { ExcelRow } from "@/lib/parseExcel";
import UploadModal from "@/components/upload/UploadModal";
import ToBeUploadModal from "@/components/upload/ToBeUploadModal";
import ColumnMappingStep from "@/components/upload/ColumnMappingStep";
import SummaryView from "@/components/dashboard/SummaryView";
import HierarchyView from "@/components/dashboard/HierarchyView";
import DataReadinessView from "@/components/dashboard/DataReadinessView";
import AdvancedAnalyticsView from "@/components/dashboard/AdvancedAnalyticsView";
import CompMatrixView from "@/components/dashboard/CompMatrixView";
import ChangeManagementDrawer from "@/components/dashboard/ChangeManagementDrawer";
import {
  createChangeRecord,
  cloneSnapshot,
  type ChangeRecord,
  type ChangeScope,
} from "@/lib/changeManagement";
import {
  applyOrgMutation,
  cloneOrgDataset,
  createOrgDataset,
  stateHeadersForMapping,
  type EditableOrgStateId,
  type OrgDataset,
  type OrgMutationSource,
} from "@/lib/orgDataset";
import {
  createSnapshotPayload,
  decryptSnapshot,
  encryptSnapshot,
  type OfflineSnapshotPayload,
} from "@/lib/offlineSnapshot";
import {
  NAVIGATION_LOADING_DURATION_MS,
  getNavigationLoadingMessage,
} from "@/lib/navigationLoading";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import {
  applyWorkCapabilityTaxonomyMutation,
  buildWorkCapabilityActivityPortfolio,
  buildActivityAnalysisPortfolio,
  buildSkillsCapabilityPortfolio,
  buildSuccessionPlanningPortfolio,
  buildWorkCapabilityTaxonomyCleanupSuggestions,
  buildWorkCapabilityTaxonomyGraph,
  createWorkCapabilityDataset,
  detectWorkCapabilityDataset,
  getWorkCapabilityArchiveImpact,
  getWorkCapabilityMergeImpact,
  getWorkCapabilityTaxonomyMutationImpact,
  updateWorkCapabilityNormalization,
  validateWorkCapabilityFiles,
  workCapabilityActivityNodeId,
  workCapabilityCategoryNodeId,
  workCapabilityDomainNodeId,
  workCapabilityProcessNodeId,
  type ActivityLibraryRow,
  type ParsedWorkCapabilityFile,
  type TaxonomyMutation,
  type WorkCapabilityActivityMetric,
  type WorkCapabilityActivityPortfolio,
  type ActivityAnalysisPortfolio,
  type ActivityAnalysisActivityMetric,
  type ActivityAnalysisEmployeeMetric,
  type SkillsCapabilityPortfolio,
  type SuccessionCandidateRecord,
  type WorkCapabilityArchiveImpact,
  type WorkCapabilityMergeImpact,
  type WorkCapabilityDataset,
  type WorkCapabilityDatasetType,
  type WorkCapabilityTaxonomyGraphNode,
  type WorkCapabilityTaxonomyMutationImpact,
  type WorkCapabilityValidationSummary,
} from "@/lib/workCapabilityDataset";
import { parseExcelFile } from "@/lib/parseExcel";
import { WC_TABLE_NAMES, computeWcDerived } from "@/lib/wcSqlUtils";
import { Treemap, ResponsiveContainer } from "recharts";
import dynamic from "next/dynamic";
import styles from "./page.module.css";

const TableView = dynamic(() => import("@/components/dashboard/TableView"), {
  ssr: false,
});

const AnalyticsStudioView = dynamic(
  () => import("@/components/dashboard/AnalyticsStudioView"),
  { ssr: false },
);

const AIAssistantView = dynamic(
  () => import("@/components/dashboard/AIAssistantView"),
  { ssr: false },
);

import ActivityAnalysisView from "@/components/dashboard/ActivityAnalysisView";
import SkillsCapabilityView from "@/components/dashboard/SkillsCapabilityView";
import SuccessionPlanningView from "@/components/dashboard/SuccessionPlanningView";
import { StoryView } from "@/components/story/StoryView";
import type { StoryDocument, PendingData } from "@/lib/story/types";

type Tab =
  | "summary"
  | "tree"
  | "table"
  | "readiness"
  | "advanced"
  | "studio"
  | "comp"
  | "workforce-intelligence"
  | "story";
type StateSlice = "as-is" | "to-be";
type CompTarget = StateSlice | "both";
type WorkforceSubTab = "activity-analysis" | "talent-mapping";

const BASE_TABS: { key: Tab; num: string; label: string }[] = [
  { key: "summary", num: "01", label: "Summary" },
  { key: "advanced", num: "02", label: "Advanced Analytics" },
  { key: "studio", num: "03", label: "Analytics Studio" },
  { key: "tree", num: "04", label: "Hierarchy" },
  { key: "table", num: "05", label: "Employees" },
  { key: "workforce-intelligence", num: "09", label: "Workforce Intelligence" },
  { key: "story", num: "13", label: "Story" },
];
const ORG_DATASET_STORAGE_KEY = "org-dashboard:dataset:v1";

const toOrgState = (slice: StateSlice): EditableOrgStateId =>
  slice === "to-be" ? "toBe" : "asIs";
const toSlice = (state: EditableOrgStateId): StateSlice =>
  state === "toBe" ? "to-be" : "as-is";

function labelForSource(source?: string): string {
  return source === "employees-table"
    ? "Employees table"
    : source === "analytics-sql"
      ? "Analytics SQL"
      : source === "analytics-reset"
        ? "Analytics Studio"
        : source === "ai-sql"
          ? "Agentic AI SQL"
          : source === "hierarchy"
            ? "Hierarchy"
            : source === "comp"
              ? "Comp setup"
              : source === "mapping"
                ? "Field mapping"
                : "Employee rows";
}

export default function HomePage() {
  const [dataset, setDataset] = useState<OrgDataset | null>(null);
  // ── As-Is state ──
  const [data, setData] = useState<DashboardData | null>(null);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelRows, setExcelRows] = useState<ExcelRow[] | null>(null);
  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping | null>(
    null,
  );
  const [showRemapping, setShowRemapping] = useState(false);
  const [remapState, setRemapState] = useState<EditableOrgStateId>("asIs");

  // ── To-Be state ──
  const [toBeData, setToBeData] = useState<DashboardData | null>(null);
  const [toBeFile, setToBeFile] = useState<File | null>(null);
  const [showToBeUpload, setShowToBeUpload] = useState(false);

  // ── Studio-mutated rows (shared with Employees tab and AI assistant) ──
  const [asIsMutatedRows, setAsIsMutatedRows] = useState<ExcelRow[] | null>(
    null,
  );
  const [toBeMutatedRows, setToBeMutatedRows] = useState<ExcelRow[] | null>(
    null,
  );

  // ── AI chart request (set by AI assistant, consumed by Analytics Studio) ──
  const [pendingChartRequest, setPendingChartRequest] =
    useState<AIChartRequest | null>(null);

  // Change management state
  const [changeLog, setChangeLog] = useState<ChangeRecord[]>([]);
  const [showChangeDrawer, setShowChangeDrawer] = useState(false);
  const [workCapabilityDataset, setWorkCapabilityDataset] =
    useState<WorkCapabilityDataset | null>(null);
  const [successionCandidates, setSuccessionCandidates] = useState<
    SuccessionCandidateRecord[]
  >([]);

  // ── Graph version — incremented on every row/hierarchy mutation ──
  const [graphVersion, setGraphVersion] = useState(0);

  // ── Story builder ──
  const [storyDoc, setStoryDoc] = useState<StoryDocument | null>(null);
  const [activeSlideId, setActiveSlideId] = useState<string | null>(null);
  const [libraryItems, setLibraryItems] = useState<PendingData[]>([]);
  const [libraryToast, setLibraryToast] = useState<string | null>(null);

  // ── UI state ──
  const [activeTab, setActiveTab] = useState<Tab>("summary");
  const [navigationLoadingMessage, setNavigationLoadingMessage] = useState<
    string | null
  >(null);
  const [showAIFloat, setShowAIFloat] = useState(false);
  const [workforceSubTab, setWorkforceSubTab] =
    useState<WorkforceSubTab>("activity-analysis");
  const [studioSlice, setStudioSlice] = useState<StateSlice>("as-is");
  const [tableSlice, setTableSlice] = useState<StateSlice>("as-is");
  const [compTarget, setCompTarget] = useState<CompTarget>("as-is");
  const [tableJumpId, setTableJumpId] = useState<string | null>(null);
  const [snapshotSourceFiles, setSnapshotSourceFiles] = useState<{
    orgFileName?: string | null;
    toBeFileName?: string | null;
  }>({});
  const shellRef = useRef<HTMLDivElement>(null);
  const navigationLoadingTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const navigationSwitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const TABS = BASE_TABS;

  const syncLegacyFromDataset = useCallback((next: OrgDataset) => {
    setData(next.states.asIs.data);
    setExcelRows(next.baselineRows);
    setExcelHeaders(next.baselineHeaders);
    setColumnMapping(next.states.asIs.mapping);
    setAsIsMutatedRows(next.states.asIs.rows);
    setToBeData(next.states.toBe?.data ?? null);
    setToBeMutatedRows(next.states.toBe?.rows ?? null);
    setChangeLog(next.changeLog);
    setGraphVersion(next.revision);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.removeItem(ORG_DATASET_STORAGE_KEY);
    } catch {
      // Storage access can fail in private mode; uploaded data still lives in memory.
    }
  }, []);

  useEffect(() => {
    return () => {
      if (navigationLoadingTimerRef.current) {
        clearTimeout(navigationLoadingTimerRef.current);
      }
      if (navigationSwitchTimerRef.current) {
        clearTimeout(navigationSwitchTimerRef.current);
      }
    };
  }, []);

  // Register WC tables in alasql as soon as WC data is loaded so run_sql can
  // query them from the AI assistant without requiring a visit to Analytics Studio.
  useEffect(() => {
    if (!workCapabilityDataset) return;
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const alasql = require("alasql") as any;
    for (const tbl of WC_TABLE_NAMES) {
      const rows = computeWcDerived(workCapabilityDataset, tbl);
      alasql(`DROP TABLE IF EXISTS ${tbl}`);
      alasql(`CREATE TABLE ${tbl}`);
      alasql.tables[tbl].data = rows.map((r: Record<string, unknown>) => ({
        ...r,
      }));
    }
  }, [workCapabilityDataset]);

  const commitDataset = useCallback(
    (
      nextBase: OrgDataset,
      meta: {
        scope: ChangeScope;
        action:
          | "initialize"
          | "upload"
          | "copy"
          | "reset"
          | "hierarchy"
          | "metadata"
          | "compensation"
          | "mapping"
          | "rows"
          | "revert";
        title: string;
        summary: string;
        details?: string[];
      },
    ) => {
      const before = dataset ? cloneOrgDataset(dataset) : null;
      const change = createChangeRecord({
        scope: meta.scope,
        action: meta.action,
        title: meta.title,
        summary: meta.summary,
        details: meta.details,
        before: { dataset: before },
        after: { dataset: nextBase },
      });
      const next = { ...nextBase, changeLog: [...nextBase.changeLog, change] };
      setDataset(next);
      syncLegacyFromDataset(next);
    },
    [dataset, syncLegacyFromDataset],
  );

  const appendChange = useCallback((change: ChangeRecord) => {
    setChangeLog((prev) => [...prev, change]);
  }, []);

  const currentSnapshot = useCallback(
    () => ({
      data,
      toBeData,
      columnMapping,
      excelRows,
      studioRows: asIsMutatedRows,
      asIsRows: asIsMutatedRows,
      toBeRows: toBeMutatedRows,
    }),
    [
      asIsMutatedRows,
      columnMapping,
      data,
      excelRows,
      toBeData,
      toBeMutatedRows,
    ],
  );

  const restoreFromOfflineSnapshot = useCallback(
    (snapshot: OfflineSnapshotPayload) => {
      const hasToBe = Boolean(
        snapshot.dataset?.states.toBe ?? snapshot.toBeData,
      );
      const nextStudioSlice =
        snapshot.ui.studioSlice === "to-be" && hasToBe ? "to-be" : "as-is";
      const nextTableSlice =
        snapshot.ui.tableSlice === "to-be" && hasToBe ? "to-be" : "as-is";
      const nextCompTarget =
        snapshot.ui.compTarget === "to-be" && !hasToBe
          ? "as-is"
          : snapshot.ui.compTarget;

      if (snapshot.dataset) {
        setDataset(snapshot.dataset);
        syncLegacyFromDataset(snapshot.dataset);
      } else {
        setDataset(null);
        setData(snapshot.data);
        setToBeData(snapshot.toBeData);
        setExcelRows(snapshot.excelRows);
        setExcelHeaders(snapshot.excelHeaders);
        setColumnMapping(snapshot.columnMapping);
        setAsIsMutatedRows(snapshot.asIsMutatedRows);
        setToBeMutatedRows(snapshot.toBeMutatedRows);
        setChangeLog(snapshot.changeLog);
        setGraphVersion((version) => version + 1);
      }

      setExcelFile(null);
      setToBeFile(null);
      setSnapshotSourceFiles(snapshot.sourceFiles);
      setWorkCapabilityDataset(snapshot.workCapabilityDataset);
      setSuccessionCandidates(snapshot.successionCandidates);
      setStoryDoc(snapshot.storyDoc);
      setActiveSlideId(snapshot.activeSlideId);
      setLibraryItems(snapshot.libraryItems);
      setNavigationLoadingMessage(null);
      setActiveTab(snapshot.ui.activeTab);
      setWorkforceSubTab(snapshot.ui.workforceSubTab);
      setStudioSlice(nextStudioSlice);
      setTableSlice(nextTableSlice);
      setCompTarget(nextCompTarget);
      setShowChangeDrawer(false);
      setShowToBeUpload(false);
      setShowRemapping(false);
      setPendingChartRequest(null);
      setTableJumpId(null);
    },
    [syncLegacyFromDataset],
  );

  const handleLoadSnapshot = useCallback(
    async (file: File, passphrase: string) => {
      const text = await file.text();
      const snapshot = await decryptSnapshot(text, passphrase);
      restoreFromOfflineSnapshot(snapshot);
    },
    [restoreFromOfflineSnapshot],
  );

  const handleSaveSnapshot = useCallback(async () => {
    if (!data && !dataset) return;
    const passphrase = window.prompt(
      "Enter a passphrase for this encrypted snapshot.",
    );
    if (passphrase == null) return;
    if (!passphrase.trim()) {
      window.alert("Snapshot passphrase is required.");
      return;
    }

    try {
      const createdAt = new Date().toISOString();
      const payload = createSnapshotPayload(
        {
          dataset,
          data,
          toBeData,
          columnMapping,
          excelRows,
          excelHeaders,
          asIsMutatedRows,
          toBeMutatedRows,
          changeLog,
          workCapabilityDataset,
          successionCandidates,
          storyDoc,
          activeSlideId,
          libraryItems,
          ui: {
            activeTab,
            workforceSubTab,
            studioSlice,
            tableSlice,
            compTarget,
          },
          sourceFiles: {
            orgFileName:
              excelFile?.name ??
              dataset?.sourceFileName ??
              snapshotSourceFiles.orgFileName ??
              null,
            toBeFileName:
              toBeFile?.name ?? snapshotSourceFiles.toBeFileName ?? null,
          },
        },
        createdAt,
      );
      const encrypted = await encryptSnapshot(payload, passphrase);
      const blob = new Blob([encrypted], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const stamp = createdAt.slice(0, 19).replace(/[:T]/g, "-");
      anchor.href = url;
      anchor.download = `org-dashboard-${stamp}.orgsnap`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "Could not save snapshot.",
      );
    }
  }, [
    activeSlideId,
    activeTab,
    asIsMutatedRows,
    changeLog,
    columnMapping,
    compTarget,
    data,
    dataset,
    excelFile,
    excelHeaders,
    excelRows,
    libraryItems,
    snapshotSourceFiles.orgFileName,
    snapshotSourceFiles.toBeFileName,
    storyDoc,
    studioSlice,
    successionCandidates,
    tableSlice,
    toBeData,
    toBeFile,
    toBeMutatedRows,
    workforceSubTab,
    workCapabilityDataset,
  ]);

  const canBuildFromRows = useCallback(
    (rows: ExcelRow[]) => {
      if (!columnMapping || rows.length === 0) return false;
      const headers = new Set(Object.keys(rows[0]));
      return ["Employee ID", "Manager ID"].every((field) => {
        const mapped = columnMapping[field as keyof ColumnMapping]?.column;
        return !!mapped && headers.has(mapped);
      });
    },
    [columnMapping],
  );

  const showNavigationLoading = useCallback((message: string) => {
    if (navigationLoadingTimerRef.current) {
      clearTimeout(navigationLoadingTimerRef.current);
    }
    setNavigationLoadingMessage(message);
    navigationLoadingTimerRef.current = setTimeout(() => {
      setNavigationLoadingMessage(null);
      navigationLoadingTimerRef.current = null;
    }, NAVIGATION_LOADING_DURATION_MS);
  }, []);

  const switchActiveTab = useCallback(
    (tab: Tab) => {
      if (tab === activeTab) return;
      const subTab =
        tab === "workforce-intelligence" ? workforceSubTab : undefined;
      showNavigationLoading(getNavigationLoadingMessage(tab, subTab));
      if (navigationSwitchTimerRef.current) {
        clearTimeout(navigationSwitchTimerRef.current);
      }
      navigationSwitchTimerRef.current = setTimeout(() => {
        setActiveTab(tab);
        navigationSwitchTimerRef.current = null;
      }, 16);
    },
    [activeTab, showNavigationLoading, workforceSubTab],
  );

  const switchWorkforceSubTab = useCallback(
    (subTab: WorkforceSubTab) => {
      if (subTab === workforceSubTab) return;
      showNavigationLoading(
        getNavigationLoadingMessage("workforce-intelligence", subTab),
      );
      if (navigationSwitchTimerRef.current) {
        clearTimeout(navigationSwitchTimerRef.current);
      }
      navigationSwitchTimerRef.current = setTimeout(() => {
        setWorkforceSubTab(subTab);
        navigationSwitchTimerRef.current = null;
      }, 16);
    },
    [showNavigationLoading, workforceSubTab],
  );

  // ── As-Is handlers ──
  const handleDataReady = useCallback(
    (d: DashboardData) => {
      appendChange(
        createChangeRecord({
          scope: "as-is",
          action: data ? "upload" : "initialize",
          before: currentSnapshot(),
          after: {
            data: d,
            toBeData,
            columnMapping,
            excelRows,
            studioRows: asIsMutatedRows,
            asIsRows: asIsMutatedRows,
            toBeRows: toBeMutatedRows,
          },
          details: data
            ? undefined
            : ["Baseline snapshot captured from the uploaded org data."],
        }),
      );
      setData(d);
      setActiveTab("summary");
    },
    [
      appendChange,
      asIsMutatedRows,
      columnMapping,
      currentSnapshot,
      data,
      excelRows,
      toBeData,
      toBeMutatedRows,
    ],
  );

  const handleExcelFile = useCallback((f: File) => {
    setExcelFile(f);
    setSnapshotSourceFiles((prev) => ({ ...prev, orgFileName: f.name }));
    setAsIsMutatedRows(null);
    setToBeMutatedRows(null);
  }, []);

  const handleExcelParsed = useCallback(
    (rows: ExcelRow[], headers: string[], mapping: ColumnMapping) => {
      const created = createOrgDataset({
        rows,
        headers,
        mapping,
        sourceFileName: excelFile?.name,
      });
      const change = createChangeRecord({
        scope: "as-is",
        action: "initialize",
        title: "Dataset initialized",
        summary: `${rows.length.toLocaleString()} uploaded rows stored as immutable baseline and editable As-Is.`,
        details: [
          "Baseline rows are preserved separately from the editable As-Is state.",
        ],
        before: { dataset: dataset ? cloneOrgDataset(dataset) : null },
        after: { dataset: created },
      });
      const next = { ...created, changeLog: [change] };
      setDataset(next);
      syncLegacyFromDataset(next);
      setActiveTab("summary");
    },
    [dataset, excelFile, syncLegacyFromDataset],
  );

  const handleRemappingConfirm = useCallback(
    async (newMapping: ColumnMapping) => {
      if (dataset) {
        setShowRemapping(false);
        const next = applyOrgMutation(dataset, {
          target: remapState,
          source: "mapping",
          action: "updateMapping",
          mapping: newMapping,
        });
        commitDataset(next, {
          scope: "mapping",
          action: "mapping",
          title: `${remapState === "asIs" ? "As-Is" : "To-Be"} field mapping updated`,
          summary:
            "The selected state was rebuilt with the updated field mapping.",
        });
        return;
      }
      setShowRemapping(false);
      const sourceRows = asIsMutatedRows ?? excelRows;
      if (!sourceRows) return;
      const { buildHierarchyFromMapping } =
        await import("@/lib/buildHierarchy");
      const nextData = buildHierarchyFromMapping(sourceRows, newMapping);
      appendChange(
        createChangeRecord({
          scope: "mapping",
          action: "mapping",
          before: currentSnapshot(),
          after: {
            data: nextData,
            toBeData,
            columnMapping: newMapping,
            excelRows,
            studioRows: asIsMutatedRows,
            asIsRows: asIsMutatedRows,
            toBeRows: toBeMutatedRows,
          },
        }),
      );
      setData(nextData);
      setColumnMapping(newMapping);
    },
    [
      appendChange,
      asIsMutatedRows,
      commitDataset,
      currentSnapshot,
      data,
      dataset,
      excelRows,
      remapState,
      toBeData,
      toBeMutatedRows,
    ],
  );

  const handleDataChange = useCallback(
    (d: DashboardData) => {
      appendChange(
        createChangeRecord({
          scope: "as-is",
          action: "hierarchy",
          before: currentSnapshot(),
          after: {
            data: d,
            toBeData,
            columnMapping,
            excelRows,
            studioRows: asIsMutatedRows,
            asIsRows: asIsMutatedRows,
            toBeRows: toBeMutatedRows,
          },
        }),
      );
      setData(d);
    },
    [
      appendChange,
      asIsMutatedRows,
      columnMapping,
      currentSnapshot,
      excelRows,
      toBeData,
      toBeMutatedRows,
    ],
  );

  const handleToBeDataChange = useCallback(
    (d: DashboardData) => {
      appendChange(
        createChangeRecord({
          scope: "to-be",
          action: "hierarchy",
          before: currentSnapshot(),
          after: {
            data,
            toBeData: d,
            columnMapping,
            excelRows,
            studioRows: asIsMutatedRows,
            asIsRows: asIsMutatedRows,
            toBeRows: toBeMutatedRows,
          },
        }),
      );
      setToBeData(d);
    },
    [
      appendChange,
      asIsMutatedRows,
      columnMapping,
      currentSnapshot,
      data,
      excelRows,
      toBeMutatedRows,
    ],
  );
  const handleCompDataChange = useCallback(
    (d: DashboardData) => {
      if (dataset) {
        const next = applyOrgMutation(dataset, {
          target: compTarget === "both" ? "both" : toOrgState(compTarget),
          source: "comp",
          action: "updateCompMatrix",
          compMatrix: d.compMatrix ?? {},
        });
        commitDataset(next, {
          scope: "compensation",
          action: "compensation",
          title: "Compensation setup updated",
          summary:
            compTarget === "both"
              ? "Compensation bands were updated in both states."
              : `Compensation bands were updated in ${compTarget === "as-is" ? "As-Is" : "To-Be"}.`,
        });
        return;
      }
      const nextToBeData = toBeData
        ? { ...toBeData, compMatrix: d.compMatrix }
        : toBeData;
      appendChange(
        createChangeRecord({
          scope: "compensation",
          action: "compensation",
          title: "Compensation setup updated",
          summary: nextToBeData
            ? "Compensation bands were updated and synced into the target state."
            : "Compensation bands were updated.",
          details: [
            "As-Is compensation setup changed.",
            ...(nextToBeData
              ? ["To-Be compensation setup now uses the same band matrix."]
              : []),
          ],
          before: currentSnapshot(),
          after: {
            data: d,
            toBeData: nextToBeData,
            columnMapping,
            excelRows,
            studioRows: asIsMutatedRows,
            asIsRows: asIsMutatedRows,
            toBeRows: toBeMutatedRows,
          },
        }),
      );
      setData(d);
      setToBeData(nextToBeData);
    },
    [
      appendChange,
      asIsMutatedRows,
      columnMapping,
      commitDataset,
      compTarget,
      currentSnapshot,
      data,
      dataset,
      excelRows,
      toBeData,
      toBeMutatedRows,
    ],
  );

  const handleAICompMatrixChange = useCallback(
    (
      matrix: CompMatrix,
      target: CompTarget = "both",
      meta?: {
        source: "ai";
        replaceAll: boolean;
        bandsSet: number;
        rationale?: string;
      },
    ) => {
      const effectiveTarget: CompTarget =
        target === "both" && !toBeData ? "as-is" : target;
      const targetLabel =
        effectiveTarget === "both"
          ? "both states"
          : effectiveTarget === "to-be"
            ? "To-Be"
            : "As-Is";

      if (dataset) {
        const next = applyOrgMutation(dataset, {
          target:
            effectiveTarget === "both" ? "both" : toOrgState(effectiveTarget),
          source: "ai",
          action: "updateCompMatrix",
          compMatrix: matrix,
        });
        commitDataset(next, {
          scope: "compensation",
          action: "compensation",
          title: "AI compensation bands updated",
          summary: `AI updated ${meta?.bandsSet ?? Object.values(matrix).reduce((sum, geos) => sum + Object.keys(geos ?? {}).length, 0)} compensation band${meta?.bandsSet === 1 ? "" : "s"} in ${targetLabel}.`,
          details: [
            meta?.replaceAll
              ? "Existing compensation bands were replaced."
              : "Compensation bands were added or updated.",
            ...(meta?.rationale ? [meta.rationale] : []),
            ...(target === "both" && effectiveTarget === "as-is"
              ? [
                  "To-Be is not initialized, so the default Both target applied to As-Is only.",
                ]
              : []),
          ],
        });
        return;
      }

      const nextAsIsData =
        effectiveTarget === "to-be"
          ? data
          : data
            ? { ...data, compMatrix: matrix }
            : data;
      const nextToBeData =
        effectiveTarget === "as-is"
          ? toBeData
          : toBeData
            ? { ...toBeData, compMatrix: matrix }
            : toBeData;
      appendChange(
        createChangeRecord({
          scope: "compensation",
          action: "compensation",
          title: "AI compensation bands updated",
          summary: `AI updated compensation bands in ${targetLabel}.`,
          details: [
            meta?.replaceAll
              ? "Existing compensation bands were replaced."
              : "Compensation bands were added or updated.",
            ...(meta?.rationale ? [meta.rationale] : []),
          ],
          before: currentSnapshot(),
          after: {
            data: nextAsIsData,
            toBeData: nextToBeData,
            columnMapping,
            excelRows,
            studioRows: asIsMutatedRows,
            asIsRows: asIsMutatedRows,
            toBeRows: toBeMutatedRows,
          },
        }),
      );
      if (nextAsIsData !== data) setData(nextAsIsData);
      if (nextToBeData !== toBeData) setToBeData(nextToBeData);
    },
    [
      appendChange,
      asIsMutatedRows,
      columnMapping,
      commitDataset,
      currentSnapshot,
      data,
      dataset,
      excelRows,
      toBeData,
      toBeMutatedRows,
    ],
  );

  const handleSharedRowsChange = useCallback(
    async (
      rows: ExcelRow[] | null,
      meta?: {
        source?: string;
        action?: string;
        query?: string;
        affected?: number;
        label?: string;
        target?: StateSlice;
      },
    ) => {
      if (dataset) {
        const targetSlice =
          meta?.target ??
          (activeTab === "table"
            ? tableSlice
            : activeTab === "tree"
              ? studioSlice
              : studioSlice);
        const target = toOrgState(targetSlice);
        const isReset = rows === null;
        const source =
          (meta?.source as OrgMutationSource | undefined) ??
          (isReset ? "analytics-reset" : "employees-table");
        const next = isReset
          ? applyOrgMutation(
              dataset,
              target === "asIs"
                ? { target: "asIs", source, action: "resetAsIsFromBaseline" }
                : { target: "toBe", source, action: "copyFromAsIs" },
            )
          : applyOrgMutation(dataset, {
              target,
              source,
              action: "replaceRows",
              rows: rows ?? [],
            });
        const label = labelForSource(meta?.source);
        commitDataset(next, {
          scope: "rows",
          action: "rows",
          title: isReset
            ? `${label} reset`
            : `${label} updated ${targetSlice === "as-is" ? "As-Is" : "To-Be"} rows`,
          summary: isReset
            ? targetSlice === "as-is"
              ? "As-Is was reset to the immutable uploaded baseline."
              : "To-Be was reset from the current As-Is state."
            : `${(rows?.length ?? 0).toLocaleString()} rows changed${meta?.affected != null ? `, ${meta.affected.toLocaleString()} affected by the operation` : ""}.`,
          details: [
            meta?.label ??
              (meta?.query
                ? `SQL: ${meta.query}`
                : "Rows changed through an editable surface."),
            `The ${targetSlice === "as-is" ? "As-Is" : "To-Be"} hierarchy was rebuilt from canonical state rows.`,
          ],
        });
        return;
      }
      const target =
        meta?.target ?? (activeTab === "table" ? tableSlice : studioSlice);
      const before = currentSnapshot();
      let nextData = data;
      let nextToBeData = toBeData;
      const nextAsIsRows = target === "as-is" ? rows : asIsMutatedRows;
      const nextToBeRows = target === "to-be" ? rows : toBeMutatedRows;

      if (rows && columnMapping && canBuildFromRows(rows)) {
        const { buildHierarchyFromMapping } =
          await import("@/lib/buildHierarchy");
        const rebuilt = buildHierarchyFromMapping(rows, columnMapping);
        if (target === "as-is")
          nextData = data
            ? { ...rebuilt, compMatrix: data.compMatrix }
            : rebuilt;
        if (target === "to-be")
          nextToBeData = toBeData
            ? {
                ...rebuilt,
                compMatrix: toBeData.compMatrix ?? data?.compMatrix,
              }
            : { ...rebuilt, compMatrix: data?.compMatrix };
      }

      const isReset = rows === null;
      const sourceLabel =
        meta?.source === "employees-table"
          ? "Employees table"
          : meta?.source === "analytics-sql"
            ? "Analytics SQL"
            : meta?.source === "analytics-reset"
              ? "Analytics Studio"
              : meta?.source === "ai-sql"
                ? "Agentic AI SQL"
                : meta?.source === "hierarchy"
                  ? "Hierarchy"
                  : "Employee rows";

      appendChange(
        createChangeRecord({
          scope: "rows",
          action: "rows",
          title: isReset
            ? `${sourceLabel} reset`
            : `${sourceLabel} updated ${target === "as-is" ? "As-Is" : "To-Be"} rows`,
          summary: isReset
            ? "The active row layer was reset to the loaded source data."
            : `${(rows?.length ?? 0).toLocaleString()} rows changed${meta?.affected != null ? `, ${meta.affected.toLocaleString()} affected by the operation` : ""}.`,
          details: [
            meta?.label ??
              (meta?.query
                ? `SQL: ${meta.query}`
                : "Rows changed through an editable surface."),
            rows && columnMapping && canBuildFromRows(rows)
              ? `The ${target === "as-is" ? "As-Is" : "To-Be"} hierarchy was rebuilt from these rows.`
              : "Stored as row-layer changes because the current field mapping could not rebuild hierarchy data.",
          ],
          before,
          after: {
            data: nextData,
            toBeData: nextToBeData,
            columnMapping,
            excelRows,
            studioRows: nextAsIsRows,
            asIsRows: nextAsIsRows,
            toBeRows: nextToBeRows,
          },
        }),
      );

      if (target === "as-is") setAsIsMutatedRows(rows);
      if (target === "to-be") setToBeMutatedRows(rows);
      if (nextData !== data) setData(nextData);
      if (nextToBeData !== toBeData) setToBeData(nextToBeData);
      setGraphVersion((v) => v + 1);
    },
    [
      activeTab,
      appendChange,
      asIsMutatedRows,
      canBuildFromRows,
      columnMapping,
      commitDataset,
      currentSnapshot,
      data,
      dataset,
      excelRows,
      studioSlice,
      tableSlice,
      toBeData,
      toBeMutatedRows,
    ],
  );

  const handleRowMutation = useCallback(
    async (rows: ExcelRow[], target: "as-is" | "to-be" | "both") => {
      if (dataset) {
        const scope: ChangeScope =
          target === "as-is"
            ? "as-is"
            : target === "to-be"
              ? "to-be"
              : "session";
        const next = applyOrgMutation(dataset, {
          target: target === "both" ? "both" : toOrgState(target),
          source: "ai",
          action: "replaceRows",
          rows,
        });
        commitDataset(next, {
          scope,
          action: "rows",
          title: `Rows applied to ${target === "both" ? "both states" : target === "as-is" ? "As-Is" : "To-Be"}`,
          summary: `${rows.length.toLocaleString()} source rows rebuilt into hierarchy data.`,
          details: [
            "Dashboard state was rebuilt from the current row set and field mapping.",
          ],
        });
        return;
      }
      if (!columnMapping) return;
      const { buildHierarchyFromMapping } =
        await import("@/lib/buildHierarchy");
      const rebuilt = buildHierarchyFromMapping(rows, columnMapping);
      const nextAsIs =
        target === "as-is" || target === "both"
          ? { ...rebuilt, compMatrix: data?.compMatrix }
          : data;
      const nextToBe =
        target === "to-be" || target === "both"
          ? { ...rebuilt, compMatrix: toBeData?.compMatrix ?? data?.compMatrix }
          : toBeData;
      const scope: ChangeScope =
        target === "as-is" ? "as-is" : target === "to-be" ? "to-be" : "session";
      appendChange(
        createChangeRecord({
          scope,
          action: "rows",
          title: `Rows applied to ${target === "both" ? "both states" : target === "as-is" ? "As-Is" : "To-Be"}`,
          summary: `${rows.length.toLocaleString()} source rows rebuilt into hierarchy data.`,
          details: [
            "Dashboard state was rebuilt from the current row set and field mapping.",
          ],
          before: currentSnapshot(),
          after: {
            data: nextAsIs,
            toBeData: nextToBe,
            columnMapping,
            excelRows,
            studioRows: target === "to-be" ? asIsMutatedRows : rows,
            asIsRows: target === "to-be" ? asIsMutatedRows : rows,
            toBeRows: target === "as-is" ? toBeMutatedRows : rows,
          },
        }),
      );
      if (target === "as-is" || target === "both") {
        setAsIsMutatedRows(rows);
        setData(nextAsIs);
      }
      if (target === "to-be" || target === "both") {
        setToBeMutatedRows(rows);
        setToBeData(nextToBe);
      }
      setGraphVersion((v) => v + 1);
    },
    [
      appendChange,
      asIsMutatedRows,
      columnMapping,
      commitDataset,
      currentSnapshot,
      data,
      dataset,
      excelRows,
      toBeData,
      toBeMutatedRows,
    ],
  );

  const handleFieldMapping = useCallback(
    async (
      field: string,
      column: string,
      newRows?: ExcelRow[],
      targetSlice: StateSlice = "as-is",
    ) => {
      if (dataset) {
        const target = toOrgState(targetSlice);
        const baseState = dataset.states[target] ?? dataset.states.asIs;
        const newMapping: ColumnMapping = {
          ...baseState.mapping,
          [field as import("@/lib/fieldDictionary").CanonicalField]: {
            column,
            confidence: 1,
            isManual: true,
          },
        };
        let next = dataset;
        if (newRows) {
          next = applyOrgMutation(next, {
            target,
            source: "mapping",
            action: "replaceRows",
            rows: newRows,
          });
        }
        next = applyOrgMutation(next, {
          target,
          source: "mapping",
          action: "updateMapping",
          mapping: newMapping,
        });
        commitDataset(next, {
          scope: "mapping",
          action: "mapping",
          title: `${targetSlice === "as-is" ? "As-Is" : "To-Be"} field mapped`,
          summary: `${field} now maps to ${column}.`,
        });
        return;
      }
      if (!columnMapping) return;
      const { buildHierarchyFromMapping } =
        await import("@/lib/buildHierarchy");
      const newMapping: ColumnMapping = {
        ...columnMapping,
        [field as import("@/lib/fieldDictionary").CanonicalField]: {
          column,
          confidence: 1,
          isManual: true,
        },
      };
      setColumnMapping(newMapping);
      const rows = newRows ?? excelRows;
      if (!rows) return;
      if (newRows) {
        setAsIsMutatedRows(newRows);
        // Add the new derived column to excelHeaders if it isn't already there
        setExcelHeaders((prev) =>
          prev.includes(column) ? prev : [...prev, column],
        );
      }
      const nextData = buildHierarchyFromMapping(rows, newMapping);
      appendChange(
        createChangeRecord({
          scope: "mapping",
          action: "mapping",
          before: currentSnapshot(),
          after: {
            data: nextData,
            toBeData,
            columnMapping: newMapping,
            excelRows: newRows ?? excelRows,
            studioRows: newRows ?? asIsMutatedRows,
            asIsRows: newRows ?? asIsMutatedRows,
            toBeRows: toBeMutatedRows,
          },
        }),
      );
      setData(nextData);
    },
    [
      appendChange,
      asIsMutatedRows,
      columnMapping,
      commitDataset,
      currentSnapshot,
      data,
      dataset,
      excelRows,
      toBeData,
      toBeMutatedRows,
    ],
  );

  // ── Story builder ──
  const handleAddToStory = useCallback(
    (data: PendingData) => {
      if (libraryItems.length >= 10) {
        setLibraryToast(
          "Library is full (10/10). Remove an item from the library first.",
        );
        setTimeout(() => setLibraryToast(null), 3500);
        return;
      }
      setLibraryItems((prev) => [...prev, data]);
      switchActiveTab("story");
    },
    [libraryItems, switchActiveTab],
  );

  // ── To-Be handlers ──
  const handleCopyFromAsIs = useCallback(() => {
    if (dataset) {
      const next = applyOrgMutation(dataset, {
        target: "toBe",
        source: "session",
        action: "copyFromAsIs",
      });
      commitDataset(next, {
        scope: "to-be",
        action: "copy",
        title: "To-Be copied from As-Is",
        summary:
          "Target state initialized from the current organization snapshot.",
        details: [
          "Use this as a controlled baseline before target-state edits.",
        ],
      });
      setSnapshotSourceFiles((prev) => ({
        ...prev,
        toBeFileName: "Copied from As-Is",
      }));
      return;
    }
    if (!data) return;
    const nextToBe = JSON.parse(JSON.stringify(data));
    const copiedRows = asIsMutatedRows ?? excelRows;
    appendChange(
      createChangeRecord({
        scope: "to-be",
        action: "copy",
        title: "To-Be copied from As-Is",
        summary:
          "Target state initialized from the current organization snapshot.",
        details: [
          "Use this as a controlled baseline before target-state edits.",
        ],
        before: currentSnapshot(),
        after: {
          data,
          toBeData: nextToBe,
          columnMapping,
          excelRows,
          studioRows: asIsMutatedRows,
          asIsRows: asIsMutatedRows,
          toBeRows: copiedRows,
        },
      }),
    );
    setToBeData(nextToBe);
    setToBeMutatedRows(
      copiedRows ? copiedRows.map((row) => ({ ...row })) : null,
    );
    setToBeFile(excelFile);
    setSnapshotSourceFiles((prev) => ({
      ...prev,
      toBeFileName: excelFile?.name ?? "Copied from As-Is",
    }));
  }, [
    appendChange,
    asIsMutatedRows,
    columnMapping,
    commitDataset,
    currentSnapshot,
    data,
    dataset,
    excelFile,
    excelRows,
  ]);

  const handleToBeUploaded = useCallback(
    (
      d: DashboardData,
      file: File,
      rows?: ExcelRow[],
      headers?: string[],
      mapping?: ColumnMapping,
    ) => {
      if (dataset && rows) {
        const next = applyOrgMutation(dataset, {
          target: "toBe",
          source: "upload",
          action: "replaceToBeFromUpload",
          rows,
          headers,
          mapping,
          sourceFileName: file.name,
        });
        commitDataset(next, {
          scope: "to-be",
          action: "upload",
          title: "To-Be file uploaded",
          summary: `${file.name} loaded as target-state data.`,
        });
        setSnapshotSourceFiles((prev) => ({
          ...prev,
          toBeFileName: file.name,
        }));
        setShowToBeUpload(false);
        return;
      }
      appendChange(
        createChangeRecord({
          scope: "to-be",
          action: "upload",
          title: "To-Be file uploaded",
          summary: `${file.name} loaded as target-state data.`,
          before: currentSnapshot(),
          after: {
            data,
            toBeData: d,
            columnMapping,
            excelRows,
            studioRows: asIsMutatedRows,
            asIsRows: asIsMutatedRows,
            toBeRows: rows ?? toBeMutatedRows,
          },
        }),
      );
      setToBeData(d);
      if (rows) setToBeMutatedRows(rows);
      setToBeFile(file);
      setSnapshotSourceFiles((prev) => ({ ...prev, toBeFileName: file.name }));
      setShowToBeUpload(false);
    },
    [
      appendChange,
      asIsMutatedRows,
      columnMapping,
      commitDataset,
      currentSnapshot,
      data,
      dataset,
      excelRows,
      toBeMutatedRows,
    ],
  );

  const handleResetToBe = useCallback(() => {
    if (dataset) {
      const next = applyOrgMutation(dataset, {
        target: "toBe",
        source: "session",
        action: "removeToBe",
      });
      commitDataset(next, {
        scope: "to-be",
        action: "reset",
        title: "To-Be reset",
        summary: "The target-state table was removed.",
      });
      setSnapshotSourceFiles((prev) => ({ ...prev, toBeFileName: null }));
      return;
    }
    appendChange(
      createChangeRecord({
        scope: "to-be",
        action: "reset",
        before: currentSnapshot(),
        after: {
          data,
          toBeData: null,
          columnMapping,
          excelRows,
          studioRows: asIsMutatedRows,
          asIsRows: asIsMutatedRows,
          toBeRows: null,
        },
      }),
    );
    setToBeData(null);
    setToBeFile(null);
    setToBeMutatedRows(null);
    setSnapshotSourceFiles((prev) => ({ ...prev, toBeFileName: null }));
  }, [
    appendChange,
    asIsMutatedRows,
    columnMapping,
    commitDataset,
    currentSnapshot,
    data,
    dataset,
    excelRows,
  ]);

  const handleRevertChange = useCallback(
    (change: ChangeRecord) => {
      const before = cloneSnapshot(change.before);

      if (before.dataset) {
        const restored = cloneOrgDataset(before.dataset);
        const index = changeLog.findIndex((item) => item.id === change.id);
        const next = {
          ...restored,
          changeLog:
            index >= 0 ? changeLog.slice(0, index) : restored.changeLog,
        };
        setDataset(next);
        syncLegacyFromDataset(next);
        setStudioSlice(toSlice(next.activeStateBySurface.studio));
        setTableSlice(toSlice(next.activeStateBySurface.table));
        return;
      }

      if ("data" in before) setData(before.data ?? null);
      if ("toBeData" in before) {
        setToBeData(before.toBeData ?? null);
        if (!before.toBeData) setToBeFile(null);
      }
      if ("columnMapping" in before)
        setColumnMapping(before.columnMapping ?? null);
      if ("excelRows" in before) setExcelRows(before.excelRows ?? null);
      if ("asIsRows" in before) setAsIsMutatedRows(before.asIsRows ?? null);
      else if ("studioRows" in before)
        setAsIsMutatedRows(before.studioRows ?? null);
      if ("toBeRows" in before) setToBeMutatedRows(before.toBeRows ?? null);

      setChangeLog((prev) => {
        const index = prev.findIndex((item) => item.id === change.id);
        return index >= 0 ? prev.slice(0, index) : prev;
      });
    },
    [changeLog, syncLegacyFromDataset],
  );

  if (!data) {
    return (
      <>
        <div
          className={styles.shell}
          style={{ filter: "blur(8px)", pointerEvents: "none" }}
        >
          <ShellSkeleton />
        </div>
        <UploadModal
          onDataReady={handleDataReady}
          onExcelFile={handleExcelFile}
          onExcelParsed={handleExcelParsed}
          onSnapshotLoad={handleLoadSnapshot}
        />
      </>
    );
  }

  // Which data/file to pass to analytics studio and table
  const studioData = studioSlice === "as-is" ? data : (toBeData ?? data);
  const studioFile =
    studioSlice === "as-is" ? excelFile : (toBeFile ?? excelFile);
  const tableData = tableSlice === "as-is" ? data : (toBeData ?? data);
  const tableFile =
    tableSlice === "as-is" ? excelFile : (toBeFile ?? excelFile);
  const aiSlice = dataset ? toSlice(dataset.activeStateBySurface.ai) : "as-is";
  const rowsForSlice = (slice: StateSlice): ExcelRow[] | null =>
    slice === "as-is"
      ? (asIsMutatedRows ?? excelRows)
      : (toBeMutatedRows ?? asIsMutatedRows ?? excelRows);
  const studioRows = rowsForSlice(studioSlice);
  const tableRows = rowsForSlice(tableSlice);
  const aiRows = rowsForSlice(aiSlice);
  const aiData = aiSlice === "as-is" ? data : (toBeData ?? data);
  const asIsHierarchyRows = rowsForSlice("as-is");
  const toBeHierarchyRows = rowsForSlice("to-be");
  const setSurfaceSlice = (
    surface: keyof OrgDataset["activeStateBySurface"],
    slice: StateSlice,
  ) => {
    const state = toOrgState(slice);
    if (surface === "studio" || surface === "hierarchy") setStudioSlice(slice);
    if (surface === "table") setTableSlice(slice);
    if (!dataset) return;
    setDataset(
      applyOrgMutation(dataset, {
        target: state,
        source: "session",
        action: "setActiveState",
        surface,
        state,
      }),
    );
  };
  const switchHierarchySlice = (slice: StateSlice) => {
    setSurfaceSlice("hierarchy", slice);
  };
  const remapHeaderGroups = dataset
    ? stateHeadersForMapping(dataset, remapState)
    : { source: excelHeaders, derived: [] };
  const remapMapping = dataset?.states[remapState]?.mapping ?? columnMapping;
  const compData = compTarget === "to-be" && toBeData ? toBeData : data;
  const hasLoadedSource = Boolean(data || dataset || excelFile);

  return (
    <div className={styles.shell} ref={shellRef}>
      {showToBeUpload && (
        <ToBeUploadModal
          asIsHeaders={dataset?.states.asIs.headers ?? excelHeaders}
          asIsMapping={dataset?.states.asIs.mapping ?? columnMapping}
          asIsData={data}
          onConfirm={(d, file, rows, headers, mapping) =>
            handleToBeUploaded(d, file, rows, headers, mapping)
          }
          onCancel={() => setShowToBeUpload(false)}
        />
      )}
      {showChangeDrawer && (
        <ChangeManagementDrawer
          changes={changeLog}
          onClose={() => setShowChangeDrawer(false)}
          onRevert={handleRevertChange}
        />
      )}

      <header className={styles.header}>
        <div className={styles.brandmark}>
          <div className={styles.bar} />
          <div className={styles.brandName}>Org Analytics · Menu Tech</div>
        </div>
        <div className={styles.headerRight}>
          {hasLoadedSource && (
            <>
              <button
                className={styles.changeLogBtn}
                onClick={handleSaveSnapshot}
                title="Download an encrypted offline copy of this dashboard state"
              >
                Save Snapshot
              </button>
              <button
                className={styles.changeLogBtn}
                onClick={() => switchActiveTab("readiness")}
                title="View data quality and completeness report"
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="10" cy="10" r="8" />
                  <path d="M10 6v4l2.5 2.5" />
                </svg>
                Data Readiness
              </button>
              <button
                className={styles.changeLogBtn}
                onClick={() => switchActiveTab("comp")}
                title="Compensation setup"
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="5" width="14" height="10" rx="1.5" />
                  <path d="M7 10h6M10 7v6" />
                </svg>
                Comp Setup
              </button>
            </>
          )}
          <button
            className={styles.changeLogBtn}
            onClick={() => setShowChangeDrawer(true)}
          >
            Change Log
            {changeLog.length > 0 && <span>{changeLog.length}</span>}
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
            onClick={() => switchActiveTab(t.key)}
          >
            <span className={styles.tabNum}>{t.num}</span>
            {t.label}
          </button>
        ))}
        {columnMapping && (
          <button
            className={styles.editFieldsBtn}
            onClick={() => {
              const slice =
                activeTab === "table"
                  ? tableSlice
                  : activeTab === "studio" || activeTab === "tree"
                    ? studioSlice
                    : "as-is";
              setRemapState(toOrgState(slice));
              setShowRemapping(true);
            }}
            title="Re-map Excel columns to data model fields"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M11 5H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-5" />
              <path d="M17.5 2.5a2.121 2.121 0 0 1 3 3L12 14l-4 1 1-4 8.5-8.5z" />
            </svg>
            Edit Fields
          </button>
        )}
      </nav>

      {navigationLoadingMessage && (
        <div
          className={styles.navigationLoading}
          role="status"
          aria-live="polite"
        >
          <span className={styles.navigationLoadingDot} />
          {navigationLoadingMessage}
        </div>
      )}

      {showRemapping && remapMapping && (
        <div className={styles.remapOverlay}>
          <ColumnMappingStep
            headers={[
              ...remapHeaderGroups.source,
              ...remapHeaderGroups.derived,
            ]}
            sourceHeaders={remapHeaderGroups.source}
            derivedHeaders={remapHeaderGroups.derived}
            mapping={remapMapping}
            onConfirm={handleRemappingConfirm}
            onBack={() => setShowRemapping(false)}
          />
        </div>
      )}

      {/* ── 01 Summary — always As-Is ── */}
      <div
        data-view="summary"
        style={{ display: activeTab === "summary" ? "block" : "none" }}
      >
        <SummaryView data={data} onAddToStory={handleAddToStory} />
      </div>

      {/* ── 02 Advanced Analytics — always As-Is ── */}
      <div
        data-view="advanced"
        style={{ display: activeTab === "advanced" ? "block" : "none" }}
      >
        <AdvancedAnalyticsView
          data={data}
          file={excelFile}
          sourceRows={asIsHierarchyRows ?? undefined}
          onAddToStory={handleAddToStory}
          onNavigateToEmployee={(rowId) => {
            switchActiveTab("table");
            setTableJumpId(rowId);
          }}
        />
      </div>

      {/* ── 03 Analytics Studio — state-switchable ── */}
      <div
        data-view="studio"
        style={{ display: activeTab === "studio" ? "block" : "none" }}
      >
        <div className={styles.sectionStateBar}>
          <span className={styles.sectionStateLabel}>State</span>
          <div className={styles.sectionStateBtns}>
            <button
              className={`${styles.sectionStateBtn} ${studioSlice === "as-is" ? styles.sectionStateBtnActive : ""}`}
              onClick={() => setSurfaceSlice("studio", "as-is")}
            >
              As-Is
            </button>
            <button
              className={`${styles.sectionStateBtn} ${studioSlice === "to-be" ? styles.sectionStateBtnActive : ""}`}
              onClick={() => setSurfaceSlice("studio", "to-be")}
              disabled={!toBeData}
              title={
                !toBeData
                  ? "Initialize To-Be state in the Hierarchy tab first"
                  : undefined
              }
            >
              To-Be
            </button>
          </div>
          {studioSlice === "to-be" && toBeData && (
            <span
              className={styles.sectionStateLabel}
              style={{ marginLeft: 8 }}
            >
              {toBeFile ? toBeFile.name : "Copied from As-Is"}
            </span>
          )}
        </div>
        <AnalyticsStudioView
          file={studioRows ? null : studioFile}
          data={studioData}
          rows={studioRows ?? undefined}
          onRowsChange={(rows, meta) =>
            handleSharedRowsChange(rows, { ...meta, target: studioSlice })
          }
          externalChartRequest={pendingChartRequest}
          workCapabilityDataset={workCapabilityDataset}
          onAddToStory={handleAddToStory}
        />
      </div>

      {/* ── 04 Hierarchy — both panels side-by-side ── */}
      <div
        data-view="tree"
        data-export-title="Hierarchy Tree"
        style={{ display: activeTab === "tree" ? "block" : "none" }}
      >
        <div className={styles.hierarchyStateHeader}>
          <div className={styles.sectionStateBar}>
            <span className={styles.sectionStateLabel}>Hierarchy view</span>
            <div className={styles.sectionStateBtns}>
              <button
                className={`${styles.sectionStateBtn} ${studioSlice === "as-is" ? styles.sectionStateBtnActive : ""}`}
                onClick={() => switchHierarchySlice("as-is")}
              >
                As-Is
              </button>
              <button
                className={`${styles.sectionStateBtn} ${studioSlice === "to-be" ? styles.sectionStateBtnActive : ""}`}
                onClick={() => switchHierarchySlice("to-be")}
              >
                To-Be
              </button>
            </div>
            <span className={styles.sectionStateLabel}>
              {studioSlice === "as-is"
                ? "Current state"
                : toBeFile
                  ? toBeFile.name
                  : "Target state"}
            </span>
          </div>
          {studioSlice === "to-be" && (
            <div className={styles.hierarchyStateActions}>
              {excelFile && (
                <button
                  className={styles.toBeResetBtn}
                  onClick={() => setShowToBeUpload(true)}
                >
                  Upload To-Be
                </button>
              )}
              {toBeData && (
                <button
                  className={styles.toBeResetBtn}
                  onClick={handleResetToBe}
                  title="Reset To-Be state"
                >
                  Reset To-Be
                </button>
              )}
            </div>
          )}
        </div>

        <div className={styles.hierarchyWorkspace}>
          {studioSlice === "to-be" && !toBeData ? (
            <ToBeEmptyState
              onCopy={handleCopyFromAsIs}
              onUpload={() => setShowToBeUpload(true)}
              hasAsIsFile={!!excelFile}
            />
          ) : (
            <>
              <div className={styles.hierarchyMainPane}>
                <HierarchyView
                  data={studioSlice === "as-is" ? data : toBeData!}
                  onDataChange={
                    studioSlice === "as-is"
                      ? handleDataChange
                      : handleToBeDataChange
                  }
                  columnMapping={columnMapping}
                  rows={
                    studioSlice === "as-is"
                      ? asIsHierarchyRows
                      : toBeHierarchyRows
                  }
                  onRowsChange={(rows, meta) =>
                    handleSharedRowsChange(rows, {
                      ...meta,
                      target: studioSlice,
                    })
                  }
                  stateKey={studioSlice}
                />
              </div>
              <aside
                className={styles.hierarchyAiPane}
                aria-label="AI assistant"
              >
                <AIAssistantView
                  data={studioData}
                  rows={studioRows ?? []}
                  toBeRows={toBeMutatedRows ?? asIsMutatedRows ?? excelRows}
                  stateId={studioSlice}
                  onRowsChange={(rows, meta) =>
                    handleSharedRowsChange(rows, {
                      ...meta,
                      target: studioSlice,
                    })
                  }
                  onCreateChart={(req) => {
                    setPendingChartRequest(req);
                    switchActiveTab("studio");
                  }}
                  onDataChange={
                    studioSlice === "as-is"
                      ? handleCompDataChange
                      : handleToBeDataChange
                  }
                  onCompMatrixChange={handleAICompMatrixChange}
                  toBeData={toBeData}
                  onRowMutation={handleRowMutation}
                  onFieldMapping={handleFieldMapping}
                  columnMapping={columnMapping}
                  changeLog={changeLog}
                  graphVersion={graphVersion}
                  variant="pane"
                  onAddToStory={handleAddToStory}
                />
              </aside>
            </>
          )}
        </div>

        {false && data && (
          <div className={styles.hierarchyStateHeader}>
            {/* As-Is panel */}
            <div className={styles.statePanel}>
              <div className={styles.statePanelHeader}>
                <span className={styles.stateLabelAsIs}>AS-IS</span>
                <span className={styles.statePanelDesc}>Current State</span>
              </div>
              <HierarchyView
                data={data!}
                onDataChange={handleDataChange}
                columnMapping={columnMapping}
                rows={asIsHierarchyRows}
                onRowsChange={(rows, meta) =>
                  handleSharedRowsChange(rows, { ...meta, target: "as-is" })
                }
                stateKey="as-is"
              />
            </div>

            {/* To-Be panel */}
            <div className={styles.statePanel}>
              <div className={styles.statePanelHeader}>
                <span className={styles.stateLabelToBe}>TO-BE</span>
                <span className={styles.statePanelDesc}>Target State</span>
                {toBeData && (
                  <button
                    className={styles.toBeResetBtn}
                    onClick={handleResetToBe}
                    title="Reset To-Be state"
                  >
                    ✕ Reset
                  </button>
                )}
              </div>
              {toBeData ? (
                <HierarchyView
                  data={toBeData!}
                  onDataChange={handleToBeDataChange}
                  columnMapping={columnMapping}
                  rows={toBeHierarchyRows}
                  onRowsChange={(rows, meta) =>
                    handleSharedRowsChange(rows, { ...meta, target: "to-be" })
                  }
                  stateKey="to-be"
                />
              ) : (
                <ToBeEmptyState
                  onCopy={handleCopyFromAsIs}
                  onUpload={() => setShowToBeUpload(true)}
                  hasAsIsFile={!!excelFile}
                />
              )}
            </div>
          </div>
        )}

        {/* ── Target State Analysis ── */}
        <TargetStateAnalysis
          asIs={computeStateMetrics(data)}
          toBe={toBeData ? computeStateMetrics(toBeData) : null}
        />
      </div>

      {/* ── 05 Employees — state-switchable ── */}
      <div
        data-view="table"
        data-export-title="Employee Directory"
        style={{ display: activeTab === "table" ? "block" : "none" }}
      >
        <div className={styles.sectionStateBar}>
          <span className={styles.sectionStateLabel}>State</span>
          <div className={styles.sectionStateBtns}>
            <button
              className={`${styles.sectionStateBtn} ${tableSlice === "as-is" ? styles.sectionStateBtnActive : ""}`}
              onClick={() => setSurfaceSlice("table", "as-is")}
            >
              As-Is
            </button>
            <button
              className={`${styles.sectionStateBtn} ${tableSlice === "to-be" ? styles.sectionStateBtnActive : ""}`}
              onClick={() => setSurfaceSlice("table", "to-be")}
              disabled={!toBeData}
              title={
                !toBeData
                  ? "Initialize To-Be state in the Hierarchy tab first"
                  : undefined
              }
            >
              To-Be
            </button>
          </div>
          {tableSlice === "to-be" && toBeData && (
            <span
              className={styles.sectionStateLabel}
              style={{ marginLeft: 8 }}
            >
              {toBeFile
                ? toBeFile.name
                : "Copied from As-Is · hierarchy edits applied"}
            </span>
          )}
        </div>
        <TableView
          data={tableData}
          file={tableRows ? null : tableFile}
          jumpToId={tableJumpId}
          isActive={activeTab === "table"}
          onJumpComplete={() => setTableJumpId(null)}
          externalRows={tableRows}
          onRowsChange={(rows, meta) =>
            handleSharedRowsChange(rows, { ...meta, target: tableSlice })
          }
        />
      </div>

      {/* ── 06 Comp Setup — shared ── */}
      <div
        data-view="comp"
        style={{ display: activeTab === "comp" ? "block" : "none" }}
      >
        <div className={styles.sectionStateBar}>
          <span className={styles.sectionStateLabel}>Apply to</span>
          <div className={styles.sectionStateBtns}>
            <button
              className={`${styles.sectionStateBtn} ${compTarget === "as-is" ? styles.sectionStateBtnActive : ""}`}
              onClick={() => setCompTarget("as-is")}
            >
              As-Is
            </button>
            <button
              className={`${styles.sectionStateBtn} ${compTarget === "to-be" ? styles.sectionStateBtnActive : ""}`}
              onClick={() => setCompTarget("to-be")}
              disabled={!toBeData}
              title={!toBeData ? "Initialize To-Be state first" : undefined}
            >
              To-Be
            </button>
          </div>
        </div>
        <CompMatrixView data={compData} onDataChange={handleCompDataChange} />
      </div>

      {/* ── 07 Data Readiness ── */}
      {excelFile && (
        <div
          data-view="readiness"
          style={{ display: activeTab === "readiness" ? "block" : "none" }}
        >
          <DataReadinessView
            file={excelFile}
            onNavigateToEmployee={(rowId) => {
              switchActiveTab("table");
              setTableJumpId(rowId);
            }}
          />
        </div>
      )}

      {/* ── 09 Workforce Intelligence (merged section) ── */}
      <div
        data-view="workforce-intelligence"
        style={{
          display: activeTab === "workforce-intelligence" ? "block" : "none",
        }}
      >
        {/* Sub-tab navigation */}
        <div
          style={{
            display: "flex",
            gap: 0,
            borderBottom: "1px solid rgba(0,0,0,0.1)",
            marginBottom: 24,
            background: "var(--cream, #f8f6f0)",
          }}
        >
          {(
            [
              { key: "activity-analysis", label: "Activity Analysis" },
              { key: "talent-mapping", label: "Talent Mapping" },
            ] as { key: WorkforceSubTab; label: string }[]
          ).map((st) => (
            <button
              key={st.key}
              onClick={() => switchWorkforceSubTab(st.key)}
              style={{
                padding: "10px 20px",
                background: "none",
                border: "none",
                borderBottom:
                  workforceSubTab === st.key
                    ? "2px solid var(--teal, #006b6b)"
                    : "2px solid transparent",
                color:
                  workforceSubTab === st.key
                    ? "var(--teal, #006b6b)"
                    : "var(--slate-2, #6b7280)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fontWeight: workforceSubTab === st.key ? 700 : 500,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                cursor: "pointer",
                transition: "all 0.15s",
                whiteSpace: "nowrap",
              }}
            >
              {st.label}
            </button>
          ))}
        </div>

        {/* Sub-section content */}
        <div
          style={{
            display: workforceSubTab === "activity-analysis" ? "block" : "none",
          }}
        >
          <WorkCapabilityIngestionPanel
            dataset={workCapabilityDataset}
            orgDataset={dataset}
            orgRows={asIsMutatedRows ?? excelRows ?? []}
            orgEmployeeIdColumn={
              columnMapping?.["Employee ID"]?.column ?? "employee_id"
            }
            onDatasetReady={setWorkCapabilityDataset}
            onAddToStory={handleAddToStory}
            combinedAnalysisChartsContent={
              <ActivityAnalysisView
                dataset={workCapabilityDataset}
                orgRows={asIsMutatedRows ?? excelRows ?? []}
                orgEmployeeIdColumn={
                  columnMapping?.["Employee ID"]?.column ?? "employee_id"
                }
                columnMapping={columnMapping}
                embeddedMode
                embeddedSection="category-charts"
                onAddToStory={handleAddToStory}
              />
            }
            combinedAnalysisPortfolioContent={
              <ActivityAnalysisView
                dataset={workCapabilityDataset}
                orgRows={asIsMutatedRows ?? excelRows ?? []}
                orgEmployeeIdColumn={
                  columnMapping?.["Employee ID"]?.column ?? "employee_id"
                }
                columnMapping={columnMapping}
                embeddedMode
                embeddedSection="portfolio-workload"
                onAddToStory={handleAddToStory}
              />
            }
          />
        </div>
        <div
          style={{
            display: workforceSubTab === "talent-mapping" ? "block" : "none",
          }}
        >
          <SkillsCapabilityView
            dataset={workCapabilityDataset}
            orgRows={asIsMutatedRows ?? excelRows ?? []}
            orgEmployeeIdColumn={
              columnMapping?.["Employee ID"]?.column ?? "employee_id"
            }
            columnMapping={columnMapping}
            layoutMode="talent-mapping"
            successionRiskContent={
              <SuccessionPlanningView
                dataset={workCapabilityDataset}
                orgRows={asIsMutatedRows ?? excelRows ?? []}
                orgEmployeeIdColumn={
                  columnMapping?.["Employee ID"]?.column ?? "employee_id"
                }
                columnMapping={columnMapping}
                successionCandidates={successionCandidates}
                onSuccessionCandidatesChange={setSuccessionCandidates}
                embeddedMode
                embeddedSection="risk-overview"
              />
            }
            successionPlanningContent={
              <SuccessionPlanningView
                dataset={workCapabilityDataset}
                orgRows={asIsMutatedRows ?? excelRows ?? []}
                orgEmployeeIdColumn={
                  columnMapping?.["Employee ID"]?.column ?? "employee_id"
                }
                columnMapping={columnMapping}
                successionCandidates={successionCandidates}
                onSuccessionCandidatesChange={setSuccessionCandidates}
                embeddedMode
                embeddedSection="remaining"
              />
            }
            successionFlagsContent={
              <SuccessionPlanningView
                dataset={workCapabilityDataset}
                orgRows={asIsMutatedRows ?? excelRows ?? []}
                orgEmployeeIdColumn={
                  columnMapping?.["Employee ID"]?.column ?? "employee_id"
                }
                columnMapping={columnMapping}
                successionCandidates={successionCandidates}
                onSuccessionCandidatesChange={setSuccessionCandidates}
                embeddedMode
                embeddedSection="attention-flags"
              />
            }
          />
        </div>
      </div>

      {/* ── 13 Story ── */}
      {activeTab === "story" && (
        <div data-view="story">
          <StoryView
            doc={storyDoc}
            setDoc={setStoryDoc}
            activeSlideId={activeSlideId}
            setActiveSlideId={setActiveSlideId}
            libraryItems={libraryItems}
            setLibraryItems={setLibraryItems}
          />
        </div>
      )}

      <footer className={styles.footer}>
        <div>Confidential · Internal Analytics · 2026</div>
        <div>menu-tech / item-vista · snapshot.v1</div>
      </footer>

      {/* Library full toast */}
      {libraryToast && (
        <div
          style={{
            position: "fixed",
            bottom: 88,
            right: 28,
            zIndex: 9997,
            background: "#333",
            color: "#fff",
            padding: "10px 18px",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            boxShadow: "0 4px 20px rgba(0,0,0,0.35)",
            pointerEvents: "none",
            maxWidth: 340,
          }}
        >
          {libraryToast}
        </div>
      )}

      {/* ── Floating AI Chat Button ── */}
      <button
        onClick={() => setShowAIFloat((f) => !f)}
        title={showAIFloat ? "Close AI Assistant" : "Open AI Assistant"}
        style={{
          position: "fixed",
          bottom: 28,
          right: 28,
          zIndex: 9998,
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: showAIFloat
            ? "var(--ink, #1a1d20)"
            : "var(--teal, #006b6b)",
          color: "#fff",
          border: "none",
          cursor: "pointer",
          boxShadow: "0 4px 24px rgba(0,107,107,0.4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 20,
          transition: "background 0.2s, transform 0.15s",
        }}
      >
        {showAIFloat ? (
          "✕"
        ) : (
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>

      {/* ── Floating AI Panel ── */}
      {showAIFloat && (
        <div
          style={{
            position: "fixed",
            bottom: 92,
            right: 24,
            zIndex: 9995,
            width: 460,
            height: 620,
            background: "#fff",
            borderRadius: 12,
            boxShadow: "0 12px 48px rgba(0,0,0,0.22)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            border: "1px solid rgba(0,0,0,0.1)",
          }}
        >
          <div style={{ flex: 1, overflow: "hidden", minHeight: 0 }}>
            <AIAssistantView
              data={aiData}
              rows={aiRows ?? []}
              toBeRows={toBeMutatedRows ?? asIsMutatedRows ?? excelRows}
              stateId={aiSlice}
              onRowsChange={(rows, meta) =>
                handleSharedRowsChange(rows, { ...meta, target: aiSlice })
              }
              onCreateChart={(req) => {
                setPendingChartRequest(req);
                switchActiveTab("studio");
                setShowAIFloat(false);
              }}
              onDataChange={handleCompDataChange}
              onCompMatrixChange={handleAICompMatrixChange}
              toBeData={toBeData}
              onRowMutation={handleRowMutation}
              onFieldMapping={handleFieldMapping}
              columnMapping={columnMapping}
              changeLog={changeLog}
              graphVersion={graphVersion}
              variant="pane"
              onAddToStory={handleAddToStory}
            />
          </div>
        </div>
      )}
    </div>
  );
}

const WORK_DATASET_LABELS: Record<
  WorkCapabilityDatasetType,
  { label: string; fileName: string }
> = {
  activity_library: {
    label: "Activity Library",
    fileName: "activity_library_cost_based.csv",
  },
  activity_assignments: {
    label: "Activity Assignments",
    fileName: "activity_assignments_as_is_only.csv",
  },
  skill_library: { label: "Skill Library", fileName: "skill_library.csv" },
  role_skill_requirements: {
    label: "Role Skill Requirements",
    fileName: "role_skill_requirements.csv",
  },
  employee_skills: {
    label: "Employee Skills",
    fileName: "employee_skills.csv",
  },
  activity_skill_requirements: {
    label: "Activity Skill Requirements",
    fileName: "activity_skill_requirements.csv",
  },
};

const WORK_DATASET_ORDER = Object.keys(
  WORK_DATASET_LABELS,
) as WorkCapabilityDatasetType[];

function headersFromRows(rows: ExcelRow[]): string[] {
  const headers = new Set<string>();
  for (const row of rows) {
    Object.keys(row).forEach((key) => headers.add(key));
  }
  return [...headers];
}

function statusLabel(
  status?: WorkCapabilityValidationSummary["status"],
): string {
  if (status === "success") return "Success";
  if (status === "imported_with_warnings") return "Imported with warnings";
  if (status === "failed") return "Failed";
  return "Not imported";
}

function textCell(row: ExcelRow, key: string): string {
  const value = row[key];
  return value == null ? "" : String(value).trim();
}

function boolCell(row: ExcelRow, key: string): boolean {
  const value = row[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string")
    return !["false", "no", "n", "0"].includes(value.trim().toLowerCase());
  return Boolean(value);
}

function numberCell(row: ExcelRow, key: string): number {
  const value = row[key];
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function impactText(impact: WorkCapabilityTaxonomyMutationImpact): string {
  return `${impact.activityRows} activities, ${impact.assignmentRows} assignments, ${impact.skillRequirementRows} skill requirements`;
}

const EMPTY_ACTIVITY_DRAFT: ActivityLibraryRow = {
  activity_id: "",
  activity_name: "",
  department_focus: "",
  activity_category: "",
  process_area: "",
  nature: "Operational",
  criticality: "Medium",
  automation_cost_reduction_pct: 0,
  outsourcing_cost_reduction_pct: 0,
  complexity: "Medium",
  frequency: "Monthly",
  active_flag: true,
  merged_into_activity_id: null,
  created_source: null,
  last_updated_at: null,
};

interface TaxonomyNodeData extends Record<string, unknown> {
  node: WorkCapabilityTaxonomyGraphNode;
  branchSelected: boolean;
}

const taxonomyNodeTypes = { taxonomy: TaxonomyChartNode };

function taxonomyNodeTone(node: WorkCapabilityTaxonomyGraphNode): string {
  if (!node.active) return styles.workCapabilityTaxonomyNodeInactive;
  if (node.criticality === "High") return styles.workCapabilityTaxonomyNodeHigh;
  if (node.criticality === "Medium")
    return styles.workCapabilityTaxonomyNodeMedium;
  if (node.criticality === "Low") return styles.workCapabilityTaxonomyNodeLow;
  return "";
}

function TaxonomyChartNode({ data }: { data: TaxonomyNodeData }) {
  const { node, branchSelected } = data;
  return (
    <div
      className={[
        styles.workCapabilityTaxonomyNode,
        styles[`workCapabilityTaxonomyNode_${node.kind}`],
        taxonomyNodeTone(node),
        node.selected ? styles.workCapabilityTaxonomyNodeSelected : "",
        branchSelected ? styles.workCapabilityTaxonomyNodeBranch : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Handle
        type="target"
        position={Position.Left}
        className={styles.workCapabilityTaxonomyHandle}
      />
      <div className={styles.workCapabilityTaxonomyNodeKind}>{node.kind}</div>
      <strong>{node.label}</strong>
      <div className={styles.workCapabilityTaxonomyNodeMeta}>
        {node.kind === "root" && (
          <span>{node.activityCount.toLocaleString()} activities</span>
        )}
        {node.kind === "domain" && (
          <>
            <span>{node.categoryCount.toLocaleString()} categories</span>
            <span>{(node.processCount ?? 0).toLocaleString()} processes</span>
            <span>{node.activityCount.toLocaleString()} activities</span>
          </>
        )}
        {node.kind === "category" && (
          <>
            <span>{(node.processCount ?? 0).toLocaleString()} processes</span>
            <span>{node.activityCount.toLocaleString()} activities</span>
          </>
        )}
        {node.kind === "process" && (
          <span>{node.activityCount.toLocaleString()} activities</span>
        )}
        {node.kind === "activity" && (
          <>
            <span>{node.criticality || "Unrated"}</span>
            <span>{node.nature || "Unclassified"}</span>
            <span>{node.automationPct ?? 0}% auto</span>
          </>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className={styles.workCapabilityTaxonomyHandle}
      />
    </div>
  );
}

const TAXONOMY_PALETTE = [
  "#00474a",
  "#005c5f",
  "#006b6b",
  "#007a80",
  "#008f95",
  "#00a3aa",
];

type TreemapDrill =
  | { level: "domain" }
  | { level: "category"; domainId: string; domainLabel: string }
  | {
      level: "process";
      domainId: string;
      domainLabel: string;
      categoryId: string;
      categoryLabel: string;
    };

interface TaxonomyDomainCellProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  depth?: number;
  index?: number;
  name?: string;
  categoryCount?: number;
  processCount?: number;
  activityCount?: number;
  criticalActivityCount?: number;
  isOther?: boolean;
  metricLabel?: string;
  nodeId?: string;
  drillLevel?: string;
  [key: string]: unknown;
}

function TaxonomyDomainCell({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  depth = 0,
  index = 0,
  name = "",
  categoryCount = 0,
  processCount = 0,
  activityCount = 0,
  criticalActivityCount = 0,
  isOther = false,
  metricLabel = "",
  drillLevel = "domain",
}: TaxonomyDomainCellProps) {
  if (depth < 1 || width < 8 || height < 8) return null;
  const fill = isOther
    ? "#8fa3b1"
    : (TAXONOMY_PALETTE[index % TAXONOMY_PALETTE.length] ?? "#006b6b");
  const pad = 9;
  const maxChars = Math.max(3, Math.floor((width - pad * 2) / 7));
  const shortName =
    name.length > maxChars ? name.slice(0, maxChars - 1) + "…" : name;
  const subLabel =
    drillLevel === "domain"
      ? `${categoryCount} cat · ${activityCount} act`
      : drillLevel === "category"
        ? `${processCount} proc · ${activityCount} act`
        : `${activityCount} activities`;
  const critLabel =
    criticalActivityCount > 0 ? `${criticalActivityCount} critical` : null;
  const fontSize = Math.min(13, Math.max(9, Math.floor(width / 10)));
  return (
    <g style={{ cursor: isOther ? "default" : "pointer" }}>
      <rect
        x={x + 1}
        y={y + 1}
        width={Math.max(0, width - 2)}
        height={Math.max(0, height - 2)}
        rx={4}
        ry={4}
        fill={fill}
        stroke="#fff"
        strokeWidth={2}
      />
      {width > 24 && height > 16 && (
        <text
          x={x + pad}
          y={y + 18}
          fill="#fff"
          fontSize={fontSize}
          fontWeight={700}
        >
          {shortName}
        </text>
      )}
      {width > 70 && height > 32 && (
        <text
          x={x + pad}
          y={y + 32}
          fill="rgba(255,255,255,0.88)"
          fontSize={Math.min(11, fontSize)}
          fontWeight={500}
        >
          {metricLabel}
        </text>
      )}
      {width > 100 && height > 46 && (
        <text x={x + pad} y={y + 46} fill="rgba(255,255,255,0.58)" fontSize={9}>
          {subLabel}
        </text>
      )}
      {critLabel && width > 80 && height > 60 && (
        <>
          <rect
            x={x + pad}
            y={y + 52}
            width={Math.min(width - pad * 2 - 4, critLabel.length * 6 + 10)}
            height={12}
            rx={2}
            ry={2}
            fill="rgba(220,38,38,0.75)"
          />
          <text
            x={x + pad + 4}
            y={y + 61}
            fill="#fff"
            fontSize={8.5}
            fontWeight={600}
          >
            {critLabel}
          </text>
        </>
      )}
    </g>
  );
}

function WorkCapabilityTaxonomyManager({
  dataset,
  orgRows,
  orgEmployeeIdColumn,
  columnMapping,
  onDatasetChange,
  readOnlyCatalog = false,
  combinedAnalysisChartsContent = null,
  combinedAnalysisPortfolioContent = null,
  onAddToStory,
}: {
  dataset: WorkCapabilityDataset;
  orgRows: ExcelRow[];
  orgEmployeeIdColumn: string;
  columnMapping: ColumnMapping | null;
  onDatasetChange: (dataset: WorkCapabilityDataset) => void;
  readOnlyCatalog?: boolean;
  combinedAnalysisChartsContent?: ReactNode;
  combinedAnalysisPortfolioContent?: ReactNode;
  onAddToStory?: (data: PendingData) => void;
}) {
  const [showExperimentalMap, setShowExperimentalMap] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState("taxonomy-root");
  const [selectedTreeId, setSelectedTreeId] = useState("all");
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(
    null,
  );
  const [selectedActivityIds, setSelectedActivityIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [criticalityFilter, setCriticalityFilter] = useState("");
  const [natureFilter, setNatureFilter] = useState("");
  const [ownershipGapOnly, setOwnershipGapOnly] = useState(false);
  const [skillRiskFilter, setSkillRiskFilter] = useState("");
  const [automationFilter, setAutomationFilter] = useState("");
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [archiveModalActivityIds, setArchiveModalActivityIds] = useState<
    string[] | null
  >(null);
  const [mergeModalActivityIds, setMergeModalActivityIds] = useState<
    string[] | null
  >(null);
  const [reviewHighlightIds, setReviewHighlightIds] = useState<string[] | null>(
    null,
  );
  const [treemapMetric, setTreemapMetric] = useState<
    "fte" | "cost" | "activities"
  >("fte");
  const [treemapDrill, setTreemapDrill] = useState<TreemapDrill>({
    level: "domain",
  });

  const activityLibrary = dataset.shared.activityLibrary;
  const activeActivities = activityLibrary.filter((row) =>
    boolCell(row, "active_flag"),
  );

  const processOptions = useMemo(
    () =>
      Array.from(
        new Set(
          activityLibrary
            .map((row) => textCell(row, "process_area"))
            .filter(Boolean),
        ),
      ).sort(),
    [activityLibrary],
  );
  const categoryOptions = useMemo(
    () =>
      Array.from(
        new Set(
          activityLibrary
            .map((row) => textCell(row, "activity_category"))
            .filter(Boolean),
        ),
      ).sort(),
    [activityLibrary],
  );

  const portfolio = useMemo(
    () =>
      buildWorkCapabilityActivityPortfolio({
        dataset,
        orgRows,
        orgEmployeeIdColumn,
        columnMapping,
        includeArchived: showInactive,
      }),
    [columnMapping, dataset, orgEmployeeIdColumn, orgRows, showInactive],
  );
  const cleanupSuggestions = useMemo(
    () => buildWorkCapabilityTaxonomyCleanupSuggestions({ dataset, portfolio }),
    [dataset, portfolio],
  );

  const treemapData = useMemo(() => {
    const fmtMetric = (fte: number, cost: number, act: number) =>
      treemapMetric === "fte"
        ? `${fte.toFixed(1)} FTE`
        : treemapMetric === "cost"
          ? fmtCost(cost)
          : `${act} activities`;
    const getSize = (fte: number, cost: number, act: number) =>
      Math.max(
        0.01,
        treemapMetric === "fte" ? fte : treemapMetric === "cost" ? cost : act,
      );
    const sortAsc = (
      a: { totalFTE: number; totalCost: number; activityCount: number },
      b: typeof a,
    ) =>
      treemapMetric === "fte"
        ? b.totalFTE - a.totalFTE
        : treemapMetric === "cost"
          ? b.totalCost - a.totalCost
          : b.activityCount - a.activityCount;

    let sourceNodes: typeof portfolio.tree = [];
    let otherNodes: typeof portfolio.tree = [];

    if (treemapDrill.level === "domain") {
      const all = portfolio.tree
        .filter((n) => n.kind === "domain")
        .sort(sortAsc);
      sourceNodes = all.slice(0, 6);
      otherNodes = all.slice(6);
    } else if (treemapDrill.level === "category") {
      sourceNodes = portfolio.tree
        .filter(
          (n) => n.kind === "category" && n.domain === treemapDrill.domainLabel,
        )
        .sort(sortAsc);
    } else {
      sourceNodes = portfolio.tree
        .filter(
          (n) =>
            n.kind === "process" &&
            n.domain === treemapDrill.domainLabel &&
            n.category === treemapDrill.categoryLabel,
        )
        .sort(sortAsc);
    }

    const items = sourceNodes.map((n) => ({
      name: n.label,
      size: getSize(n.totalFTE, n.totalCost, n.activityCount),
      totalFTE: n.totalFTE,
      totalCost: n.totalCost,
      activityCount: n.activityCount,
      categoryCount: n.categoryCount,
      processCount: n.processCount,
      criticalActivityCount: n.criticalActivityCount,
      metricLabel: fmtMetric(n.totalFTE, n.totalCost, n.activityCount),
      nodeId: n.id,
      isOther: false,
      drillLevel: treemapDrill.level,
    }));

    return { items, otherNodes };
  }, [portfolio.tree, treemapMetric, treemapDrill]);

  const filteredActivities = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return portfolio.activities.filter((activity) => {
      const matchesTree =
        selectedTreeId === "all" ||
        selectedTreeId === workCapabilityDomainNodeId(activity.domain) ||
        selectedTreeId ===
          workCapabilityCategoryNodeId(activity.domain, activity.category) ||
        selectedTreeId ===
          workCapabilityProcessNodeId(
            activity.domain,
            activity.category,
            activity.processArea,
          );
      const matchesQuery =
        !query ||
        [
          activity.activityName,
          activity.domain,
          activity.processArea,
          activity.category,
          activity.nature,
          activity.criticality,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      const matchesDepartment =
        !departmentFilter ||
        activity.deliveryFootprint.some(
          (row) => row.department === departmentFilter,
        );
      const matchesCriticality =
        !criticalityFilter || activity.criticality === criticalityFilter;
      const matchesNature = !natureFilter || activity.nature === natureFilter;
      const matchesOwnership =
        !ownershipGapOnly || activity.accountableCount === 0;
      const matchesSkillRisk =
        !skillRiskFilter || activity.skillRisk === skillRiskFilter;
      const matchesAutomation =
        !automationFilter ||
        (automationFilter === "high"
          ? activity.automationSaving > 0 &&
            activity.automationCostReductionPct >= 25
          : activity.automationSaving > 0);
      const matchesReview =
        !reviewHighlightIds || reviewHighlightIds.includes(activity.activityId);
      return (
        matchesTree &&
        matchesQuery &&
        matchesDepartment &&
        matchesCriticality &&
        matchesNature &&
        matchesOwnership &&
        matchesSkillRisk &&
        matchesAutomation &&
        matchesReview
      );
    });
  }, [
    automationFilter,
    criticalityFilter,
    departmentFilter,
    natureFilter,
    ownershipGapOnly,
    portfolio.activities,
    reviewHighlightIds,
    searchQuery,
    selectedTreeId,
    skillRiskFilter,
  ]);

  const selectedActivity =
    filteredActivities.find(
      (activity) => activity.activityId === selectedActivityId,
    ) ??
    portfolio.activities.find(
      (activity) => activity.activityId === selectedActivityId,
    ) ??
    null;
  const selectedActivities = useMemo(
    () =>
      portfolio.activities.filter((activity) =>
        selectedActivityIds.includes(activity.activityId),
      ),
    [portfolio.activities, selectedActivityIds],
  );
  const selectedVisibleActivityIds = useMemo(
    () => filteredActivities.map((activity) => activity.activityId),
    [filteredActivities],
  );
  const allVisibleSelected =
    filteredActivities.length > 0 &&
    selectedVisibleActivityIds.every((activityId) =>
      selectedActivityIds.includes(activityId),
    );

  const taxonomyGraph = useMemo(
    () =>
      buildWorkCapabilityTaxonomyGraph(dataset, {
        selectedNodeId,
        searchQuery,
        showInactive,
      }),
    [dataset, searchQuery, selectedNodeId, showInactive],
  );

  const selectedNode =
    taxonomyGraph.nodes.find((node) => node.id === selectedNodeId) ??
    taxonomyGraph.nodes[0] ??
    null;

  useEffect(() => {
    if (selectedNode) return;
    setSelectedNodeId("taxonomy-root");
  }, [selectedNode]);

  const selectedBranch = useMemo(() => {
    const branch = new Set<string>();
    let current: WorkCapabilityTaxonomyGraphNode | null = selectedNode;
    while (current) {
      branch.add(current.id);
      current =
        taxonomyGraph.nodes.find((node) => node.id === current?.parentId) ??
        null;
    }
    return branch;
  }, [selectedNode, taxonomyGraph.nodes]);

  const flowNodes = useMemo<Node<TaxonomyNodeData>[]>(() => {
    const depthIndex = new Map<number, number>();
    const depthWidth: Record<number, number> = {
      0: 0,
      1: 285,
      2: 585,
      3: 885,
      4: 1190,
    };
    return taxonomyGraph.nodes.map((node) => {
      const index = depthIndex.get(node.depth) ?? 0;
      depthIndex.set(node.depth, index + 1);
      const y = node.depth === 0 ? 180 : 42 + index * 118;
      return {
        id: node.id,
        type: "taxonomy",
        position: { x: depthWidth[node.depth] ?? node.depth * 290, y },
        draggable: false,
        data: {
          node,
          branchSelected: selectedBranch.has(node.id),
        },
      };
    });
  }, [selectedBranch, taxonomyGraph.nodes]);

  const flowEdges = useMemo<Edge[]>(
    () =>
      taxonomyGraph.edges.map((edge) => {
        const isBranchEdge =
          selectedBranch.has(edge.source) && selectedBranch.has(edge.target);
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: "smoothstep",
          animated: isBranchEdge,
          style: {
            stroke: isBranchEdge ? "#006b6b" : "#c8c1ae",
            strokeWidth: isBranchEdge ? 2.5 : 1.5,
          },
        };
      }),
    [selectedBranch, taxonomyGraph.edges],
  );

  const mutate = (mutation: TaxonomyMutation, nextSelection?: string) => {
    try {
      onDatasetChange(applyWorkCapabilityTaxonomyMutation(dataset, mutation));
      setSelectedActivityIds([]);
      if (nextSelection) setSelectedNodeId(nextSelection);
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "Could not update taxonomy",
      );
    }
  };

  const toggleActivitySelection = (activityId: string) => {
    setSelectedActivityIds((prev) =>
      prev.includes(activityId)
        ? prev.filter((id) => id !== activityId)
        : [...prev, activityId],
    );
  };

  const toggleVisibleSelection = () => {
    setSelectedActivityIds((prev) => {
      if (allVisibleSelected)
        return prev.filter((id) => !selectedVisibleActivityIds.includes(id));
      return Array.from(new Set([...prev, ...selectedVisibleActivityIds]));
    });
  };

  const resetFilters = () => {
    setDepartmentFilter("");
    setCriticalityFilter("");
    setNatureFilter("");
    setOwnershipGapOnly(false);
    setSkillRiskFilter("");
    setAutomationFilter("");
    setSelectedTreeId("all");
    setReviewHighlightIds(null);
  };

  return (
    <section className={styles.workCapabilityTaxonomy}>
      {!readOnlyCatalog && (
        <div className={styles.workCapabilityTaxonomyHeader}>
          <div>
            <p className={styles.workCapabilityKicker}>Process Taxonomy</p>
            <h3>Work catalog editor</h3>
            <p>
              Manage domains, categories, processes, and activity records from
              the catalog workspace.
            </p>
          </div>
          <div className={styles.workCapabilityTaxonomyStats}>
            <span>{activeActivities.length.toLocaleString()} active</span>
            <span>{activityLibrary.length.toLocaleString()} total</span>
          </div>
        </div>
      )}

      {!readOnlyCatalog && (
        <div className={styles.workCapabilityTaxonomyToolbar}>
          <div className={styles.workCapabilityViewTabs}>
            <button type="button" className={styles.workCapabilityImportBtn}>
              Catalog View
            </button>
          </div>
          {!readOnlyCatalog && (
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search activities"
              aria-label="Search taxonomy"
            />
          )}
          <details className={styles.workCapabilityFiltersDetail}>
            <summary
              className={styles.workCapabilitySecondaryBtn}
              style={{ listStyle: "none", cursor: "pointer" }}
            >
              Filters ▾
            </summary>
            <div className={styles.workCapabilityFiltersDropdown}>
              <select
                value={departmentFilter}
                onChange={(event) => setDepartmentFilter(event.target.value)}
              >
                <option value="">Department</option>
                {portfolio.filterOptions.departments.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <select
                value={criticalityFilter}
                onChange={(event) => setCriticalityFilter(event.target.value)}
              >
                <option value="">Criticality</option>
                {portfolio.filterOptions.criticalities.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <select
                value={natureFilter}
                onChange={(event) => setNatureFilter(event.target.value)}
              >
                <option value="">Nature</option>
                {portfolio.filterOptions.natures.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <select
                value={skillRiskFilter}
                onChange={(event) => setSkillRiskFilter(event.target.value)}
              >
                <option value="">Skill risk</option>
                {portfolio.filterOptions.skillRisks.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <select
                value={automationFilter}
                onChange={(event) => setAutomationFilter(event.target.value)}
              >
                <option value="">Automation</option>
                <option value="any">Has saving</option>
                <option value="high">High potential</option>
              </select>
              <button
                type="button"
                className={
                  ownershipGapOnly
                    ? styles.workCapabilityImportBtn
                    : styles.workCapabilitySecondaryBtn
                }
                onClick={() => setOwnershipGapOnly((prev) => !prev)}
              >
                Ownership Gap
              </button>
            </div>
          </details>
          <button
            type="button"
            className={styles.workCapabilitySecondaryBtn}
            onClick={resetFilters}
          >
            Reset Filters
          </button>
          <button
            type="button"
            className={
              showInactive
                ? styles.workCapabilityImportBtn
                : styles.workCapabilitySecondaryBtn
            }
            onClick={() => setShowInactive((prev) => !prev)}
          >
            {showInactive ? "Showing Archived" : "Hide Archived"}
          </button>
          {!readOnlyCatalog && (
            <button
              type="button"
              className={styles.workCapabilityImportBtn}
              onClick={() => setShowAddActivity(true)}
            >
              Add Activity
            </button>
          )}
        </div>
      )}

      <>
        <div className={styles.workCapabilityKpiStrip}>
          <MetricPill
            label="Activities"
            value={portfolio.kpis.totalActivities.toLocaleString()}
          />
          <MetricPill
            label="Mapped Cost"
            value={fmtCost(portfolio.kpis.mappedCost)}
          />
          <MetricPill
            label="Mapped FTE"
            value={portfolio.kpis.mappedFTE.toFixed(1)}
          />
          <MetricPill
            label="Critical"
            value={portfolio.kpis.criticalActivities.toLocaleString()}
          />
          <MetricPill
            label="Ownership Gaps"
            value={portfolio.kpis.ownershipGaps.toLocaleString()}
          />
          <MetricPill
            label="Automation Saving"
            value={fmtCost(portfolio.kpis.automationSaving)}
          />
        </div>

        <div className={styles.workCapabilitySnapshotLine}>
          {portfolio.kpis.totalActivities.toLocaleString()} activities mapped to{" "}
          <strong>{portfolio.kpis.mappedFTE.toFixed(1)} FTE</strong> and{" "}
          <strong>{fmtCost(portfolio.kpis.mappedCost)}</strong> cost, with{" "}
          <strong>{portfolio.kpis.ownershipGaps.toLocaleString()}</strong>{" "}
          ownership gap
          {portfolio.kpis.ownershipGaps === 1 ? "" : "s"} requiring cleanup
          before scenario planning.
        </div>

        <div className={styles.workCapabilityTreemapSection}>
          <div className={styles.workCapabilityTreemapHeader}>
            <div>
              <span className={styles.workCapabilityTreemapTitle}>
                {treemapDrill.level === "domain"
                  ? "Work is concentrated in a few taxonomy domains"
                  : treemapDrill.level === "category"
                    ? `Categories within ${treemapDrill.domainLabel}`
                    : `Processes within ${treemapDrill.categoryLabel}`}
              </span>
              <span className={styles.workCapabilityTreemapSub}>
                {treemapDrill.level === "domain"
                  ? "Click a domain to explore its categories."
                  : treemapDrill.level === "category"
                    ? "Click a category to explore its processes."
                    : "Click a process to filter the catalog below."}
              </span>
            </div>
            <div className={styles.workCapabilityTreemapToggleGroup}>
              {(["fte", "cost", "activities"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={
                    treemapMetric === m
                      ? styles.workCapabilityTreemapToggleActive
                      : styles.workCapabilityTreemapToggle
                  }
                  onClick={() => setTreemapMetric(m)}
                >
                  {m === "fte" ? "FTE" : m === "cost" ? "Cost" : "Activities"}
                </button>
              ))}
            </div>
          </div>

          {treemapDrill.level !== "domain" && (
            <div className={styles.workCapabilityTreemapBreadcrumbs}>
              <button
                type="button"
                className={styles.workCapabilityTreemapBreadcrumbBtn}
                onClick={() => {
                  setTreemapDrill({ level: "domain" });
                  setSelectedTreeId("all");
                }}
              >
                All Domains
              </button>
              <span className={styles.workCapabilityTreemapBreadcrumbSep}>
                ›
              </span>
              {treemapDrill.level === "category" && (
                <span className={styles.workCapabilityTreemapBreadcrumbCurrent}>
                  {treemapDrill.domainLabel}
                </span>
              )}
              {treemapDrill.level === "process" && (
                <>
                  <button
                    type="button"
                    className={styles.workCapabilityTreemapBreadcrumbBtn}
                    onClick={() => {
                      setTreemapDrill({
                        level: "category",
                        domainId: treemapDrill.domainId,
                        domainLabel: treemapDrill.domainLabel,
                      });
                      setSelectedTreeId(treemapDrill.domainId);
                    }}
                  >
                    {treemapDrill.domainLabel}
                  </button>
                  <span className={styles.workCapabilityTreemapBreadcrumbSep}>
                    ›
                  </span>
                  <span
                    className={styles.workCapabilityTreemapBreadcrumbCurrent}
                  >
                    {treemapDrill.categoryLabel}
                  </span>
                </>
              )}
            </div>
          )}

          <ResponsiveContainer width="100%" height={300}>
            <Treemap
              data={treemapData.items}
              dataKey="size"
              stroke="#fff"
              fill="#006b6b"
              isAnimationActive={false}
              content={(props: TaxonomyDomainCellProps) => (
                <TaxonomyDomainCell {...props} />
              )}
              onClick={(data: Record<string, unknown>) => {
                if (!data?.nodeId || data.isOther) return;
                const nodeId = data.nodeId as string;
                const nodeName = data.name as string;
                if (treemapDrill.level === "domain") {
                  setTreemapDrill({
                    level: "category",
                    domainId: nodeId,
                    domainLabel: nodeName,
                  });
                  setSelectedTreeId(nodeId);
                } else if (treemapDrill.level === "category") {
                  setTreemapDrill({
                    level: "process",
                    domainId: treemapDrill.domainId,
                    domainLabel: treemapDrill.domainLabel,
                    categoryId: nodeId,
                    categoryLabel: nodeName,
                  });
                  setSelectedTreeId(nodeId);
                } else {
                  setSelectedTreeId(
                    selectedTreeId === nodeId ? treemapDrill.domainId : nodeId,
                  );
                }
              }}
            />
          </ResponsiveContainer>

          {treemapDrill.level === "domain" &&
            treemapData.otherNodes.length > 0 && (
              <div className={styles.workCapabilityTreemapOtherList}>
                <span className={styles.workCapabilityTreemapOtherLabel}>
                  {treemapData.otherNodes.length} more:
                </span>
                {treemapData.otherNodes.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className={styles.workCapabilityTreemapOtherItem}
                    onClick={() => {
                      setTreemapDrill({
                        level: "category",
                        domainId: n.id,
                        domainLabel: n.label,
                      });
                      setSelectedTreeId(n.id);
                    }}
                  >
                    {n.label}
                  </button>
                ))}
              </div>
            )}

          {selectedTreeId !== "all" &&
            portfolio.tree.find((n) => n.id === selectedTreeId) != null && (
              <div className={styles.workCapabilityTreemapActiveHint}>
                Catalog filtered to:{" "}
                <strong>
                  {portfolio.tree.find((n) => n.id === selectedTreeId)!.label}
                </strong>{" "}
                —{" "}
                <button type="button" onClick={() => setSelectedTreeId("all")}>
                  clear filter
                </button>
              </div>
            )}
        </div>
        <div className={styles.workCapabilityCatalogWorkspace}>
          {onAddToStory && (
            <div
              style={{
                gridColumn: "1 / -1",
                display: "flex",
                justifyContent: "flex-end",
                paddingBottom: 8,
                borderBottom: "1px solid rgba(0,0,0,0.07)",
                marginBottom: 8,
              }}
            >
              <button
                onClick={() => {
                  const now = new Date().toISOString();
                  onAddToStory({
                    rows: filteredActivities.map((a) => ({
                      Activity: a.activityName,
                      Domain: a.domain,
                      Category: a.category,
                      Process: a.processArea,
                      Nature: a.nature,
                      Criticality: a.criticality,
                      Cost: a.totalCost,
                      FTE: a.totalFTE,
                      People: a.assignedPeople,
                      Accountable: a.accountableCount,
                      "Auto Saving %": a.automationCostReductionPct,
                    })),
                    columns: [
                      "Activity",
                      "Domain",
                      "Category",
                      "Process",
                      "Nature",
                      "Criticality",
                      "Cost",
                      "FTE",
                      "People",
                      "Accountable",
                      "Auto Saving %",
                    ],
                    source: {
                      type: "org-metrics",
                      label: "Work Capability Catalog",
                      capturedAt: now,
                    },
                    label: "Work Capability Catalog",
                  });
                }}
                style={{
                  background: "none",
                  border: "1px solid rgba(0,107,107,0.35)",
                  borderRadius: 3,
                  padding: "3px 10px",
                  fontSize: 11,
                  color: "var(--teal, #006b6b)",
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                + Story
              </button>
            </div>
          )}
          <aside className={styles.workCapabilityCatalogTree}>
            <button
              type="button"
              className={
                selectedTreeId === "all"
                  ? styles.workCapabilityTreeNodeActive
                  : styles.workCapabilityTreeNode
              }
              onClick={() => setSelectedTreeId("all")}
            >
              <strong>All Domains</strong>
              <span>
                {portfolio.kpis.totalActivities.toLocaleString()} activities
              </span>
            </button>
            {portfolio.tree
              .filter((node) => node.kind === "domain")
              .map((domainNode) => (
                <div
                  key={domainNode.id}
                  className={styles.workCapabilityTreeGroup}
                >
                  <button
                    type="button"
                    className={
                      selectedTreeId === domainNode.id
                        ? styles.workCapabilityTreeNodeActive
                        : styles.workCapabilityTreeNode
                    }
                    onClick={() => setSelectedTreeId(domainNode.id)}
                  >
                    <strong>{domainNode.label}</strong>
                    <span>
                      {domainNode.categoryCount} cat | {domainNode.processCount}{" "}
                      proc | {domainNode.activityCount} act
                    </span>
                    <span>
                      {fmtCost(domainNode.totalCost)} |{" "}
                      {domainNode.totalFTE.toFixed(1)} FTE |{" "}
                      {domainNode.criticalActivityCount} high
                    </span>
                  </button>
                  {portfolio.tree
                    .filter(
                      (node) =>
                        node.kind === "category" &&
                        node.domain === domainNode.domain,
                    )
                    .map((categoryNode) => (
                      <div key={categoryNode.id}>
                        <button
                          type="button"
                          className={
                            selectedTreeId === categoryNode.id
                              ? styles.workCapabilityTreeChildActive
                              : styles.workCapabilityTreeChild
                          }
                          onClick={() => setSelectedTreeId(categoryNode.id)}
                        >
                          <strong>{categoryNode.label}</strong>
                          <span>
                            {categoryNode.processCount} proc |{" "}
                            {categoryNode.activityCount} act |{" "}
                            {categoryNode.criticalActivityCount} high
                          </span>
                        </button>
                        {portfolio.tree
                          .filter(
                            (node) =>
                              node.kind === "process" &&
                              node.domain === domainNode.domain &&
                              node.category === categoryNode.category,
                          )
                          .map((processNode) => (
                            <button
                              key={processNode.id}
                              type="button"
                              className={
                                selectedTreeId === processNode.id
                                  ? styles.workCapabilityTreeGrandchildActive
                                  : styles.workCapabilityTreeGrandchild
                              }
                              onClick={() => setSelectedTreeId(processNode.id)}
                            >
                              <strong>{processNode.label}</strong>
                              <span>
                                {processNode.activityCount} act |{" "}
                                {processNode.criticalActivityCount} high
                              </span>
                            </button>
                          ))}
                      </div>
                    ))}
                </div>
              ))}
          </aside>

          <div className={styles.workCapabilityActivityTableWrap}>
            {reviewHighlightIds && (
              <div className={styles.workCapabilityReviewBanner}>
                <span>
                  Showing {reviewHighlightIds.length} flagged activities from
                  catalog suggestion
                </span>
                <button
                  type="button"
                  onClick={() => setReviewHighlightIds(null)}
                >
                  Clear
                </button>
              </div>
            )}
            {!readOnlyCatalog && selectedActivityIds.length > 0 && (
              <div className={styles.workCapabilityBulkActionBar}>
                <strong>
                  {selectedActivityIds.length.toLocaleString()} selected
                </strong>
                <span>
                  {selectedActivities
                    .map((activity) => activity.activityName)
                    .slice(0, 2)
                    .join(", ")}
                </span>
                <button
                  type="button"
                  onClick={() => setMergeModalActivityIds(selectedActivityIds)}
                  disabled={selectedActivityIds.length < 2}
                >
                  Merge Activities
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setArchiveModalActivityIds(selectedActivityIds)
                  }
                >
                  Archive Selected
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedActivityIds([])}
                >
                  Clear
                </button>
              </div>
            )}
            <table className={styles.workCapabilityActivityTable}>
              <thead>
                <tr>
                  {!readOnlyCatalog && (
                    <th>
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleVisibleSelection}
                        aria-label="Select visible activities"
                      />
                    </th>
                  )}
                  <th>Activity</th>
                  <th>Domain</th>
                  <th>Category</th>
                  <th>Process</th>
                  <th>Nature</th>
                  <th>Criticality</th>
                  <th>Complexity</th>
                  <th>Frequency</th>
                  <th>People</th>
                  <th>Cost</th>
                  <th>FTE</th>
                  <th>Accountable</th>
                  <th>Auto Saving</th>
                  <th>Skill Risk</th>
                  {!readOnlyCatalog && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredActivities.map((activity) => (
                  <tr
                    key={activity.activityId}
                    className={
                      selectedActivityId === activity.activityId
                        ? styles.workCapabilityActivityRowSelected
                        : ""
                    }
                  >
                    {!readOnlyCatalog && (
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedActivityIds.includes(
                            activity.activityId,
                          )}
                          onChange={() =>
                            toggleActivitySelection(activity.activityId)
                          }
                          aria-label={`Select ${activity.activityName}`}
                        />
                      </td>
                    )}
                    <td>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedActivityId(activity.activityId);
                          setShowAddActivity(false);
                        }}
                      >
                        {activity.activityName}
                      </button>
                    </td>
                    <td>{activity.domain}</td>
                    <td>{activity.category}</td>
                    <td>{activity.processArea}</td>
                    <td>{activity.nature}</td>
                    <td>{activity.criticality}</td>
                    <td>{activity.complexity}</td>
                    <td>{activity.frequency}</td>
                    <td>{activity.assignedPeople}</td>
                    <td>{fmtCost(activity.totalCost)}</td>
                    <td>{activity.totalFTE.toFixed(1)}</td>
                    <td>{activity.accountableCount}</td>
                    <td>{activity.automationCostReductionPct}%</td>
                    <td>{activity.skillRisk}</td>
                    {!readOnlyCatalog && (
                      <td>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedActivityId(activity.activityId);
                            setShowAddActivity(false);
                          }}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setArchiveModalActivityIds([activity.activityId])
                          }
                        >
                          Archive
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {filteredActivities.length === 0 && (
                  <tr>
                    <td colSpan={readOnlyCatalog ? 14 : 16}>
                      No activities match the current catalog filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <aside className={styles.workCapabilityActivityDetailPanel}>
            {!readOnlyCatalog && showAddActivity ? (
              <WorkCapabilityAddActivityForm
                dataset={dataset}
                selectedTreeId={selectedTreeId}
                processOptions={processOptions}
                categoryOptions={categoryOptions}
                onCancel={() => setShowAddActivity(false)}
                onAdd={(row) => {
                  mutate(
                    { type: "add_activity", row },
                    workCapabilityActivityNodeId(row.activity_id),
                  );
                  setSelectedActivityId(row.activity_id);
                  setShowAddActivity(false);
                }}
              />
            ) : (
              <WorkCapabilityActivityDetailPanel
                activity={selectedActivity}
                dataset={dataset}
                processOptions={processOptions}
                categoryOptions={categoryOptions}
                allActivities={portfolio.activities}
                selectedActivityIds={selectedActivityIds}
                onArchive={(activityIds) =>
                  setArchiveModalActivityIds(activityIds)
                }
                onMerge={(activityIds) => setMergeModalActivityIds(activityIds)}
                onMutate={mutate}
                readOnly={readOnlyCatalog}
              />
            )}
          </aside>
        </div>
        <div className={styles.workCapabilityVisualRow}>
          {/* Left: Work by Domain — larger card, top 8 + Other */}
          <div className={styles.workCapabilityVisualCard}>
            <strong>Work by Domain</strong>
            {(() => {
              const allDomains = portfolio.tree
                .filter((n) => n.kind === "domain")
                .sort(
                  (a, b) =>
                    b.totalCost - a.totalCost || b.totalFTE - a.totalFTE,
                );
              const top = allDomains.slice(0, 8);
              const rest = allDomains.slice(8);
              const otherCost = rest.reduce((s, n) => s + n.totalCost, 0);
              const maxCost = Math.max(1, top[0]?.totalCost ?? 0, otherCost);
              return (
                <>
                  {top.map((n) => (
                    <div key={n.id} className={styles.workCapabilityVisualBar}>
                      <span className={styles.workCapabilityVisualBarLabel}>
                        {n.label}
                      </span>
                      <div className={styles.workCapabilityVisualBarTrack}>
                        <div
                          className={styles.workCapabilityVisualBarFill}
                          style={{
                            width: `${Math.max(4, (n.totalCost / maxCost) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className={styles.workCapabilityVisualBarValue}>
                        {fmtCost(n.totalCost)}
                      </span>
                    </div>
                  ))}
                  {rest.length > 0 && (
                    <div className={styles.workCapabilityVisualBar}>
                      <span className={styles.workCapabilityVisualBarLabel}>
                        Other ({rest.length})
                      </span>
                      <div className={styles.workCapabilityVisualBarTrack}>
                        <div
                          className={styles.workCapabilityVisualBarFill}
                          style={{
                            width: `${Math.max(4, (otherCost / maxCost) * 100)}%`,
                            opacity: 0.45,
                          }}
                        />
                      </div>
                      <span className={styles.workCapabilityVisualBarValue}>
                        {fmtCost(otherCost)}
                      </span>
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          {/* Right: stacked Quality Mix + Automation Opportunity */}
          <div className={styles.workCapabilityVisualRightStack}>
            <div className={styles.workCapabilityVisualCard}>
              <strong>Quality Mix</strong>
              {(() => {
                const total = Math.max(1, portfolio.kpis.totalActivities);
                const critPct =
                  (portfolio.kpis.criticalActivities / total) * 100;
                const gapPct = (portfolio.kpis.ownershipGaps / total) * 100;
                return (
                  <div className={styles.workCapabilityQualityStats}>
                    <div>
                      <span
                        className={styles.workCapabilityQualityNum}
                        style={{ color: "#dc2626" }}
                      >
                        {portfolio.kpis.criticalActivities}
                      </span>
                      <span className={styles.workCapabilityQualityLabel}>
                        critical <span>({critPct.toFixed(0)}%)</span>
                      </span>
                    </div>
                    <div>
                      <span
                        className={styles.workCapabilityQualityNum}
                        style={{ color: "#d97706" }}
                      >
                        {portfolio.kpis.ownershipGaps}
                      </span>
                      <span className={styles.workCapabilityQualityLabel}>
                        ownership gaps <span>({gapPct.toFixed(0)}%)</span>
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className={styles.workCapabilityVisualCard}>
              <strong>Automation Opportunity</strong>
              {(() => {
                const cost = portfolio.kpis.mappedCost;
                const saving = portfolio.kpis.automationSaving;
                const pct = cost > 0 ? Math.min(100, (saving / cost) * 100) : 0;
                return (
                  <>
                    <div className={styles.workCapabilityAutoSavingBig}>
                      {fmtCost(saving)}
                    </div>
                    <div className={styles.workCapabilityAutoSavingSub}>
                      {pct.toFixed(0)}% of {fmtCost(cost)} mapped cost
                    </div>
                    <div className={styles.workCapabilityVisualBarTrack}>
                      <div
                        className={styles.workCapabilityVisualBarFillAmber}
                        style={{ width: `${Math.max(4, pct)}%` }}
                      />
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Taxonomy concentration treemap */}
        {combinedAnalysisChartsContent}

        {combinedAnalysisPortfolioContent}

        <WorkCapabilityTaxonomyCleanupPanel
          suggestions={cleanupSuggestions}
          readOnlyCatalog={readOnlyCatalog}
          onReview={(activityIds) => {
            setReviewHighlightIds(activityIds);
            const firstActivityId = activityIds[0];
            if (firstActivityId) setSelectedActivityId(firstActivityId);
          }}
          onMerge={(activityIds) => setMergeModalActivityIds(activityIds)}
          onArchive={(activityIds) => setArchiveModalActivityIds(activityIds)}
        />
      </>

      {showExperimentalMap && (
        <div className={styles.workCapabilityTaxonomyWorkspace}>
          <div className={styles.workCapabilityTaxonomyCanvas}>
            <ReactFlow
              nodes={flowNodes}
              edges={flowEdges}
              nodeTypes={taxonomyNodeTypes}
              fitView
              minZoom={0.35}
              maxZoom={1.4}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable
              onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            >
              <Background color="#d8d1c0" gap={18} />
              <Controls showInteractive={false} />
              <MiniMap
                pannable
                zoomable
                nodeColor={(node) => {
                  const kind = (node.data as TaxonomyNodeData | undefined)?.node
                    ?.kind;
                  return kind === "activity"
                    ? "#5b8a8a"
                    : kind === "process"
                      ? "#7b6f2a"
                      : kind === "category"
                        ? "#c0a800"
                        : kind === "domain"
                          ? "#006b6b"
                          : "#202020";
                }}
              />
            </ReactFlow>
          </div>

          <aside className={styles.workCapabilityInspector}>
            <TaxonomyInspector
              selectedNode={selectedNode}
              dataset={dataset}
              processOptions={processOptions}
              categoryOptions={categoryOptions}
              onMutate={mutate}
              onSelect={setSelectedNodeId}
            />
          </aside>
        </div>
      )}

      {!readOnlyCatalog && archiveModalActivityIds && (
        <WorkCapabilityArchiveModal
          impact={getWorkCapabilityArchiveImpact({
            dataset,
            portfolio,
            activityIds: archiveModalActivityIds,
          })}
          activityIds={archiveModalActivityIds}
          onCancel={() => setArchiveModalActivityIds(null)}
          onConfirm={() => {
            mutate({
              type: "deactivate_activities",
              activityIds: archiveModalActivityIds,
            });
            setArchiveModalActivityIds(null);
            setSelectedActivityId(null);
          }}
        />
      )}

      {!readOnlyCatalog && mergeModalActivityIds && (
        <WorkCapabilityMergeModal
          dataset={dataset}
          portfolio={portfolio}
          activityIds={mergeModalActivityIds}
          onCancel={() => setMergeModalActivityIds(null)}
          onConfirm={(survivorId) => {
            mutate(
              {
                type: "merge_activities",
                sourceActivityIds: mergeModalActivityIds,
                targetActivityId: survivorId,
              },
              workCapabilityActivityNodeId(survivorId),
            );
            setSelectedActivityId(survivorId);
            setMergeModalActivityIds(null);
          }}
        />
      )}

      {!readOnlyCatalog && (
        <div className={styles.workCapabilityTaxonomyFooter}>
          <div className={styles.workCapabilityChangeLog}>
            <strong>Taxonomy Change Log</strong>
            {(dataset.taxonomyChangeLog ?? []).slice(-5).map((change) => (
              <span key={change.id}>
                {change.action}: {change.target} ({impactText(change.affected)})
              </span>
            ))}
            {(dataset.taxonomyChangeLog ?? []).length === 0 && (
              <span>No taxonomy edits this session.</span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.workCapabilityKpiCard}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function nextActivityId(dataset: WorkCapabilityDataset): string {
  const max = dataset.shared.activityLibrary.reduce((current, row) => {
    const match = textCell(row, "activity_id").match(/(\d+)$/);
    return match ? Math.max(current, Number(match[1])) : current;
  }, 0);
  return `ACT${String(max + 1).padStart(3, "0")}`;
}

function parseCatalogTreeSelection(selectedTreeId: string): {
  domain: string;
  category: string;
  processArea: string;
} {
  if (selectedTreeId.startsWith("process::")) {
    const [domain = "", category = "", processArea = ""] = selectedTreeId
      .slice("process::".length)
      .split("::");
    return { domain, category, processArea };
  }
  if (selectedTreeId.startsWith("category::")) {
    const [domain = "", category = ""] = selectedTreeId
      .slice("category::".length)
      .split("::");
    return { domain, category, processArea: "" };
  }
  if (selectedTreeId.startsWith("domain::")) {
    return {
      domain: selectedTreeId.slice("domain::".length),
      category: "",
      processArea: "",
    };
  }
  return { domain: "", category: "", processArea: "" };
}

function WorkCapabilityAddActivityForm({
  dataset,
  selectedTreeId,
  processOptions,
  categoryOptions,
  onCancel,
  onAdd,
}: {
  dataset: WorkCapabilityDataset;
  selectedTreeId: string;
  processOptions: string[];
  categoryOptions: string[];
  onCancel: () => void;
  onAdd: (row: ActivityLibraryRow) => void;
}) {
  const selectedTaxonomy = useMemo(
    () => parseCatalogTreeSelection(selectedTreeId),
    [selectedTreeId],
  );
  const [draft, setDraft] = useState<ActivityLibraryRow>({
    ...EMPTY_ACTIVITY_DRAFT,
    activity_id: "",
    department_focus: selectedTaxonomy.domain,
    process_area: selectedTaxonomy.processArea,
    activity_category: selectedTaxonomy.category,
    created_source: "Manual",
  });

  useEffect(() => {
    setDraft((prev) => ({
      ...prev,
      department_focus: selectedTaxonomy.domain || prev.department_focus,
      process_area: selectedTaxonomy.processArea || prev.process_area,
      activity_category: selectedTaxonomy.category || prev.activity_category,
    }));
  }, [selectedTaxonomy]);

  const update = (
    field: keyof ActivityLibraryRow,
    value: string | number | boolean,
  ) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className={styles.workCapabilityActivityDetailInner}>
      <p className={styles.workCapabilityKicker}>Add Activity</p>
      <h3>Create catalog activity</h3>
      <label>
        Activity ID
        <input
          value={draft.activity_id}
          onChange={(event) => update("activity_id", event.target.value)}
          placeholder="ACT###"
        />
      </label>
      <label>
        Activity name
        <input
          value={draft.activity_name}
          onChange={(event) => update("activity_name", event.target.value)}
        />
      </label>
      <label>
        Process area
        <input
          value={draft.process_area}
          list="catalog-add-process-options"
          onChange={(event) => update("process_area", event.target.value)}
        />
      </label>
      <datalist id="catalog-add-process-options">
        {processOptions.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>
      <label>
        Category
        <input
          value={draft.activity_category}
          list="catalog-add-category-options"
          onChange={(event) => update("activity_category", event.target.value)}
        />
      </label>
      <datalist id="catalog-add-category-options">
        {categoryOptions.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>
      <label>
        Department focus
        <input
          value={draft.department_focus}
          onChange={(event) => update("department_focus", event.target.value)}
        />
      </label>
      <label>
        Nature
        <select
          value={draft.nature}
          onChange={(event) => update("nature", event.target.value)}
        >
          {["Strategic", "Operational", "Transactional", "Governance"].map(
            (value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ),
          )}
        </select>
      </label>
      <label>
        Criticality
        <select
          value={draft.criticality}
          onChange={(event) => update("criticality", event.target.value)}
        >
          {["Low", "Medium", "High"].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <div className={styles.workCapabilityEditorActions}>
        <button
          type="button"
          className={styles.workCapabilitySecondaryBtn}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() =>
            onAdd({
              ...draft,
              activity_id: draft.activity_id || nextActivityId(dataset),
              active_flag: true,
              created_source: "Manual",
              last_updated_at: new Date().toISOString(),
            })
          }
          disabled={
            !draft.activity_name ||
            !draft.process_area ||
            !draft.activity_category
          }
        >
          Add Activity
        </button>
      </div>
    </div>
  );
}

function WorkCapabilityActivityDetailPanel({
  activity,
  dataset,
  processOptions,
  categoryOptions,
  allActivities,
  selectedActivityIds,
  onArchive,
  onMerge,
  onMutate,
  readOnly = false,
}: {
  activity: WorkCapabilityActivityMetric | null;
  dataset: WorkCapabilityDataset;
  processOptions: string[];
  categoryOptions: string[];
  allActivities: WorkCapabilityActivityMetric[];
  selectedActivityIds: string[];
  onArchive: (activityIds: string[]) => void;
  onMerge: (activityIds: string[]) => void;
  onMutate: (mutation: TaxonomyMutation, nextSelection?: string) => void;
  readOnly?: boolean;
}) {
  const [detailEditMode, setDetailEditMode] = useState(false);
  const sourceActivity = activity
    ? (dataset.shared.activityLibrary.find(
        (row) => textCell(row, "activity_id") === activity.activityId,
      ) ?? null)
    : null;

  useEffect(() => {
    setDetailEditMode(false);
  }, [activity?.activityId]);

  if (!activity || !sourceActivity) {
    return (
      <div className={styles.workCapabilityActivityDetailEmpty}>
        <p className={styles.workCapabilityKicker}>Activity Detail</p>
        <h3>Select an activity</h3>
        <p>
          Choose a row from the portfolio table to review delivery footprint,
          skills, and activity context.
        </p>
      </div>
    );
  }

  const skillRequirementCount = dataset.shared.activitySkillRequirements.filter(
    (row) => textCell(row, "activity_id") === activity.activityId,
  ).length;

  return (
    <div className={styles.workCapabilityActivityDetailInner}>
      <p className={styles.workCapabilityKicker}>Activity Detail</p>
      <div className={styles.workCapabilityDetailHeader}>
        <h3>{activity.activityName}</h3>
        {!readOnly && (
          <button
            type="button"
            className={
              detailEditMode
                ? styles.workCapabilityImportBtn
                : styles.workCapabilitySecondaryBtn
            }
            onClick={() => setDetailEditMode((prev) => !prev)}
          >
            {detailEditMode ? "Close Edit" : "Edit Activity"}
          </button>
        )}
      </div>
      <div className={styles.workCapabilityActivityPath}>
        {activity.domain} / {activity.category} / {activity.processArea}
      </div>

      <div className={styles.workCapabilityDetailCards}>
        <MetricPill label="Total Cost" value={fmtCost(activity.totalCost)} />
        <MetricPill label="Total FTE" value={activity.totalFTE.toFixed(1)} />
        <MetricPill label="People" value={String(activity.assignedPeople)} />
        <MetricPill
          label="Departments"
          value={String(activity.departmentsInvolved)}
        />
        <MetricPill
          label="Accountable"
          value={String(activity.accountableCount)}
        />
        <MetricPill
          label="Responsible"
          value={String(activity.responsibleCount)}
        />
      </div>

      {!readOnly && detailEditMode ? (
        <ActivityTaxonomyEditor
          activity={sourceActivity}
          processOptions={processOptions}
          categoryOptions={categoryOptions}
          onSave={(patch) => {
            onMutate(
              {
                type: "update_activity",
                activityId: activity.activityId,
                patch,
              },
              workCapabilityActivityNodeId(activity.activityId),
            );
            setDetailEditMode(false);
          }}
          onDeactivate={() => onArchive([activity.activityId])}
        />
      ) : (
        <div className={styles.workCapabilityReadOnlyFacts}>
          <span>
            Nature: <strong>{activity.nature || "Unclassified"}</strong>
          </span>
          <span>
            Criticality: <strong>{activity.criticality || "Unrated"}</strong>
          </span>
          <span>
            Complexity: <strong>{activity.complexity || "Unrated"}</strong>
          </span>
          <span>
            Frequency: <strong>{activity.frequency || "Unspecified"}</strong>
          </span>
          <span>
            Automation: <strong>{activity.automationCostReductionPct}%</strong>
          </span>
          <span>
            Outsourcing:{" "}
            <strong>{activity.outsourcingCostReductionPct}%</strong>
          </span>
        </div>
      )}

      <div className={styles.workCapabilityDetailSection}>
        <strong>Delivery Footprint</strong>
        <table>
          <thead>
            <tr>
              <th>Person</th>
              <th>Role</th>
              <th>Dept</th>
              <th>Grade</th>
              <th>Time</th>
              <th>Cost</th>
              <th>RACI</th>
            </tr>
          </thead>
          <tbody>
            {activity.deliveryFootprint.map((row) => (
              <tr key={row.assignmentId || row.employeeId}>
                <td>{row.employeeName || row.employeeId}</td>
                <td>{row.role}</td>
                <td>{row.department}</td>
                <td>{row.grade}</td>
                <td>{row.timeAllocationPct}%</td>
                <td>{fmtCost(row.costContribution)}</td>
                <td>{row.accountability}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.workCapabilityDetailSection}>
        <strong>Required Skills</strong>
        <table>
          <thead>
            <tr>
              <th>Skill</th>
              <th>Required</th>
              <th>Coverage</th>
              <th>Gap</th>
            </tr>
          </thead>
          <tbody>
            {activity.requiredSkills.map((skill) => (
              <tr key={skill.skillId}>
                <td>{skill.skillName}</td>
                <td>{skill.requiredLevel}</td>
                <td>
                  {skill.coveragePct == null
                    ? "Unknown"
                    : `${skill.coveragePct.toFixed(0)}%`}
                </td>
                <td>{skill.gap}</td>
              </tr>
            ))}
            {activity.requiredSkills.length === 0 && (
              <tr>
                <td colSpan={4}>No required skills mapped.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!readOnly && (
        <div className={styles.workCapabilityDetailSection}>
          <strong>Scenario Levers</strong>
          <div className={styles.workCapabilityScenarioLevers}>
            <button type="button">
              Automate: {fmtCost(activity.automationSaving)}
            </button>
            <button type="button">
              Outsource: {fmtCost(activity.outsourcingSaving)}
            </button>
            <button type="button">Consolidate</button>
            <button type="button">Reassign Owner</button>
          </div>
        </div>
      )}

      {!readOnly && (
        <div className={styles.workCapabilityInspectorForm}>
          <strong>Activity Actions</strong>
          <span>
            {skillRequirementCount.toLocaleString()} skill requirement
            {skillRequirementCount === 1 ? "" : "s"} linked to this activity.
          </span>
          <button
            type="button"
            onClick={() =>
              onMerge(
                selectedActivityIds.length >= 2
                  ? selectedActivityIds
                  : [activity.activityId],
              )
            }
            disabled={selectedActivityIds.length < 2}
            title={
              selectedActivityIds.length < 2
                ? "Select 2 or more activities using checkboxes to merge"
                : undefined
            }
          >
            {selectedActivityIds.length >= 2
              ? `Merge ${selectedActivityIds.length} selected`
              : "Merge (select 2+ first)"}
          </button>
          <button
            type="button"
            onClick={() => onArchive([activity.activityId])}
          >
            Archive Activity
          </button>
        </div>
      )}
    </div>
  );
}

function WorkCapabilityArchiveModal({
  activityIds,
  impact,
  onCancel,
  onConfirm,
}: {
  activityIds: string[];
  impact: WorkCapabilityArchiveImpact;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className={styles.workCapabilityActionModalOverlay}
      role="dialog"
      aria-modal="true"
      aria-label="Archive activity"
    >
      <div className={styles.workCapabilityActionModal}>
        <p className={styles.workCapabilityKicker}>Archive Activity</p>
        <h3>Archive selected activities?</h3>
        <p>
          This is a soft delete. The rows stay in memory, but archived
          activities are hidden from default catalog metrics.
        </p>
        <div className={styles.workCapabilityModalImpactGrid}>
          <MetricPill
            label="Activities"
            value={impact.activityCount.toLocaleString()}
          />
          <MetricPill
            label="People"
            value={impact.assignedPeople.toLocaleString()}
          />
          <MetricPill label="Cost" value={fmtCost(impact.totalCost)} />
          <MetricPill label="FTE" value={impact.totalFTE.toFixed(1)} />
          <MetricPill
            label="Skill Reqs"
            value={impact.skillRequirements.toLocaleString()}
          />
          <MetricPill
            label="RACI Links"
            value={impact.accountabilityLinks.toLocaleString()}
          />
        </div>
        <div className={styles.workCapabilityModalIdList}>
          {activityIds.map((activityId) => (
            <span key={activityId}>{activityId}</span>
          ))}
        </div>
        <div className={styles.workCapabilityModalActions}>
          <button
            type="button"
            className={styles.workCapabilitySecondaryBtn}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.workCapabilityImportBtn}
            onClick={onConfirm}
          >
            Archive Activity
          </button>
        </div>
      </div>
    </div>
  );
}

function WorkCapabilityMergeModal({
  dataset,
  portfolio,
  activityIds,
  onCancel,
  onConfirm,
}: {
  dataset: WorkCapabilityDataset;
  portfolio: WorkCapabilityActivityPortfolio;
  activityIds: string[];
  onCancel: () => void;
  onConfirm: (survivorId: string) => void;
}) {
  const selectedActivities = portfolio.activities.filter((activity) =>
    activityIds.includes(activity.activityId),
  );
  const [survivorId, setSurvivorId] = useState(activityIds[0] ?? "");
  const impact: WorkCapabilityMergeImpact | null = survivorId
    ? getWorkCapabilityMergeImpact({
        dataset,
        portfolio,
        sourceActivityIds: activityIds,
        targetActivityId: survivorId,
      })
    : null;
  const canMerge = selectedActivities.length >= 2 && !!survivorId;

  return (
    <div
      className={styles.workCapabilityActionModalOverlay}
      role="dialog"
      aria-modal="true"
      aria-label="Merge activities"
    >
      <div className={styles.workCapabilityActionModal}>
        <p className={styles.workCapabilityKicker}>Merge Activities</p>
        <h3>Choose the surviving activity</h3>
        <p>
          Assignments and skill requirements from non-survivors will be
          repointed to the survivor, then non-survivors are archived.
        </p>
        <label>
          Survivor activity
          <select
            value={survivorId}
            onChange={(event) => setSurvivorId(event.target.value)}
          >
            {selectedActivities.map((activity) => (
              <option key={activity.activityId} value={activity.activityId}>
                {activity.activityName}
              </option>
            ))}
          </select>
        </label>
        {impact && (
          <div className={styles.workCapabilityModalImpactGrid}>
            <MetricPill
              label="Assignments Moved"
              value={impact.assignmentsMoved.toLocaleString()}
            />
            <MetricPill
              label="Skill Reqs Merged"
              value={impact.skillRequirementsMerged.toLocaleString()}
            />
            <MetricPill
              label="Skill Reqs Deduped"
              value={impact.duplicateSkillRequirementsDeduped.toLocaleString()}
            />
            <MetricPill
              label="Cost Affected"
              value={fmtCost(impact.costAffected)}
            />
            <MetricPill
              label="FTE Affected"
              value={impact.fteAffected.toFixed(1)}
            />
          </div>
        )}
        <div className={styles.workCapabilityModalIdList}>
          {selectedActivities.map((activity) => (
            <span key={activity.activityId}>
              {activity.activityId}: {activity.activityName}
            </span>
          ))}
        </div>
        {selectedActivities.length < 2 && (
          <p className={styles.workCapabilityModalWarning}>
            Select at least two activities to merge.
          </p>
        )}
        <div className={styles.workCapabilityModalActions}>
          <button
            type="button"
            className={styles.workCapabilitySecondaryBtn}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.workCapabilityImportBtn}
            onClick={() => onConfirm(survivorId)}
            disabled={!canMerge}
          >
            Merge Activities
          </button>
        </div>
      </div>
    </div>
  );
}

function WorkCapabilityTaxonomyCleanupPanel({
  suggestions,
  onReview,
  onMerge,
  onArchive,
  readOnlyCatalog = false,
}: {
  suggestions: ReturnType<typeof buildWorkCapabilityTaxonomyCleanupSuggestions>;
  onReview: (activityIds: string[]) => void;
  onMerge: (activityIds: string[]) => void;
  onArchive: (activityIds: string[]) => void;
  readOnlyCatalog?: boolean;
}) {
  return (
    <div className={styles.workCapabilityCleanupPanel}>
      <div className={styles.workCapabilityCleanupHeader}>
        <div>
          <p className={styles.workCapabilityKicker}>
            Taxonomy Cleanup Suggestions
          </p>
          <h3>Review catalog quality</h3>
        </div>
        <span>{suggestions.length.toLocaleString()} suggestions</span>
      </div>
      <div
        className={styles.workCapabilityCleanupList}
        style={{ maxHeight: 360, overflowY: "auto" }}
      >
        {suggestions.map((suggestion) => (
          <div key={suggestion.id} className={styles.workCapabilityCleanupItem}>
            <div>
              <strong>{suggestion.title}</strong>
              <p>{suggestion.description}</p>
              <span>
                {suggestion.severity} | {suggestion.count.toLocaleString()}{" "}
                affected
              </span>
            </div>
            <div className={styles.workCapabilityCleanupActions}>
              {suggestion.actions.includes("Review") && (
                <button
                  type="button"
                  onClick={() => onReview(suggestion.activityIds)}
                >
                  Review
                </button>
              )}
              {!readOnlyCatalog && suggestion.actions.includes("Merge") && (
                <button
                  type="button"
                  onClick={() => onMerge(suggestion.activityIds)}
                  disabled={suggestion.activityIds.length < 2}
                >
                  Merge
                </button>
              )}
              {!readOnlyCatalog && suggestion.actions.includes("Archive") && (
                <button
                  type="button"
                  onClick={() => onArchive(suggestion.activityIds)}
                >
                  Archive
                </button>
              )}
              {!readOnlyCatalog &&
                suggestion.actions.includes("Add Skills") && (
                  <button
                    type="button"
                    onClick={() => onReview(suggestion.activityIds)}
                  >
                    Add Skills
                  </button>
                )}
            </div>
          </div>
        ))}
        {suggestions.length === 0 && (
          <div className={styles.workCapabilityCleanupItem}>
            <div>
              <strong>No cleanup suggestions</strong>
              <p>
                The active taxonomy has no obvious duplicates, ownership gaps,
                or missing skill-requirement groups.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function mutationPreview(
  dataset: WorkCapabilityDataset,
  mutation: TaxonomyMutation | null,
): string {
  if (!mutation) return "Select a valid change to preview impact.";
  try {
    return impactText(
      getWorkCapabilityTaxonomyMutationImpact(dataset, mutation),
    );
  } catch {
    return "Complete the fields to preview impact.";
  }
}

function TaxonomyInspector({
  selectedNode,
  dataset,
  processOptions,
  categoryOptions,
  onMutate,
  onSelect,
}: {
  selectedNode: WorkCapabilityTaxonomyGraphNode | null;
  dataset: WorkCapabilityDataset;
  processOptions: string[];
  categoryOptions: string[];
  onMutate: (mutation: TaxonomyMutation, nextSelection?: string) => void;
  onSelect: (nodeId: string) => void;
}) {
  const [processName, setProcessName] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [categoryProcess, setCategoryProcess] = useState("");
  const [mergeSources, setMergeSources] = useState("");
  const [mergeTarget, setMergeTarget] = useState("");
  const [addDraft, setAddDraft] =
    useState<ActivityLibraryRow>(EMPTY_ACTIVITY_DRAFT);

  const selectedActivity =
    selectedNode?.kind === "activity"
      ? (dataset.shared.activityLibrary.find(
          (row) => textCell(row, "activity_id") === selectedNode.activityId,
        ) ?? null)
      : null;

  useEffect(() => {
    setProcessName(selectedNode?.processArea ?? "");
    setCategoryName(selectedNode?.category ?? "");
    setCategoryProcess(selectedNode?.processArea ?? "");
    setMergeSources(
      selectedNode?.kind === "activity" && selectedNode.activityId
        ? selectedNode.activityId
        : "",
    );
    setMergeTarget("");
    setAddDraft({
      ...EMPTY_ACTIVITY_DRAFT,
      process_area: selectedNode?.processArea ?? "",
      activity_category: selectedNode?.category ?? "",
    });
  }, [selectedNode]);

  const mergeSourceIds = mergeSources
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const mergeMutation =
    mergeSourceIds.length > 0 && mergeTarget
      ? {
          type: "merge_activities" as const,
          sourceActivityIds: mergeSourceIds,
          targetActivityId: mergeTarget,
        }
      : null;

  const updateAddDraft = (
    field: keyof ActivityLibraryRow,
    value: string | number | boolean,
  ) => {
    setAddDraft((prev) => ({ ...prev, [field]: value }));
  };

  if (!selectedNode) {
    return (
      <div className={styles.workCapabilityInspectorEmpty}>
        <p className={styles.workCapabilityKicker}>Taxonomy Inspector</p>
        <h3>Select a node</h3>
        <p>
          Choose a process, category, or activity on the chart to edit taxonomy
          data.
        </p>
      </div>
    );
  }

  const processRenameMutation =
    selectedNode.kind === "process" &&
    selectedNode.processArea &&
    processName.trim()
      ? {
          type: "rename_process" as const,
          from: selectedNode.processArea,
          to: processName.trim(),
        }
      : null;
  const categoryRenameMutation =
    selectedNode.kind === "category" &&
    selectedNode.processArea &&
    selectedNode.category &&
    categoryName.trim()
      ? {
          type: "rename_category" as const,
          processArea: selectedNode.processArea,
          from: selectedNode.category,
          to: categoryName.trim(),
        }
      : null;
  const categoryMoveMutation =
    selectedNode.kind === "category" &&
    selectedNode.processArea &&
    selectedNode.category &&
    categoryProcess.trim()
      ? {
          type: "move_category" as const,
          processArea: selectedNode.processArea,
          category: selectedNode.category,
          toProcessArea: categoryProcess.trim(),
        }
      : null;

  return (
    <div className={styles.workCapabilityInspectorInner}>
      <p className={styles.workCapabilityKicker}>Taxonomy Inspector</p>
      <h3>{selectedNode.label}</h3>
      <div className={styles.workCapabilityInspectorMeta}>
        <span>{selectedNode.kind}</span>
        <span>{selectedNode.activityCount.toLocaleString()} activities</span>
        {selectedNode.criticality && (
          <span>{selectedNode.criticality} risk</span>
        )}
      </div>

      {selectedNode.kind === "root" && (
        <div className={styles.workCapabilityInspectorHelp}>
          <p>
            Select a process or category to expand its branch. Use search to
            reveal matching activities across the taxonomy.
          </p>
        </div>
      )}

      {selectedNode.kind === "process" && selectedNode.processArea && (
        <div className={styles.workCapabilityInspectorForm}>
          <strong>Rename Process</strong>
          <input
            value={processName}
            onChange={(event) => setProcessName(event.target.value)}
          />
          <span>{mutationPreview(dataset, processRenameMutation)}</span>
          <button
            type="button"
            onClick={() =>
              processRenameMutation &&
              onMutate(
                processRenameMutation,
                workCapabilityProcessNodeId(
                  selectedNode.domain ?? "",
                  selectedNode.category ?? "",
                  processName.trim(),
                ),
              )
            }
            disabled={
              !processRenameMutation ||
              processName.trim() === selectedNode.processArea
            }
          >
            Apply Rename
          </button>
        </div>
      )}

      {selectedNode.kind === "category" &&
        selectedNode.processArea &&
        selectedNode.category && (
          <>
            <div className={styles.workCapabilityInspectorForm}>
              <strong>Rename Category</strong>
              <input
                value={categoryName}
                onChange={(event) => setCategoryName(event.target.value)}
              />
              <span>{mutationPreview(dataset, categoryRenameMutation)}</span>
              <button
                type="button"
                onClick={() =>
                  categoryRenameMutation &&
                  onMutate(
                    categoryRenameMutation,
                    workCapabilityCategoryNodeId(
                      selectedNode.domain ?? "",
                      categoryName.trim(),
                    ),
                  )
                }
                disabled={
                  !categoryRenameMutation ||
                  categoryName.trim() === selectedNode.category
                }
              >
                Apply Rename
              </button>
            </div>

            <div className={styles.workCapabilityInspectorForm}>
              <strong>Move Category</strong>
              <input
                value={categoryProcess}
                list="taxonomy-inspector-process-options"
                onChange={(event) => setCategoryProcess(event.target.value)}
              />
              <datalist id="taxonomy-inspector-process-options">
                {processOptions.map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>
              <span>{mutationPreview(dataset, categoryMoveMutation)}</span>
              <button
                type="button"
                onClick={() =>
                  categoryMoveMutation &&
                  onMutate(
                    categoryMoveMutation,
                    workCapabilityCategoryNodeId(
                      selectedNode.domain ?? "",
                      selectedNode.category!,
                    ),
                  )
                }
                disabled={
                  !categoryMoveMutation ||
                  categoryProcess.trim() === selectedNode.processArea
                }
              >
                Move Category
              </button>
            </div>
          </>
        )}

      {selectedActivity && (
        <>
          <ActivityTaxonomyEditor
            activity={selectedActivity}
            processOptions={processOptions}
            categoryOptions={categoryOptions}
            onSave={(patch) =>
              onMutate(
                {
                  type: "update_activity",
                  activityId: selectedActivity.activity_id,
                  patch,
                },
                workCapabilityActivityNodeId(selectedActivity.activity_id),
              )
            }
            onDeactivate={() =>
              onMutate(
                {
                  type: "deactivate_activity",
                  activityId: selectedActivity.activity_id,
                },
                workCapabilityActivityNodeId(selectedActivity.activity_id),
              )
            }
          />

          <div className={styles.workCapabilityInspectorForm}>
            <strong>Merge Activities</strong>
            <input
              value={mergeSources}
              onChange={(event) => setMergeSources(event.target.value)}
              placeholder="Source IDs, comma separated"
            />
            <input
              value={mergeTarget}
              onChange={(event) => setMergeTarget(event.target.value)}
              placeholder="Target activity ID"
            />
            <span>{mutationPreview(dataset, mergeMutation)}</span>
            <button
              type="button"
              onClick={() => {
                if (!mergeMutation) return;
                const impact = getWorkCapabilityTaxonomyMutationImpact(
                  dataset,
                  mergeMutation,
                );
                if (
                  window.confirm(
                    `Merge will repoint ${impact.assignmentRows} assignments and ${impact.skillRequirementRows} skill requirements, then deactivate source activities. Continue?`,
                  )
                ) {
                  onMutate(
                    mergeMutation,
                    workCapabilityActivityNodeId(mergeTarget.trim()),
                  );
                }
              }}
              disabled={!mergeMutation}
            >
              Merge
            </button>
          </div>
        </>
      )}

      {(selectedNode.kind === "category" ||
        selectedNode.kind === "process") && (
        <div className={styles.workCapabilityAddActivity}>
          <strong>Add Activity</strong>
          <input
            value={addDraft.activity_id}
            onChange={(event) =>
              updateAddDraft("activity_id", event.target.value)
            }
            placeholder="Activity ID"
          />
          <input
            value={addDraft.activity_name}
            onChange={(event) =>
              updateAddDraft("activity_name", event.target.value)
            }
            placeholder="Activity name"
          />
          <input
            value={addDraft.process_area}
            onChange={(event) =>
              updateAddDraft("process_area", event.target.value)
            }
            placeholder="Process area"
          />
          <input
            value={addDraft.activity_category}
            onChange={(event) =>
              updateAddDraft("activity_category", event.target.value)
            }
            placeholder="Category"
          />
          <button
            type="button"
            onClick={() =>
              onMutate(
                { type: "add_activity", row: addDraft },
                workCapabilityActivityNodeId(addDraft.activity_id),
              )
            }
            disabled={
              !addDraft.activity_id ||
              !addDraft.activity_name ||
              !addDraft.process_area ||
              !addDraft.activity_category
            }
          >
            Add Activity
          </button>
        </div>
      )}

      <button
        type="button"
        className={styles.workCapabilitySecondaryBtn}
        onClick={() => onSelect("taxonomy-root")}
      >
        Back to Overview
      </button>
    </div>
  );
}

function ActivityTaxonomyEditor({
  activity,
  processOptions,
  categoryOptions,
  onSave,
  onDeactivate,
}: {
  activity: ActivityLibraryRow;
  processOptions: string[];
  categoryOptions: string[];
  onSave: (patch: Partial<ActivityLibraryRow>) => void;
  onDeactivate: () => void;
}) {
  const [draft, setDraft] = useState<Partial<ActivityLibraryRow>>(activity);

  useEffect(() => {
    setDraft(activity);
  }, [activity]);

  const update = (
    field: keyof ActivityLibraryRow,
    value: string | number | boolean,
  ) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className={styles.workCapabilityActivityEditor}>
      <label>
        Activity name
        <input
          value={textCell(draft as ExcelRow, "activity_name")}
          onChange={(event) => update("activity_name", event.target.value)}
        />
      </label>
      <label>
        Process area
        <input
          value={textCell(draft as ExcelRow, "process_area")}
          list="work-process-options"
          onChange={(event) => update("process_area", event.target.value)}
        />
      </label>
      <datalist id="work-process-options">
        {processOptions.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>
      <label>
        Category
        <input
          value={textCell(draft as ExcelRow, "activity_category")}
          list="work-category-options"
          onChange={(event) => update("activity_category", event.target.value)}
        />
      </label>
      <datalist id="work-category-options">
        {categoryOptions.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>
      <label>
        Department focus
        <input
          value={textCell(draft as ExcelRow, "department_focus")}
          onChange={(event) => update("department_focus", event.target.value)}
        />
      </label>
      <label>
        Nature
        <select
          value={textCell(draft as ExcelRow, "nature")}
          onChange={(event) => update("nature", event.target.value)}
        >
          {["Strategic", "Operational", "Transactional", "Governance"].map(
            (value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ),
          )}
        </select>
      </label>
      <label>
        Criticality
        <select
          value={textCell(draft as ExcelRow, "criticality")}
          onChange={(event) => update("criticality", event.target.value)}
        >
          {["Low", "Medium", "High"].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label>
        Complexity
        <select
          value={textCell(draft as ExcelRow, "complexity")}
          onChange={(event) => update("complexity", event.target.value)}
        >
          {["Low", "Medium", "High"].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label>
        Frequency
        <select
          value={textCell(draft as ExcelRow, "frequency")}
          onChange={(event) => update("frequency", event.target.value)}
        >
          {["Daily", "Weekly", "Monthly", "Quarterly", "Ad hoc"].map(
            (value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ),
          )}
        </select>
      </label>
      <label>
        Automation cost reduction %
        <input
          type="number"
          value={numberCell(draft as ExcelRow, "automation_cost_reduction_pct")}
          onChange={(event) =>
            update("automation_cost_reduction_pct", Number(event.target.value))
          }
        />
      </label>
      <label>
        Outsourcing cost reduction %
        <input
          type="number"
          value={numberCell(
            draft as ExcelRow,
            "outsourcing_cost_reduction_pct",
          )}
          onChange={(event) =>
            update("outsourcing_cost_reduction_pct", Number(event.target.value))
          }
        />
      </label>
      <div className={styles.workCapabilityEditorActions}>
        <button type="button" onClick={() => onSave(draft)}>
          Save Assumptions
        </button>
        <button type="button" onClick={onDeactivate}>
          Archive Activity
        </button>
      </div>
    </div>
  );
}

function WorkCapabilityIngestionPanel({
  dataset,
  orgDataset,
  orgRows,
  orgEmployeeIdColumn,
  onDatasetReady,
  combinedAnalysisChartsContent,
  combinedAnalysisPortfolioContent,
  onAddToStory,
}: {
  dataset: WorkCapabilityDataset | null;
  orgDataset: OrgDataset | null;
  orgRows: ExcelRow[];
  orgEmployeeIdColumn: string;
  onDatasetReady: (dataset: WorkCapabilityDataset) => void;
  combinedAnalysisChartsContent?: ReactNode;
  combinedAnalysisPortfolioContent?: ReactNode;
  onAddToStory?: (data: PendingData) => void;
}) {
  const [parsedFiles, setParsedFiles] = useState<ParsedWorkCapabilityFile[]>(
    [],
  );
  const [validation, setValidation] =
    useState<WorkCapabilityValidationSummary | null>(
      dataset?.validation ?? null,
    );
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [normalizationDrafts, setNormalizationDrafts] = useState<
    Record<string, string>
  >({});
  const [workCapabilityUploadOpen, setWorkCapabilityUploadOpen] =
    useState(false);
  const [workCapabilityStep, setWorkCapabilityStep] = useState<
    "select" | "review" | "result"
  >("select");
  const [hasImportAttempted, setHasImportAttempted] = useState(!!dataset);

  useEffect(() => {
    if (dataset) setHasImportAttempted(true);
  }, [dataset]);

  const replaceParsedFile = (
    expectedType: WorkCapabilityDatasetType,
    nextFile: ParsedWorkCapabilityFile,
  ) => {
    setParsedFiles((prev) => [
      ...prev.filter(
        (file) =>
          file.datasetType !== expectedType &&
          file.datasetType !== nextFile.datasetType,
      ),
      nextFile,
    ]);
    setValidation(null);
    setHasImportAttempted(false);
    setWorkCapabilityStep("select");
  };

  const openWorkCapabilityModal = () => {
    setWorkCapabilityUploadOpen(true);
    setWorkCapabilityStep(hasImportAttempted || dataset ? "result" : "select");
  };

  const handleFileChange = async (
    expectedType: WorkCapabilityDatasetType,
    file: File | null,
  ) => {
    if (!file) return;
    setIsImporting(true);
    setParseErrors((prev) =>
      prev.filter((item) => !item.startsWith(`${expectedType}:`)),
    );
    try {
      const rows = await parseExcelFile(file);
      if (rows.length === 0) throw new Error("file has no rows");
      const headers = headersFromRows(rows);
      const detected = detectWorkCapabilityDataset(headers);
      replaceParsedFile(expectedType, {
        fileName: file.name,
        datasetType: detected ?? expectedType,
        headers,
        rows,
      });
    } catch (err) {
      setParseErrors((prev) => [
        ...prev,
        `${expectedType}: ${err instanceof Error ? err.message : "could not parse file"}`,
      ]);
    } finally {
      setIsImporting(false);
    }
  };

  const handleImport = () => {
    setHasImportAttempted(true);
    const nextValidation = validateWorkCapabilityFiles({
      files: parsedFiles,
      orgRows,
      orgEmployeeIdColumn,
    });
    setValidation(nextValidation);
    setWorkCapabilityStep("result");
    if (nextValidation.errors.length > 0 || !orgDataset) return;
    const nextDataset = createWorkCapabilityDataset({
      orgDatasetId: orgDataset.datasetId,
      files: parsedFiles,
      orgRows,
      orgEmployeeIdColumn,
    });
    onDatasetReady(nextDataset);
  };

  const handleNormalizationChange = (recordId: string, value: string) => {
    setNormalizationDrafts((prev) => ({ ...prev, [recordId]: value }));
  };

  const handleNormalizationAction = (
    recordId: string,
    status: "approved" | "ignored",
  ) => {
    if (!dataset) return;
    const record = dataset.normalization.records.find(
      (item) => item.id === recordId,
    );
    const nextDataset = updateWorkCapabilityNormalization(dataset, {
      id: recordId,
      status,
      normalizedValue:
        status === "approved"
          ? (normalizationDrafts[recordId] ?? record?.suggestedValue ?? "")
          : undefined,
    });
    setValidation(nextDataset.validation);
    onDatasetReady(nextDataset);
  };

  const currentByType = new Map(
    parsedFiles.map((file) => [file.datasetType, file]),
  );
  const allParsed = WORK_DATASET_ORDER.every((type) => currentByType.has(type));
  const resultValidation = validation ?? dataset?.validation ?? null;
  const normalization =
    dataset?.normalization ?? resultValidation?.normalization ?? null;
  const importedStatus = dataset
    ? statusLabel(dataset.validation.status)
    : "Not imported";
  const stepNumber =
    workCapabilityStep === "select"
      ? 1
      : workCapabilityStep === "review"
        ? 2
        : 3;
  const canReview = parsedFiles.length > 0 && !isImporting;

  return (
    <section className={styles.workCapabilityPanel}>
      <div className={styles.workCapabilityHeader}>
        <div>
          <p className={styles.workCapabilityKicker}>
            Work & Capability Analysis
          </p>
          <h2>Load work, skill, and activity datasets</h2>
          <p className={styles.workCapabilityIntro}>
            Use the guided upload flow to parse the six CSV datasets, review
            detection, then import into memory.
          </p>
        </div>
        <button
          className={styles.workCapabilityImportBtn}
          onClick={openWorkCapabilityModal}
        >
          Open upload modal
        </button>
      </div>

      <div className={styles.workCapabilitySummary}>
        <div>
          <span className={styles.workCapabilitySummaryLabel}>
            Current status
          </span>
          <strong>{importedStatus}</strong>
        </div>
        <div>
          <span className={styles.workCapabilitySummaryLabel}>
            Files selected
          </span>
          <strong>
            {parsedFiles.length} / {WORK_DATASET_ORDER.length}
          </strong>
        </div>
        <div>
          <span className={styles.workCapabilitySummaryLabel}>Storage</span>
          <strong>Memory only</strong>
        </div>
      </div>

      {dataset && (
        <WorkCapabilityTaxonomyManager
          dataset={dataset}
          orgRows={orgRows}
          orgEmployeeIdColumn={orgEmployeeIdColumn}
          columnMapping={orgDataset?.states.asIs.mapping ?? null}
          onDatasetChange={(nextDataset) => {
            setValidation(nextDataset.validation);
            onDatasetReady(nextDataset);
          }}
          readOnlyCatalog
          combinedAnalysisChartsContent={combinedAnalysisChartsContent}
          combinedAnalysisPortfolioContent={combinedAnalysisPortfolioContent}
          onAddToStory={onAddToStory}
        />
      )}

      {workCapabilityUploadOpen && (
        <div
          className={styles.workCapabilityModalOverlay}
          role="dialog"
          aria-modal="true"
          aria-label="Work and capability upload"
        >
          <div className={styles.workCapabilityModal}>
            <div className={styles.workCapabilityModalHeader}>
              <div>
                <p className={styles.workCapabilityKicker}>
                  Work & Capability Upload
                </p>
                <h3>
                  {workCapabilityStep === "select"
                    ? "Select files"
                    : workCapabilityStep === "review"
                      ? "Review files"
                      : "Import result"}
                </h3>
              </div>
              <button
                type="button"
                className={styles.workCapabilityModalClose}
                onClick={() => setWorkCapabilityUploadOpen(false)}
                aria-label="Close work capability upload"
              >
                x
              </button>
            </div>

            <div className={styles.workCapabilityStepper}>
              {["Select files", "Review files", "Import result"].map(
                (label, index) => (
                  <button
                    key={label}
                    type="button"
                    className={`${styles.workCapabilityStepBtn} ${stepNumber === index + 1 ? styles.workCapabilityStepBtnActive : ""}`}
                    onClick={() =>
                      setWorkCapabilityStep(
                        index === 0
                          ? "select"
                          : index === 1
                            ? "review"
                            : "result",
                      )
                    }
                    disabled={
                      (index === 1 && !canReview) ||
                      (index === 2 && !hasImportAttempted && !dataset)
                    }
                  >
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    {label}
                  </button>
                ),
              )}
            </div>

            {workCapabilityStep === "select" && (
              <>
                <div className={styles.workCapabilityGrid}>
                  {WORK_DATASET_ORDER.map((type) => {
                    const parsed = currentByType.get(type);
                    return (
                      <label key={type} className={styles.workCapabilitySlot}>
                        <span className={styles.workCapabilitySlotLabel}>
                          {WORK_DATASET_LABELS[type].label}
                        </span>
                        <span className={styles.workCapabilitySlotHint}>
                          {WORK_DATASET_LABELS[type].fileName}
                        </span>
                        <input
                          type="file"
                          accept=".csv,.xlsx,.xls"
                          onChange={(event) =>
                            handleFileChange(
                              type,
                              event.target.files?.[0] ?? null,
                            )
                          }
                        />
                        <span
                          className={
                            parsed
                              ? styles.workCapabilityOk
                              : styles.workCapabilityPending
                          }
                        >
                          {parsed
                            ? `Detected ${parsed.datasetType} · ${parsed.rows.length.toLocaleString()} rows`
                            : "Waiting for file"}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <div className={styles.workCapabilityModalActions}>
                  <button
                    type="button"
                    className={styles.workCapabilitySecondaryBtn}
                    onClick={() => setWorkCapabilityUploadOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={styles.workCapabilityImportBtn}
                    onClick={() => setWorkCapabilityStep("review")}
                    disabled={!canReview}
                  >
                    Review files
                  </button>
                </div>
              </>
            )}

            {workCapabilityStep === "review" && (
              <>
                <div className={styles.workCapabilityReviewList}>
                  {WORK_DATASET_ORDER.map((type) => {
                    const parsed = currentByType.get(type);
                    return (
                      <div
                        key={type}
                        className={styles.workCapabilityReviewRow}
                      >
                        <div>
                          <strong>{WORK_DATASET_LABELS[type].label}</strong>
                          <span>{WORK_DATASET_LABELS[type].fileName}</span>
                        </div>
                        <span
                          className={
                            parsed
                              ? styles.workCapabilityOk
                              : styles.workCapabilityPending
                          }
                        >
                          {parsed
                            ? `${parsed.datasetType} · ${parsed.rows.length.toLocaleString()} rows`
                            : "Missing"}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className={styles.workCapabilityModalActions}>
                  <button
                    type="button"
                    className={styles.workCapabilitySecondaryBtn}
                    onClick={() => setWorkCapabilityStep("select")}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className={styles.workCapabilityImportBtn}
                    onClick={handleImport}
                    disabled={isImporting || parsedFiles.length === 0}
                  >
                    {isImporting ? "Reading..." : "Import datasets"}
                  </button>
                </div>
              </>
            )}

            {workCapabilityStep === "result" && (
              <>
                {hasImportAttempted && (
                  <div className={styles.workCapabilityResult}>
                    <h3>Work & Capability Upload Result</h3>
                    <pre>
                      {`Status: ${statusLabel(resultValidation?.status)}${allParsed ? "" : "\nNote: all six datasets are required before import."}
Loaded:
${WORK_DATASET_ORDER.map((type) => `- ${type}: ${(resultValidation?.loaded[type] ?? currentByType.get(type)?.rows.length ?? 0).toLocaleString()} rows`).join("\n")}

Failures:
${[...(resultValidation?.errors ?? []), ...parseErrors].length ? [...(resultValidation?.errors ?? []), ...parseErrors].map((item) => `- ${item}`).join("\n") : "- none"}

Warnings:
${resultValidation?.warnings.length ? resultValidation.warnings.map((item) => `- ${item}`).join("\n") : "- none"}
${dataset ? "\nAll work & capability datasets loaded successfully." : ""}`}
                    </pre>
                  </div>
                )}

                {hasImportAttempted &&
                  normalization &&
                  normalization.totalGroups > 0 && (
                    <div className={styles.workCapabilityNormalization}>
                      <div className={styles.workCapabilityNormalizationHeader}>
                        <div>
                          <p className={styles.workCapabilityKicker}>
                            Normalization Review
                          </p>
                          <h3>Clean up imported labels in the app</h3>
                        </div>
                        <div
                          className={styles.workCapabilityNormalizationStats}
                        >
                          <span>{normalization.totalGroups} groups</span>
                          <span>{normalization.autoApplied} auto</span>
                          <span>{normalization.needsReview} review</span>
                          <span>{normalization.approved} approved</span>
                          <span>{normalization.ignored} ignored</span>
                        </div>
                      </div>

                      <div className={styles.workCapabilityNormalizationList}>
                        {normalization.records.map((record) => {
                          const draftValue =
                            normalizationDrafts[record.id] ??
                            record.normalizedValue ??
                            record.suggestedValue;
                          const canApprove =
                            !!dataset && draftValue.trim().length > 0;
                          return (
                            <div
                              key={record.id}
                              className={styles.workCapabilityNormalizationRow}
                            >
                              <div
                                className={
                                  styles.workCapabilityNormalizationMeta
                                }
                              >
                                <span
                                  className={
                                    styles.workCapabilityNormalizationDataset
                                  }
                                >
                                  {record.datasetType}
                                </span>
                                <strong>{record.field}</strong>
                                <span>
                                  {record.rowCount.toLocaleString()} rows
                                </span>
                                <span>first row {record.firstRowNumber}</span>
                              </div>
                              <div
                                className={
                                  styles.workCapabilityNormalizationValues
                                }
                              >
                                <span className={styles.workCapabilityRawValue}>
                                  {record.rawValue}
                                </span>
                                <span className={styles.workCapabilityArrow}>
                                  -&gt;
                                </span>
                                <input
                                  value={draftValue}
                                  placeholder="Enter normalized label"
                                  list={`normalization-values-${record.id}`}
                                  onChange={(event) =>
                                    handleNormalizationChange(
                                      record.id,
                                      event.target.value,
                                    )
                                  }
                                  disabled={
                                    !dataset || record.status === "ignored"
                                  }
                                />
                                <datalist
                                  id={`normalization-values-${record.id}`}
                                >
                                  {record.acceptedValues.map((value) => (
                                    <option key={value} value={value} />
                                  ))}
                                  {record.suggestedValue &&
                                    !record.acceptedValues.includes(
                                      record.suggestedValue,
                                    ) && (
                                      <option value={record.suggestedValue} />
                                    )}
                                </datalist>
                              </div>
                              <div
                                className={
                                  styles.workCapabilityNormalizationFooter
                                }
                              >
                                <span
                                  className={
                                    styles.workCapabilityNormalizationReason
                                  }
                                >
                                  {record.reason}
                                </span>
                                <span
                                  className={
                                    styles.workCapabilityNormalizationStatus
                                  }
                                >
                                  {record.status.replace("_", " ")}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleNormalizationAction(
                                      record.id,
                                      "approved",
                                    )
                                  }
                                  disabled={
                                    !canApprove || record.status === "approved"
                                  }
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleNormalizationAction(
                                      record.id,
                                      "ignored",
                                    )
                                  }
                                  disabled={
                                    !dataset || record.status === "ignored"
                                  }
                                >
                                  Ignore
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                <div className={styles.workCapabilityModalActions}>
                  <button
                    type="button"
                    className={styles.workCapabilitySecondaryBtn}
                    onClick={() => setWorkCapabilityStep("review")}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className={styles.workCapabilityImportBtn}
                    onClick={() => setWorkCapabilityUploadOpen(false)}
                  >
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// ── Target State Analysis ──
interface MetricDef {
  key: string;
  label: string;
  value: (m: StateMetrics) => string;
  delta: (a: StateMetrics, b: StateMetrics) => string;
  deltaSign: (a: StateMetrics, b: StateMetrics) => "pos" | "neg" | "zero";
}

const METRIC_DEFS: MetricDef[] = [
  {
    key: "span",
    label: "Avg Span",
    value: (m) => m.avgSpan.toFixed(2),
    delta: (a, b) => {
      const d = b.avgSpan - a.avgSpan;
      return (d >= 0 ? "+" : "") + d.toFixed(2);
    },
    deltaSign: (a, b) => {
      const d = b.avgSpan - a.avgSpan;
      return d === 0 ? "zero" : d > 0 ? "pos" : "neg";
    },
  },
  {
    key: "layers",
    label: "Layers",
    value: (m) => String(m.layers),
    delta: (a, b) => {
      const d = b.layers - a.layers;
      return (d >= 0 ? "+" : "") + d;
    },
    deltaSign: (a, b) => {
      const d = b.layers - a.layers;
      return d === 0 ? "zero" : d < 0 ? "pos" : "neg"; // fewer layers = good
    },
  },
  {
    key: "cost",
    label: "Total Cost",
    value: (m) => (m.totalCost != null ? fmtCost(m.totalCost) : "—"),
    delta: (a, b) => {
      if (a.totalCost == null || b.totalCost == null) return "—";
      const pct =
        a.totalCost !== 0
          ? ((b.totalCost - a.totalCost) / a.totalCost) * 100
          : 0;
      return (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%";
    },
    deltaSign: (a, b) => {
      if (a.totalCost == null || b.totalCost == null) return "zero";
      const d = b.totalCost - a.totalCost;
      return d === 0 ? "zero" : d < 0 ? "pos" : "neg"; // lower cost = good
    },
  },
  {
    key: "ic",
    label: "IC Ratio",
    value: (m) => m.icRatio.toFixed(0) + "%",
    delta: (a, b) => {
      const d = b.icRatio - a.icRatio;
      return (d >= 0 ? "+" : "") + d.toFixed(1) + "pp";
    },
    deltaSign: (a, b) => {
      const d = b.icRatio - a.icRatio;
      return d === 0 ? "zero" : "zero"; // neutral — direction depends on org goals
    },
  },
  {
    key: "hc",
    label: "Headcount",
    value: (m) => m.headcount.toLocaleString(),
    delta: (a, b) => {
      const d = b.headcount - a.headcount;
      return (d >= 0 ? "+" : "") + d.toLocaleString();
    },
    deltaSign: (a, b) => {
      const d = b.headcount - a.headcount;
      return d === 0 ? "zero" : "zero"; // neutral
    },
  },
  {
    key: "mgr",
    label: "Mgr Ratio",
    value: (m) => m.mgrRatio.toFixed(0) + "%",
    delta: (a, b) => {
      const d = b.mgrRatio - a.mgrRatio;
      return (d >= 0 ? "+" : "") + d.toFixed(1) + "pp";
    },
    deltaSign: (a, b) => {
      const d = b.mgrRatio - a.mgrRatio;
      return d === 0 ? "zero" : d < 0 ? "pos" : "neg"; // lower mgr ratio = leaner
    },
  },
];

function TargetStateAnalysis({
  asIs,
  toBe,
}: {
  asIs: StateMetrics;
  toBe: StateMetrics | null;
}) {
  const ref = toBe ?? asIs;
  const missingBands = [
    ...asIs.missingCompBands.map((band) => ({ state: "As-Is", ...band })),
    ...(toBe?.missingCompBands.map((band) => ({ state: "To-Be", ...band })) ??
      []),
  ];
  return (
    <div className={styles.targetAnalysis}>
      <div className={styles.targetAnalysisHeader}>
        <span className={styles.targetAnalysisTitle}>
          Target State Analysis
        </span>
        {!toBe && (
          <span className={styles.targetAnalysisNote}>
            Initialize To-Be state above to see deltas
          </span>
        )}
      </div>
      <div className={styles.metricStrip}>
        {METRIC_DEFS.map((def) => {
          const deltaStr = toBe ? def.delta(asIs, toBe) : "±0";
          const sign = toBe ? def.deltaSign(asIs, toBe) : "zero";
          const isZero =
            deltaStr === "±0" ||
            deltaStr === "+0" ||
            deltaStr === "+0.0%" ||
            deltaStr === "+0.00" ||
            deltaStr === "+0pp" ||
            deltaStr === "+0.0pp";
          return (
            <div key={def.key} className={styles.metricCard}>
              <div className={styles.metricLabel}>{def.label}</div>
              <div className={styles.metricRow}>
                <span className={styles.metricAsIs}>{def.value(asIs)}</span>
                {toBe && def.value(toBe) !== def.value(asIs) && (
                  <span className={styles.metricToBe}>{def.value(ref)}</span>
                )}
              </div>
              <div
                className={`${styles.metricDelta} ${sign === "pos" && !isZero ? styles.metricDeltaPos : sign === "neg" && !isZero ? styles.metricDeltaNeg : ""}`}
              >
                {toBe ? (
                  deltaStr
                ) : (
                  <span className={styles.metricDeltaZero}>±0</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {missingBands.length > 0 && (
        <div className={styles.targetAnalysisWarning}>
          Total cost is incomplete: {missingBands.length} role
          {missingBands.length === 1 ? "" : "s"} need a matching compensation
          band.{" "}
          {missingBands
            .slice(0, 4)
            .map(
              (band) =>
                `${band.state} ${band.employeeId} (${band.grade} / ${band.geo ?? "blank geo"})`,
            )
            .join("; ")}
        </div>
      )}
    </div>
  );
}

// ── To-Be Empty State ──
function ToBeEmptyState({
  onCopy,
  onUpload,
  hasAsIsFile,
}: {
  onCopy: () => void;
  onUpload: () => void;
  hasAsIsFile: boolean;
}) {
  return (
    <div className={styles.toBeEmpty}>
      <div className={styles.toBeEmptyTitle}>To-Be state is empty</div>
      <div className={styles.toBeEmptySub}>
        Choose how to initialize the target state
      </div>
      <div className={styles.toBeEmptyActions}>
        <button className={styles.toBeEmptyBtn} onClick={onCopy}>
          <span className={styles.toBeEmptyBtnIcon}>⎘</span>
          <div className={styles.toBeEmptyBtnText}>
            <b>Copy from As-Is</b>
            <small>
              Start with current state as baseline, then edit the hierarchy
            </small>
          </div>
        </button>
        {hasAsIsFile && (
          <button className={styles.toBeEmptyBtn} onClick={onUpload}>
            <span className={styles.toBeEmptyBtnIcon}>↑</span>
            <div className={styles.toBeEmptyBtnText}>
              <b>Upload Excel</b>
              <small>Must have same columns as As-Is · rows can vary</small>
            </div>
          </button>
        )}
      </div>
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
