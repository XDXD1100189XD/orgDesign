'use client';

import { useRef, useCallback, useState } from 'react';
import type {
  StoryDocument, StorySlide, SlideTemplateType, ChartBlock, TableBlock, PendingData,
} from '@/lib/story/types';
import { SLOT_COUNT } from '@/lib/story/types';
import { SlideNavigator } from './SlideNavigator';
import { SlideCanvas } from './SlideCanvas';
import { SlideControls } from './SlideControls';
import { BlockConfigModal } from './BlockConfigModal';
import { exportStoryToPdf } from '@/lib/story/exportPdf';

interface Props {
  doc: StoryDocument | null;
  setDoc: (doc: StoryDocument) => void;
  activeSlideId: string | null;
  setActiveSlideId: (id: string | null) => void;
  libraryItems: PendingData[];
  setLibraryItems: (items: PendingData[]) => void;
}

function makeId() {
  return typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

function makeSlide(template: SlideTemplateType, order: number): StorySlide {
  const title: Record<SlideTemplateType, string> = {
    'title':  'New Presentation',
    '1-slot': 'Chart Title',
    '2-slot': 'Chart Title',
    '3-slot': 'Chart Title',
    '4-slot': 'Chart Title',
  };
  return {
    id: makeId(),
    template,
    title: title[template],
    subtitle: template === 'title' ? 'Organisation Insights · 2026' : undefined,
    slots: Array.from({ length: SLOT_COUNT[template] }, () => null),
    order,
  };
}

function makeDoc(): StoryDocument {
  const now = new Date().toISOString();
  return {
    id: makeId(),
    title: 'New Story',
    slides: [makeSlide('title', 0)],
    createdAt: now,
    updatedAt: now,
  };
}

export function StoryView({
  doc, setDoc, activeSlideId, setActiveSlideId, libraryItems, setLibraryItems,
}: Props) {
  const canvasRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [activePendingData, setActivePendingData] = useState<PendingData | null>(null);
  const [draggingLibraryIndex, setDraggingLibraryIndex] = useState<number | null>(null);
  const [pendingPlacement, setPendingPlacement] = useState<{
    slideId: string;
    slotIndex: number;
  } | null>(null);

  const ensureDoc = useCallback((): StoryDocument => {
    if (doc) return doc;
    const d = makeDoc();
    setDoc(d);
    return d;
  }, [doc, setDoc]);

  const currentDoc = doc ?? makeDoc();
  const activeSlide = currentDoc.slides.find(s => s.id === activeSlideId)
    ?? currentDoc.slides[0]
    ?? null;

  function updateDoc(update: Partial<StoryDocument>) {
    const d = ensureDoc();
    setDoc({ ...d, ...update, updatedAt: new Date().toISOString() });
  }

  function addSlide(template: SlideTemplateType) {
    const d = ensureDoc();
    const newSlide = makeSlide(template, d.slides.length);
    updateDoc({ slides: [...d.slides, newSlide] });
    setActiveSlideId(newSlide.id);
  }

  function deleteSlide(id: string) {
    const d = ensureDoc();
    const slides = d.slides.filter(s => s.id !== id);
    updateDoc({ slides });
    if (activeSlideId === id) {
      setActiveSlideId(slides[0]?.id ?? null);
    }
  }

  function duplicateSlide(id: string) {
    const d = ensureDoc();
    const idx = d.slides.findIndex(s => s.id === id);
    if (idx === -1) return;
    const clone: StorySlide = {
      ...d.slides[idx],
      id: makeId(),
      order: idx + 1,
      slots: d.slides[idx].slots.map(b => b ? { ...b, id: makeId() } : null),
    };
    const slides = [
      ...d.slides.slice(0, idx + 1),
      clone,
      ...d.slides.slice(idx + 1),
    ].map((s, i) => ({ ...s, order: i }));
    updateDoc({ slides });
    setActiveSlideId(clone.id);
  }

  function updateSlide(updated: StorySlide) {
    const d = ensureDoc();
    updateDoc({ slides: d.slides.map(s => s.id === updated.id ? updated : s) });
  }

  function handleSlotClick(slideId: string, slotIndex: number) {
    if (!activePendingData) return;
    const d = ensureDoc();
    const slide = d.slides.find(s => s.id === slideId);
    if (!slide || slide.slots[slotIndex] !== null) return;
    setPendingPlacement({ slideId, slotIndex });
  }

  function handleSlotDrop(slideId: string, slotIndex: number) {
    if (draggingLibraryIndex === null) return;
    const item = libraryItems[draggingLibraryIndex];
    if (!item) return;
    const d = ensureDoc();
    const slide = d.slides.find(s => s.id === slideId);
    if (!slide || slide.slots[slotIndex] !== null) return;
    setActivePendingData(item);
    setPendingPlacement({ slideId, slotIndex });
  }

  function handleModalConfirm(block: ChartBlock | TableBlock) {
    if (!pendingPlacement) return;
    const d = ensureDoc();
    const slide = d.slides.find(s => s.id === pendingPlacement.slideId);
    if (!slide) return;
    const newSlots = slide.slots.map((b, i) =>
      i === pendingPlacement.slotIndex ? block : b
    );
    updateSlide({ ...slide, slots: newSlots });
    setPendingPlacement(null);
    // Keep activePendingData — user may place the same dataset in other slots
  }

  function handleModalDismiss() {
    setPendingPlacement(null);
  }

  function handleRemoveBlock(slideId: string, slotIndex: number) {
    const d = ensureDoc();
    const slide = d.slides.find(s => s.id === slideId);
    if (!slide) return;
    const newSlots = slide.slots.map((b, i) => i === slotIndex ? null : b);
    updateSlide({ ...slide, slots: newSlots });
  }

  async function handleExportPdf() {
    const d = ensureDoc();
    const elements: HTMLElement[] = [];
    for (const slide of d.slides) {
      const el = canvasRefs.current.get(slide.id);
      if (el) elements.push(el);
    }
    await exportStoryToPdf(elements, d);
  }

  const CANVAS_SCALE = 0.72;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: 'calc(100vh - 120px)',
      minHeight: 600,
      background: '#f0ede4',
    }}>
      {/* Top toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 24px',
        background: '#fff',
        borderBottom: '1px solid rgba(0,0,0,0.09)',
        gap: 16,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input
            type="text"
            value={currentDoc.title}
            onChange={e => updateDoc({ title: e.target.value })}
            placeholder="Story title"
            style={{
              border: 'none',
              borderBottom: '1px solid rgba(0,0,0,0.15)',
              padding: '2px 4px',
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--ink, #1a1d20)',
              background: 'transparent',
              outline: 'none',
              width: 280,
            }}
          />
          <span style={{ fontSize: 11, color: '#aaa' }}>
            {currentDoc.slides.length} slide{currentDoc.slides.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {activePendingData && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 11, color: 'var(--teal, #006b6b)',
              background: 'rgba(0,107,107,0.08)',
              borderRadius: 3, padding: '4px 10px',
              fontWeight: 500,
            }}>
              <span>Item selected — click an empty slot to place</span>
              <button
                onClick={() => setActivePendingData(null)}
                title="Deselect"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--teal, #006b6b)', fontSize: 13,
                  padding: 0, lineHeight: 1, opacity: 0.7,
                }}
              >✕</button>
            </div>
          )}
          <button
            onClick={handleExportPdf}
            disabled={currentDoc.slides.length === 0}
            style={{
              background: 'var(--teal, #006b6b)',
              color: '#fff',
              border: 'none',
              borderRadius: 3,
              padding: '7px 16px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              opacity: currentDoc.slides.length === 0 ? 0.5 : 1,
            }}
          >
            ↓ Export PDF
          </button>
        </div>
      </div>

      {/* 4-panel body */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        {/* Library panel */}
        <LibraryPanel
          items={libraryItems}
          activePendingData={activePendingData}
          onSelect={(item) => setActivePendingData(activePendingData === item ? null : item)}
          onRemove={(idx) => {
            const removing = libraryItems[idx];
            if (activePendingData === removing) setActivePendingData(null);
            setLibraryItems(libraryItems.filter((_, i) => i !== idx));
          }}
          onDragStart={(idx) => setDraggingLibraryIndex(idx)}
          onDragEnd={() => setDraggingLibraryIndex(null)}
        />

        {/* Slide navigator */}
        <SlideNavigator
          doc={currentDoc}
          activeSlideId={activeSlide?.id ?? null}
          onSelectSlide={setActiveSlideId}
          onAddSlide={addSlide}
          onDeleteSlide={deleteSlide}
          onDuplicateSlide={duplicateSlide}
        />

        {/* Center: canvas — all slides mounted, only active is visible */}
        <div style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          minWidth: 0,
        }}>
          {currentDoc.slides.length === 0 ? (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <EmptyState onAdd={() => addSlide('1-slot')} />
            </div>
          ) : (
            currentDoc.slides.map(slide => (
              <div
                key={slide.id}
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  visibility: slide.id === activeSlide?.id ? 'visible' : 'hidden',
                  pointerEvents: slide.id === activeSlide?.id ? 'auto' : 'none',
                }}
              >
                <SlideCanvas
                  ref={(el) => {
                    if (el) canvasRefs.current.set(slide.id, el);
                    else canvasRefs.current.delete(slide.id);
                  }}
                  slide={slide}
                  scale={CANVAS_SCALE}
                  onSlotClick={
                    activePendingData
                      ? (slotIdx) => handleSlotClick(slide.id, slotIdx)
                      : undefined
                  }
                  onSlotDrop={(slotIdx) => handleSlotDrop(slide.id, slotIdx)}
                  isDragActive={draggingLibraryIndex !== null}
                  onRemoveBlock={(slotIdx) => handleRemoveBlock(slide.id, slotIdx)}
                />
              </div>
            ))
          )}
        </div>

        {/* Right: controls */}
        <SlideControls
          slide={activeSlide}
          onUpdateSlide={updateSlide}
        />
      </div>

      {/* Block Config Modal */}
      {activePendingData && pendingPlacement && (
        <BlockConfigModal
          data={activePendingData}
          onConfirm={handleModalConfirm}
          onDismiss={handleModalDismiss}
        />
      )}
    </div>
  );
}

