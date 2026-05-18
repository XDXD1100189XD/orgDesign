import type { AIChartRequest } from '@/lib/types';
import type { PivotConfig, PivotData } from '@/lib/story/pivotUtils';

export interface StoryDocument {
  id: string;
  title: string;
  slides: StorySlide[];
  createdAt: string;
  updatedAt: string;
}

export type SlideTemplateType =
  | 'title'
  | '1-slot'
  | '2-slot'
  | '3-slot'
  | '4-slot';

export const SLOT_COUNT: Record<SlideTemplateType, number> = {
  'title':  0,
  '1-slot': 1,
  '2-slot': 2,
  '3-slot': 3,
  '4-slot': 4,
};

export interface StorySlide {
  id: string;
  template: SlideTemplateType;
  title: string;
  subtitle?: string;    // title slide only
  footer?: string;      // slot templates: small bottom text
  slots: (ChartBlock | TableBlock | null)[];  // one block per slot (null = empty)
  order: number;
}

export type SlideBlock = ChartBlock | TableBlock;

export interface PivotDataSnapshot {
  colKeys: string[];
  rows: Array<{
    rowKey: string;
    values: Record<string, number | null>;
    total: number | null;
  }>;
}

export interface ChartBlock {
  type: 'chart';
  id: string;
  title?: string;
  spec: AIChartRequest & { palette?: string[] };
  snapshot: {
    rows?: Record<string, unknown>[];
    pivotData?: PivotDataSnapshot;
    capturedAt: string;
  };
  source: BlockSource;
}

export interface TableBlock {
  type: 'table';
  id: string;
  title?: string;
  columns: string[];
  rows: Record<string, unknown>[];
  maxDisplayRows: number;
  source: BlockSource;
}

export interface BlockSource {
  type:
    | 'manual'
    | 'sql-query'
    | 'analytics-studio'
    | 'ai-tool'
    | 'activity-analysis'
    | 'skills-capability'
    | 'succession-planning'
    | 'org-metrics';
  label: string;
  capturedAt: string;
}

// Raw data staged from "Add to Story" — user configures it in BlockConfigModal before placement
export interface PendingData {
  rows: Record<string, unknown>[];
  columns: string[];
  source: BlockSource;
  label: string;
  // Optional pre-computed pivot (from Analytics Studio saved views)
  pivotData?: PivotData;
  pivotConfig?: PivotConfig;
}
