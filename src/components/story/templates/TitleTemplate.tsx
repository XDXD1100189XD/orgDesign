'use client';

import type { StorySlide } from '@/lib/story/types';

export function TitleTemplate({ slide }: { slide: StorySlide }) {
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '48px 80px',
      boxSizing: 'border-box',
      background: 'linear-gradient(145deg, var(--teal-dark, #003438) 0%, var(--teal, #006b6b) 100%)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* decorative bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: 4,
        background: 'var(--olive, #8a9a2f)',
      }} />
      <div style={{
        textAlign: 'center',
        color: '#ffffff',
        maxWidth: 700,
      }}>
        <div style={{
          fontSize: slide.title.length > 40 ? 36 : 44,
          fontWeight: 800,
          lineHeight: 1.15,
          letterSpacing: '-0.02em',
          marginBottom: slide.subtitle ? 20 : 0,
        }}>
          {slide.title || 'Untitled Slide'}
        </div>
        {slide.subtitle && (
          <div style={{
            fontSize: 18,
            fontWeight: 400,
            color: 'rgba(255,255,255,0.75)',
            lineHeight: 1.5,
          }}>
            {slide.subtitle}
          </div>
        )}
      </div>
      {/* bottom label */}
      <div style={{
        position: 'absolute', bottom: 20, right: 32,
        fontSize: 10,
        color: 'rgba(255,255,255,0.35)',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}>
        Confidential
      </div>
    </div>
  );
}
