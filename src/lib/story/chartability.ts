import type { AggFn, ChartType } from '@/lib/types';

export interface ChartabilityResult {
  chartable: boolean;
  reason?: string;
  suggestedTypes: ChartType[];
  numericColumns: string[];
  categoricalColumns: string[];
  recommendedRowField: string | null;
  recommendedValueField: string | null;
  recommendedAggFn: AggFn;
  warnings: string[];
}

export function validateChartability(
  rows: Record<string, unknown>[],
  opts?: { maxCategories?: number },
): ChartabilityResult {
  const maxCategories = opts?.maxCategories ?? 40;

  if (!rows.length) {
    return {
      chartable: false,
      reason: 'No rows to chart.',
      suggestedTypes: [],
      numericColumns: [],
      categoricalColumns: [],
      recommendedRowField: null,
      recommendedValueField: null,
      recommendedAggFn: 'count',
      warnings: [],
    };
  }

  const sample = rows.slice(0, 20);
  const columns = Object.keys(rows[0]);
  const warnings: string[] = [];
  const numericColumns: string[] = [];
  const categoricalColumns: string[] = [];

  for (const col of columns) {
    const values = sample.map(r => r[col]).filter(v => v != null);
    if (!values.length) continue;

    const numericCount = values.filter(v => typeof v === 'number' || (!isNaN(parseFloat(String(v))) && String(v).trim() !== '')).length;
    if (numericCount / values.length > 0.8) {
      numericColumns.push(col);
    } else {
      const unique = new Set(rows.map(r => String(r[col] ?? '')).filter(Boolean));
      if (unique.size <= maxCategories) {
        categoricalColumns.push(col);
        if (unique.size > 20) {
          warnings.push(`Column "${col}" has ${unique.size} unique values — chart may be crowded.`);
        }
      } else {
        warnings.push(`Column "${col}" has ${unique.size} unique values — too many to group by directly.`);
      }
    }
  }

  // A count chart only needs a categorical column (no numeric needed)
  const canCountChart = categoricalColumns.length > 0;
  const canValueChart = categoricalColumns.length > 0 && numericColumns.length > 0;

  if (!canCountChart) {
    return {
      chartable: false,
      reason: 'No groupable column found. All columns have too many unique values or no data.',
      suggestedTypes: [],
      numericColumns,
      categoricalColumns,
      recommendedRowField: null,
      recommendedValueField: null,
      recommendedAggFn: 'count',
      warnings,
    };
  }

  const recommendedRowField = categoricalColumns[0];
  const recommendedValueField = numericColumns[0] ?? null;
  const recommendedAggFn: AggFn = canValueChart ? 'sum' : 'count';

  // Suggest chart types
  const suggestedTypes: ChartType[] = [];
  const uniqueCount = new Set(rows.map(r => String(r[recommendedRowField] ?? ''))).size;
  if (uniqueCount <= 6 && canValueChart) suggestedTypes.push('pie');
  suggestedTypes.push('bar');
  if (canValueChart) suggestedTypes.push('line', 'area');

  // Null check warning for value column
  if (recommendedValueField) {
    const nulls = rows.filter(r => r[recommendedValueField] == null).length;
    if (nulls > 0) {
      warnings.push(`Value column "${recommendedValueField}" has ${nulls} null values — they will be excluded from aggregation.`);
    }
  }

  return {
    chartable: true,
    suggestedTypes,
    numericColumns,
    categoricalColumns,
    recommendedRowField,
    recommendedValueField,
    recommendedAggFn,
    warnings,
  };
}
