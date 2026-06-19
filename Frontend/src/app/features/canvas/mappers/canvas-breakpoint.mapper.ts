import { CanvasElement } from '@app/core';
import {
  getCanvasBreakpointSourceId,
  isDetachedCanvasBreakpointOverride,
} from '../utils/canvas-breakpoint-link.util';

export function collectFrameSubtree(
  frameId: string,
  allElements: CanvasElement[],
): CanvasElement[] {
  const result: CanvasElement[] = [];
  const frame = allElements.find((e) => e.id === frameId);
  if (!frame) return result;

  result.push(frame);
  const queue = [frameId];
  while (queue.length > 0) {
    const parentId = queue.shift()!;
    for (const el of allElements) {
      if (el.parentId === parentId) {
        result.push(el);
        queue.push(el.id);
      }
    }
  }
  return result;
}

export function syncBreakpointElements(
  breakpointElements: CanvasElement[],
  breakpointFrameId: string,
  primaryFrame: CanvasElement,
  primaryElements: CanvasElement[],
): CanvasElement[] {
  const primaryById = new Map<string, CanvasElement>();
  for (const el of primaryElements) {
    primaryById.set(el.id, el);
  }

  const idRemap = new Map<string, string>();
  idRemap.set(breakpointFrameId, primaryFrame.id);
  for (const el of breakpointElements) {
    const sourceId = getCanvasBreakpointSourceId(el);
    if (sourceId) {
      idRemap.set(el.id, sourceId);
    }
  }

  const primaryChildrenByParent = new Map<string, string[]>();
  for (const el of primaryElements) {
    if (el.parentId) {
      const siblings = primaryChildrenByParent.get(el.parentId);
      if (siblings) {
        siblings.push(el.id);
      } else {
        primaryChildrenByParent.set(el.parentId, [el.id]);
      }
    }
  }

  const bpChildrenByParent = new Map<string, string[]>();
  for (const el of breakpointElements) {
    if (el.parentId) {
      const siblings = bpChildrenByParent.get(el.parentId);
      if (siblings) {
        siblings.push(el.id);
      } else {
        bpChildrenByParent.set(el.parentId, [el.id]);
      }
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const el of breakpointElements) {
      if (el.primarySyncId || el.id === breakpointFrameId || !el.parentId || idRemap.has(el.id)) {
        continue;
      }
      const remappedParentId = idRemap.get(el.parentId);
      if (!remappedParentId) continue;

      const bpSiblings = bpChildrenByParent.get(el.parentId) ?? [];
      const siblingIndex = bpSiblings.indexOf(el.id);
      if (siblingIndex < 0) continue;

      const primarySiblings = primaryChildrenByParent.get(remappedParentId) ?? [];
      const matchedPrimaryId = primarySiblings[siblingIndex];
      if (matchedPrimaryId) {
        idRemap.set(el.id, matchedPrimaryId);
        changed = true;
      }
    }
  }

  const skippedDuplicateIds = collectDuplicateBreakpointSubtreeIds(
    breakpointElements,
    breakpointFrameId,
    idRemap,
  );

  return breakpointElements.flatMap((el) => {
    if (skippedDuplicateIds.has(el.id)) {
      return [];
    }

    if (el.id === breakpointFrameId) {
      return [{ ...el, id: primaryFrame.id, parentId: el.parentId }];
    }

    const remappedParentId = el.parentId ? (idRemap.get(el.parentId) ?? el.parentId) : el.parentId;
    if (el.primarySyncId) {
      const primaryEl = primaryById.get(el.primarySyncId);
      if (primaryEl) {
        return [{ ...primaryEl, parentId: remappedParentId }];
      }
      return [{ ...el, id: el.primarySyncId, parentId: remappedParentId }];
    }

    const remappedId = idRemap.get(el.id);
    if (remappedId) {
      return [{ ...el, id: remappedId, parentId: remappedParentId }];
    }

    return [{ ...el, parentId: remappedParentId }];
  });
}

function collectDuplicateBreakpointSubtreeIds(
  breakpointElements: CanvasElement[],
  breakpointFrameId: string,
  idRemap: ReadonlyMap<string, string>,
): Set<string> {
  const preferredBySourceId = new Map<string, CanvasElement>();
  const duplicateRootIds = new Set<string>();

  for (const element of breakpointElements) {
    if (element.id === breakpointFrameId) {
      continue;
    }

    const sourceId = getCanvasBreakpointSourceId(element) ?? idRemap.get(element.id);
    if (!sourceId) {
      continue;
    }

    const existing = preferredBySourceId.get(sourceId);
    if (!existing) {
      preferredBySourceId.set(sourceId, element);
      continue;
    }

    const existingIsDetachedOverride =
      !existing.primarySyncId &&
      (isDetachedCanvasBreakpointOverride(existing) || idRemap.get(existing.id) === sourceId);
    const currentIsDetachedOverride =
      !element.primarySyncId &&
      (isDetachedCanvasBreakpointOverride(element) || idRemap.get(element.id) === sourceId);
    const shouldPreferCurrent =
      !existingIsDetachedOverride && currentIsDetachedOverride;

    if (shouldPreferCurrent) {
      duplicateRootIds.add(existing.id);
      preferredBySourceId.set(sourceId, element);
      continue;
    }

    duplicateRootIds.add(element.id);
  }

  if (duplicateRootIds.size === 0) {
    return duplicateRootIds;
  }

  const childrenByParent = new Map<string, string[]>();
  for (const element of breakpointElements) {
    if (!element.parentId) {
      continue;
    }

    const children = childrenByParent.get(element.parentId);
    if (children) {
      children.push(element.id);
    } else {
      childrenByParent.set(element.parentId, [element.id]);
    }
  }

  const skippedIds = new Set<string>();
  for (const rootId of duplicateRootIds) {
    const queue = [rootId];
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (skippedIds.has(currentId)) {
        continue;
      }

      skippedIds.add(currentId);
      for (const childId of childrenByParent.get(currentId) ?? []) {
        queue.push(childId);
      }
    }
  }

  return skippedIds;
}
