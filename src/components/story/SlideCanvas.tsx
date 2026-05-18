'use client';

import { forwardRef } from 'react';
import type { StorySlide } from '@/lib/story/types';
import { TitleTemplate } from './templates/TitleTemplate';
import { OneSlotTemplate } from './templates/OneSlotTemplate';
import { TwoSlotTemplate } from './templates/TwoSlotTemplate';
import { ThreeSlotTemplate } from './templates/ThreeSlotTemplate';
import { FourSlotTemplate } from './templates/FourSlotTemplate';

interface Props {
  slide: StorySlide;
  scale?: number;
  onSlotClick?: (slotIndex: number) => void;
  onRemoveBlock?: (slotIndex: number) => void;
  onSlotDrop?: (slotIndex: number) => void;
  isDragActive?: boolean;
}

const SLIDE_W = 960;
const SLIDE_H = 540;

export const SlideCanvas = forwardRef<HTMLDivElement, Props>(
  function SlideCanvas({ slide, scale = 1, onSlotClick, onRemoveBlock, onSlotDrop, isDragActive }, ref) {
    const template = (() => {
      switch (slide.template) {
        case 'title':  return <TitleTemplate slide={slide} />;
        case '1-slot': return <OneSlotTemplate slide={slide} onSlotClick={onSlotClick} onRemoveBlock={onRemoveBlock} onSlotDrop={onSlotDrop} isDragActive={isDragActive} />;
        case '2-slot': return <TwoSlotTemplate slide={slide} onSlotClick={onSlotClick} onRemoveBlock={onRemoveBlock} onSlotDrop={onSlotDrop} isDragActive={isDragActive} />;
        case '3-slot': return <ThreeSlotTemplate slide={slide} onSlotClick={onSlotClick} onRemoveBlock={onRemoveBlock} onSlotDrop={onSlotDrop} isDragActive={isDragActive} />;
        case '4-slot': return <FourSlotTemplate slide={slide} onSlotClick={onSlotClick} onRemoveBlock={onRemoveBlock} onSlotDrop={onSlotDrop} isDragActive={isDragActive} />;
        default:       return <OneSlotTemplate slide={slide} onSlotClick={onSlotClick} onRemoveBlock={onRemoveBlock} onSlotDrop={onSlotDrop} isDragActive={isDragActive} />;
      }
    })();

    return (
      <div style={{
        width:  SLIDE_W * scale,
        height: SLIDE_H * scale,
        flexShrink: 0,
        position: 'relative',
      }}>
        <div
          ref={ref}
          style={{
            width:  SLIDE_W,
            height: SLIDE_H,
            overflow: 'hidden',
            position: 'absolute',
            top: 0,
            left: 0,
            transformOrigin: 'top left',
            transform: `scale(${scale})`,
            boxShadow: '0 2px 16px rgba(0,0,0,0.12)',
            borderRadius: 2,
            background: '#ffffff',
            fontFamily: 'inherit',
          }}
        >
          {template}
        </div>
      </div>
    );
  }
);
