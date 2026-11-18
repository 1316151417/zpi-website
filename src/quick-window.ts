import { defaultWindowSize, resizedWindowBounds, windowBounds, windowSizes } from "@source/quick/window.ts";

type Bounds = { x: number; y: number; width: number; height: number };
export class QuickWindow {
  embeddedPlayback = false;
  expanded = false;
  pinned = false;
  occupied = false;
  previewing = false;
  keepExpanded = false;
  compactHeight = windowSizes.compactHeight;
  expandedInset = 0;
  appliedInset = 0;
  position?: Bounds;
  expandedSize?: { width: number; height: number };
  preferredDefaults?: ReturnType<typeof defaultWindowSize>;
  applied: Bounds;
  resizing?: { frame: Bounds; edge: any; x: number; y: number };
  constructor(
    public frame: HTMLIFrameElement,
    public desktop: HTMLElement,
  ) {
    this.applied = this.bounds();
    this.place(this.applied);
    window.addEventListener("resize", () => this.place(this.bounds()));
  }
  get visible() {
    return !this.frame.hidden;
  }
  get api() {
    return (this.frame.contentWindow as any)?.quickDemo;
  }
  display() {
    const bounds = { x: 0, y: 0, width: this.desktop.clientWidth, height: this.desktop.clientHeight };
    return { bounds, workArea: { ...bounds, height: Math.max(44, bounds.height - 66) } };
  }
  bounds() {
    const display = this.display();
    const defaults = this.preferredDefaults ?? defaultWindowSize(display);
    const composerWidth = this.expandedSize
      ? this.expandedSize.width - 2 * windowSizes.expandedSideInset
      : defaults.width;
    return windowBounds(
      display,
      this.expanded
        ? (this.expandedSize?.width ?? composerWidth + 2 * windowSizes.expandedSideInset)
        : this.previewing
          ? windowSizes.previewWidth
          : composerWidth,
      this.expanded
        ? (this.expandedSize?.height ?? defaults.expandedHeight)
        : this.previewing
          ? windowSizes.previewHeight
          : this.compactHeight,
      this.position,
      this.expanded ? this.expandedInset : 0,
      defaults.bottomGap,
    );
  }
  place(next: Bounds, animate = false) {
    this.applied = next;
    this.appliedInset = this.expanded ? this.expandedInset : 0;
    this.frame.style.transition =
      animate && !matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "left 180ms cubic-bezier(.33,1,.68,1),top 180ms cubic-bezier(.33,1,.68,1),width 180ms cubic-bezier(.33,1,.68,1),height 180ms cubic-bezier(.33,1,.68,1)"
        : "none";
    Object.assign(this.frame.style, {
      left: next.x + "px",
      top: next.y + "px",
      width: next.width + "px",
      height: next.height + "px",
    });
  }
  remember(next = this.applied) {
    this.preferredDefaults ??= defaultWindowSize(this.display());
    this.position = { ...next, y: next.y - this.appliedInset };
    if (this.expanded) this.expandedSize = { width: next.width, height: next.height };
  }
  setExpanded(value: boolean) {
    const changed = value !== this.expanded;
    if (changed && this.expanded) this.remember();
    this.expanded = value;
    if (!value) this.pinned = false;
    this.place(this.bounds(), changed);
  }
  show() {
    if (!this.visible && this.keepExpanded && !this.occupied && !this.api?.hasMessages()) {
      this.keepExpanded = false;
      this.setExpanded(false);
      this.api?.publishLayout();
    }
    this.frame.hidden = false;
    this.frame.dispatchEvent(new Event("quick-show"));
    this.place(this.bounds());
    this.api?.focus();
  }
  hide() {
    this.resizing = undefined;
    this.frame.hidden = true;
    // Frames keep their renderer, history, draft and last chosen size while hidden.
  }
  toggle() {
    if (this.visible) this.hide();
    else this.show();
  }
  blur() {
    if (!this.embeddedPlayback && (!this.expanded || !this.pinned)) this.hide();
  }
  setPinned(value: boolean) {
    this.pinned = this.expanded && value;
  }
  reset(keepExpanded: boolean) {
    this.keepExpanded = keepExpanded;
    this.pinned = false;
    this.occupied = false;
    this.previewing = false;
    this.compactHeight = windowSizes.compactHeight;
    this.setExpanded(keepExpanded);
    this.show();
  }
  reportLayout(input: any) {
    this.occupied = Boolean(input.occupied);
    this.expandedInset = Math.min(64, Math.max(0, input.expandedInset));
    if (!this.expanded && !this.previewing) {
      this.compactHeight = Math.max(windowSizes.compactHeight, Math.min(Math.ceil(input.height), 512));
      this.place(this.bounds());
    } else if (this.expanded && this.appliedInset !== this.expandedInset) this.place(this.bounds());
  }
  preview(open: boolean) {
    this.previewing = open;
    this.place(this.bounds(), true);
  }
  resize(input: any) {
    if (!this.expanded || this.previewing) {
      this.resizing = undefined;
      return;
    }
    if (input.phase === "start")
      this.resizing = { frame: { ...this.applied }, edge: input.edge, x: input.x, y: input.y };
    else if (this.resizing && input.phase === "move") {
      const drag = this.resizing;
      const next = resizedWindowBounds(
        this.display(),
        drag.frame,
        drag.edge,
        input.x - drag.x,
        input.y - drag.y,
      );
      this.place(next);
      this.remember(next);
    } else if (input.phase === "end") this.resizing = undefined;
  }
  drag(event: PointerEvent, target: HTMLElement) {
    if (event.button !== 0) return;
    event.preventDefault();
    const start = { ...this.applied },
      x = event.screenX,
      y = event.screenY;
    target.setPointerCapture(event.pointerId);
    const move = (next: PointerEvent) => {
      const display = this.display().workArea;
      const frame = {
        ...start,
        x: Math.max(0, Math.min(display.width - start.width, start.x + next.screenX - x)),
        y: Math.max(0, Math.min(display.height - start.height, start.y + next.screenY - y)),
      };
      this.place(frame);
      this.remember(frame);
    };
    const end = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", end);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
  }
}
