import { inject, Injectable } from '@angular/core';
import { CanvasElement, CanvasElementType } from '@app/core';
import { clamp, roundToTwoDecimals } from '../../utils/canvas-math.util';
import { collectSubtreeIds } from '../../utils/canvas-tree.util';
import { CanvasClipboardPasteResult, CanvasClipboardSnapshot, Bounds } from '../../canvas.types';
import { CanvasElementService } from '../canvas-element.service';

const PASTE_OFFSET = 24;

@Injectable()
export class CanvasClipboardService {
  private snapshot: CanvasClipboardSnapshot | null = null;
  private readonly elementService = inject(CanvasElementService);

  get hasClipboard(): boolean {
    return this.snapshot !== null;
  }

  // Copy

  copySelection(
    selectedIds: string[],
    elements: CanvasElement[],
    currentPageId: string | null,
  ): void {
    const rootIds = this.getSelectionRootIds(selectedIds, elements);
    const subtreeIds = new Set(rootIds.flatMap((id) => collectSubtreeIds(elements, id)));
    const copiedElements = elements
      .filter((element) => subtreeIds.has(element.id))
      .map((element) => structuredClone(element));

    if (copiedElements.length === 0 || rootIds.length === 0) {
      return;
    }

    this.snapshot = {
      rootIds,
      sourcePageId: currentPageId,
      pasteCount: 0,
      elements: copiedElements,
    };
  }

  // Paste

  paste(
    currentElements: CanvasElement[],
    targetParentId: string | null,
  ): CanvasClipboardPasteResult | null {
    const clipboard = this.snapshot;
    if (!clipboard) {
      return null;
    }

    const rootElements = clipboard.rootIds
      .map((rootId) => clipboard.elements.find((element) => element.id === rootId) ?? null)
      .filter((element): element is CanvasElement => element !== null);
    if (rootElements.length === 0) {
      return null;
    }

    const pastedElements = this.createPastedElements(clipboard, currentElements, targetParentId);
    if (!pastedElements || pastedElements.elements.length === 0) {
      return null;
    }

    this.snapshot = {
      ...clipboard,
      pasteCount: clipboard.pasteCount + 1,
    };

    return pastedElements;
  }

  resolvePasteParentId(
    currentElements: CanvasElement[],
    selectedContainer: CanvasElement | null,
  ): { parentId: string | null; error: string | null } {
    const clipboard = this.snapshot;
    if (!clipboard) {
      return { parentId: null, error: null };
    }

    const rootElements = clipboard.rootIds
      .map((rootId) => clipboard.elements.find((element) => element.id === rootId) ?? null)
      .filter((element): element is CanvasElement => element !== null);
    if (rootElements.length === 0) {
      return { parentId: null, error: null };
    }

    const sharedOriginalParentId = this.getSharedParentId(rootElements);

    if (selectedContainer) {
      const clipboardRootIds = new Set(clipboard.rootIds);
      if (clipboardRootIds.has(selectedContainer.id)) {
        const parentId = selectedContainer.parentId ?? null;
        return { parentId, error: null };
      }
      return { parentId: selectedContainer.id, error: null };
    }

    if (
      sharedOriginalParentId !== undefined &&
      sharedOriginalParentId !== null &&
      currentElements.some(
        (element) =>
          element.id === sharedOriginalParentId && this.canContainPastedChildren(element.type),
      )
    ) {
      return { parentId: sharedOriginalParentId, error: null };
    }

    if (sharedOriginalParentId === null) {
      return { parentId: null, error: null };
    }

    return {
      parentId: null,
      error:
        rootElements.length > 1
          ? 'Select a destination frame or container before pasting these elements.'
          : 'Select a destination frame or container before pasting this element.',
    };
  }

  // Private

