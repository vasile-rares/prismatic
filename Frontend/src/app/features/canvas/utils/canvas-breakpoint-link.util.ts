import { CanvasElement } from '@app/core';

type CanvasBreakpointLink = Pick<CanvasElement, 'primarySyncId' | 'detachedPrimarySyncId'>;

export function getCanvasBreakpointSourceId(
  element: CanvasBreakpointLink | null | undefined,
): string | undefined {
  return element?.primarySyncId ?? element?.detachedPrimarySyncId;
}

export function isDetachedCanvasBreakpointOverride(
  element: CanvasBreakpointLink | null | undefined,
): boolean {
  return !element?.primarySyncId && !!element?.detachedPrimarySyncId;
}

export function detachCanvasElementFromPrimarySync<T extends CanvasElement>(element: T): T {
  if (!element.primarySyncId) {
    return element;
  }

  return {
    ...element,
    primarySyncId: undefined,
    detachedPrimarySyncId: element.primarySyncId,
  } as T;
}
