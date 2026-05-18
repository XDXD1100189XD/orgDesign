import type { StoryDocument } from './types';

export async function exportStoryToPdf(
  slideElements: HTMLElement[],
  story: StoryDocument,
): Promise<void> {
  if (!slideElements.length) return;

  const [html2canvasModule, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const html2canvas = (html2canvasModule as any).default ?? html2canvasModule;

  // White overlay so the user doesn't see slides flashing into view
  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'background:rgba(255,255,255,0.97)',
    'z-index:99998', 'display:flex', 'align-items:center',
    'justify-content:center', 'font-family:sans-serif',
    'font-size:14px', 'color:#555',
  ].join(';');
  overlay.textContent = 'Preparing export…';
  document.body.appendChild(overlay);

  const pdf = new jsPDF({ unit: 'px', format: [960, 540], orientation: 'landscape' });

  try {
    for (let i = 0; i < slideElements.length; i++) {
      overlay.textContent = `Exporting slide ${i + 1} of ${slideElements.length}…`;

      const el = slideElements[i];

      // Walk up the tree and temporarily make every visibility:hidden ancestor visible.
      // The slide wrapper in StoryView is typically 2 levels up from the inner canvas div,
      // but we collect all of them to be safe.
      const hiddenAncestors: Array<{ node: HTMLElement; saved: string }> = [];
      let cur: HTMLElement | null = el.parentElement;
      while (cur && cur !== document.body) {
        if (getComputedStyle(cur).visibility === 'hidden') {
          hiddenAncestors.push({ node: cur, saved: cur.style.cssText });
          cur.style.setProperty('visibility', 'visible', 'important');
        }
        cur = cur.parentElement;
      }

      // Bring the element itself to (0,0) in the viewport, no transform, fully visible.
      // opacity:1 + visibility:visible is required — html2canvas captures opacity:0 as blank.
      const savedElStyle = el.style.cssText;
      el.style.cssText = [
        'width:960px', 'height:540px', 'overflow:hidden',
        'position:fixed', 'top:0', 'left:0',
        'z-index:99999', 'transform:none', 'transform-origin:top left',
        'opacity:1', 'visibility:visible',
        'pointer-events:none', 'background:#ffffff',
      ].join(';');

      // Give Recharts time to repaint after dimension/visibility change
      await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 350))));

      const canvas = await html2canvas(el, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        width: 960,
        height: 540,
        x: 0,
        y: 0,
        scrollX: 0,
        scrollY: 0,
      });

      // Restore element first, then ancestors in reverse order
      el.style.cssText = savedElStyle;
      for (let j = hiddenAncestors.length - 1; j >= 0; j--) {
        hiddenAncestors[j].node.style.cssText = hiddenAncestors[j].saved;
      }

      if (i > 0) pdf.addPage([960, 540], 'landscape');
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 960, 540);
    }

    pdf.save(`${story.title || 'story'}.pdf`);
  } finally {
    document.body.removeChild(overlay);
  }
}
