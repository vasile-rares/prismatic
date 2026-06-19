import { CanvasElement } from '@app/core';
import { clamp, roundToTwoDecimals } from './canvas-math.util';
import type { Bounds, Point, ResizeState, SnapLine } from '../canvas.types';

// Snap

export const SNAP_THRESHOLD = 6;

export interface SnapResult {
  x: number;
  y: number;
  lines: SnapLine[];
}

function findClosestSnap(
  dragEdges: number[],
  dragOffsets: number[],
  candidates: number[],
  threshold: number,
): { snappedOrigin: number; guidePosition: number } | null {
  let bestDelta = threshold;
  let result: { snappedOrigin: number; guidePosition: number } | null = null;

  for (const cand of candidates) {
    for (let i = 0; i < dragEdges.length; i++) {
      const delta = Math.abs(dragEdges[i] - cand);
      if (delta < bestDelta) {
        bestDelta = delta;
        result = { snappedOrigin: cand - dragOffsets[i], guidePosition: cand };
      }
    }
  }

  return result;
}

export function computeSnappedPosition(
  absX: number,
  absY: number,
  width: number,
  height: number,
  xCandidates: number[],
  yCandidates: number[],
  threshold = SNAP_THRESHOLD,
): SnapResult {
  const dragEdgesX = [absX, absX + width / 2, absX + width];
  const offsetsX = [0, width / 2, width];

  const dragEdgesY = [absY, absY + height / 2, absY + height];
  const offsetsY = [0, height / 2, height];

  const snapX = findClosestSnap(dragEdgesX, offsetsX, xCandidates, threshold);
  const snapY = findClosestSnap(dragEdgesY, offsetsY, yCandidates, threshold);

  const lines: SnapLine[] = [];
  if (snapX) lines.push({ type: 'vertical', position: snapX.guidePosition });
  if (snapY) lines.push({ type: 'horizontal', position: snapY.guidePosition });

  return {
    x: snapX ? snapX.snappedOrigin : absX,
    y: snapY ? snapY.snappedOrigin : absY,
    lines,
  };
}

export function buildSnapCandidates(
  draggedId: string,
  elements: CanvasElement[],
  getBounds: (el: CanvasElement, elements: CanvasElement[]) => Bounds,
): { xCandidates: number[]; yCandidates: number[] } {
  const xCandidates: number[] = [];
  const yCandidates: number[] = [];

  for (const el of elements) {
    if (el.id === draggedId) continue;
    if (el.visible === false) continue;

    const b = getBounds(el, elements);
    xCandidates.push(b.x, b.x + b.width / 2, b.x + b.width);
    yCandidates.push(b.y, b.y + b.height / 2, b.y + b.height);
  }

  return { xCandidates, yCandidates };
}

// Resize

const MIN_RESIZE_SIZE = 1;

