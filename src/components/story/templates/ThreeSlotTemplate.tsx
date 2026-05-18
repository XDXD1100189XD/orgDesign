'use client';

import type { StorySlide, ChartBlock, TableBlock } from '@/lib/story/types';
import { SlotArea } from './OneSlotTemplate';

interface Props {
  slide: StorySlide;
  onSlotClick?: (slotIndex: number) => void;
  onRemoveBlock?: (slotIndex: number) => void;
  onSlotDrop?: (slotIndex: number) => void;
  isDragActive?: boolean;
}

export function ThreeSlotTemplate({ slide, onSlotClick, onRemoveBlock, onSlotDrop, isDragActive }: Props) {
  const topH = 208;
  const botH = 180;

  return (
    <div style={{ width: 960, height: 540, display: 'flex', flexDirection: 'column', background: '#fff', fontFamily: 'inherit' }}>
      {/* Header */}
      <div style={{
        background: 'var(--teal, #006b6b)',
        color: '#fff',
        padding: '10px 24px',
        fontSize: 16,
        fontWeight: 700,
        letterSpacing: '0.01em',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        minHeight: 44,
      }}>
        <div style={{ width: 3, height: 20, background: '#c0a800', borderRadius: 1, flexShrink: 0 }} />
        {slide.title || 'Untitled'}
      </div>

      {/* Top row: 2 slots */}
      <div style={{ display: 'flex', gap: 12, padding: '12px 24px 6px', flexShrink: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <SlotArea
            block={(slide.slots[0] ?? null) as ChartBlock | TableBlock | null}
            height={topH}
            onSlotClick={onSlotClick ? () => onSlotClick(0) : undefined}
            onRemoveBlock={onRemoveBlock ? () => onRemoveBlock(0) : undefined}
            onDrop={onSlotDrop ? () => onSlotDrop(0) : undefined}
            isDragActive={isDragActive}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <SlotArea
            block={(slide.slots[1] ?? null) as ChartBlock | TableBlock | null}
            height={topH}
            onSlotClick={onSlotClick ? () => onSlotClick(1) : undefined}
            onRemoveBlock={onRemoveBlock ? () => onRemoveBlock(1) : undefined}
            onDrop={onSlotDrop ? () => onSlotDrop(1) : undefined}
            isDragActive={isDragActive}
          />
        </div>
      </div>

      {/* Bottom row: 1 wide slot */}
      <div style={{ padding: '0 24px 8px', flex: 1 }}>
        <SlotArea
          block={(slide.slots[2] ?? null) as ChartBlock | TableBlock | null}
          height={botH}
          onSlotClick={onSlotClick ? () => onSlotClick(2) : undefined}
          onRemoveBlock={onRemoveBlock ? () => onRemoveBlock(2) : undefined}
          onDrop={onSlotDrop ? () => onSlotDrop(2) : undefined}
          isDragActive={isDragActive}
        />
      </div>

      {/* Footer */}
      {slide.footer && (
        <div style={{
          padding: '4px 24px 6px',
          fontSize: 9,
          color: '#aaa',
          borderTop: '1px solid rgba(0,0,0,0.06)',
          flexShrink: 0,
        }}>
          {slide.footer}
        </div>
      )}
    </div>
  );
}
