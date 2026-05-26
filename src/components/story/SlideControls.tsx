'use client';

import type { StorySlide, SlideTemplateType, ChartBlock, TableBlock } from '@/lib/story/types';
import { SLOT_COUNT } from '@/lib/story/types';

const TEMPLATE_LABELS: Record<SlideTemplateType, string> = {
  'title':  'Title',
  '1-slot': '1 Chart',
  '2-slot': '2 Charts',
  '3-slot': '3 Charts',
  '4-slot': '4 Charts',
};

const TEMPLATES: SlideTemplateType[] = ['title', '1-slot', '2-slot', '3-slot', '4-slot'];

interface Props {
  slide: StorySlide | null;
  onUpdateSlide: (updated: StorySlide) => void;
}

export function SlideControls({ slide, onUpdateSlide }: Props) {
  if (!slide) {
    return (
      <div style={{ width: 240, flexShrink: 0, padding: 24, color: '#aaa', fontSize: 13, borderLeft: '1px solid rgba(0,0,0,0.09)' }}>
        Select a slide to edit it
      </div>
    );
  }

  function setTitle(title: string) { onUpdateSlide({ ...slide!, title }); }
  function setSubtitle(subtitle: string) { onUpdateSlide({ ...slide!, subtitle }); }
  function setFooter(footer: string) { onUpdateSlide({ ...slide!, footer }); }

  function setTemplate(template: SlideTemplateType) {
    const s = slide!;
    const newCount = SLOT_COUNT[template];
    const newSlots = Array.from({ length: newCount }, (_, i) => s.slots[i] ?? null);
    onUpdateSlide({ ...s, template, slots: newSlots });
  }

  function removeBlock(slotIndex: number) {
    const s = slide!;
    const newSlots = s.slots.map((b, i) => i === slotIndex ? null : b);
    onUpdateSlide({ ...s, slots: newSlots });
  }

  const filledSlotCount = slide.slots.filter(b => b !== null).length;
  const totalSlots = SLOT_COUNT[slide.template];

  return (
    <div style={{
      width: 240,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      borderLeft: '1px solid rgba(0,0,0,0.09)',
      background: '#fafaf8',
      padding: '20px 16px',
      gap: 20,
      overflowY: 'auto',
      height: '100%',
      boxSizing: 'border-box',
    }}>
      {/* Template picker */}
      <div>
        <label style={labelStyle}>Template</label>
        <select
          value={slide.template}
          onChange={e => setTemplate(e.target.value as SlideTemplateType)}
          style={selectStyle}
        >
          {TEMPLATES.map(t => (
            <option key={t} value={t}>{TEMPLATE_LABELS[t]}</option>
          ))}
        </select>
      </div>

      {/* Title */}
      <div>
        <label style={labelStyle}>Heading</label>
        <input
          type="text"
          value={slide.title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Slide heading"
          style={inputStyle}
        />
      </div>

      {/* Subtitle — title slide only */}
      {slide.template === 'title' && (
        <div>
          <label style={labelStyle}>Subtitle</label>
          <input
            type="text"
            value={slide.subtitle ?? ''}
            onChange={e => setSubtitle(e.target.value)}
            placeholder="e.g. Organisation Insights · Q2 2026"
            style={inputStyle}
          />
        </div>
      )}

      {/* Footer */}
      <div>
        <label style={labelStyle}>Footer text</label>
        <input
          type="text"
          value={slide.footer ?? ''}
          onChange={e => setFooter(e.target.value)}
          placeholder="Source: HR Database · Q2 2026"
          style={inputStyle}
        />
      </div>

      {/* Slot status */}
      {slide.template !== 'title' && (
        <div>
          <label style={labelStyle}>
            Slots ({filledSlotCount}/{totalSlots} filled)
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {slide.slots.map((block, si) => (
              <SlotRow
                key={si}
                slotIndex={si}
                block={block as ChartBlock | TableBlock | null}
                onRemove={() => removeBlock(si)}
              />
            ))}
          </div>
          {filledSlotCount === 0 && (
            <div style={{ fontSize: 11, color: '#aaa', lineHeight: 1.5, fontStyle: 'italic', marginTop: 6 }}>
              Drag items from the library onto a slot to place them.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SlotRow({
  slotIndex, block, onRemove,
}: {
  slotIndex: number;
  block: ChartBlock | TableBlock | null;
  onRemove: () => void;
}) {
  const label = block
    ? block.type === 'chart'
      ? `Chart: ${block.spec.rowField ?? '—'}`
      : `Table: ${block.columns.slice(0, 2).join(', ')}${block.columns.length > 2 ? '…' : ''}`
    : 'Empty';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '5px 8px',
      borderRadius: 3,
      border: '1px solid rgba(0,0,0,0.08)',
      background: block ? 'rgba(0,107,107,0.04)' : 'rgba(0,0,0,0.01)',
      gap: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 9, color: '#aaa', fontWeight: 700, flexShrink: 0 }}>S{slotIndex + 1}</span>
        <span style={{
          fontSize: 10,
          color: block ? 'var(--teal, #006b6b)' : '#bbb',
          fontWeight: block ? 500 : 400,
          fontStyle: block ? 'normal' : 'italic',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
        }}>
          {label}
        </span>
      </div>
      {block && (
        <button
          onClick={onRemove}
          title="Clear slot"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#bbb', fontSize: 11, padding: '1px 2px', flexShrink: 0,
            lineHeight: 1,
          }}
        >✕</button>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 10,
  fontWeight: 600,
  color: '#888',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 5,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  fontSize: 12,
  border: '1px solid rgba(0,0,0,0.15)',
  borderRadius: 3,
  background: '#fff',
  color: 'var(--ink, #1a1d20)',
  boxSizing: 'border-box',
  outline: 'none',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
};
