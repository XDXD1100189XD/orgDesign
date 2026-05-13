'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { CompMatrix, DashboardData, AIChartRequest, ScenarioAction, ValidatedPlan } from '@/lib/types';
import type { ExcelRow } from '@/lib/parseExcel';
import { buildSystemContext } from '@/lib/aiContext';
import { validateAndSimulate, applyActions } from '@/lib/scenarioPlanner';
import { repairDeletedManagerReferences } from '@/lib/hierarchyRows';
import { computeStateMetrics } from '@/lib/computeStateMetrics';
import styles from './AIAssistantView.module.css';

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const alasql = require('alasql') as any;

const AI_TABLE = 'ai_employees';
const CHAT_STORAGE_KEY = 'org-ai-chat';

// ── Anthropic message types ────────────────────────────────────────────────────

interface TextContent    { type: 'text'; text: string }
interface ToolUseContent { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
interface ToolResultContent { type: 'tool_result'; tool_use_id: string; content: string }

type RawMessage = {
  role: 'user' | 'assistant';
  content: string | Array<TextContent | ToolUseContent | ToolResultContent>;
};

// ── Between-turn history compression ──────────────────────────────────────────

const COMPRESS_KEEP_TURNS = 2;
const COMPRESS_MAX_CHARS  = 300;

function compressHistory(messages: RawMessage[]): RawMessage[] {
  const questionIndices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role === 'user' && typeof m.content === 'string') questionIndices.push(i);
  }
  if (questionIndices.length <= COMPRESS_KEEP_TURNS) return messages;
  const cutoff = questionIndices[questionIndices.length - COMPRESS_KEEP_TURNS];
  return messages.map((m, i) => {
    if (i >= cutoff) return m;
    if (m.role !== 'user' || !Array.isArray(m.content)) return m;
    if ((m.content[0] as { type?: string })?.type !== 'tool_result') return m;
    return {
      ...m,
      content: (m.content as ToolResultContent[]).map(block =>
        block.type === 'tool_result' && block.content.length > COMPRESS_MAX_CHARS
          ? { ...block, content: block.content.slice(0, COMPRESS_MAX_CHARS) + '…[truncated]' }
          : block
      ),
    };
  });
}

// ── SSE event types ────────────────────────────────────────────────────────────

interface ToolUseEvent   { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
interface DoneEvent      { type: 'done'; stop_reason: string; fullMessage: RawMessage }
interface ErrorEvent     { type: 'error'; message: string }
interface TextDeltaEvent { type: 'text_delta'; text: string }
type SSEEvent = TextDeltaEvent | ToolUseEvent | DoneEvent | ErrorEvent;

// ── Display message types ──────────────────────────────────────────────────────

type DisplayMsg =
  | { id: string; kind: 'user';          text: string }
  | { id: string; kind: 'assistant';     text: string; streaming: boolean }
  | { id: string; kind: 'tool_call';     name: string; sql?: string }
  | { id: string; kind: 'tool_result';   name: string; rows?: Record<string, unknown>[]; rowCount?: number; error?: string; isMetrics?: boolean; summary?: string }
  | { id: string; kind: 'chart_created'; title: string };

// ── Hierarchy enrichment (mirrors AnalyticsStudioView) ────────────────────────

const DERIVED_KEYS = ['span', 'depth', 'subtree_count'] as const;
type DerivedKey = typeof DERIVED_KEYS[number];
const ID_KEYS   = ['employeeid','empid','id','workerid','staffid','personid'];
const NAME_KEYS = ['name','employeename','fullname','displayname','workername','employee'];

function enrichRows(raw: ExcelRow[], data: DashboardData): ExcelRow[] {
  const { vertices: V, metrics: m } = data;
  const byEmpId = new Map<string, Record<DerivedKey, number>>();
  const byName  = new Map<string, Record<DerivedKey, number>>();

  for (const [vid, v] of Object.entries(V)) {
    const derived: Record<DerivedKey, number> = {
      span:          m.span[vid]          ?? 0,
      depth:         m.depth[vid]         ?? 0,
      subtree_count: m.subtree_count[vid] ?? 0,
    };
    if (v.id)           byEmpId.set(String(v.id).trim().toLowerCase(), derived);
    if (v.display_name) byName.set(v.display_name.trim().toLowerCase(), derived);
  }

  const headers = raw.length ? Object.keys(raw[0]) : [];
  const norm    = (h: string) => h.toLowerCase().replace(/[\s_-]/g, '');
  const idKey   = headers.find(h => ID_KEYS.includes(norm(h)));
  const nameKey = headers.find(h => NAME_KEYS.includes(norm(h)));

  return raw.map(row => {
    const idVal   = idKey   ? String(row[idKey]   ?? '').trim().toLowerCase() : '';
    const nameVal = nameKey ? String(row[nameKey] ?? '').trim().toLowerCase() : '';
    const match   = (idVal && byEmpId.get(idVal)) || (nameVal && byName.get(nameVal));
    return match ? { ...row, ...match } : row;
  });
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

function inlineFormat(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('`')  && p.endsWith('`'))  return <code key={i} className={styles.inlineCode}>{p.slice(1, -1)}</code>;
    return p;
  });
}

