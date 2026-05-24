/**
 * Shared helpers for stripping sensitive/PII fields from data before sending to the Claude AI API.
 * Tools execute client-side against full data; these helpers sanitize what goes into tool_result content.
 */

export const SENSITIVE_FIELD_PATTERNS: RegExp[] = [
  // Financial / legal PII
  /salary/i,
  /bonus/i,
  /pension/i,
  /insurance/i,
  /national_ins/i,
  /\bNIN\b/,
  /date_of_birth/i,
  /\bDOB\b/,
  /birth/i,
  /healthcare/i,
  /share_based/i,
  /payroll/i,
  /compensation/i,
  /benefit/i,
  /cost/i,
  /termination/i,
  /relocation/i,
  /expenses/i,
  /overtime/i,
  /email/i,
  /\bannual_rate\b/i,
  /\bbase_pay\b/i,
  /\bpay_rate\b/i,
  /\btotal_pay\b/i,
  // Employee name PII — strip from all tool results; never expose to API
  /\bname\b/i,       // standalone "name" field (word-boundary safe: won't match department_name)
  /display_name/i,
  /full_name/i,
  /first_name/i,
  /last_name/i,
  /\bmanager\b/i,    // resolved manager display_name (not manager_id — underscore breaks word boundary)
  // Org-vocab labels — strip from tool results; AI looks these up from system context schema
  /\bactivity_name\b/i,
  /\bskill_name\b/i,
];

const NAME_FIELD_PATTERNS: RegExp[] = [
  /\bname\b/i,
  /display_name/i,
  /full_name/i,
  /first_name/i,
  /last_name/i,
];

export function stripNameFieldsFromRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => !NAME_FIELD_PATTERNS.some(p => p.test(key)))
  );
}

export function isSensitiveField(key: string): boolean {
  return SENSITIVE_FIELD_PATTERNS.some(p => p.test(key));
}

export function stripSensitiveFieldsFromRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => !isSensitiveField(key))
  );
}

/** Return up to `limit` rows with sensitive fields removed. */
export function sanitizeRowsForAI(
  rows: Record<string, unknown>[],
  limit = 5,
): Record<string, unknown>[] {
  return rows.slice(0, limit).map(stripSensitiveFieldsFromRow);
}

/**
 * Summarize a row array for AI consumption:
 * - counts total rows
 * - lists columns (marking sensitive ones)
 * - provides a stripped sample
 * - flags truncation and sensitive-field stripping
 */
export function summarizeRowsForAI(
  rows: Record<string, unknown>[],
  limit = 5,
): {
  row_count: number;
  truncated_for_ai: boolean;
  sensitive_columns_stripped: boolean;
  columns: string[];
  sample: Record<string, unknown>[];
} {
  const allColumns = rows.length > 0 ? Object.keys(rows[0]) : [];
  const sensitiveColumns = allColumns.filter(isSensitiveField);
  return {
    row_count:                  rows.length,
    truncated_for_ai:           rows.length > limit,
    sensitive_columns_stripped: sensitiveColumns.length > 0,
    columns:                    allColumns.map(c => isSensitiveField(c) ? `${c} [omitted]` : c),
    sample:                     sanitizeRowsForAI(rows, limit),
  };
}
