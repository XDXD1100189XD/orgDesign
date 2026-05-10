// ========================================================
// Raw response types from n8n webhook
// ========================================================
export interface RawEdge {
  employee_temp_id: string;
  manager_temp_id: string;
  employee_original?: string;
  manager_original?: string;
  employee_resolution_method?: string;
  manager_resolution_method?: string;
  resolution_notes?: string;
  edge_confidence: number;
}

export interface RawIdentifier {
  type: string;
  value: string;
  confidence: number;
}

export interface RawAttribute {
  type: string;
  value: string;
}

export interface RawVertex {
  temp_id: string;
  display_name: string;
  subtitle?: string | null;
  badge?: string;
  grade?: string;
  all_identifiers?: RawIdentifier[];
  all_attributes?: RawAttribute[];
  open_role?: boolean;
  // Fields from sample/simplified shapes
  role?: string;
  id?: string | null;
  dept?: string;
  unnamed?: boolean;
}

export interface RawHierarchyNode {
  temp_id: string;
  display_name: string;
  subtitle?: string | null;
  badge?: string;
  grade?: string;
  children: RawHierarchyNode[];
}

export interface RawMetrics {
  basic: { total_nodes: number; total_edges: number; root_count: number };
  span: Record<string, number>;
  depth: Record<string, number>;
  org_structure: {
    org_depth: number;
    width_per_level: Record<string, number>;
    layer_efficiency_score: number;
    diameter: number;
  };
  management: {
    manager_count: number;
    avg_span: number;
    span_variance: number;
    span_gini: number;
    span_overload_index: number;
    overload_threshold: number;
  };
}

export interface WebhookResponse {
  resolved_edges: RawEdge[];
  vertex_lookup: Record<string, RawVertex>;
  heirarchy_tree?: { roots: RawHierarchyNode[] };
  hierarchy_tree?: { roots: RawHierarchyNode[] };
  metrics?: RawMetrics;
  warnings?: string[];
  resolution_summary?: Record<string, unknown>;
}

// ========================================================
// Compensation types
// ========================================================
export interface CompBand {
  min: number;
  max: number;
  currency: string;
}

// grade → geo → band; both levels may be absent at runtime
export type CompMatrix = Record<string, Record<string, CompBand | undefined> | undefined>;

export interface CompTransition {
  from_open: boolean;
  from_geo: string | null;
  from_band_min: number | null;
  from_band_max: number | null;
  from_currency: string | null;
  to_open: boolean;
  to_geo: string | null;
  to_band_min: number | null;
  to_band_max: number | null;
  to_currency: string | null;
  changed_at: string; // ISO
}

// ========================================================
// Normalized types used by dashboard components
// ========================================================
export interface NormalizedVertex {
  display_name: string;
  role: string;
  id: string | null;
  grade: string | null;
  unnamed: boolean;
  dept: string | null;
  open_role: boolean;
  geo?: string | null;
  transition?: CompTransition | null;
}

export interface ComputedMetrics {
  basic: {
    total_nodes: number;
    total_edges: number;
    root_count: number;
    roots: string[];
  };
  span: Record<string, number>;
  depth: Record<string, number>;
  subtree_count: Record<string, number>;
  children: Record<string, string[]>;
  parent: Record<string, string>;
  org_structure: {
    org_depth: number;
    width_per_level: Record<string, number>;
    layer_efficiency_score: number;
    diameter: number;
  };
  management: {
    manager_count: number;
    avg_span: number;
    span_variance: number;
    span_gini: number;
    span_overload_index: number;
    overload_threshold: number;
    overloaded: number;
  };
  avg_confidence: number;
}

export interface DashboardData {
  vertices: Record<string, NormalizedVertex>;
  metrics: ComputedMetrics;
  warnings: string[];
  edges: RawEdge[];  // preserved for React Flow mutations
  compMatrix?: CompMatrix;
}

// ── AI chart request (shared between AIAssistantView and AnalyticsStudioView) ──

export type AggFn     = 'sum' | 'count' | 'avg' | 'min' | 'max';
export type ChartType = 'bar' | 'stackedBar' | 'line' | 'area' | 'pie' | 'radar';

export interface AIChartRequest {
  rowField:    string;
  colField?:   string;
  valueField?: string;
  aggFn:       AggFn;
  chartType:   ChartType;
  title?:      string;
  sqlQuery?:        string;
  precomputedRows?: Record<string, unknown>[];
}

export interface TableRow {
  id: string;
  name: string;
  unnamed: boolean;
  emp_id: string;
  role: string;
  grade: string;
  manager: string | null;
  manager_id: string | undefined;
  depth: number;
  span: number;
  open_role: boolean;
}

// ========================================================
// Upload file type selection
// ========================================================
export type FileInputType = 'image' | 'text' | 'excel';

export const FILE_TYPE_CONFIG: Record<FileInputType, {
  label: string;
  accept: string;
  description: string;
  icon: string;
}> = {
  image: { label: 'Image', accept: 'image/png,image/jpeg,image/webp', description: 'PNG · JPG · WEBP', icon: '🖼️' },
  text:  { label: 'Text', accept: '.txt,.csv,.json,.md', description: 'TXT · CSV · JSON · MD', icon: '📄' },
  excel: { label: 'Excel', accept: '.xlsx,.xls,.csv', description: 'XLSX · XLS · CSV', icon: '📊' },
};

// ========================================================
// Metric filter for table
// ========================================================
export type FilterOperator = 'any' | 'lt' | 'gt' | 'eq' | 'between';

export interface MetricFilter {
  metric: string;        // 'span' | 'depth' (extensible)
  operator: FilterOperator;
  value: number;
  valueTo?: number;      // for 'between'
}

// ========================================================
// React Flow node data
// ========================================================
export interface OrgNodeData {
  tempId: string;
  displayName: string;
  role: string;
  empId: string | null;
  grade: string | null;
  geo?: string | null;
  unnamed: boolean;
  span: number;
  depth: number;
  openRole: boolean;
  isUserCreated?: boolean;
  isOrphan?: boolean;
  subtreeCount?: number;
}
