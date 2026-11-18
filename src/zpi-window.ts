type Rect = { width: number; height: number; x: number; y: number };
const original = { width: 1200, height: 800 };
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(n, max));

// Keep Electron's coordinate space inside the iframe; only its outer window is scaled.
export function zpiGeometry(frame: HTMLElement, desktop: HTMLElement, grip: HTMLElement) {
  let width = original.width,
    height = original.height,
    position: { x: number; y: number } | undefined,
    maximized = false;
  let rect: Rect,
    scale = 1;
  const bounds = () => ({ w: desktop.clientWidth, h: desktop.clientHeight - 68 });
  function layout({ w, h: availableHeight } = bounds()) {
    const h = Math.max(1, availableHeight);
    const gap = Math.min(12, w * 0.02, h * 0.02);
    const maxW = w - 2 * gap,
      maxH = h - 2 * gap;
    scale = maximized ? Math.min(1, w / 740, h / 560) : Math.min(1, maxW / width, maxH / height);
    const logicalWidth = maximized ? w / scale : width,
      logicalHeight = maximized ? h / scale : height;
    const fw = logicalWidth * scale,
      fh = logicalHeight * scale;
    const x = maximized ? 0 : clamp(position?.x ?? (w - fw) / 2, 0, w - fw);
    const y = maximized ? 0 : clamp(position?.y ?? (h - fh) / 2, 0, h - fh);
    rect = { x, y, width: fw, height: fh };
    Object.assign(frame.style, {
      left: `${x}px`,
      top: `${y}px`,
      width: `${logicalWidth}px`,
      height: `${logicalHeight}px`,
      transform: `scale(${scale})`,
      transformOrigin: "top left",
    });
  }
  function gesture(event: PointerEvent, resize: boolean) {
    if (event.button !== 0 || maximized) return;
    const target = event.target as HTMLElement,
      start = { ...rect },
      startScale = scale,
      sx = event.screenX,
      sy = event.screenY;
    const logicalWidth = width,
      logicalHeight = height;
    target.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent) => {
      const dx = e.screenX - sx,
        dy = e.screenY - sy;
      const area = bounds();
      if (resize) {
        width = clamp(logicalWidth + dx / startScale, 740, (area.w - start.x) / startScale);
        height = clamp(logicalHeight + dy / startScale, 560, (area.h - start.y) / startScale);
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
  new ResizeObserver(() => layout()).observe(desktop);
  layout();
  return {
    toggle: () => {
      maximized = !maximized;
      layout();
    },
    drag: (event: PointerEvent) => gesture(event, false),
  };
}
