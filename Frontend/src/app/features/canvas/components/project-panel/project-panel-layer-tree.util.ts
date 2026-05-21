import { CanvasElement, CanvasElementType, CanvasPageModel } from '@app/core';
import { DeviceFramePreset, VIEWPORT_PRESET_OPTIONS } from '../../canvas.types';
import { formatCanvasElementTypeLabel } from '../../utils/element/canvas-element-normalization.util';

export interface LayerEntry {
  pageId: string;
  id: string;
  depth: number;
  type: CanvasElementType;
  typeLabel: string;
  parentId: string | null;
  name: string;
  visible: boolean;
  isEffectivelyHidden: boolean;
  hasChildren: boolean;
  hasLayout: boolean;
  hasImageFill: boolean;
  devicePreset: Exclude<DeviceFramePreset, 'custom'> | null;
}

export type LayerDropPosition = 'before' | 'after' | 'inside';

const DEVICE_FRAME_PRESET_OPTIONS = VIEWPORT_PRESET_OPTIONS.filter(
  (
    option,
  ): option is {
    id: Exclude<DeviceFramePreset, 'custom'>;
    label: string;
    width: number;
    height: number;
  } => option.id === 'desktop' || option.id === 'tablet' || option.id === 'mobile',
);

export function buildLayerEntriesByPage(
  pages: CanvasPageModel[],
  collapsedLayers: ReadonlySet<string>,
): Map<string, LayerEntry[]> {
  return new Map(
    pages.map((page) => [page.id, buildLayerEntries(page.elements, page.id, collapsedLayers)]),
  );
}

export function findLayerEntryById(
  layerEntriesByPage: ReadonlyMap<string, LayerEntry[]>,
  id: string,
): LayerEntry | null {
  for (const entries of layerEntriesByPage.values()) {
    const match = entries.find((entry) => entry.id === id);
    if (match) {
      return match;
    }
  }

  return null;
}

export function canDropInside(
  pageElements: CanvasElement[],
  dragged: LayerEntry,
  target: LayerEntry,
): boolean {
  return canContainLayers(target) && dragged.type !== 'frame' && !isDescendantOf(pageElements, dragged.id, target.id);
}

export function isInvalidLayerDrop(
  pageElements: CanvasElement[],
  dragged: LayerEntry,
  target: LayerEntry,
): boolean {
  return dragged.id === target.id || isDescendantOf(pageElements, dragged.id, target.id);
}

export function getPageViewportLabel(page: CanvasPageModel): string {
  const preset = page.viewportPreset ?? 'desktop';
  const width =
    typeof page.viewportWidth === 'number' && Number.isFinite(page.viewportWidth)
      ? Math.max(100, Math.round(page.viewportWidth))
      : 1280;
  const height =
    typeof page.viewportHeight === 'number' && Number.isFinite(page.viewportHeight)
      ? Math.max(100, Math.round(page.viewportHeight))
      : 720;

  const presetLabel =
    preset === 'desktop'
      ? 'Desktop'
      : preset === 'tablet'
        ? 'Tablet'
        : preset === 'mobile'
          ? 'Mobile'
          : 'Custom';

  return `${presetLabel} · ${width} × ${height}`;
}

function buildLayerEntries(
  elements: CanvasElement[],
  pageId: string,
  collapsedLayers: ReadonlySet<string>,
): LayerEntry[] {
  if (elements.length === 0) {
    return [];
  }

  const elementIds = new Set(elements.map((element) => element.id));
  const childrenByParent = new Map<string | null, CanvasElement[]>();

  for (const element of elements) {
    const parentKey = element.parentId && elementIds.has(element.parentId) ? element.parentId : null;
    const existingChildren = childrenByParent.get(parentKey);
    if (existingChildren) {
      existingChildren.push(element);
    } else {
      childrenByParent.set(parentKey, [element]);
    }
  }

  const entries: LayerEntry[] = [];
  const seen = new Set<string>();
  const typeCounters = new Map<CanvasElementType, number>();

  const walk = (parentId: string | null, depth: number, isAncestorHidden: boolean) => {
    const children = childrenByParent.get(parentId) ?? [];
    for (const child of children) {
      if (seen.has(child.id)) {
        continue;
      }

      seen.add(child.id);
      const nextTypeCount = (typeCounters.get(child.type) ?? 0) + 1;
      typeCounters.set(child.type, nextTypeCount);

      const typeLabel = formatCanvasElementTypeLabel(child.type);
      const fallbackName =
        child.type === 'rectangle' ||
        child.type === 'text' ||
        child.type === 'image' ||
        child.type === 'frame'
          ? typeLabel
          : `${typeLabel} ${nextTypeCount}`;

      const isVisible = child.visible !== false;
      const isEffectivelyHidden = isAncestorHidden || !isVisible;

      entries.push({
        pageId,
        id: child.id,
        depth,
        type: child.type,
        typeLabel,
        parentId: child.parentId ?? null,
        name: typeof child.name === 'string' ? child.name : fallbackName,
        visible: isVisible,
        isEffectivelyHidden,
        hasChildren: (childrenByParent.get(child.id)?.length ?? 0) > 0,
        hasLayout: !!child.display,
        hasImageFill: child.fillMode === 'image',
        devicePreset: getDeviceFramePreset(child),
      });

      if (!collapsedLayers.has(child.id)) {
        walk(child.id, depth + 1, isEffectivelyHidden);
      }
    }
  };

  walk(null, 0, false);
  return entries;
}

function getDeviceFramePreset(
  element: CanvasElement,
): Exclude<DeviceFramePreset, 'custom'> | null {
  if (element.type !== 'frame' || element.parentId) {
    return null;
  }

  const normalizedName = (element.name ?? '').trim().toLowerCase();
  if (normalizedName.startsWith('desktop')) {
    return 'desktop';
  }

  if (normalizedName.startsWith('tablet')) {
    return 'tablet';
  }

  if (normalizedName.startsWith('mobile')) {
    return 'mobile';
  }

  const roundedWidth = Math.round(element.width);
  const matchedPreset = DEVICE_FRAME_PRESET_OPTIONS.find(
    (option) => option.width === roundedWidth,
  );
  return matchedPreset?.id ?? null;
}

function canContainLayers(layer: LayerEntry): boolean {
  return layer.type === 'frame' || layer.type === 'rectangle';
}

function isDescendantOf(
  pageElements: CanvasElement[],
  ancestorId: string,
  elementId: string,
): boolean {
  const parentById = new Map(pageElements.map((element) => [element.id, element.parentId ?? null]));
  let currentParentId = parentById.get(elementId) ?? null;

  while (currentParentId) {
    if (currentParentId === ancestorId) {
      return true;
    }

    currentParentId = parentById.get(currentParentId) ?? null;
  }

  return false;
}
