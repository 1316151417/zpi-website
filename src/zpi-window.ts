type Rect = { width: number; height: number; x: number; y: number };
const original = { width: 1200, height: 800 };
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(n, max));

export function zpiGeometry(frame: HTMLElement, desktop: HTMLElement, grip: HTMLElement, phoneLayout?: MediaQueryList) {
  let preferred = { ...original };
  let position: { x: number; y: number } | undefined;
  let maximized = false,
    rect: Rect;
  const bounds = () => ({ w: desktop.clientWidth, h: Math.max(1, desktop.clientHeight - 68) });
  function layout({ w, h } = bounds()) {
    const gap = maximized ? 0 : Math.min(12, w * 0.02, h * 0.02);
    // Fit the window rectangle, not its contents: preserve the 3:2 opening shape without scaling text.
    const fit = Math.min(1, (w - 2 * gap) / preferred.width, (h - 2 * gap) / preferred.height);
    const phone = phoneLayout?.matches;
    const width = maximized ? w : phone ? w - 2 * gap : preferred.width * fit;
    const height = maximized ? h : phone ? h - 2 * gap : preferred.height * fit;
    const x = maximized ? 0 : clamp(position?.x ?? (w - width) / 2, 0, w - width);
    const y = maximized ? 0 : clamp(position?.y ?? (h - height) / 2, 0, h - height);
    rect = { x, y, width, height };
    Object.assign(frame.style, { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` });
  }
  function gesture(event: PointerEvent, resize: boolean) {
    if (event.button !== 0 || maximized || phoneLayout?.matches) return;
    const target = event.target as HTMLElement,
      start = rect,
      sx = event.screenX,
      sy = event.screenY;
    target.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent) => {
      const dx = e.screenX - sx,
        dy = e.screenY - sy;
      const area = bounds();
      if (resize) {
        const maxW = area.w - start.x,
          maxH = area.h - start.y;
        preferred = {
          width: clamp(start.width + dx, Math.min(320, maxW), maxW),
          height: clamp(start.height + dy, Math.min(240, maxH), maxH),
        };
        position = { x: start.x, y: start.y };
      } else position = { x: start.x + dx, y: start.y + dy };
      layout(area);
    };
    const end = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("lostpointercapture", end);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("lostpointercapture", end);
  }
  grip.addEventListener("pointerdown", (e) => gesture(e, true));
  // The desktop tracks this frame's viewport. Resize its child iframe before observer delivery.
  window.addEventListener("resize", () => layout());
  layout();
  return {
    toggle: () => {
      maximized = !maximized;
      layout();
    },
    drag: (event: PointerEvent) => gesture(event, false),
  };
}
