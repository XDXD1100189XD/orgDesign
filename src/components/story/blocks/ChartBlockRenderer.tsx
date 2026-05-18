'use client';

import { useMemo } from 'react';
import { PivotChart } from '@/components/shared/PivotChart';
import { computePivot, CHART_COLORS } from '@/lib/story/pivotUtils';
import type { PivotConfig } from '@/lib/story/pivotUtils';
import type { ChartBlock } from '@/lib/story/types';
import type { ExcelRow } from '@/lib/parseExcel';

export function ChartBlockRenderer({ block, height = 260 }: {
  block: ChartBlock;
  height?: number;
}) {
  const pivotData = useMemo(() => {
    if (block.snapshot.pivotData) {
      return block.snapshot.pivotData;
    }
    if (block.snapshot.rows?.length) {
      const config: PivotConfig = {
        rowField: block.spec.rowField,
        colField: block.spec.colField ?? null,
        valueField: block.spec.valueField ?? null,
        aggFn: block.spec.aggFn,
        chartType: block.spec.chartType,
        palette: block.spec.palette ?? CHART_COLORS,
      };
      return computePivot(block.snapshot.rows as ExcelRow[], config);
    }
    return { colKeys: [], rows: [] };
  }, [block]);

  const config: PivotConfig = {
    rowField: block.spec.rowField,
    colField: block.spec.colField ?? null,
    valueField: block.spec.valueField ?? null,
    aggFn: block.spec.aggFn,
    chartType: block.spec.chartType,
    palette: block.spec.palette ?? CHART_COLORS,
  };

  return (
    <div style={{ width: '100%', height }}>
      <PivotChart pivotData={pivotData} config={config} />
    </div>
  );
}
