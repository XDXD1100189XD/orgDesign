'use client';

import { useState } from 'react';
import type { StorySlide, ChartBlock, TableBlock } from '@/lib/story/types';
import { ChartBlockRenderer } from '../blocks/ChartBlockRenderer';
import { TableBlockRenderer } from '../blocks/TableBlockRenderer';

interface Props {
  slide: StorySlide;
  onSlotClick?: (slotIndex: number) => void;
  onRemoveBlock?: (slotIndex: number) => void;
  onSlotDrop?: (slotIndex: number) => void;
  isDragActive?: boolean;
}

export function OneSlotTemplate({ slide, onSlotClick, onRemoveBlock, onSlotDrop, isDragActive }: Props) {
  const block = (slide.slots[0] ?? null) as ChartBlock | TableBlock | null;

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

      {/* Slot area */}
      <div style={{ flex: 1, padding: '12px 24px', overflow: 'hidden' }}>
        <SlotArea
          block={block}
          height={432}
          onSlotClick={onSlotClick ? () => onSlotClick(0) : undefined}
          onRemoveBlock={onRemoveBlock ? () => onRemoveBlock(0) : undefined}
          onDrop={onSlotDrop ? () => onSlotDrop(0) : undefined}
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

export function SlotArea({
  block, height, onSlotClick, onRemoveBlock, onDrop, isDragActive,
}: {
  block: ChartBlock | TableBlock | null;
  height: number;
  onSlotClick?: () => void;
  onRemoveBlock?: () => void;
  onDrop?: () => void;
  isDragActive?: boolean;
}) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    if (block !== null) return;
    e.preventDefault();
    setIsDragOver(true);
  };
  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (block !== null) return;
    if (onDrop) onDrop();
  };

  const canPlace = !!onSlotClick || !!onDrop;

  if (block === null) {
    return (
      <div
        onClick={onSlotClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          height,
          border: `2px dashed ${
            isDragOver ? 'var(--teal, #006b6b)'
            : isDragActive ? 'rgba(0,107,107,0.6)'
            : canPlace ? 'var(--teal, #006b6b)'
            : 'rgba(0,0,0,0.12)'
          }`,
          borderRadius: 4,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          color: isDragOver || canPlace ? 'var(--teal, #006b6b)' : '#ccc',
          fontSize: 12,
          cursor: canPlace ? 'pointer' : 'default',
          background: isDragOver
            ? 'rgba(0,107,107,0.08)'
            : isDragActive
            ? 'rgba(0,107,107,0.03)'
            : canPlace
            ? 'rgba(0,107,107,0.02)'
            : 'transparent',
          userSelect: 'none',
          transition: 'background 0.15s, border-color 0.15s',
        }}
      >
        <div style={{ fontSize: 22, opacity: 0.4 }}>⊞</div>
        <div style={{ fontWeight: 500 }}>
          {isDragOver
            ? 'Drop to configure & place'
            : isDragActive
            ? 'Drop here'
            : canPlace
            ? 'Click to place'
            : 'Select an item from the library'}
        </div>
      </div>
    );
  }

  return (
    <div style={{ height, position: 'relative', overflow: 'hidden', borderRadius: 4 }}>
      {block.type === 'chart'
        ? <ChartBlockRenderer block={block} height={height} />
        : <TableBlockRenderer block={block} maxRows={Math.floor(height / 26)} />
      }
      {onRemoveBlock && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemoveBlock(); }}
          title="Remove from slot"
          style={{
            position: 'absolute', top: 4, right: 4, zIndex: 10,
            background: 'rgba(0,0,0,0.45)', color: '#fff',
            border: 'none', borderRadius: 3,
            width: 18, height: 18, fontSize: 9,
            cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            lineHeight: 1, padding: 0,
          }}
        >✕</button>
      )}
    </div>
  );
}
