/**
 * Shared helpers for stripping sensitive/PII fields from data before sending to the Claude AI API.
 * Tools execute client-side against full data; these helpers sanitize what goes into tool_result content.
 */

export const SENSITIVE_FIELD_PATTERNS: RegExp[] = [
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
];

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
