import type { DashboardData } from './types';
import type { ExcelRow } from './parseExcel';
import type { ColumnMapping } from './fieldDictionary';
import { CANONICAL_FIELDS } from './fieldDictionary';

function buildColumnInfo(rows: ExcelRow[]): string {
  if (rows.length === 0) return '  (no columns detected)';

  const headers = Object.keys(rows[0]);

  return headers.map(col => {
    const vals = rows.map(r => r[col]);
    const nonNull = vals.filter(v => v != null);
    if (nonNull.length === 0) return `  - \`${col}\`: unknown`;

    const first = nonNull[0];

    if (typeof first === 'boolean') {
      const trueCount = nonNull.filter(v => v === true).length;
      return `  - \`${col}\`: boolean — true: ${trueCount}, false: ${nonNull.length - trueCount}`;
    }

    if (typeof first === 'number') {
      const nums = nonNull.filter((v): v is number => typeof v === 'number');
      const min  = Math.min(...nums);
      const max  = Math.max(...nums);
      const avg  = nums.reduce((a, b) => a + b, 0) / nums.length;
      return `  - \`${col}\`: number — min: ${min}, max: ${max}, avg: ${avg.toFixed(1)}`;
    }

    // String column
    const unique = [...new Set(vals.map(v => String(v ?? '')).filter(Boolean))];
    if (unique.length <= 20) {
      return `  - \`${col}\`: string — values: [${unique.join(', ')}]`;
    }
    return `  - \`${col}\`: string (${unique.length} unique values)`;
  }).join('\n');
}