function renderMdTable(lines: string[], key: string): React.ReactNode {
  const rows = lines.filter(l => !l.match(/^\|[\s-|]+\|$/));
  if (rows.length === 0) return null;
  const [headerLine, ...bodyLines] = rows;
  const split = (l: string) => l.split('|').slice(1, -1).map(c => c.trim());
  const headers = split(headerLine);
  return (
    <div key={key} className={styles.mdTableWrap}>
      <table className={styles.mdTable}>
        <thead><tr>{headers.map((h, i) => <th key={i}>{inlineFormat(h)}</th>)}</tr></thead>
        <tbody>
          {bodyLines.map((line, ri) => (
            <tr key={ri}>{split(line).map((c, ci) => <td key={ci}>{inlineFormat(c)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderMarkdown(text: string): React.ReactNode[] {
  const segments = text.split(/(```[\s\S]*?```)/g);
  const nodes: React.ReactNode[] = [];

  segments.forEach((seg, si) => {
    if (seg.startsWith('```') && seg.endsWith('```')) {
      const content = seg.slice(3, -3).replace(/^(sql|json|text|js)\n/, '').trim();
      nodes.push(<pre key={`code-${si}`} className={styles.codeBlock}><code>{content}</code></pre>);
      return;
    }

    const lines = seg.split('\n');
    let li = 0;
    while (li < lines.length) {
      const line = lines[li];

      if (line.startsWith('### ')) { nodes.push(<h4 key={`${si}-${li}`} className={styles.mdH3}>{inlineFormat(line.slice(4))}</h4>); li++; continue; }
      if (line.startsWith('## '))  { nodes.push(<h3 key={`${si}-${li}`} className={styles.mdH2}>{inlineFormat(line.slice(3))}</h3>); li++; continue; }
      if (line.startsWith('# '))   { nodes.push(<h2 key={`${si}-${li}`} className={styles.mdH1}>{inlineFormat(line.slice(2))}</h2>); li++; continue; }

      if (line.match(/^[-*]\s/)) {
        const items: string[] = [];
        while (li < lines.length && lines[li].match(/^[-*]\s/)) { items.push(lines[li].slice(2)); li++; }
        nodes.push(<ul key={`ul-${si}-${li}`} className={styles.mdList}>{items.map((it, j) => <li key={j}>{inlineFormat(it)}</li>)}</ul>);
        continue;
      }

      if (line.match(/^\d+\.\s/)) {
        const items: string[] = [];
        while (li < lines.length && lines[li].match(/^\d+\.\s/)) { items.push(lines[li].replace(/^\d+\.\s/, '')); li++; }
        nodes.push(<ol key={`ol-${si}-${li}`} className={styles.mdList}>{items.map((it, j) => <li key={j}>{inlineFormat(it)}</li>)}</ol>);
        continue;
      }

      if (line.startsWith('|')) {
        const tableLines: string[] = [];
        while (li < lines.length && lines[li].startsWith('|')) { tableLines.push(lines[li]); li++; }
        nodes.push(renderMdTable(tableLines, `tbl-${si}-${li}`));
        continue;
      }

      if (line.trim()) nodes.push(<p key={`p-${si}-${li}`} className={styles.mdPara}>{inlineFormat(line)}</p>);
      li++;
    }
  });

  return nodes.filter(Boolean);
}

// ── Inline result table ────────────────────────────────────────────────────────

function ResultTable({ rows }: { rows: Record<string, unknown>[] }) {
  const headers = Object.keys(rows[0] ?? {});
  return (
    <div className={styles.resultTableWrap}>
      <table className={styles.resultTable}>
        <thead><tr>{headers.map(h => <th key={h} className={styles.rtTh}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.slice(0, 20).map((row, i) => (
            <tr key={i} className={styles.rtTr}>
              {headers.map(h => (
                <td key={h} className={styles.rtTd}>
                  {row[h] == null ? <span className={styles.rtNull}>—</span> : String(row[h])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 20 && <div className={styles.rtMore}>+{rows.length - 20} more rows not shown</div>}
    </div>
  );
}

// ── Follow-up suggestions ──────────────────────────────────────────────────────

function getFollowUps(text: string): string[] {
  const t = text.toLowerCase();
  const seen = new Set<string>();
  const suggestions: string[] = [];

  const add = (s: string) => { if (!seen.has(s)) { seen.add(s); suggestions.push(s); } };

  if (t.includes('overload') || (t.includes('span') && (t.includes('high') || t.includes('exceed'))))
    add('List all overloaded managers with their direct reports');
  if (t.includes('span') && !suggestions.length)
    add('Show span distribution by department');
  if (t.includes('department') || t.includes('dept'))
    add('Compare headcount across all departments');
  if (t.includes('cost') || t.includes('compensation') || t.includes('salary') || t.includes('pay'))
    add('What is the total compensation cost by grade?');
  if (t.includes('depth') || t.includes('layer'))
    add('Who are the deepest individual contributors?');
  if (t.includes('manager') && !t.includes('overload'))
    add('Who manages the most people overall?');
  if (t.includes('open') || t.includes('vacant') || t.includes('unfill'))
    add('List all open roles by department');
  if (t.includes('gini') || t.includes('inequal'))
    add('Which grades have the most unequal span distribution?');

  if (suggestions.length < 2) {
    add('Give me a full org structure summary');
    add('Which department has the highest average span?');
  }

  return suggestions.slice(0, 3);
}

// ── Props & suggestions ───────────────────────────────────────────────────────

interface Props {
  data: DashboardData | null;
  rows: ExcelRow[];
  toBeRows?: ExcelRow[] | null;
  stateId?: 'as-is' | 'to-be';
  onRowsChange?: (rows: ExcelRow[], meta?: { source: 'ai-sql'; query?: string; affected?: number; label?: string }) => void;
  onCreateChart?: (req: AIChartRequest) => void;
  onDataChange?: (d: DashboardData) => void;
  onCompMatrixChange?: (
    matrix: CompMatrix,
    target: 'as-is' | 'to-be' | 'both',
    meta?: { source: 'ai'; replaceAll: boolean; bandsSet: number; rationale?: string },
  ) => void;
  toBeData?: DashboardData | null;
  onRowMutation?: (rows: ExcelRow[], target: 'as-is' | 'to-be' | 'both') => void;
  onFieldMapping?: (field: string, column: string, newRows?: ExcelRow[], target?: 'as-is' | 'to-be') => void;
  columnMapping?: import('@/lib/fieldDictionary').ColumnMapping | null;
  changeLog?: import('@/lib/changeManagement').ChangeRecord[];
  graphVersion?: number;
  variant?: 'full' | 'pane';
}

const SUGGESTIONS = [
  'What are the biggest structural issues in this org?',
  'Who are the top 5 highest-paid employees?',
  'Which managers have the highest span?',
  'Give me a full summary of this organization',
];

// ── Main component ────────────────────────────────────────────────────────────

export default function AIAssistantView({ data, rows, toBeRows, stateId = 'as-is', onRowsChange, onCreateChart, onDataChange, onCompMatrixChange, toBeData, onRowMutation, onFieldMapping, columnMapping, changeLog = [], graphVersion = 0, variant = 'full' }: Props) {
  const [displayMsgs,    setDisplayMsgs]    = useState<DisplayMsg[]>([]);
  const [rawMsgs,        setRawMsgs]        = useState<RawMessage[]>([]);
  const [input,          setInput]          = useState('');
  const [busy,           setBusy]           = useState(false);
  const [writeMode,      setWriteMode]      = useState(false);
  const [copiedSqlId,    setCopiedSqlId]    = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<{
    sql: string;
    resolve: (confirmed: boolean) => void;
  } | null>(null);
  const [pendingCompBands, setPendingCompBands] = useState<{
    bands: Array<{ grade: string; geo: string; min: number; max: number; currency: string }>;
    replaceAll: boolean;
    target: 'as-is' | 'to-be' | 'both';
    rationale: string;
    resolve: (confirmed: boolean) => void;
  } | null>(null);
  const [pendingRowMutation, setPendingRowMutation] = useState<{
    sql: string; target: 'as-is' | 'to-be' | 'both'; rationale: string;
    resolve: (confirmed: boolean) => void;
  } | null>(null);
  const [pendingFieldMapping, setPendingFieldMapping] = useState<{
    field: string; sourceColumn?: string; derivedSql?: string; newColumnName?: string;
    rationale: string; resolve: (confirmed: boolean) => void;
  } | null>(null);

  const scrollRef           = useRef<HTMLDivElement>(null);
  const systemCtxRef        = useRef('');
  const dataRef             = useRef(data);
  const toBeDataRef         = useRef(toBeData);
  const writeModeRef        = useRef(writeMode);
  const onRowsChangeRef     = useRef(onRowsChange);
  const onCreateChartRef    = useRef(onCreateChart);
  const onDataChangeRef     = useRef(onDataChange);
  const onCompMatrixChangeRef = useRef(onCompMatrixChange);
  const onRowMutationRef    = useRef(onRowMutation);
  const onFieldMappingRef   = useRef(onFieldMapping);
  const columnMappingRef    = useRef(columnMapping);
  const chatRestoredRef     = useRef(false);
  const planStoreRef        = useRef<Map<string, ValidatedPlan>>(new Map());
  const graphVersionRef     = useRef(graphVersion);
  const toBeRowsRef         = useRef(toBeRows ?? null);
  const asIsRowsRef         = useRef(rows);
  const stateIdRef          = useRef(stateId);
  const changeLogRef        = useRef(changeLog);

  const [pendingPlan, setPendingPlan] = useState<{
    plan: ValidatedPlan;
    resolve: (ok: boolean) => void;
  } | null>(null);

  dataRef.current           = data;
  toBeDataRef.current       = toBeData;
  writeModeRef.current      = writeMode;
  onRowsChangeRef.current   = onRowsChange;
  onCreateChartRef.current  = onCreateChart;
  onDataChangeRef.current   = onDataChange;
  onCompMatrixChangeRef.current = onCompMatrixChange;
  onRowMutationRef.current  = onRowMutation;
  onFieldMappingRef.current = onFieldMapping;
  columnMappingRef.current  = columnMapping;
  graphVersionRef.current   = graphVersion;
  toBeRowsRef.current       = toBeRows ?? null;
  asIsRowsRef.current       = rows;
  stateIdRef.current        = stateId;
  changeLogRef.current      = changeLog;

  // ── Sync rows → AlaSQL, restore chat on first load ──
  useEffect(() => {
    let tableRows: ExcelRow[];

    if (rows.length) {
      tableRows = data ? enrichRows(rows, data) : rows;
    } else if (data) {
      const { vertices: V, metrics: m } = data;
      tableRows = Object.entries(V).map(([vid, v]) => ({
        id:            v.id ?? vid,
        name:          v.display_name,
        role:          v.role,
        grade:         v.grade ?? '',
        department:    v.dept ?? '',
        geo:           v.geo ?? '',
        open_role:     v.open_role,
        manager_id:    m.parent[vid] ?? '',
        span:          m.span[vid]          ?? 0,
        depth:         m.depth[vid]         ?? 0,
        subtree_count: m.subtree_count[vid] ?? 0,
      })) as ExcelRow[];
    } else {
      return;
    }

    alasql(`DROP TABLE IF EXISTS ${AI_TABLE}`);
    alasql(`CREATE TABLE ${AI_TABLE}`);
    alasql.tables[AI_TABLE].data = tableRows.map((r: ExcelRow) => ({ ...r }));
    systemCtxRef.current = buildSystemContext(tableRows, data, writeMode, columnMapping ?? null);

    // Restore chat once after the first data load
    if (!chatRestoredRef.current) {
      chatRestoredRef.current = true;
      try {
        const raw = sessionStorage.getItem(CHAT_STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          if (Array.isArray(saved.displayMsgs)) {
            setDisplayMsgs(
              saved.displayMsgs.map((m: DisplayMsg) =>
                m.kind === 'assistant' ? { ...m, streaming: false } : m
              )
            );
          }
          if (Array.isArray(saved.rawMsgs)) setRawMsgs(saved.rawMsgs);
        }
      } catch { /* corrupted storage — ignore */ }
    }
  }, [rows, data, writeMode]);

  // ── Persist chat to sessionStorage ──
  useEffect(() => {
    if (!chatRestoredRef.current) return;
    try {
      const toSave = displayMsgs.filter(m => !(m.kind === 'assistant' && m.streaming));
      sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify({ displayMsgs: toSave, rawMsgs }));
    } catch { /* storage full — silently skip */ }
  }, [displayMsgs, rawMsgs]);

  // ── Auto-scroll ──
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [displayMsgs]);

  const uid = () => Math.random().toString(36).slice(2, 10);

  function patch(id: string, text: string) {
    setDisplayMsgs(prev => prev.map(m => m.id === id && m.kind === 'assistant' ? { ...m, text } : m));
  }
  function finalize(id: string) {
    setDisplayMsgs(prev => prev.map(m => m.id === id && m.kind === 'assistant' ? { ...m, streaming: false } : m));
  }

  // ── ReAct send loop ──────────────────────────────────────────────────────────
  const send = useCallback(async (userText: string) => {
    if (!userText.trim() || busy) return;
    setBusy(true);
    setInput('');

    const userApiMsg: RawMessage = { role: 'user', content: userText };
    let current: RawMessage[] = [...compressHistory(rawMsgs), userApiMsg];
    setDisplayMsgs(prev => [...prev, { id: uid(), kind: 'user', text: userText }]);

    async function executeTool(name: string, toolInput: Record<string, unknown>): Promise<unknown> {
      if (name === 'run_sql') {
        const raw  = toolInput.query as string;
        const verb = raw.trim().toUpperCase().split(/[\s(]/)[0];
        const isWrite = ['UPDATE', 'DELETE', 'INSERT'].includes(verb);
        const beforeWriteRows: ExcelRow[] = isWrite
          ? (alasql.tables[AI_TABLE]?.data ?? []).map((r: ExcelRow) => ({ ...r }))
          : [];

        if (isWrite) {
          if (!writeModeRef.current) {
            return { ok: false, error: 'Write Mode is disabled. SQL mutations are preview-only until Write Mode is enabled.' };
          }
          const confirmed = await new Promise<boolean>(resolve =>
            setPendingConfirm({ sql: raw, resolve })
          );
          if (!confirmed) return { ok: false, error: 'User cancelled the operation.' };
        }

        try {
          const sql = raw
            .replace(/\bFROM\s+data\b/gi,  `FROM ${AI_TABLE}`)
            .replace(/\bJOIN\s+data\b/gi,   `JOIN ${AI_TABLE}`)
            .replace(/\bUPDATE\s+data\b/gi, `UPDATE ${AI_TABLE}`);
          const result = alasql(sql);
          if (isWrite) {
            const updated: ExcelRow[] = alasql.tables[AI_TABLE]?.data ?? [];
            const repaired = columnMappingRef.current && verb === 'DELETE'
              ? repairDeletedManagerReferences(beforeWriteRows, updated, columnMappingRef.current)
              : { rows: updated.map((r: ExcelRow) => ({ ...r })), deletedCount: 0, reassignedCount: 0 };
            if (repaired.reassignedCount > 0) {
              alasql.tables[AI_TABLE].data = repaired.rows.map((r: ExcelRow) => ({ ...r }));
            }
            onRowsChangeRef.current?.(repaired.rows, {
              source: 'ai-sql',
              query: raw,
              affected: typeof result === 'number' ? result + repaired.reassignedCount : repaired.rows.length,
              label: repaired.reassignedCount > 0
                ? `SQL delete applied; ${repaired.reassignedCount} direct report${repaired.reassignedCount === 1 ? '' : 's'} reassigned to the deleted manager's parent.`
                : undefined,
            });
          }
          if (Array.isArray(result)) {
            const total = result.length;
            const rows  = result.slice(0, 100);
            return total > 100
              ? { ok: true, rows, truncated: true, total_rows: total, note: `Showing first 100 of ${total} rows. Use WHERE, GROUP BY, or LIMIT to narrow results.` }
              : { ok: true, rows };
          }
          return { ok: true, rows: [] };
        } catch (e) { return { ok: false, error: String(e) }; }
      }

      if (name === 'create_chart') {
        const inp = toolInput as unknown as AIChartRequest;
        let req: AIChartRequest = { ...inp };

        if (inp.sqlQuery) {
          try {
            const sql = inp.sqlQuery
              .replace(/\bFROM\s+data\b/gi, `FROM ${AI_TABLE}`)
              .replace(/\bJOIN\s+data\b/gi,  `JOIN ${AI_TABLE}`);
            const result = alasql(sql);
            if (Array.isArray(result) && result.length > 0) {
              req = { ...req, precomputedRows: result as Record<string, unknown>[] };
            }
          } catch { /* fall through to normal pivot */ }
        }

        onCreateChartRef.current?.(req);
        setDisplayMsgs(prev => [...prev, {
          id: uid(), kind: 'chart_created',
          title: req.title ?? `${req.chartType} chart by ${req.rowField}`,
        }]);
        return { ok: true, message: 'Chart created in Analytics Studio.' };
      }

      if (name === 'get_metrics') {
        const d = dataRef.current;
        if (!d) return { error: 'No org data loaded' };
        const m = d.metrics;
        return {
          total_employees:     m.basic.total_nodes,
          total_managers:      m.management.manager_count,
          avg_span:            m.management.avg_span,
          span_variance:       m.management.span_variance,
          span_gini:           m.management.span_gini,
          overloaded_managers: m.management.overloaded,
          overload_threshold:  m.management.overload_threshold,
          org_depth:           m.org_structure.org_depth,
          layer_efficiency:    m.org_structure.layer_efficiency_score,
          root_count:          m.basic.root_count,
          total_edges:         m.basic.total_edges,
          avg_edge_confidence: m.avg_confidence,
          open_roles:          Object.values(d.vertices).filter(v => v.open_role).length,
        };
      }

      if (name === 'get_schema') {
        const sample = alasql.tables[AI_TABLE]?.data?.[0];
        return { columns: sample ? Object.keys(sample) : [] };
      }

      if (name === 'get_column_values') {
        const col = toolInput.column as string;
        const tableData: Record<string, unknown>[] = alasql.tables[AI_TABLE]?.data ?? [];
        const counts: Record<string, number> = {};
        for (const row of tableData) {
          const val = String(row[col] ?? 'null');
          counts[val] = (counts[val] ?? 0) + 1;
        }
        return { column: col, unique_count: Object.keys(counts).length, distribution: counts };
      }

      if (name === 'find_employees') {
        const query = (toolInput.query as string).toLowerCase();
        const limit = (toolInput.limit as number) ?? 10;
        const tableData: Record<string, unknown>[] = alasql.tables[AI_TABLE]?.data ?? [];
        const results = tableData
          .filter(row =>
            Object.values(row).some(v => typeof v === 'string' && v.toLowerCase().includes(query))
          )
          .slice(0, limit);
        return { found: results.length, employees: results };
      }

      if (name === 'get_hierarchy_path') {
        const d = dataRef.current;
        if (!d) return { error: 'No org data loaded' };
        const query = (toolInput.employee_name as string).toLowerCase();
        const entry = Object.entries(d.vertices).find(([, v]) =>
          v.display_name.toLowerCase().includes(query)
        );
        if (!entry) return { error: `No employee found matching "${toolInput.employee_name}"` };
        const [startId] = entry;
        const path: Array<{ name: string; role: string; depth: number }> = [];
        let current: string | undefined = startId;
        while (current) {
          const v = d.vertices[current];
          if (!v) break;
          path.unshift({ name: v.display_name, role: v.role ?? '', depth: d.metrics.depth[current] ?? 0 });
          current = d.metrics.parent[current];
        }
        return { employee: entry[1].display_name, hierarchy_depth: path.length, path };
      }

      if (name === 'compare_states') {
        const d   = dataRef.current;
        const tbd = toBeDataRef.current;
        if (!d) return { error: 'No org data loaded' };
        if (!tbd) return { error: 'No To-Be state is loaded. Go to the Hierarchy tab and initialize a To-Be state first.' };
        const extract = (dd: DashboardData) => {
          const stateMetrics = computeStateMetrics(dd);
          return {
            headcount:           dd.metrics.basic.total_nodes,
            manager_count:       dd.metrics.management.manager_count,
            avg_span:            +dd.metrics.management.avg_span.toFixed(2),
            org_depth:           dd.metrics.org_structure.org_depth,
            span_gini:           +((dd.metrics.management.span_gini ?? 0).toFixed(3)),
            overloaded_managers: dd.metrics.management.overloaded ?? 0,
            open_roles:          Object.values(dd.vertices).filter(v => v.open_role).length,
            total_cost:          stateMetrics.totalCost,
            missing_comp_bands:  stateMetrics.missingCompBands,
          };
        };
        const asIs = extract(d);
        const toBe = extract(tbd);
        return {
          as_is: asIs,
          to_be: toBe,
          delta: {
            headcount:           toBe.headcount           - asIs.headcount,
            manager_count:       toBe.manager_count       - asIs.manager_count,
            avg_span:            +(toBe.avg_span           - asIs.avg_span).toFixed(2),
            org_depth:           toBe.org_depth           - asIs.org_depth,
            overloaded_managers: toBe.overloaded_managers - asIs.overloaded_managers,
            open_roles:          toBe.open_roles          - asIs.open_roles,
            total_cost:          asIs.total_cost != null && toBe.total_cost != null ? toBe.total_cost - asIs.total_cost : null,
          },
        };
      }

      if (name === 'set_comp_bands') {
        if (!writeModeRef.current) {
          return { ok: false, error: 'Write Mode is disabled. Enable it using the toggle in the Permissions bar above the chat.' };
        }
        const d = dataRef.current;
        if (!d) return { ok: false, error: 'No org data loaded.' };

        type Band = { grade: string; geo: string; min: number; max: number; currency: string };
        const bands = toolInput.bands as Band[];
        const replaceAll = !!(toolInput.replace_all as boolean | undefined);
        const target = (toolInput.target as 'as-is' | 'to-be' | 'both' | undefined) ?? 'both';
        const rationale = (toolInput.rationale as string | undefined) ?? '';

        const confirmed = await new Promise<boolean>(resolve =>
          setPendingCompBands({ bands, replaceAll, target, rationale, resolve })
        );
        if (!confirmed) return { ok: false, error: 'User cancelled.' };

        const base = replaceAll ? {} : { ...(d.compMatrix ?? {}) };
        const newMatrix = { ...base };
        for (const b of bands) {
          newMatrix[b.grade] = {
            ...(newMatrix[b.grade] ?? {}),
            [b.geo]: { min: b.min, max: b.max, currency: b.currency },
          };
        }
        if (onCompMatrixChangeRef.current) {
          onCompMatrixChangeRef.current(newMatrix, target, {
            source: 'ai',
            replaceAll,
            bandsSet: bands.length,
            rationale,
          });
        } else {
          onDataChangeRef.current?.({ ...d, compMatrix: newMatrix });
        }
        return { ok: true, bands_set: bands.length, replace_all: replaceAll, target };
      }

      if (name === 'write_employees') {
        if (!writeModeRef.current) return { ok: false, error: 'Write Mode is disabled.' };

        const sql      = toolInput.sql as string;
        const target   = toolInput.target as 'as-is' | 'to-be' | 'both';
        const rationale = (toolInput.rationale as string) ?? '';

        const confirmed = await new Promise<boolean>(resolve =>
          setPendingRowMutation({ sql, target, rationale, resolve })
        );
        if (!confirmed) return { ok: false, error: 'User cancelled.' };

        try {
          const beforeWriteRows: ExcelRow[] = (alasql.tables[AI_TABLE]?.data ?? []).map((r: ExcelRow) => ({ ...r }));
          const normalized = sql
            .replace(/\bFROM\s+data\b/gi,   `FROM ${AI_TABLE}`)
            .replace(/\bUPDATE\s+data\b/gi, `UPDATE ${AI_TABLE}`)
            .replace(/\bINTO\s+data\b/gi,   `INTO ${AI_TABLE}`);
          const affectedCount = alasql(normalized);
          const updatedRows: ExcelRow[] = alasql.tables[AI_TABLE]?.data ?? [];
          const isDelete = normalized.trim().toUpperCase().startsWith('DELETE');
          const repaired = columnMappingRef.current && isDelete
            ? repairDeletedManagerReferences(beforeWriteRows, updatedRows, columnMappingRef.current)
            : { rows: updatedRows.map((r: ExcelRow) => ({ ...r })), deletedCount: 0, reassignedCount: 0 };
          if (repaired.reassignedCount > 0) {
            alasql.tables[AI_TABLE].data = repaired.rows.map((r: ExcelRow) => ({ ...r }));
          }
          onRowMutationRef.current?.(repaired.rows, target);
          return {
            ok: true,
            rows_affected: typeof affectedCount === 'number' ? affectedCount + repaired.reassignedCount : repaired.rows.length,
            rows_deleted: repaired.deletedCount,
            rows_reassigned: repaired.reassignedCount,
            target,
          };
        } catch (e) { return { ok: false, error: String(e) }; }
      }

      if (name === 'set_field_mapping') {
        if (!writeModeRef.current) return { ok: false, error: 'Write Mode is disabled.' };

        const field        = toolInput.field          as string;
        const sourceColumn = toolInput.source_column  as string | undefined;
        const derivedSql   = toolInput.derived_sql    as string | undefined;
        const newColName   = toolInput.new_column_name as string | undefined;
        const rationale    = (toolInput.rationale     as string) ?? '';

        if (!sourceColumn && !derivedSql) return { ok: false, error: 'Provide either source_column or derived_sql.' };
        if (derivedSql && !newColName)    return { ok: false, error: 'new_column_name is required when using derived_sql.' };

        const confirmed = await new Promise<boolean>(resolve =>
          setPendingFieldMapping({ field, sourceColumn, derivedSql, newColumnName: newColName, rationale, resolve })
        );
        if (!confirmed) return { ok: false, error: 'User cancelled.' };

        if (sourceColumn) {
          onFieldMappingRef.current?.(field, sourceColumn, undefined, stateIdRef.current);
          return { ok: true, field, column: sourceColumn, method: 'existing_column' };
        }

        try {
          const sql = derivedSql!
            .replace(/\bFROM\s+data\b/gi, `FROM ${AI_TABLE}`)
            .replace(/\bJOIN\s+data\b/gi,  `JOIN ${AI_TABLE}`);
          const result = alasql(sql) as Array<{ employee_id: string | number; value: unknown }>;
          const valMap = new Map(result.map(r => [String(r.employee_id), r.value]));

          const currentRows: ExcelRow[] = alasql.tables[AI_TABLE]?.data ?? [];
          const empIdCol = columnMappingRef.current?.['Employee ID']?.column;
          const enriched: ExcelRow[] = currentRows.map(row => ({
            ...row,
            [newColName!]: empIdCol ? ((valMap.get(String(row[empIdCol])) as string | number | boolean | null) ?? null) : null,
          }));

          alasql.tables[AI_TABLE].data = enriched.map((r: ExcelRow) => ({ ...r }));
          onRowsChangeRef.current?.(enriched, {
            source: 'ai-sql',
            query: derivedSql,
            affected: enriched.length,
            label: `Derived ${newColName!} for ${field}`,
          });
          onFieldMappingRef.current?.(field, newColName!, enriched, stateIdRef.current);
          return { ok: true, field, column: newColName, method: 'derived', rows_enriched: enriched.length };
        } catch (e) { return { ok: false, error: String(e) }; }
      }

      if (name === 'get_change_log') {
        const limit = Math.min(Number(toolInput.limit ?? 5), 20);
        const entries = changeLogRef.current.slice(-limit).reverse().map(e => ({
          id:        e.id,
          timestamp: e.timestamp,
          scope:     e.scope,
          action:    e.action,
          title:     e.title,
          summary:   e.summary,
        }));
        return { entries, count: entries.length };
      }

      if (name === 'get_comp_bands') {
        const matrix = dataRef.current?.compMatrix;
        if (!matrix) return { bands: [], note: 'No comp matrix defined yet.' };
        const bands: Array<{ grade: string; geo: string; min: number; max: number; currency: string }> = [];
        for (const [grade, geoMap] of Object.entries(matrix)) {
          if (!geoMap) continue;
          for (const [geo, band] of Object.entries(geoMap)) {
            if (band) bands.push({ grade, geo, min: band.min, max: band.max, currency: band.currency });
          }
        }
        return { bands };
      }

      if (name === 'plan_scenario') {
        const mapping = columnMappingRef.current;
        const d       = dataRef.current;
        if (!mapping || !d) return { valid: false, error: 'No org data loaded.' };

        const target = ((toolInput.target as string) ?? 'as-is') as 'as-is' | 'to-be';
        if (target === 'to-be' && !toBeDataRef.current) {
          return {
            valid: false,
            error: 'No To-Be scenario exists yet.',
            suggestion: "Initialize a To-Be state first: go to the Hierarchy tab → To-Be and click \"Copy from As-Is\", then retry with target='to-be'.",
          };
        }

        const sourceRows  = target === 'to-be' ? toBeRowsRef.current! : asIsRowsRef.current;
        const targetData  = target === 'to-be' ? toBeDataRef.current : d;
        const description = (toolInput.description as string) ?? '';
        const planId      = `plan_${Date.now().toString(36)}`;
        const result      = validateAndSimulate(
          toolInput.actions as ScenarioAction[],
          sourceRows,
          mapping,
          targetData?.compMatrix ?? null,
          planId,
          graphVersionRef.current,
          target,
          description,
        );

        if (!result.valid) return result;

        planStoreRef.current.set(planId, result.plan);
        const byType = result.plan.actions.reduce((acc: Record<string, number>, a) => {
          acc[a.type] = (acc[a.type] ?? 0) + 1;
          return acc;
        }, {});

        return {
          valid:           true,
          plan_id:         planId,
          summary:         { total_actions: result.plan.actions.length, by_type: byType },
          impact:          result.plan.impact,
          action_previews: result.plan.action_previews,
          affected_nodes:  result.plan.affected_nodes,
          warnings:        result.plan.warnings,
        };
      }

      if (name === 'apply_scenario') {
        if (!writeModeRef.current) return { ok: false, error: 'Write Mode is disabled.' };

        const plan = planStoreRef.current.get(toolInput.plan_id as string);
        if (!plan) return { ok: false, error: 'Plan not found or expired. Call plan_scenario again.' };
        if (plan.status === 'applied') return { ok: false, error: 'This plan was already applied.' };

        if (new Date(plan.expires_at) < new Date()) {
          planStoreRef.current.delete(plan.plan_id);
          plan.status = 'expired';
          return { ok: false, error: 'Plan expired (30-minute limit). Call plan_scenario again.' };
        }

        if (graphVersionRef.current !== plan.base_graph_version) {
          planStoreRef.current.delete(plan.plan_id);
          return {
            ok: false,
            error: 'The org chart changed after this scenario was planned. Please call plan_scenario again with the updated state.',
          };
        }

        const confirmed = await new Promise<boolean>(resolve => setPendingPlan({ plan, resolve }));
        if (!confirmed) {
          plan.status = 'cancelled';
          return { ok: false, error: 'User cancelled.' };
        }

        const applyMapping    = columnMappingRef.current!;
        const sourceRows      = plan.target === 'to-be' ? toBeRowsRef.current! : asIsRowsRef.current;
        const targetData      = plan.target === 'to-be' ? toBeDataRef.current : dataRef.current;
        const recheck         = validateAndSimulate(
          plan.actions, sourceRows, applyMapping,
          targetData?.compMatrix ?? null,
          plan.plan_id, plan.base_graph_version,
          plan.target, plan.description,
        );
        if (!recheck.valid) {
          plan.status = 'cancelled';
          planStoreRef.current.delete(plan.plan_id);
          return { ok: false, error: `Re-validation failed: ${(recheck as { error?: string }).error}. Plan cancelled.` };
        }

        const newRows = applyActions(plan.actions, sourceRows, applyMapping);
        await onRowMutationRef.current?.(newRows, plan.target);

        // Sync AlaSQL table so subsequent AI SQL queries see the updated state
        alasql.tables[AI_TABLE].data = newRows.map((r: ExcelRow) => ({ ...r }));

        plan.status = 'applied';
        planStoreRef.current.delete(plan.plan_id);
        return {
          applied:          true,
          plan_id:          plan.plan_id,
          actions_executed: plan.actions.length,
          final_metrics:    plan.impact.after,
        };
      }

      return { error: `Unknown tool: ${name}` };
    }

    for (let step = 0; step < 8; step++) {
      const aId = uid();
      let aText = '';
      const pendingTools: ToolUseEvent[] = [];
      let fullMessage: RawMessage | null = null;
      let stopReason = 'end_turn';

      setDisplayMsgs(prev => [...prev, { id: aId, kind: 'assistant', text: '', streaming: true }]);

      try {
        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: current, systemContext: systemCtxRef.current }),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`API error ${res.status}: ${errText}`);
        }

        const reader  = res.body!.getReader();
        const decoder = new TextDecoder();
        let buf = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const json = line.slice(6).trim();
            if (!json) continue;
            let evt: SSEEvent;
            try { evt = JSON.parse(json); } catch { continue; }

            if (evt.type === 'text_delta')  { aText += evt.text; patch(aId, aText); }
            if (evt.type === 'tool_use')    { pendingTools.push(evt); }
            if (evt.type === 'done')        { fullMessage = evt.fullMessage; stopReason = evt.stop_reason; }
            if (evt.type === 'error')       { throw new Error(evt.message); }
          }
        }
      } catch (err) {
        patch(aId, `⚠ ${err instanceof Error ? err.message : String(err)}`);
        finalize(aId);
        break;
      }

      finalize(aId);
      if (!fullMessage) break;
      current = [...current, fullMessage];

      if (stopReason === 'end_turn') break;

      // Execute tool calls
      const toolResults: ToolResultContent[] = [];
      for (const tc of pendingTools) {
        const sql = tc.name === 'run_sql' ? (tc.input.query as string | undefined) : undefined;
        setDisplayMsgs(prev => [...prev, { id: uid(), kind: 'tool_call', name: tc.name, sql }]);

        const result    = await executeTool(tc.name, tc.input);
        const resultStr = JSON.stringify(result);

        let resultRows: Record<string, unknown>[] | undefined;
        let rowCount:   number    | undefined;
        let error:      string    | undefined;
        let isMetrics              = false;
        let summary:    string    | undefined;

        if (tc.name === 'run_sql') {
          const r = result as { ok: boolean; rows?: Record<string, unknown>[]; error?: string };
          if (r.ok) { resultRows = r.rows ?? []; rowCount = resultRows.length; }
          else      { error = r.error; }
        } else if (tc.name === 'get_metrics') {
          isMetrics = true;
        } else if (tc.name === 'get_schema') {
          summary = 'Schema checked ✓';
        } else if (tc.name === 'get_column_values') {
          const r = result as { column?: string; unique_count?: number; distribution?: Record<string, number> };
          if (r.distribution) {
            resultRows = Object.entries(r.distribution)
              .sort((a, b) => b[1] - a[1])
              .map(([value, count]) => ({ value, count }));
            rowCount = resultRows.length;
          }
        } else if (tc.name === 'find_employees') {
          const r = result as { found?: number; employees?: Record<string, unknown>[] };
          if (r.employees) { resultRows = r.employees; rowCount = r.found ?? r.employees.length; }
        } else if (tc.name === 'get_hierarchy_path') {
          const r = result as { employee?: string; path?: Record<string, unknown>[]; error?: string };
          if (r.error) { error = r.error; }
          else if (r.path) { resultRows = r.path; rowCount = r.path.length; }
        } else if (tc.name === 'compare_states') {
          const r = result as { error?: string };
          if (r.error) { error = r.error; } else { summary = 'States compared ✓'; }
        } else if (tc.name === 'set_comp_bands') {
          const r = result as { ok?: boolean; bands_set?: number; target?: string; error?: string };
          if (r.error) { error = r.error; }
          else {
            const targetLabel = r.target === 'both' ? 'As-Is and To-Be' : r.target === 'to-be' ? 'To-Be' : 'As-Is';
            summary = `✓ ${r.bands_set} comp band${r.bands_set !== 1 ? 's' : ''} saved to ${targetLabel} Comp Matrix`;
          }
        } else if (tc.name === 'write_employees') {
          const r = result as { ok?: boolean; rows_affected?: number; rows_reassigned?: number; target?: string; error?: string };
          if (r.error) { error = r.error; }
          else {
            const reassigned = r.rows_reassigned ? ` · ${r.rows_reassigned} direct report${r.rows_reassigned === 1 ? '' : 's'} reassigned` : '';
            summary = `✓ ${r.rows_affected ?? 0} row${r.rows_affected !== 1 ? 's' : ''} written to ${r.target} hierarchy${reassigned}`;
          }
        } else if (tc.name === 'set_field_mapping') {
          const r = result as { ok?: boolean; field?: string; column?: string; method?: string; rows_enriched?: number; error?: string };
          if (r.error) { error = r.error; }
          else if (r.method === 'derived') { summary = `✓ "${r.field}" derived → "${r.column}" (${r.rows_enriched} rows enriched)`; }
          else { summary = `✓ "${r.field}" mapped to column "${r.column}"`; }
        }

        setDisplayMsgs(prev => [...prev, {
          id: uid(), kind: 'tool_result',
          name: tc.name, rows: resultRows, rowCount, error, isMetrics, summary,
        }]);
        toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: resultStr });
      }

      if (!toolResults.length) break;
      current = [...current, { role: 'user', content: toolResults }];
    }

    const safeHistory = (() => {
      const last = current[current.length - 1];
      if (last?.role === 'assistant' && Array.isArray(last.content)) {
        const hasOrphan = (last.content as Array<{ type: string }>).some(b => b.type === 'tool_use');
        if (hasOrphan) return current.slice(0, -1);
      }
      return current;
    })();
    setRawMsgs(safeHistory);
    setBusy(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, rawMsgs]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => { e.preventDefault(); send(input); };

  const TOOL_LABELS: Record<string, string> = {
    run_sql:            'Running SQL query',
    get_metrics:        'Reading org metrics',
    get_schema:         'Checking schema',
    create_chart:       'Creating chart',
    get_column_values:  'Checking column values',
    find_employees:     'Searching employees',
    get_hierarchy_path: 'Tracing org path',
    compare_states:     'Comparing As-Is vs To-Be',
    set_comp_bands:     'Setting comp bands',
    write_employees:    'Writing employee data',
    set_field_mapping:  'Mapping field',
    plan_scenario:      'Planning scenario',
    apply_scenario:     'Applying scenario',
    get_change_log:     'Reading change log',
    get_comp_bands:     'Reading comp bands',
  };

  // Index of the last assistant message (for follow-up chips)
  const lastAssistantIdx = displayMsgs.reduce((last, m, i) => m.kind === 'assistant' ? i : last, -1);

  function copySql(id: string, sql: string) {
    navigator.clipboard.writeText(sql).catch(() => {});
    setCopiedSqlId(id);
    setTimeout(() => setCopiedSqlId(s => s === id ? null : s), 2000);
  }

  // ── No data state ──
  if (!rows.length && !data) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyIcon}>✦</div>
        <div className={styles.emptyTitle}>AI Assistant</div>
        <div className={styles.emptySub}>Upload an org file to start asking questions</div>
      </div>
    );
  }

  return (
    <div className={`${styles.wrap} ${variant === 'pane' ? styles.pane : ''}`}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.headerTitle}>AI Assistant</span>
          <span className={styles.headerMeta}>
            {rows.length > 0
              ? `${rows.length.toLocaleString()} rows`
              : data
              ? `${data.metrics.basic.total_nodes} nodes · re-upload Excel for full data`
              : 'no data'}
          </span>
        </div>
        {displayMsgs.length > 0 && (
          <button
            className={styles.clearBtn}
            onClick={() => {
              setDisplayMsgs([]);
              setRawMsgs([]);
              try { sessionStorage.removeItem(CHAT_STORAGE_KEY); } catch { /* ignore */ }
            }}
          >
            Clear chat
          </button>
        )}
      </div>

      {/* Permissions bar */}
      <div className={`${styles.permBar} ${writeMode ? styles.permBarWrite : ''}`}>
        <span className={styles.permIcon}>{writeMode ? '✎' : '🔒'}</span>
        <span className={styles.permLabel}>Write Mode</span>
        <button
          role="switch"
          aria-checked={writeMode}
          className={`${styles.permToggle} ${writeMode ? styles.permToggleOn : ''}`}
          onClick={() => setWriteMode(w => !w)}
          title={writeMode ? 'Disable write mode' : 'Enable write mode — AI can modify comp data'}
        >
          <span className={styles.permToggleThumb} />
        </button>
        {writeMode && (
          <span className={styles.permWarning}>AI can now edit compensation bands</span>
        )}
      </div>

      {/* Messages */}
      <div className={styles.messages} ref={scrollRef}>
        {displayMsgs.length === 0 && (
          <div className={styles.welcome}>
            <div className={styles.welcomeIcon}>✦</div>
            <div className={styles.welcomeTitle}>Ask anything about your org</div>
            <div className={styles.welcomeSub}>
              I can query employee data, surface structural insights, find people, compare org states, and analyze costs.
            </div>
            <div className={styles.suggestions}>
              {SUGGESTIONS.map(s => (
                <button key={s} className={styles.suggestion} onClick={() => !busy && send(s)} disabled={busy}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {displayMsgs.map((msg, idx) => {
          if (msg.kind === 'user') {
            return (
              <div key={msg.id} className={styles.userRow}>
                <div className={styles.userBubble}>{msg.text}</div>
              </div>
            );
          }

          if (msg.kind === 'assistant') {
            const followUps =
              !msg.streaming && idx === lastAssistantIdx && !busy && msg.text
                ? getFollowUps(msg.text)
                : [];
            return (
              <React.Fragment key={msg.id}>
                <div className={styles.assistantRow}>
                  <div className={styles.avatar}>✦</div>
                  <div className={styles.assistantBubble}>
                    {msg.text ? renderMarkdown(msg.text) : null}
                    {msg.streaming && !msg.text && <div className={styles.thinkingDots}><span /><span /><span /></div>}
                    {msg.streaming && msg.text && <span className={styles.cursor} />}
                  </div>
                </div>
                {followUps.length > 0 && (
                  <div className={styles.followUpsRow}>
                    {followUps.map(s => (
                      <button key={s} className={styles.followUpBtn} onClick={() => send(s)}>{s}</button>
                    ))}
                  </div>
                )}
              </React.Fragment>
            );
          }

          if (msg.kind === 'tool_call') {
            return (
              <div key={msg.id} className={styles.toolCallRow}>
                <span className={styles.toolCallDot} />
                <div className={styles.toolCallBody}>
                  <div className={styles.toolCallHeader}>
                    <span className={styles.toolCallLabel}>{TOOL_LABELS[msg.name] ?? msg.name}</span>
                    {msg.sql && (
                      <button
                        className={`${styles.copySqlBtn} ${copiedSqlId === msg.id ? styles.copySqlCopied : ''}`}
                        onClick={() => copySql(msg.id, msg.sql!)}
                        title="Copy SQL to clipboard"
                      >
                        {copiedSqlId === msg.id ? '✓ Copied' : 'Copy SQL'}
                      </button>
                    )}
                  </div>
                  {msg.sql && <code className={styles.toolSql}>{msg.sql}</code>}
                </div>
              </div>
            );
          }

          if (msg.kind === 'tool_result') {
            if (msg.error) {
              return (
                <div key={msg.id} className={styles.toolErrorRow}>
                  <span className={styles.errorBadge}>Error</span>
                  {msg.error}
                </div>
              );
            }
            if (msg.summary) {
              return (
                <div key={msg.id} className={styles.toolResultRow}>
                  <span className={styles.resultMeta}>{msg.summary}</span>
                </div>
              );
            }
            if (msg.rows && msg.rows.length > 0) {
              return (
                <div key={msg.id} className={styles.toolResultRow}>
                  <span className={styles.resultMeta}>{msg.rowCount?.toLocaleString()} row{msg.rowCount !== 1 ? 's' : ''} returned</span>
                  <ResultTable rows={msg.rows} />
                </div>
              );
            }
            if (msg.isMetrics) {
              return <div key={msg.id} className={styles.toolResultRow}><span className={styles.resultMeta}>Org metrics loaded ✓</span></div>;
            }
            if (msg.rows && msg.rows.length === 0) {
              return <div key={msg.id} className={styles.toolResultRow}><span className={styles.resultMeta}>0 rows returned</span></div>;
            }
            return null;
          }

          if (msg.kind === 'chart_created') {
            return (
              <div key={msg.id} className={styles.toolResultRow}>
                <span className={styles.resultMeta}>✓ Chart created · switched to Analytics Studio</span>
              </div>
            );
          }

          return null;
        })}
      </div>

      {/* Input bar */}
      <form className={styles.inputBar} onSubmit={handleSubmit}>
        <input
          className={styles.input}
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask about your org…"
          disabled={busy}
          autoComplete="off"
        />
        <button type="submit" className={styles.sendBtn} disabled={busy || !input.trim()}>
          {busy ? <span className={styles.sendBusy} /> : '↑'}
        </button>
      </form>

      {/* Comp bands confirmation modal */}
      {pendingCompBands && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmModal}>
            <div className={styles.confirmTitle}>Apply compensation bands?</div>
            {pendingCompBands.rationale && (
              <p className={styles.confirmWarn} style={{ marginBottom: 10 }}>
                <strong>Rationale:</strong> {pendingCompBands.rationale}
              </p>
            )}
            <div className={styles.compBandPreview}>
              <table className={styles.resultTable} style={{ fontSize: 11 }}>
                <thead>
                  <tr>
                    <th className={styles.rtTh}>Grade</th>
                    <th className={styles.rtTh}>Geo</th>
                    <th className={styles.rtTh}>Min</th>
                    <th className={styles.rtTh}>Max</th>
                    <th className={styles.rtTh}>Currency</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingCompBands.bands.map((b, i) => (
                    <tr key={i} className={styles.rtTr}>
                      <td className={styles.rtTd}>{b.grade}</td>
                      <td className={styles.rtTd}>{b.geo}</td>
                      <td className={styles.rtTd}>{b.min.toLocaleString()}</td>
                      <td className={styles.rtTd}>{b.max.toLocaleString()}</td>
                      <td className={styles.rtTd}>{b.currency}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.confirmWarn}>
              <strong>Target:</strong>{' '}
              {pendingCompBands.target === 'both' ? 'As-Is and To-Be' : pendingCompBands.target === 'to-be' ? 'To-Be' : 'As-Is'}
            </p>
            <p className={styles.confirmWarn}>
              {pendingCompBands.replaceAll
                ? 'This will replace ALL existing bands in the Comp Matrix.'
                : 'This will add or update these bands in the Comp Matrix. Existing bands not listed are kept.'}
            </p>
            <div className={styles.confirmActions}>
              <button
                className={styles.confirmCancel}
                onClick={() => { pendingCompBands.resolve(false); setPendingCompBands(null); }}
              >
                Cancel
              </button>
              <button
                className={styles.confirmOk}
                onClick={() => { pendingCompBands.resolve(true); setPendingCompBands(null); }}
              >
                Apply bands
              </button>
            </div>
          </div>
        </div>
      )}

      {/* write_employees confirmation modal */}
      {pendingRowMutation && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmModal}>
            <div className={styles.confirmTitle}>Apply employee data change?</div>
            <p className={styles.confirmWarn}><strong>Target:</strong> {pendingRowMutation.target}</p>
            {pendingRowMutation.rationale && (
              <p className={styles.confirmWarn}><strong>Reason:</strong> {pendingRowMutation.rationale}</p>
            )}
            <code className={styles.confirmSql}>{pendingRowMutation.sql}</code>
            <p className={styles.confirmWarn}>
              This will rebuild the{' '}
              {pendingRowMutation.target === 'both' ? 'As-Is and To-Be hierarchies'
                : pendingRowMutation.target === 'to-be' ? 'To-Be hierarchy'
                : 'As-Is hierarchy'} from the updated data.
            </p>
            <div className={styles.confirmActions}>
              <button className={styles.confirmCancel} onClick={() => { pendingRowMutation.resolve(false); setPendingRowMutation(null); }}>Cancel</button>
              <button className={styles.confirmOk}     onClick={() => { pendingRowMutation.resolve(true);  setPendingRowMutation(null); }}>Apply</button>
            </div>
          </div>
        </div>
      )}

      {/* set_field_mapping confirmation modal */}
      {pendingFieldMapping && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmModal}>
            <div className={styles.confirmTitle}>Map field &ldquo;{pendingFieldMapping.field}&rdquo;?</div>
            {pendingFieldMapping.rationale && <p className={styles.confirmWarn}>{pendingFieldMapping.rationale}</p>}
            {pendingFieldMapping.sourceColumn && (
              <p className={styles.confirmWarn}><strong>Source column:</strong> {pendingFieldMapping.sourceColumn}</p>
            )}
            {pendingFieldMapping.derivedSql && (
              <>
                <p className={styles.confirmWarn}><strong>Derived via SQL → &ldquo;{pendingFieldMapping.newColumnName}&rdquo;:</strong></p>
                <code className={styles.confirmSql}>{pendingFieldMapping.derivedSql}</code>
              </>
            )}
            <p className={styles.confirmWarn}>This will rebuild the As-Is org hierarchy with the updated field mapping.</p>
            <div className={styles.confirmActions}>
              <button className={styles.confirmCancel} onClick={() => { pendingFieldMapping.resolve(false); setPendingFieldMapping(null); }}>Cancel</button>
              <button className={styles.confirmOk}     onClick={() => { pendingFieldMapping.resolve(true);  setPendingFieldMapping(null); }}>Apply mapping</button>
            </div>
          </div>
        </div>
      )}

      {/* apply_scenario HITL modal */}
      {pendingPlan && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmModal}>
            <div className={styles.confirmTitle}>Apply scenario plan?</div>
            <p className={styles.confirmWarn}>{pendingPlan.plan.description}</p>

            <table className={styles.confirmTable}>
              <thead><tr><th>#</th><th>Type</th><th>Summary</th></tr></thead>
              <tbody>
                {pendingPlan.plan.action_previews.map(p => (
                  <tr key={p.action_index}>
                    <td>{p.action_index + 1}</td>
                    <td><code>{p.type}</code></td>
                    <td>{p.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <table className={styles.confirmTable}>
              <thead><tr><th>Metric</th><th>Before</th><th>After</th></tr></thead>
              <tbody>
                <tr><td>Headcount</td><td>{pendingPlan.plan.impact.before.headcount}</td><td>{pendingPlan.plan.impact.after.headcount}</td></tr>
                <tr><td>Avg span</td><td>{pendingPlan.plan.impact.before.avg_span.toFixed(1)}</td><td>{pendingPlan.plan.impact.after.avg_span.toFixed(1)}</td></tr>
                <tr><td>Layers</td><td>{pendingPlan.plan.impact.before.layers}</td><td>{pendingPlan.plan.impact.after.layers}</td></tr>
                {pendingPlan.plan.impact.before.total_cost != null && (
                  <tr>
                    <td>Total cost</td>
                    <td>{pendingPlan.plan.impact.before.total_cost}</td>
                    <td>{pendingPlan.plan.impact.after.total_cost}</td>
                  </tr>
                )}
              </tbody>
            </table>

            {pendingPlan.plan.affected_nodes.length > 0 && (
              <ul className={styles.confirmList}>
                {pendingPlan.plan.affected_nodes.map(n => (
                  <li key={n.node_id}><strong>{n.name}</strong>: {n.change}</li>
                ))}
              </ul>
            )}

            {pendingPlan.plan.warnings.length > 0 && (
              <ul className={styles.confirmWarnList}>
                {pendingPlan.plan.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}

            <div className={styles.confirmActions}>
              <button className={styles.confirmCancel} onClick={() => { pendingPlan.resolve(false); setPendingPlan(null); }}>Cancel</button>
              <button className={styles.confirmOk}     onClick={() => { pendingPlan.resolve(true);  setPendingPlan(null); }}>Apply</button>
            </div>
          </div>
        </div>
      )}

      {/* Destructive SQL confirmation modal */}
      {pendingConfirm && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmModal}>
            <div className={styles.confirmTitle}>Confirm data modification</div>
            <code className={styles.confirmSql}>{pendingConfirm.sql}</code>
            <p className={styles.confirmWarn}>
              This will modify your employee data. The change can be reversed by clearing the chat or re-uploading your file.
            </p>
            <div className={styles.confirmActions}>
              <button
                className={styles.confirmCancel}
                onClick={() => { pendingConfirm.resolve(false); setPendingConfirm(null); }}
              >
                Cancel
              </button>
              <button
                className={styles.confirmOk}
                onClick={() => { pendingConfirm.resolve(true); setPendingConfirm(null); }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