function LibraryPanel({
  items, activePendingData, onSelect, onRemove, onDragStart, onDragEnd,
}: {
  items: PendingData[];
  activePendingData: PendingData | null;
  onSelect: (item: PendingData) => void;
  onRemove: (index: number) => void;
  onDragStart: (index: number) => void;
  onDragEnd: () => void;
}) {
  return (
    <div style={{
      width: 164,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      borderRight: '1px solid rgba(0,0,0,0.09)',
      background: '#fafaf8',
      height: '100%',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 12px 6px',
        fontSize: 10,
        fontWeight: 700,
        color: '#888',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0,
        borderBottom: '1px solid rgba(0,0,0,0.07)',
      }}>
        <span>Library</span>
        <span style={{ color: items.length >= 10 ? '#e06060' : '#bbb', fontWeight: 600 }}>
          {items.length}/10
        </span>
      </div>

      {items.length === 0 ? (
        <div style={{
          padding: '12px',
          fontSize: 10,
          color: '#bbb',
          lineHeight: 1.6,
          fontStyle: 'italic',
        }}>
          Use &ldquo;+ Story&rdquo; in any view to add data here.
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {activePendingData && (
            <div style={{
              fontSize: 9,
              color: 'var(--teal, #006b6b)',
              padding: '2px 6px',
              background: 'rgba(0,107,107,0.07)',
              borderRadius: 2,
              marginBottom: 2,
            }}>
              Selected — click an empty slot
            </div>
          )}
          {items.map((item, idx) => {
            const isSelected = activePendingData === item;
            return (
              <div
                key={idx}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('library-index', String(idx));
                  onDragStart(idx);
                }}
                onDragEnd={onDragEnd}
                onClick={() => onSelect(item)}
                style={{
                  padding: '5px 7px',
                  borderRadius: 3,
                  border: isSelected
                    ? '1px solid var(--teal, #006b6b)'
                    : '1px solid rgba(0,0,0,0.09)',
                  background: isSelected ? 'rgba(0,107,107,0.06)' : '#fff',
                  cursor: 'grab',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 4,
                  userSelect: 'none',
                  flexShrink: 0,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 9,
                    color: isSelected ? 'var(--teal, #006b6b)' : 'var(--ink, #1a1d20)',
                    fontWeight: 600,
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    lineHeight: 1.3,
                  }}>
                    {item.label}
                  </div>
                  <div style={{
                    fontSize: 8,
                    color: '#aaa',
                    marginTop: 1,
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                  }}>
                    {item.rows.length} rows · {item.columns.length} cols
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onRemove(idx); }}
                  title="Remove from library"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#ccc', fontSize: 10, padding: 0, flexShrink: 0,
                    lineHeight: 1, marginTop: 1,
                  }}
                >✕</button>
              </div>
            );
          })}
        </div>
      )}

      <div style={{
        padding: '8px 12px',
        fontSize: 9,
        color: '#ccc',
        lineHeight: 1.4,
        borderTop: '1px solid rgba(0,0,0,0.06)',
        flexShrink: 0,
      }}>
        Click to select · drag to slot
      </div>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 16, color: '#aaa', fontSize: 13,
    }}>
      <div style={{ fontSize: 40 }}>□</div>
      <div>No slides yet</div>
      <button
        onClick={onAdd}
        style={{
          background: 'var(--teal, #006b6b)',
          color: '#fff',
          border: 'none',
          borderRadius: 3,
          padding: '8px 20px',
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        + Add first slide
      </button>
    </div>
  );
}