export function buildSystemContext(
  rows: ExcelRow[],
  data: DashboardData | null | undefined,
  writeMode = false,
  columnMapping: ColumnMapping | null = null,
): string {
  const N = rows.length;

  const colEntries = buildColumnInfo(rows);

  // Precomputed metrics block
  let metricsBlock = '';
  if (data?.metrics) {
    const m = data.metrics;
    const openRoles = Object.values(data.vertices).filter(v => v.open_role).length;
    metricsBlock = `
## Precomputed org metrics (no SQL needed for these)
- Total employees: ${m.basic.total_nodes}
- Total managers: ${m.management.manager_count}
- Average manager span: ${m.management.avg_span.toFixed(2)}
- Span variance: ${(m.management.span_variance ?? 0).toFixed(2)}
- Span Gini coefficient: ${(m.management.span_gini ?? 0).toFixed(3)} (0 = equal, 1 = very unequal)
- Overloaded managers (span > ${m.management.overload_threshold ?? 5}): ${m.management.overloaded ?? 0}
- Org depth (layers): ${m.org_structure.org_depth}
- Layer efficiency score: ${(m.org_structure.layer_efficiency_score ?? 0).toFixed(2)}
- Root nodes (top of hierarchy): ${m.basic.root_count}
- Total reporting edges: ${m.basic.total_edges}
- Open / unfilled roles: ${openRoles}
- Average edge confidence: ${(m.avg_confidence ?? 1).toFixed(2)}`;
  }

  // Compensation matrix block
  let compBlock = '';
  if (data?.compMatrix) {
    const bands: string[] = [];
    for (const [grade, geos] of Object.entries(data.compMatrix)) {
      if (!geos) continue;
      for (const [geo, band] of Object.entries(geos)) {
        if (!band) continue;
        bands.push(`  - ${grade} × ${geo}: ${band.min.toLocaleString()}–${band.max.toLocaleString()} ${band.currency}`);
      }
    }
    compBlock = bands.length
      ? `\n## Current compensation matrix (${bands.length} band${bands.length !== 1 ? 's' : ''} defined)\n${bands.join('\n')}`
      : '\n## Current compensation matrix\n  (no bands defined yet)';
  }

  // Field mapping block
  let fieldBlock = '';
  if (columnMapping) {
    const mapped   = CANONICAL_FIELDS.filter(f => columnMapping[f]?.column);
    const unmapped = CANONICAL_FIELDS.filter(f => !columnMapping[f]?.column);
    const mappedLines   = mapped.map(f => `  - ${f} → \`${columnMapping[f]!.column}\``).join('\n');
    const unmappedList  = unmapped.join(', ');
    fieldBlock = `\n## Canonical field mapping\nMapped (${mapped.length}):\n${mappedLines}\nUnmapped (${unmapped.length}): ${unmappedList || 'none'}`;
  }

  // Write mode block
  const writeModeBlock = writeMode
    ? `\n## Write mode: ENABLED\nAvailable write tools:\n- \`set_comp_bands\`: create/update comp matrix bands. Call \`run_sql\` first to analyze salary distributions.\n- \`write_employees\`: persist row mutations (INSERT/UPDATE/DELETE) to the org hierarchy. Always preview with \`run_sql SELECT\` first. Specify \`target\`: "as-is", "to-be", or "both".\n- \`set_field_mapping\`: map an unmapped canonical field to an existing column (\`source_column\`) or derive it via SQL (\`derived_sql\` returning \`employee_id\` + \`value\` columns, plus \`new_column_name\`). Always call \`get_column_values\` first.\nAll write operations show a confirmation dialog before applying.`
    : `\n## Write mode: DISABLED\nWrite tools (\`set_comp_bands\`, \`write_employees\`, \`set_field_mapping\`) are defined but disabled. Tell the user to enable Write Mode using the toggle above the chat.`;

  // 4 representative sample rows
  const sample = rows.slice(0, 4);

  return `You are an org analytics assistant embedded in an HR org-design tool. You help HR leaders, finance teams, and org designers understand org structure, headcount, compensation, and people data.

## Employee data table
Table name: \`data\`
Row count: ${N}
Columns (with value distributions):
${colEntries}

Enriched hierarchy fields (also queryable in \`data\`):
  - \`span\`: number — direct reports count (0 = individual contributor)
  - \`depth\`: number — distance from root (CEO ≈ 0)
  - \`subtree_count\`: number — total downstream reports including indirect
  - \`open_role\`: boolean — unfilled / vacant position
  - \`manager\`: string — manager's display name
${metricsBlock}

## Sample rows (first 4)
${JSON.stringify(sample, null, 2)}

## Tool usage rules
- Call \`get_metrics\` FIRST for org-wide aggregates (total headcount, avg span, depth, etc.) — it's instant
- Use \`run_sql\` for specific filters, person lookups, grouped aggregations, or anything requiring row-level data
- **Before filtering on a categorical column** (department, grade, geo, etc.), call \`get_column_values\` to get the exact values — never guess the casing or spelling
- Use \`find_employees\` for fuzzy name/role lookups instead of SQL LIKE — it handles case and partial matches
- Use \`get_hierarchy_path\` for "who reports to / who manages" chain questions
- Use \`compare_states\` when asked to compare As-Is vs To-Be scenarios
- Column names with spaces or special characters MUST be backtick-quoted: \`Column Name\`
- The table is always named \`data\`
- Prefer LIMIT 20 on exploratory queries
- SQL engine is AlaSQL — supports SELECT/FROM/WHERE/GROUP BY/ORDER BY/HAVING/JOIN/LIMIT/LIKE/IS NULL
- For UPDATE/INSERT/DELETE: call \`run_sql\` as normal — the user will see a confirmation dialog before execution
- **If \`run_sql\` returns \`{ "ok": false, "error": "..." }\`**: immediately fix and retry with a corrected query — do NOT give up after one failure

## Chart creation — ALWAYS follow this sequence
1. **Verify fields first**: Before calling \`create_chart\`, call \`get_schema\` to get the exact column list. Then run a quick \`run_sql\` (e.g. \`SELECT \`ColumnName\` FROM data LIMIT 3\`) to confirm the field has real data.
2. **Try to derive missing fields**: If the requested metric isn't a direct column (e.g. "transition cost", "monthly cost"), check whether it can be computed from existing columns (e.g. monthly = annual / 12, or a column with a similar name). If derivable, explain the mapping and use the closest real column.
3. **Declare infeasible — do NOT guess**: If the required field is neither a direct column nor computable from available columns, do NOT call \`create_chart\`. Instead, tell the user exactly which column is missing and what data they would need to upload.
4. **Call \`create_chart\` only once confirmed**: After verification, call \`create_chart\` using exact column names from \`get_schema\`. Never pass guessed or invented field names.
5. **Derived metrics require \`sqlQuery\`**: If the chart metric is computed from multiple columns (e.g. \`relocation_cost + recruitment_cost + cost_of_termination\`), you MUST pass a \`sqlQuery\` that SELECTs rowField and computes the alias — e.g. \`SELECT department, SUM(relocation_cost + recruitment_cost + cost_of_termination) as transition_cost FROM data GROUP BY department\`. Set \`valueField\` to that alias. Without \`sqlQuery\`, the chart engine can only read direct column values and will show an empty chart.

## Response format
- Lead with the direct answer, then support it with data
- Use **bold** for key numbers and names
- Use bullet lists for multiple items
- Render inline tables using markdown pipe syntax when showing comparisons
- For person profiles, use a mini-report with clear sections
- Format large numbers with commas: 1,234,567
- Keep answers concise — no filler phrases like "Based on the data…" or "Great question!"
${compBlock}${fieldBlock}${writeModeBlock}`;
}
