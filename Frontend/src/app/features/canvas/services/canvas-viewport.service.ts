import { Injectable, signal } from '@angular/core';
import { CanvasElement } from '@app/core';
import { roundToTwoDecimals, clamp } from '../utils/canvas-math.util';
import { Bounds, Point } from '../canvas.types';
export const CANVAS_MIN_ZOOM = 0.02;
export const CANVAS_DEFAULT_ZOOM = 0.5;
export const CANVAS_MAX_ZOOM = 3;

const ZOOM_FACTOR = 1.1;
const GRID_SIZE = 20;

@Injectable()
export class CanvasViewportService {
  readonly zoomLevel = signal(CANVAS_DEFAULT_ZOOM);
  readonly viewportOffset = signal<Point>({ x: 0, y: 0 });
  readonly isPanning = signal(false);
  readonly isZooming = signal(false);
  readonly isSpacePressed = signal(false);
  readonly frameTemplate = signal({ width: 390, height: 844 });

  onUpdate?: () => void;

  notifyUpdate(): void {
    this.onUpdate?.();
  }

  private panStartPosition: Point = { x: 0, y: 0 };
  private _panMoved = false;
  private zoomTimer: ReturnType<typeof setTimeout> | null = null;

  get panMoved(): boolean {
    return this._panMoved;
  }

  // Zoom

  zoomIn(canvasElement: HTMLElement | null): void {
    this.setZoom(this.zoomLevel() * ZOOM_FACTOR, this.getCanvasScreenCenter(canvasElement));
  }

  zoomOut(canvasElement: HTMLElement | null): void {
    this.setZoom(this.zoomLevel() / ZOOM_FACTOR, this.getCanvasScreenCenter(canvasElement));
  }

  resetZoom(canvasElement: HTMLElement | null): void {
    this.setZoom(CANVAS_DEFAULT_ZOOM, this.getCanvasScreenCenter(canvasElement));
  }

  zoomPercentage(): number {
    return Math.round(this.zoomLevel() * 100);
  }

  setZoom(nextZoom: number, anchor?: Point): void {
    const previousZoom = this.zoomLevel();
    const clampedZoom = clamp(nextZoom, CANVAS_MIN_ZOOM, CANVAS_MAX_ZOOM);

    if (clampedZoom === previousZoom) {
      return;
    }

    this.markZooming();

    if (anchor) {
      const offset = this.viewportOffset();
      const worldX = (anchor.x - offset.x) / previousZoom;
      const worldY = (anchor.y - offset.y) / previousZoom;

      this.viewportOffset.set({
        x: roundToTwoDecimals(anchor.x - worldX * clampedZoom),
        y: roundToTwoDecimals(anchor.y - worldY * clampedZoom),
      });
    }

    this.zoomLevel.set(clampedZoom);
    this.notifyUpdate();
  }

  // Pan

  startPanning(event: MouseEvent): void {
    this.isPanning.set(true);
    this._panMoved = false;
    this.panStartPosition = { x: event.clientX, y: event.clientY };
    event.preventDefault();
    event.stopPropagation();
  }

  updatePan(event: MouseEvent): void {
    const deltaX = event.clientX - this.panStartPosition.x;
    const deltaY = event.clientY - this.panStartPosition.y;

    if (deltaX !== 0 || deltaY !== 0) {
      this._panMoved = true;
      this.viewportOffset.update((offset) => ({
        x: roundToTwoDecimals(offset.x + deltaX),
        y: roundToTwoDecimals(offset.y + deltaY),
      }));
      this.panStartPosition = { x: event.clientX, y: event.clientY };
      this.notifyUpdate();
    }
  }

  endPan(): void {
    this.isPanning.set(false);
  }

  private markZooming(): void {
    this.isZooming.set(true);
    if (this.zoomTimer !== null) clearTimeout(this.zoomTimer);
    this.zoomTimer = setTimeout(() => {
      this.isZooming.set(false);
      this.zoomTimer = null;
    }, 350);
  }

  // Scroll / wheel

  handleWheel(event: WheelEvent, canvasRect: DOMRect): void {
    if (this.isPanning()) {
      return;
    }

    if (event.ctrlKey) {
      const factor = event.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
      this.setZoom(this.zoomLevel() * factor, {
        x: event.clientX - canvasRect.left,
        y: event.clientY - canvasRect.top,
      });
      return;
    }

    this.viewportOffset.update((offset) => ({
      x: roundToTwoDecimals(offset.x - event.deltaX),
      y: roundToTwoDecimals(offset.y - event.deltaY),
    }));
    this.notifyUpdate();
  }

  // Coordinate transforms

  getCanvasPoint(event: MouseEvent, canvasElement: HTMLElement | null): Point | null {
    if (!canvasElement) {
      return null;
    }

    const rect = canvasElement.getBoundingClientRect();
    const offset = this.viewportOffset();

    return {
      x: roundToTwoDecimals((event.clientX - rect.left - offset.x) / this.zoomLevel()),
      y: roundToTwoDecimals((event.clientY - rect.top - offset.y) / this.zoomLevel()),
    };
  }

  getViewportCenterCanvasPoint(canvasElement: HTMLElement | null): Point {
    if (!canvasElement) {
      return { x: 320, y: 240 };
    }

    const offset = this.viewportOffset();
    return {
      x: roundToTwoDecimals((canvasElement.clientWidth / 2 - offset.x) / this.zoomLevel()),
      y: roundToTwoDecimals((canvasElement.clientHeight / 2 - offset.y) / this.zoomLevel()),
    };
  }

  getScreenInvariantSize(size: number): number {
    return roundToTwoDecimals(size / this.zoomLevel());
  }

  // Template helpers

  canvasViewportTransform(): string {
    const offset = this.viewportOffset();
    return `translate(${offset.x}px, ${offset.y}px)`;
  }

  canvasSceneTransform(): string {
    return `scale(${this.zoomLevel()})`;
  }

  canvasBackgroundSize(): string {
    const zoom = this.zoomLevel();
    const rawScreen = GRID_SIZE * zoom;
    const level = Math.round(Math.log2(rawScreen / GRID_SIZE));
    const size = roundToTwoDecimals(rawScreen / Math.pow(2, level));
    return `${size}px ${size}px`;
  }

  canvasBackgroundPosition(): string {
    const offset = this.viewportOffset();
    return `${offset.x}px ${offset.y}px`;
  }

  // Focus element

  focusElement(element: CanvasElement, bounds: Bounds, canvasElement: HTMLElement | null): void {
    if (!canvasElement) {
      return;
    }

    const padding = 64;
    const minSize = 24;
    const horizontalZoom = (canvasElement.clientWidth - padding) / Math.max(bounds.width, minSize);
    const verticalZoom = (canvasElement.clientHeight - padding) / Math.max(bounds.height, minSize);
    const zoom = clamp(Math.min(horizontalZoom, verticalZoom), CANVAS_MIN_ZOOM, CANVAS_MAX_ZOOM);

    this.zoomLevel.set(zoom);
    this.viewportOffset.set({
      x: roundToTwoDecimals(
        (canvasElement.clientWidth - bounds.width * zoom) / 2 - bounds.x * zoom,
      ),
      y: roundToTwoDecimals(
        (canvasElement.clientHeight - bounds.height * zoom) / 2 - bounds.y * zoom,
      ),
    });
    this.notifyUpdate();
  }

  // Private helpers

  private getCanvasScreenCenter(canvasElement: HTMLElement | null): Point {
    if (!canvasElement) {
      return { x: 400, y: 300 };
    }
    return { x: canvasElement.clientWidth / 2, y: canvasElement.clientHeight / 2 };
  }
}