function calculateRotatedResizedBounds(
  start: ResizeState,
  pointer: Point,
  preserveAspectRatio: boolean,
  scaleFromCenter: boolean,
): Bounds {
  const rad = (start.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const ux = cos;
  const uy = sin;
  const vx = -sin;
  const vy = cos;

  const cx = start.centerX;
  const cy = start.centerY;
  const w = start.width;
  const h = start.height;
  const dx = pointer.x - start.pointerX;
  const dy = pointer.y - start.pointerY;

  const handle = start.handle;
  const isEdgeHandle = handle === 'n' || handle === 's' || handle === 'e' || handle === 'w';
  const hx = handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0;
  const hy = handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0;

  const minSize = MIN_RESIZE_SIZE;

  if (scaleFromCenter) {
    const localDx = dx * ux + dy * uy;
    const localDy = dx * vx + dy * vy;
    let newW = Math.max(minSize, w + (hx !== 0 ? hx * localDx * 2 : 0));
    let newH = Math.max(minSize, h + (hy !== 0 ? hy * localDy * 2 : 0));

    if (preserveAspectRatio && !isEdgeHandle) {
      const aspect = start.aspectRatio || 1;
      const scaleX = newW / Math.max(w, 1);
      const scaleY = newH / Math.max(h, 1);
      const scale = Math.max(
        minSize / Math.max(w, 1),
        Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY,
      );
      newW = Math.max(minSize, w * scale);
      newH = Math.max(minSize, newW / aspect);
    }

    return {
      x: roundToTwoDecimals(cx - newW / 2),
      y: roundToTwoDecimals(cy - newH / 2),
      width: roundToTwoDecimals(newW),
      height: roundToTwoDecimals(newH),
    };
  }

  const anchorX = cx + ((-hx * w) / 2) * ux + ((-hy * h) / 2) * vx;
  const anchorY = cy + ((-hx * w) / 2) * uy + ((-hy * h) / 2) * vy;

  const oldHandleX = cx + ((hx * w) / 2) * ux + ((hy * h) / 2) * vx;
  const oldHandleY = cy + ((hx * w) / 2) * uy + ((hy * h) / 2) * vy;

  const newHandleX = oldHandleX + dx;
  const newHandleY = oldHandleY + dy;

  const diagX = newHandleX - anchorX;
  const diagY = newHandleY - anchorY;

  let newW = hx * (diagX * ux + diagY * uy);
  let newH = hy * (diagX * vx + diagY * vy);

  if (hx === 0) newW = w;
  if (hy === 0) newH = h;

  if (preserveAspectRatio && !isEdgeHandle) {
    const aspect = start.aspectRatio || 1;
    const scaleX = newW / Math.max(w, 1);
    const scaleY = newH / Math.max(h, 1);
    const scale = Math.max(
      minSize / Math.max(w, 1),
      Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY,
    );
    newW = Math.max(minSize, w * scale);
    newH = Math.max(minSize, newW / aspect);
  }

  newW = Math.max(minSize, newW);
  newH = Math.max(minSize, newH);

  const newCx = anchorX + ((hx * newW) / 2) * ux + ((hy * newH) / 2) * vx;
  const newCy = anchorY + ((hx * newW) / 2) * uy + ((hy * newH) / 2) * vy;

  return {
    x: roundToTwoDecimals(newCx - newW / 2),
    y: roundToTwoDecimals(newCy - newH / 2),
    width: roundToTwoDecimals(newW),
    height: roundToTwoDecimals(newH),
  };
}

export function calculateResizedBounds(
  start: ResizeState,
  parentBounds: Bounds | null,
  pointer: Point,
  preserveAspectRatio: boolean,
  scaleFromCenter: boolean,
): Bounds {
  if (start.rotation) {
    return calculateRotatedResizedBounds(start, pointer, preserveAspectRatio, scaleFromCenter);
  }

  const minSize = MIN_RESIZE_SIZE;
  const deltaX = pointer.x - start.pointerX;
  const deltaY = pointer.y - start.pointerY;
  const isEdgeHandle =
    start.handle === 'n' || start.handle === 's' || start.handle === 'e' || start.handle === 'w';
  const isNS = start.handle === 'n' || start.handle === 's';
  const isEW = start.handle === 'e' || start.handle === 'w';
  const lockVerticalResize = false;
  const effectiveDeltaX = isNS ? 0 : deltaX;
  const effectiveDeltaY = isEW ? 0 : deltaY;
  const xDirection = start.handle.includes('w') ? -1 : 1;
  const yDirection = start.handle.includes('n') ? -1 : 1;
  const shouldPreserveAspectRatio = !isEdgeHandle && preserveAspectRatio;
  const aspectRatio = shouldPreserveAspectRatio
    ? start.aspectRatio || 1
    : start.width / Math.max(start.height, 1);

  let left = start.absoluteX;
  let top = start.absoluteY;
  let right = start.absoluteX + start.width;
  let bottom = start.absoluteY + start.height;

  const minLeft = parentBounds ? parentBounds.x : Number.NEGATIVE_INFINITY;
  const minTop = parentBounds ? parentBounds.y : Number.NEGATIVE_INFINITY;
  const maxRight = parentBounds ? parentBounds.x + parentBounds.width : Number.POSITIVE_INFINITY;
  const maxBottom = parentBounds ? parentBounds.y + parentBounds.height : Number.POSITIVE_INFINITY;

  if (scaleFromCenter) {
    const candidateHalfWidth = start.width / 2 + xDirection * effectiveDeltaX;
    const candidateHalfHeight = start.height / 2 + yDirection * effectiveDeltaY;
    const maxHalfWidth = Math.max(
      minSize / 2,
      Math.min(start.centerX - minLeft, maxRight - start.centerX),
    );
    const maxHalfHeight = Math.max(
      minSize / 2,
      Math.min(start.centerY - minTop, maxBottom - start.centerY),
    );

    if (shouldPreserveAspectRatio) {
      const scaleX = candidateHalfWidth / Math.max(start.width / 2, 1);
      const scaleY = candidateHalfHeight / Math.max(start.height / 2, 1);
      const dominantScale = Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY;
      const minScale = Math.max(
        minSize / Math.max(start.width, 1),
        minSize / Math.max(start.height, 1),
      );
      const maxScale = Math.min(
        (maxHalfWidth * 2) / Math.max(start.width, 1),
        (maxHalfHeight * 2) / Math.max(start.height, 1),
      );
      const scale = clamp(dominantScale, minScale, Math.max(minScale, maxScale));
      const width = roundToTwoDecimals(start.width * scale);
      const height = roundToTwoDecimals(width / aspectRatio);

      return {
        x: roundToTwoDecimals(start.centerX - width / 2),
        y: roundToTwoDecimals(start.centerY - height / 2),
        width,
        height,
      };
    }

    const halfWidth = clamp(candidateHalfWidth, minSize / 2, maxHalfWidth);
    const halfHeight = clamp(candidateHalfHeight, minSize / 2, maxHalfHeight);

    return {
      x: roundToTwoDecimals(start.centerX - halfWidth),
      y: roundToTwoDecimals(start.centerY - halfHeight),
      width: roundToTwoDecimals(halfWidth * 2),
      height: roundToTwoDecimals(halfHeight * 2),
    };
  }

  if (shouldPreserveAspectRatio) {
    const candidateWidth = start.handle.includes('w') ? start.width - deltaX : start.width + deltaX;
    const candidateHeight = start.handle.includes('n')
      ? start.height - deltaY
      : start.height + deltaY;
    const scaleX = candidateWidth / Math.max(start.width, 1);
    const scaleY = candidateHeight / Math.max(start.height, 1);
    const dominantScale = Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY;
    const minScale = Math.max(
      minSize / Math.max(start.width, 1),
      minSize / Math.max(start.height, 1),
    );
    const maxScale = Math.min(
      (start.handle.includes('w') ? right - minLeft : maxRight - left) / Math.max(start.width, 1),
      (start.handle.includes('n') ? bottom - minTop : maxBottom - top) / Math.max(start.height, 1),
    );
    const scale = clamp(dominantScale, minScale, Math.max(minScale, maxScale));
    const width = roundToTwoDecimals(start.width * scale);
    const height = roundToTwoDecimals(width / aspectRatio);

    if (start.handle.includes('w')) {
      left = right - width;
    } else {
      right = left + width;
    }

    if (start.handle.includes('n')) {
      top = bottom - height;
    } else {
      bottom = top + height;
    }

    return {
      x: roundToTwoDecimals(left),
      y: roundToTwoDecimals(top),
      width: roundToTwoDecimals(right - left),
      height: roundToTwoDecimals(bottom - top),
    };
  }

  if (start.handle.includes('w')) {
    left = clamp(start.absoluteX + deltaX, minLeft, right - minSize);
  }

  if (start.handle.includes('e')) {
    right = clamp(start.absoluteX + start.width + deltaX, left + minSize, maxRight);
  }

  if (start.handle.includes('n') && !lockVerticalResize) {
    top = clamp(start.absoluteY + deltaY, minTop, bottom - minSize);
  }

  if (start.handle.includes('s') && !lockVerticalResize) {
    bottom = clamp(start.absoluteY + start.height + deltaY, top + minSize, maxBottom);
  }

  return {
    x: roundToTwoDecimals(left),
    y: roundToTwoDecimals(top),
    width: roundToTwoDecimals(right - left),
    height: roundToTwoDecimals(bottom - top),
  };
}
