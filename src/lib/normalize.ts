import type {
  WebhookResponse,
  RawVertex,
  NormalizedVertex,
  DashboardData,
  ComputedMetrics,
} from './types';
import { computeMetrics } from './metrics';

function normalizeVertex(v: RawVertex): NormalizedVertex {
  // Role
  let role = v.role || '';
  if (!role && v.badge) role = v.badge;
  if (!role) {
    const roleAttr = (v.all_attributes || []).find((a) => a.type === 'role');
    if (roleAttr) role = roleAttr.value;
  }
  role = role || '—';

  // Employee ID
  let empId: string | null = v.id || null;
  if (!empId && v.subtitle && /^[A-Z]{2,6}\d{3,}$/.test(v.subtitle)) {
    empId = v.subtitle;
  }
  if (!empId) {
    const idEntry = (v.all_identifiers || []).find(
      (i) => i.type === 'employee_id'
    );
    if (idEntry) empId = idEntry.value;
  }

  // Grade
  let grade: string | null = v.grade || null;
  if (!grade) {
    const gradeAttr = (v.all_attributes || []).find((a) => a.type === 'grade');
    if (gradeAttr) grade = gradeAttr.value;
  }

  // Unnamed
  const isUnnamed =
    v.unnamed || /^[A-Z]{2,6}\d{3,}$/.test(v.display_name);

  return {
    display_name: v.display_name,
    role,
    id: empId,
    grade,
    unnamed: isUnnamed,
    dept: v.dept || null,
    open_role: v.open_role || false,
  };
}

/**
 * Parse the raw webhook response and produce a single DashboardData object
 * that all components consume.
 */
export function parseWebhookResponse(raw: WebhookResponse): DashboardData {
  // Normalize vertices
  const vertices: Record<string, NormalizedVertex> = {};
  for (const [key, v] of Object.entries(raw.vertex_lookup)) {
    vertices[key] = normalizeVertex(v);
  }

  // Compute graph-traversal metrics (children, parent, roots)
  const computed = computeMetrics(raw.resolved_edges);

  // If n8n already sent pre-computed metrics, merge them with graph data
  let metrics: ComputedMetrics;
  if (raw.metrics?.basic && raw.metrics?.management && raw.metrics?.org_structure) {
    metrics = {
      ...computed,
      basic: {
        ...raw.metrics.basic,
        roots: computed.basic.roots,
      },
      span: raw.metrics.span || computed.span,
      depth: raw.metrics.depth || computed.depth,
      org_structure: raw.metrics.org_structure,
      management: {
        ...raw.metrics.management,
        overloaded:
          raw.metrics.management.overload_threshold !== undefined
            ? Object.values(raw.metrics.span || computed.span).filter(
                (s) => s > (raw.metrics!.management.overload_threshold || 5)
              ).length
            : computed.management.overloaded,
      },
    };
  } else {
    metrics = computed;
  }

  return {
    vertices,
    metrics,
    warnings: raw.warnings || [],
    edges: raw.resolved_edges,
  };
}

/**
 * Unwrap the response from n8n which may be nested in various ways.
 */
export function unwrapResponse(payload: unknown): WebhookResponse {
  let hier = payload as Record<string, unknown>;
  if (Array.isArray(hier)) hier = hier[0];
  if (hier?.data && (hier.data as Record<string, unknown>).resolved_edges)
    hier = hier.data as Record<string, unknown>;
  if (hier?.json && (hier.json as Record<string, unknown>).resolved_edges)
    hier = hier.json as Record<string, unknown>;
  if (hier?.body && (hier.body as Record<string, unknown>).resolved_edges)
    hier = hier.body as Record<string, unknown>;

  if (!hier?.resolved_edges || !hier?.vertex_lookup) {
    throw new Error(
      `Response missing "resolved_edges" or "vertex_lookup". Keys: ${Object.keys(
        hier || {}
      ).join(', ')}`
    );
  }

  return hier as unknown as WebhookResponse;
}
