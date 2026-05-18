'use client';

import type { StoryDocument, StorySlide, SlideTemplateType } from '@/lib/story/types';
import { SlideCanvas } from './SlideCanvas';

const TEMPLATE_LABELS: Record<SlideTemplateType, string> = {
  'title':  'Title',
  '1-slot': '1 Chart',
  '2-slot': '2 Charts',
  '3-slot': '3 Charts',
  '4-slot': '4 Charts',
};

const TEMPLATES: SlideTemplateType[] = ['title', '1-slot', '2-slot', '3-slot', '4-slot'];

interface Props {
  doc: StoryDocument;
  activeSlideId: string | null;
  onSelectSlide: (id: string) => void;
  onAddSlide: (template: SlideTemplateType) => void;
  onDeleteSlide: (id: string) => void;
  onDuplicateSlide: (id: string) => void;
}

export function SlideNavigator({
  doc, activeSlideId, onSelectSlide, onAddSlide, onDeleteSlide, onDuplicateSlide,
}: Props) {
  return (
    <div style={{
      width: 200,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      borderRight: '1px solid rgba(0,0,0,0.09)',
      background: 'var(--cream, #f4f1e8)',
      overflowY: 'auto',
      height: '100%',
    }}>
      {/* Slide thumbnails */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 10px' }}>
        {doc.slides.map((slide, idx) => (
          <SlideThumb
            key={slide.id}
            slide={slide}
            index={idx}
            active={slide.id === activeSlideId}
            onSelect={() => onSelectSlide(slide.id)}
            onDelete={() => onDeleteSlide(slide.id)}
            onDuplicate={() => onDuplicateSlide(slide.id)}
          />
        ))}
        {doc.slides.length === 0 && (
          <div style={{ color: '#aaa', fontSize: 11, textAlign: 'center', marginTop: 24 }}>
            No slides yet
          </div>
        )}
      </div>

      {/* Add slide menu */}
      <div style={{ borderTop: '1px solid rgba(0,0,0,0.09)', padding: '10px' }}>
        <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
          Add slide
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {TEMPLATES.map(t => (
            <button
              key={t}
              onClick={() => onAddSlide(t)}
              style={{
                background: 'none',
                border: '1px solid rgba(0,107,107,0.3)',
                borderRadius: 3,
                padding: '4px 8px',
                fontSize: 11,
                color: 'var(--teal, #006b6b)',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              + {TEMPLATE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SlideThumb({
  slide, index, active, onSelect, onDelete, onDuplicate,
}: {
  slide: StorySlide;
  index: number;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      style={{
        marginBottom: 8,
        cursor: 'pointer',
        borderRadius: 3,
        border: active ? '2px solid var(--teal, #006b6b)' : '2px solid transparent',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Mini preview */}
      <div style={{
        width: '100%',
        aspectRatio: '16/9',
        background: '#fff',
        overflow: 'hidden',
        pointerEvents: 'none',
        position: 'relative',
      }}>
        <div style={{ transform: 'scale(0.1875)', transformOrigin: 'top left', width: 960, height: 540, pointerEvents: 'none' }}>
          <SlideCanvas slide={slide} scale={1} />
        </div>
      </div>

      {/* Slide number + title */}
      <div style={{
        padding: '4px 6px',
        background: active ? 'rgba(0,107,107,0.06)' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 4,
      }}>
        <div style={{ overflow: 'hidden' }}>
          <div style={{ fontSize: 9, color: '#999', lineHeight: 1 }}>{index + 1} · {TEMPLATE_LABELS[slide.template]}</div>
          <div style={{
            fontSize: 10, color: 'var(--ink, #1a1d20)', fontWeight: 500,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            maxWidth: 110,
          }}>
            {slide.title || 'Untitled'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          <button
            onClick={e => { e.stopPropagation(); onDuplicate(); }}
            title="Duplicate"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: '#999', padding: 2 }}
          >⧉</button>
          <button
            onClick={e => { e.stopPropagation(); onDelete(); }}
            title="Delete"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: '#999', padding: 2 }}
          >✕</button>
        </div>
      </div>
    </div>
  );
}