  private createPastedElements(
    clipboard: CanvasClipboardSnapshot,
    currentElements: CanvasElement[],
    targetParentId: string | null,
  ): CanvasClipboardPasteResult | null {
    const rootElements = clipboard.rootIds
      .map((rootId) => clipboard.elements.find((element) => element.id === rootId) ?? null)
      .filter((element): element is CanvasElement => element !== null);
    if (rootElements.length === 0) {
      return null;
    }

    const idMap = new Map(clipboard.elements.map((element) => [element.id, crypto.randomUUID()]));
    const targetParent = targetParentId
      ? (currentElements.find((element) => element.id === targetParentId) ?? null)
      : null;
    const sharedOriginalParentId = this.getSharedParentId(rootElements);
    const rootBoundsById = new Map(
      rootElements.map((element) => [
        element.id,
        this.elementService.getAbsoluteBounds(element, clipboard.elements),
      ]),
    );
    const groupBounds = this.getCombinedBounds(Array.from(rootBoundsById.values()));
    if (!groupBounds) {
      return null;
    }
    const offset = PASTE_OFFSET * (clipboard.pasteCount + 1);
    const rootIds = new Set(clipboard.rootIds);

    const pastedElements = clipboard.elements.map((element) => {
      const cloned = structuredClone(element);
      cloned.id = idMap.get(element.id) ?? crypto.randomUUID();
      cloned.primarySyncId = undefined;
      cloned.detachedPrimarySyncId = undefined;
      cloned.isPrimary = false;

      if (rootIds.has(element.id)) {
        const rootBounds = rootBoundsById.get(element.id);
        if (!rootBounds) {
          return cloned;
        }

        cloned.parentId = targetParentId;
        cloned.position = this.elementService.getDefaultPositionForPlacement(
          cloned.type,
          targetParent,
        );

        const shouldPreserveLocalOffset = sharedOriginalParentId === targetParentId;
        const relativeX = shouldPreserveLocalOffset
          ? element.x + offset
          : rootBounds.x - groupBounds.x + offset;
        const relativeY = shouldPreserveLocalOffset
          ? element.y + offset
          : rootBounds.y - groupBounds.y + offset;

        if (targetParent) {
          cloned.x = clamp(relativeX, 0, targetParent.width - element.width);
          cloned.y = clamp(relativeY, 0, targetParent.height - element.height);
        } else if (shouldPreserveLocalOffset) {
          cloned.x = roundToTwoDecimals(element.x + offset);
          cloned.y = roundToTwoDecimals(element.y + offset);
        } else {
          cloned.x = roundToTwoDecimals(rootBounds.x - groupBounds.x + offset);
          cloned.y = roundToTwoDecimals(rootBounds.y - groupBounds.y + offset);
        }

        return cloned;
      }

      cloned.parentId = element.parentId ? (idMap.get(element.parentId) ?? null) : null;
      return cloned;
    });

    const pastedRootIds: string[] = [];
    for (const rootId of clipboard.rootIds) {
      const pastedRootId = idMap.get(rootId);
      if (pastedRootId) {
        pastedRootIds.push(pastedRootId);
      }
    }

    return {
      elements: pastedElements,
      rootIds: pastedRootIds,
    };
  }

  private canContainPastedChildren(type: CanvasElementType): boolean {
    return type === 'frame' || type === 'rectangle';
  }

  private getSelectionRootIds(selectedIds: string[], elements: CanvasElement[]): string[] {
    const selectedIdSet = new Set(selectedIds);

    return selectedIds.filter((selectedId) => {
      let parentId = elements.find((element) => element.id === selectedId)?.parentId ?? null;
      while (parentId) {
        if (selectedIdSet.has(parentId)) {
          return false;
        }

        parentId = elements.find((element) => element.id === parentId)?.parentId ?? null;
      }

      return true;
    });
  }

  private getSharedParentId(elements: CanvasElement[]): string | null | undefined {
    if (elements.length === 0) {
      return undefined;
    }

    const firstParentId = elements[0].parentId ?? null;
    return elements.every((element) => (element.parentId ?? null) === firstParentId)
      ? firstParentId
      : undefined;
  }

  private getCombinedBounds(boundsList: Bounds[]): Bounds | null {
    if (boundsList.length === 0) {
      return null;
    }

    const left = Math.min(...boundsList.map((bounds) => bounds.x));
    const top = Math.min(...boundsList.map((bounds) => bounds.y));
    const right = Math.max(...boundsList.map((bounds) => bounds.x + bounds.width));
    const bottom = Math.max(...boundsList.map((bounds) => bounds.y + bounds.height));

    return {
      x: roundToTwoDecimals(left),
      y: roundToTwoDecimals(top),
      width: roundToTwoDecimals(right - left),
      height: roundToTwoDecimals(bottom - top),
    };
  }
}
