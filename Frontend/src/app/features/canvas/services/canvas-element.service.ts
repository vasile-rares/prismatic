import { Injectable } from '@angular/core';
import {
  CanvasElement,
  CanvasElementType,
  CanvasOverflowMode,
  CanvasPageModel,
  CanvasPositionMode,
} from '@app/core';
import { hasPerCornerRadius } from '../utils/element/canvas-element-normalization.util';
import { clamp, roundToTwoDecimals } from '../utils/canvas-math.util';
import { collectSubtreeIds, buildElementMap, buildChildrenMap } from '../utils/canvas-tree.util';

export interface ElementIndex {
  readonly elementMap: Map<string, CanvasElement>;
  readonly childrenMap: Map<string | null, CanvasElement[]>;
}
import { formatCanvasElementTypeLabel } from '../utils/element/canvas-element-normalization.util';
import {
  getTextFontFamily,
  getTextFontSize,
  getTextFontStyle,
  getTextFontWeight,
  getTextLetterSpacing,
  getTextLineHeight,
} from '../utils/element/canvas-text.util';
import {
  CanvasConstraintField,
  CanvasSizeAxis,
  getCanvasConstraintAxis,
  getCanvasConstraintMode,
  getCanvasConstraintSizingValue,
  getCanvasConstraintValue,
  getCanvasSizeMode,
  getCanvasSizingValue,
  resolveCanvasConstraintPixels,
  resolveCanvasPixelsFromMode,
} from '../utils/element/canvas-sizing.util';
import { Bounds, Point } from '../canvas.types';

const DEFAULT_FRAME_FILL = '#ffffff';
const DEFAULT_ELEMENT_FILL = '#e0e0e0';
const MIN_ELEMENT_SIZE = 24;
const FRAME_INSERT_GAP = 48;
const DEFAULT_ELEMENT_DIMENSIONS: Record<CanvasElementType, { width: number; height: number }> = {
  frame: { width: 390, height: 844 },
  text: { width: 150, height: 40 },
  image: { width: 180, height: 120 },
  rectangle: { width: 100, height: 100 },
  svg: { width: 200, height: 200 },
};

@Injectable()
export class CanvasElementService {

  private readonly _indexCache = new WeakMap<CanvasElement[], ElementIndex>();

  private getOrBuildIndex(elements: CanvasElement[]): ElementIndex {
    let idx = this._indexCache.get(elements);
    if (!idx) {
      idx = {
        elementMap: buildElementMap(elements),
        childrenMap: buildChildrenMap(elements),
      };
      this._indexCache.set(elements, idx);
    }
    return idx;
  }


  createElementAtPoint(
    tool: CanvasElementType,
    pointer: Point,
    elements: CanvasElement[],
    selectedContainer: CanvasElement | null,
    containerBounds: Bounds | null,
    frameTemplateSize: { width: number; height: number },
  ): { element: CanvasElement | null; error: string | null } {
    const { width: defaultWidth, height: defaultHeight } = this.getDefaultElementDimensions(
      tool,
      frameTemplateSize,
    );
    const createdType: CanvasElementType = tool === 'image' ? 'rectangle' : tool;
    const isImageFillPreset = tool === 'image';
    const isSvg = tool === 'svg';

    let x = roundToTwoDecimals(createdType === 'text' ? pointer.x : pointer.x - defaultWidth / 2);
    let y = roundToTwoDecimals(pointer.y - defaultHeight / 2);
    let parentId: string | null = null;

    if (createdType === 'frame') {
      const nextPosition = this.getNextFramePosition(elements, defaultWidth, defaultHeight);
      if (nextPosition) {
        x = nextPosition.x;
        y = nextPosition.y;
      }
    }

    if (tool !== 'frame' && selectedContainer && containerBounds) {
      const containerWidth = this.getContainerChildPlacementSize(
        selectedContainer,
        elements,
        'width',
      );
      const containerHeight = this.getContainerChildPlacementSize(
        selectedContainer,
        elements,
        'height',
      );
      if (
        !(
          pointer.x >= containerBounds.x &&
          pointer.x <= containerBounds.x + containerBounds.width &&
          pointer.y >= containerBounds.y &&
          pointer.y <= containerBounds.y + containerBounds.height
        )
      ) {
        return {
          element: null,
          error: 'Click inside the selected container to place the element.',
        };
      }

      const xHalfOffset = createdType === 'text' ? 0 : defaultWidth / 2;
      x = clamp(pointer.x - containerBounds.x - xHalfOffset, 0, containerWidth - xHalfOffset * 2);
      y = clamp(
        pointer.y - containerBounds.y - defaultHeight / 2,
        0,
        containerHeight - defaultHeight,
      );
      parentId = selectedContainer.id;
    }

    return {
      element: {
        id: crypto.randomUUID(),
        type: createdType,
        name: this.getNextElementName(tool, elements),
        x,
        y,
        width: defaultWidth,
        height: defaultHeight,
        visible: true,
        fill: isSvg
          ? undefined
          : createdType === 'frame'
            ? DEFAULT_FRAME_FILL
            : createdType === 'text'
              ? '#000000'
              : DEFAULT_ELEMENT_FILL,
        fillMode: isImageFillPreset ? 'image' : undefined,
        backgroundSize: isImageFillPreset ? 'cover' : undefined,
        backgroundPosition: isImageFillPreset ? 'center' : undefined,
        backgroundRepeat: isImageFillPreset ? 'no-repeat' : undefined,
        objectFit: isImageFillPreset ? 'cover' : undefined,
        strokeWidth: createdType === 'text' || isSvg ? undefined : 1,
        strokeStyle: createdType === 'text' || isSvg ? undefined : 'Solid',
        opacity: 1,
        cornerRadius: isImageFillPreset ? 6 : 0,
        text: createdType === 'text' ? '' : undefined,
        fontSize: createdType === 'text' ? 16 : undefined,
        fontSizeUnit: createdType === 'text' ? 'px' : undefined,
        fontFamily: createdType === 'text' ? 'Inter' : undefined,
        fontWeight: createdType === 'text' ? 400 : undefined,
        fontStyle: createdType === 'text' ? 'normal' : undefined,
        textAlign: createdType === 'text' ? 'center' : undefined,
        textVerticalAlign: createdType === 'text' ? 'middle' : undefined,
        letterSpacing: createdType === 'text' ? 0 : undefined,
        letterSpacingUnit: createdType === 'text' ? 'px' : undefined,
        lineHeight: createdType === 'text' ? 1.2 : undefined,
        lineHeightUnit: createdType === 'text' ? 'em' : undefined,
        widthMode: createdType === 'text' ? 'fit-content' : undefined,
        heightMode: createdType === 'text' ? 'fit-content' : undefined,
        position: this.getDefaultPositionForPlacement(createdType, selectedContainer),
        parentId,
      },
      error: null,
    };
  }

  getDefaultElementDimensions(
    tool: CanvasElementType,
    frameTemplateSize: { width: number; height: number },
  ): { width: number; height: number } {
    return {
      width: tool === 'frame' ? frameTemplateSize.width : DEFAULT_ELEMENT_DIMENSIONS[tool].width,
      height: tool === 'frame' ? frameTemplateSize.height : DEFAULT_ELEMENT_DIMENSIONS[tool].height,
    };
  }

  createFrameAtCenter(
    center: Point,
    width: number,
    height: number,
    name: string,
    elements: CanvasElement[],
  ): CanvasElement {
    const nextPosition = this.getNextFramePosition(elements, width, height);

    return {
      id: crypto.randomUUID(),
      type: 'frame',
      name: this.getNextFrameName(name, elements),
      x: nextPosition?.x ?? roundToTwoDecimals(center.x - width / 2),
      y: nextPosition?.y ?? roundToTwoDecimals(center.y - height / 2),
      width,
      height,
      visible: true,
      fill: DEFAULT_FRAME_FILL,
      strokeWidth: 1,
      strokeStyle: 'Solid',
      opacity: 1,
      cornerRadius: 0,
      parentId: null,
    };
  }

  createRectangleFromBounds(
    tool: 'rectangle' | 'image',
    bounds: Bounds,
    elements: CanvasElement[],
    selectedContainer: CanvasElement | null,
    containerBounds: Bounds | null,
  ): { element: CanvasElement | null; error: string | null } {
    const placementWidth = selectedContainer
      ? this.getContainerChildPlacementSize(selectedContainer, elements, 'width')
      : null;
    const placementHeight = selectedContainer
      ? this.getContainerChildPlacementSize(selectedContainer, elements, 'height')
      : null;
    const maxWidth = placementWidth != null ? Math.max(placementWidth, MIN_ELEMENT_SIZE) : null;
    const maxHeight = selectedContainer
      ? Math.max(placementHeight ?? MIN_ELEMENT_SIZE, MIN_ELEMENT_SIZE)
      : null;
    const width = Math.round(
      maxWidth == null
        ? Math.max(bounds.width, MIN_ELEMENT_SIZE)
        : clamp(bounds.width, MIN_ELEMENT_SIZE, maxWidth),
    );
    const height = Math.round(
      maxHeight == null
        ? Math.max(bounds.height, MIN_ELEMENT_SIZE)
        : clamp(bounds.height, MIN_ELEMENT_SIZE, maxHeight),
    );
    const center = {
      x: roundToTwoDecimals(bounds.x + width / 2),
      y: roundToTwoDecimals(bounds.y + height / 2),
    };
    const result = this.createElementAtPoint(
      tool,
      center,
      elements,
      selectedContainer,
      containerBounds,
      { width, height },
    );

    if (!result.element || result.error) {
      return result;
    }

    let x = roundToTwoDecimals(bounds.x);
    let y = roundToTwoDecimals(bounds.y);

    if (selectedContainer && containerBounds) {
      x = clamp(bounds.x - containerBounds.x, 0, Math.max(0, (placementWidth ?? 0) - width));
      y = clamp(bounds.y - containerBounds.y, 0, Math.max(0, (placementHeight ?? 0) - height));
    }

    return {
      element: {
        ...result.element,
        x: roundToTwoDecimals(x),
        y: roundToTwoDecimals(y),
        width,
        height,
      },
      error: null,
    };
  }

  createPage(name: string): CanvasPageModel {
    return {
      id: crypto.randomUUID(),
      name,
      viewportPreset: 'desktop',
      viewportWidth: 1280,
      viewportHeight: 720,
      canvasX: 0,
      canvasY: 0,
      elements: [],
    };
  }


  getNextPageName(pages: CanvasPageModel[]): string {
    return `Page ${pages.length + 1}`;
  }

  getNextElementName(type: CanvasElementType, elements: CanvasElement[]): string {
    if (type === 'rectangle' || type === 'text' || type === 'image' || type === 'frame') {
      return formatCanvasElementTypeLabel(type);
    }

    const index = elements.filter((element) => element.type === type).length + 1;
    return `${formatCanvasElementTypeLabel(type)} ${index}`;
  }

  getNextFrameName(templateName: string, elements: CanvasElement[]): string {
    return templateName;
  }


  findElementById(id: string | null, elements: CanvasElement[]): CanvasElement | null {
    if (!id) {
      return null;
    }
    return this.getOrBuildIndex(elements).elementMap.get(id) ?? null;
  }

  getRootFrames(elements: CanvasElement[]): CanvasElement[] {
    return (this.getOrBuildIndex(elements).childrenMap.get(null) ?? []).filter(
      (el) => el.type === 'frame',
    );
  }

  getChildrenOf(parentId: string, elements: CanvasElement[]): CanvasElement[] {
    return this.getOrBuildIndex(elements).childrenMap.get(parentId) ?? [];
  }

  getRenderedWidth(
    element: CanvasElement,
    elements: CanvasElement[],
    page?: CanvasPageModel | null,
  ): number {
    return this.getRenderedBoxSizePx(element, elements, 'width', page);
  }

  getRenderedHeight(
    element: CanvasElement,
    elements: CanvasElement[],
    page?: CanvasPageModel | null,
  ): number {
    return this.getRenderedBoxSizePx(element, elements, 'height', page);
  }

  getRenderedWidthStyle(
    element: CanvasElement,
    elements: CanvasElement[],
    page?: CanvasPageModel | null,
  ): string {
    return this.getRenderedSizeStyle(element, elements, 'width', page);
  }

  getRenderedHeightStyle(
    element: CanvasElement,
    elements: CanvasElement[],
    page?: CanvasPageModel | null,
  ): string {
    return this.getRenderedSizeStyle(element, elements, 'height', page);
  }

  getRenderedMinWidthStyle(
    element: CanvasElement,
    elements: CanvasElement[],
    page?: CanvasPageModel | null,
  ): string | null {
    return this.getRenderedConstraintStyle(element, elements, 'minWidth', page);
  }

  getRenderedMaxWidthStyle(
    element: CanvasElement,
    elements: CanvasElement[],
    page?: CanvasPageModel | null,
  ): string | null {
    return this.getRenderedConstraintStyle(element, elements, 'maxWidth', page);
  }

  getRenderedMinHeightStyle(
    element: CanvasElement,
    elements: CanvasElement[],
    page?: CanvasPageModel | null,
  ): string | null {
    return this.getRenderedConstraintStyle(element, elements, 'minHeight', page);
  }

  getRenderedMaxHeightStyle(
    element: CanvasElement,
    elements: CanvasElement[],
    page?: CanvasPageModel | null,
  ): string | null {
    return this.getRenderedConstraintStyle(element, elements, 'maxHeight', page);
  }

  getAbsoluteBounds(
    element: CanvasElement,
    elements: CanvasElement[],
    page?: CanvasPageModel | null,
  ): Bounds {
    const parent = this.findElementById(element.parentId ?? null, elements);
    const width = this.getRenderedBoxSizePx(element, elements, 'width', page);
    const height = this.getRenderedBoxSizePx(element, elements, 'height', page);

    if (!parent || element.type === 'frame') {
      return {
        x: roundToTwoDecimals(element.x),
        y: roundToTwoDecimals(element.y),
        width,
        height,
      };
    }

    const parentBounds = this.getAbsoluteBounds(parent, elements, page);
    return {
      x: roundToTwoDecimals(parentBounds.x + element.x),
      y: roundToTwoDecimals(parentBounds.y + element.y),
      width,
      height,
    };
  }

  private getRenderedBoxSizePx(
    element: CanvasElement,
    elements: CanvasElement[],
    axis: CanvasSizeAxis,
    page?: CanvasPageModel | null,
  ): number {
    return roundToTwoDecimals(this.getResolvedContentSizePx(element, elements, axis, page));
  }

  private getResolvedContentSizePx(
    element: CanvasElement,
    elements: CanvasElement[],
    axis: CanvasSizeAxis,
    page?: CanvasPageModel | null,
  ): number {
    const fallbackPixels = axis === 'width' ? element.width : element.height;
    const mode = getCanvasSizeMode(element, axis);
    let resolvedPixels = fallbackPixels;

    const idx = this.getOrBuildIndex(elements);
    const parent = element.parentId ? (idx.elementMap.get(element.parentId) ?? null) : null;
    const parentSizeRef = this.getParentSizeReferenceForChild(element, parent, elements, page);

    if (element.type === 'text' && mode === 'fit-content') {
      const widthConstraint = this.getTextMeasurementWidthConstraint(element, elements, page);
      const measured = this.measureTextContentSize(element, widthConstraint);
      resolvedPixels =
        (axis === 'width' ? measured.width : measured.height) +
        this.getPaddingAxisTotal(element, axis);
    } else if (
      (element.type === 'rectangle' || element.type === 'frame') &&
      mode === 'fit-content'
    ) {
      const children = idx.childrenMap.get(element.id) ?? [];
      if (children.length > 0) {
        resolvedPixels =
          this.computeContainerFitContentSize(element, children, elements, axis, page) +
          this.getPaddingAxisTotal(element, axis);
      }
    } else if (mode !== 'fixed' && mode !== 'fit-content') {
      if (mode === 'viewport' && !page) {
        resolvedPixels = fallbackPixels;
      } else {
        resolvedPixels = resolveCanvasPixelsFromMode(
          mode,
          fallbackPixels,
          axis,
          getCanvasSizingValue(element, axis),
          parentSizeRef,
          page,
        );
      }
    }

    const minConstraint = this.getRenderedConstraintPx(
      element,
      elements,
      axis === 'width' ? 'minWidth' : 'minHeight',
      page,
    );
    const maxConstraint = this.getRenderedConstraintPx(
      element,
      elements,
      axis === 'width' ? 'maxWidth' : 'maxHeight',
      page,
    );

    let normalizedMin = minConstraint;
    let normalizedMax = maxConstraint;
    if (
      normalizedMin !== undefined &&
      normalizedMax !== undefined &&
      normalizedMax < normalizedMin
    ) {
      normalizedMax = normalizedMin;
    }

    if (normalizedMin !== undefined) {
      resolvedPixels = Math.max(resolvedPixels, normalizedMin);
    }

    if (normalizedMax !== undefined) {
      resolvedPixels = Math.min(resolvedPixels, normalizedMax);
    }

    return roundToTwoDecimals(resolvedPixels);
  }

  private getTextMeasurementWidthConstraint(
    element: CanvasElement,
    elements: CanvasElement[],
    page?: CanvasPageModel | null,
  ): number | undefined {
    const widthMode = getCanvasSizeMode(element, 'width');
    const padding = this.getPaddingAxisTotal(element, 'width');

    if (widthMode !== 'fit-content') {
      return this.getResolvedContentSizePx(element, elements, 'width', page) - padding;
    }

    let minWidth = this.getRenderedConstraintPx(element, elements, 'minWidth', page);
    let maxWidth = this.getRenderedConstraintPx(element, elements, 'maxWidth', page);
    if (minWidth !== undefined && maxWidth !== undefined && maxWidth < minWidth) {
      maxWidth = minWidth;
    }
    let constrainedWidth = this.measureTextContentSize(element).width;

    if (minWidth !== undefined) {
      constrainedWidth = Math.max(constrainedWidth, minWidth - padding);
    }

    if (maxWidth !== undefined) {
      constrainedWidth = Math.min(constrainedWidth, maxWidth - padding);
    }

    return constrainedWidth;
  }

  private measureTextContentSize(
    element: CanvasElement,
    widthConstraint?: number,
  ): { width: number; height: number } {
    const mirror = document.createElement('div');
    mirror.style.cssText = [
      'position:fixed',
      'top:-9999px',
      'left:-9999px',
      'visibility:hidden',
      'box-sizing:content-box',
      'padding:0',
      'margin:0',
      widthConstraint == null ? 'white-space:pre' : 'white-space:pre-wrap',
      widthConstraint == null ? 'display:inline-block' : 'display:block',
      'overflow-wrap:break-word',
      `font-size:${getTextFontSize(element)}`,
      `font-family:${getTextFontFamily(element)}`,
      `font-weight:${getTextFontWeight(element)}`,
      `font-style:${getTextFontStyle(element)}`,
      `line-height:${getTextLineHeight(element)}`,
      `letter-spacing:${getTextLetterSpacing(element)}`,
    ].join(';');

    if (widthConstraint != null) {
      mirror.style.width = `${widthConstraint}px`;
    }

    const textForMeasure = (element.text || ' ').replace(/\n+$/, (match) => match + '\u200b');
    mirror.textContent = textForMeasure;
    document.body.appendChild(mirror);
    const measuredWidth = widthConstraint ?? mirror.offsetWidth;
    const measuredHeight = mirror.offsetHeight;
    document.body.removeChild(mirror);

    return {
      width: Math.max(roundToTwoDecimals(measuredWidth), MIN_ELEMENT_SIZE),
      height: Math.max(roundToTwoDecimals(measuredHeight), 4),
    };
  }

  private getRenderedSizeStyle(
    element: CanvasElement,
    elements: CanvasElement[],
    axis: CanvasSizeAxis,
    page?: CanvasPageModel | null,
  ): string {
    if (getCanvasSizeMode(element, axis) !== 'fit-content') {
      return `${this.getResolvedContentSizePx(element, elements, axis, page)}px`;
    }
    const canUseCssKeyword = element.type === 'text' || this.isLayoutContainerElement(element);
    if (!canUseCssKeyword)
      return `${this.getResolvedContentSizePx(element, elements, axis, page)}px`;
    return element.type === 'text' ? 'max-content' : 'fit-content';
  }

  private getRenderedConstraintPx(
    element: CanvasElement,
    elements: CanvasElement[],
    field: CanvasConstraintField,
    page?: CanvasPageModel | null,
  ): number | undefined {
    const fallbackPixels = getCanvasConstraintValue(element, field);
    if (!Number.isFinite(fallbackPixels ?? Number.NaN)) {
      return undefined;
    }

    const parent = this.findElementById(element.parentId ?? null, elements);
    const parentSizeRef = this.getParentSizeReferenceForChild(element, parent, elements, page);
    const axis = getCanvasConstraintAxis(field);

    return roundToTwoDecimals(
      resolveCanvasConstraintPixels(
        getCanvasConstraintMode(element, field),
        fallbackPixels as number,
        axis,
        getCanvasConstraintSizingValue(element, field),
        parentSizeRef,
      ),
    );
  }

  private getParentSizeReferenceForChild(
    element: CanvasElement,
    parent: CanvasElement | null,
    elements: CanvasElement[],
    page?: CanvasPageModel | null,
  ): { width: number; height: number; padding?: CanvasElement['padding'] } | null {
    if (!parent) {
      return null;
    }

    const width = this.getRenderedWidth(parent, elements, page);
    const height = this.getRenderedHeight(parent, elements, page);

    if (this.isLayoutContainerElement(parent) && isFlowLayoutChild(element)) {
      return { width, height, padding: parent.padding };
    }

    return { width, height };
  }

  private getContainerChildPlacementSize(
    container: CanvasElement,
    elements: CanvasElement[],
    axis: CanvasSizeAxis,
    page?: CanvasPageModel | null,
  ): number {
    return axis === 'width'
      ? this.getRenderedWidth(container, elements, page)
      : this.getRenderedHeight(container, elements, page);
  }

  private getPaddingAxisTotal(
    element: Pick<CanvasElement, 'padding'>,
    axis: CanvasSizeAxis,
  ): number {
    const padding = element.padding;
    if (!padding) {
      return 0;
    }

    return axis === 'width'
      ? (padding.left ?? 0) + (padding.right ?? 0)
      : (padding.top ?? 0) + (padding.bottom ?? 0);
  }

  // Fit-Content container sizing

  private computeContainerFitContentSize(
    container: CanvasElement,
    children: CanvasElement[],
    elements: CanvasElement[],
    axis: CanvasSizeAxis,
    page?: CanvasPageModel | null,
  ): number {
    if (this.isLayoutContainerElement(container)) {
      return this.computeLayoutContainerFitContent(container, children, elements, axis, page);
    }
    return this.computeFreeContainerFitContent(children, elements, axis, page);
  }

  private computeLayoutContainerFitContent(
    container: CanvasElement,
    children: CanvasElement[],
    elements: CanvasElement[],
    axis: CanvasSizeAxis,
    page?: CanvasPageModel | null,
  ): number {
    const flowChildren = children.filter((c) => isFlowLayoutChild(c));
    const absChildren = children.filter((c) => !isFlowLayoutChild(c));

    const mainIsWidth = isContainerMainAxisWidth(container);
    const isMainAxis = (axis === 'width' && mainIsWidth) || (axis === 'height' && !mainIsWidth);

    let contentSize = 0;

    if (flowChildren.length > 0) {
      if (isMainAxis) {
        let total = 0;
        let count = 0;
        for (const child of flowChildren) {
          const childMode = getCanvasSizeMode(child, axis);
          const childBoxSize =
            childMode === 'fill' ? 0 : this.getChildIntrinsicBoxSize(child, elements, axis, page);
          total += childBoxSize + this.getMarginAxisTotal(child, axis);
          count++;
        }
        const gap = getContainerGapForAxis(container, axis);
        total += Math.max(0, count - 1) * gap;
        contentSize = total;
      } else {
        for (const child of flowChildren) {
          const childMode = getCanvasSizeMode(child, axis);
          const childBoxSize =
            childMode === 'fill' ? 0 : this.getChildIntrinsicBoxSize(child, elements, axis, page);
          contentSize = Math.max(contentSize, childBoxSize + this.getMarginAxisTotal(child, axis));
        }
      }
    }

    for (const child of absChildren) {
      const childPos = axis === 'width' ? child.x : child.y;
      const childSize = this.getChildIntrinsicBoxSize(child, elements, axis, page);
      contentSize = Math.max(contentSize, childPos + childSize);
    }

    return Math.max(contentSize, 1);
  }

  private computeFreeContainerFitContent(
    children: CanvasElement[],
    elements: CanvasElement[],
    axis: CanvasSizeAxis,
    page?: CanvasPageModel | null,
  ): number {
    let maxExtent = 0;
    for (const child of children) {
      const childPos = axis === 'width' ? child.x : child.y;
      const childSize = this.getChildIntrinsicBoxSize(child, elements, axis, page);
      maxExtent = Math.max(maxExtent, childPos + childSize);
    }
    return Math.max(maxExtent, 1);
  }

  private getChildIntrinsicBoxSize(
    child: CanvasElement,
    elements: CanvasElement[],
    axis: CanvasSizeAxis,
    page?: CanvasPageModel | null,
  ): number {
    const mode = getCanvasSizeMode(child, axis);
    const raw = axis === 'width' ? child.width : child.height;
    const padding = this.getPaddingAxisTotal(child, axis);

    switch (mode) {
      case 'fit-content': {
        if (child.type === 'text') {
          let widthConstraint: number | undefined;
          if (axis === 'height') {
            const widthMode = getCanvasSizeMode(child, 'width');
            if (widthMode !== 'fit-content') {
              widthConstraint = child.width - this.getPaddingAxisTotal(child, 'width');
            }
          }
          const measured = this.measureTextContentSize(child, widthConstraint);
          return (axis === 'width' ? measured.width : measured.height) + padding;
        }
        if (child.type === 'rectangle' || child.type === 'frame') {
          const grandchildren = this.getOrBuildIndex(elements).childrenMap.get(child.id) ?? [];
          if (grandchildren.length > 0) {
            return (
              this.computeContainerFitContentSize(child, grandchildren, elements, axis, page) +
              padding
            );
          }
        }
        return Math.max(raw, 1);
      }
      case 'viewport':
        if (page) {
          return resolveCanvasPixelsFromMode(
            mode,
            raw,
            axis,
            getCanvasSizingValue(child, axis),
            null,
            page,
          );
        }
        return raw;
      case 'fill':
      case 'relative':
        return raw;
      default:
        return raw;
    }
  }

  private getMarginAxisTotal(element: Pick<CanvasElement, 'margin'>, axis: CanvasSizeAxis): number {
    const margin = element.margin;
    if (!margin) {
      return 0;
    }

    return axis === 'width'
      ? (margin.left ?? 0) + (margin.right ?? 0)
      : (margin.top ?? 0) + (margin.bottom ?? 0);
  }

  private getRenderedConstraintStyle(
    element: CanvasElement,
    elements: CanvasElement[],
    field: CanvasConstraintField,
    page?: CanvasPageModel | null,
  ): string | null {
    const pixels = this.getRenderedConstraintPx(element, elements, field, page);
    return pixels === undefined ? null : `${pixels}px`;
  }

  isElementEffectivelyVisible(elementId: string, elements: CanvasElement[]): boolean {
    let current = this.findElementById(elementId, elements);

    while (current) {
      if (current.visible === false) {
        return false;
      }
      current = this.findElementById(current.parentId ?? null, elements);
    }

    return true;
  }

  isContainerElement(element: CanvasElement | null | undefined): element is CanvasElement {
    return !!element && (element.type === 'frame' || element.type === 'rectangle');
  }

  isLayoutContainerElement(element: CanvasElement | null | undefined): element is CanvasElement {
    return !!element && this.isContainerElement(element) && !!element.display;
  }

  getDefaultPositionForPlacement(
    type: CanvasElementType,
    parent: CanvasElement | null | undefined,
  ): CanvasPositionMode | undefined {
    if (type === 'frame') {
      return undefined;
    }

    return this.isLayoutContainerElement(parent) ? 'relative' : 'absolute';
  }

  getSelectedContainer(selectedElement: CanvasElement | null): CanvasElement | null {
    return this.isContainerElement(selectedElement) ? selectedElement : null;
  }


  getNextFramePosition(elements: CanvasElement[], width: number, height: number): Point | null {
    const rootFrames = this.getRootFrames(elements);

    if (rootFrames.length === 0) {
      return null;
    }

    const rightMostFrame = rootFrames.reduce((currentRightMost, candidate) => {
      const currentBounds = this.getAbsoluteBounds(currentRightMost, elements);
      const candidateBounds = this.getAbsoluteBounds(candidate, elements);
      const currentRight = currentBounds.x + currentBounds.width;
      const candidateRight = candidateBounds.x + candidateBounds.width;
      return candidateRight > currentRight ? candidate : currentRightMost;
    }, rootFrames[0]);

    const bounds = this.getAbsoluteBounds(rightMostFrame, elements);
    return {
      x: roundToTwoDecimals(bounds.x + bounds.width + FRAME_INSERT_GAP),
      y: roundToTwoDecimals(bounds.y),
    };
  }


  reorderLayerElements(
    elements: CanvasElement[],
    draggedId: string,
    targetId: string | null,
    position: 'before' | 'after' | 'inside',
  ): CanvasElement[] {
    if (draggedId === targetId) {
      return elements;
    }

    const dragged = elements.find((element) => element.id === draggedId);
    const target = targetId ? (elements.find((element) => element.id === targetId) ?? null) : null;
    if (!dragged || (targetId && !target)) {
      return elements;
    }

    if (
      position === 'inside' &&
      targetId !== null &&
      (!this.canContainChildren(target!) || dragged.type === 'frame')
    ) {
      return elements;
    }

    const draggedSubtreeIds = new Set(collectSubtreeIds(elements, draggedId));
    if (targetId !== null && draggedSubtreeIds.has(targetId)) {
      return elements;
    }

    const draggedSubtree = elements.filter((element) => draggedSubtreeIds.has(element.id));
    const remaining = elements.filter((element) => !draggedSubtreeIds.has(element.id));
    const draggedRoot = draggedSubtree[0];
    if (!draggedRoot) {
      return elements;
    }

    const draggedBounds = this.getAbsoluteBounds(dragged, elements);
    const targetIndex = targetId
      ? remaining.findIndex((element) => element.id === targetId)
      : remaining.length;
    if (targetId && targetIndex === -1) {
      return elements;
    }

    const targetSubtreeIds = targetId ? collectSubtreeIds(remaining, targetId) : [];

    let nextParentId = dragged.parentId ?? null;
    let insertIndex = targetIndex;

    if (position === 'inside') {
      nextParentId = target?.id ?? null;
      insertIndex = target ? targetIndex + targetSubtreeIds.length : remaining.length;
    } else {
      if (!target) {
        return elements;
      }
      nextParentId = target.parentId ?? null;
      insertIndex = position === 'after' ? targetIndex + targetSubtreeIds.length : targetIndex;
    }

    const nextParent = nextParentId
      ? (remaining.find((element) => element.id === nextParentId) ?? null)
      : null;

    draggedRoot.parentId = nextParentId;
    draggedRoot.position = this.getDefaultPositionForPlacement(draggedRoot.type, nextParent);
    if (nextParent) {
      const parentBounds = this.getAbsoluteBounds(nextParent, remaining);
      const nextParentWidth = this.getContainerChildPlacementSize(nextParent, remaining, 'width');
      const nextParentHeight = this.getContainerChildPlacementSize(nextParent, remaining, 'height');
      draggedRoot.x = clamp(
        draggedBounds.x - parentBounds.x,
        0,
        nextParentWidth - draggedRoot.width,
      );
      draggedRoot.y = clamp(
        draggedBounds.y - parentBounds.y,
        0,
        nextParentHeight - draggedRoot.height,
      );
    } else {
      draggedRoot.x = roundToTwoDecimals(draggedBounds.x);
      draggedRoot.y = roundToTwoDecimals(draggedBounds.y);
    }

    return [...remaining.slice(0, insertIndex), ...draggedSubtree, ...remaining.slice(insertIndex)];
  }

  private canContainChildren(element: CanvasElement): boolean {
    return this.isContainerElement(element);
  }


  updatePageElements(
    pages: CanvasPageModel[],
    currentPageId: string,
    updater: (elements: CanvasElement[]) => CanvasElement[],
  ): CanvasPageModel[] {
    return pages.map((page) =>
      page.id === currentPageId ? { ...page, elements: updater(page.elements) } : page,
    );
  }


  getElementClipPath(element: CanvasElement, elements: CanvasElement[]): string {
    const parent = this.findElementById(element.parentId ?? null, elements);
    if (!parent) {
      return 'none';
    }

    if (!isOverflowClippingMode(parent.overflow ?? 'clip')) {
      return 'none';
    }

    const bounds = this.getAbsoluteBounds(element, elements);
    const parentBounds = this.getAbsoluteBounds(parent, elements);
    const topInset = Math.max(0, parentBounds.y - bounds.y);
    const rightInset = Math.max(0, bounds.x + bounds.width - (parentBounds.x + parentBounds.width));
    const bottomInset = Math.max(
      0,
      bounds.y + bounds.height - (parentBounds.y + parentBounds.height),
    );
    const leftInset = Math.max(0, parentBounds.x - bounds.x);

    if (topInset === 0 && rightInset === 0 && bottomInset === 0 && leftInset === 0) {
      return 'none';
    }

    return `inset(${topInset}px ${rightInset}px ${bottomInset}px ${leftInset}px)`;
  }

  isElementClippedOut(element: CanvasElement, elements: CanvasElement[]): boolean {
    const parent = this.findElementById(element.parentId ?? null, elements);
    if (!parent) {
      return false;
    }

    if (!isOverflowClippingMode(parent.overflow ?? 'clip')) {
      return false;
    }

    const bounds = this.getAbsoluteBounds(element, elements);
    const parentBounds = this.getAbsoluteBounds(parent, elements);
    const intersectionWidth =
      Math.min(bounds.x + bounds.width, parentBounds.x + parentBounds.width) -
      Math.max(bounds.x, parentBounds.x);
    const intersectionHeight =
      Math.min(bounds.y + bounds.height, parentBounds.y + parentBounds.height) -
      Math.max(bounds.y, parentBounds.y);

    return intersectionWidth <= 0 || intersectionHeight <= 0;
  }

  supportsCornerRadius(element: CanvasElement): boolean {
    return element.type !== 'text' && element.type !== 'frame' && !hasPerCornerRadius(element);
  }
}

function isFlowLayoutChild(element: Pick<CanvasElement, 'position'>): boolean {
  const position = element.position;
  return !position || position === 'static' || position === 'relative' || position === 'sticky';
}

function isContainerMainAxisWidth(
  container: Pick<CanvasElement, 'display' | 'flexDirection'>,
): boolean {
  if (container.display === 'grid') {
    return true;
  }
  if (container.display === 'block') {
    return false;
  }
  return container.flexDirection !== 'column' && container.flexDirection !== 'column-reverse';
}

function getContainerGapForAxis(
  container: Pick<CanvasElement, 'display' | 'gap' | 'gapX' | 'gapY'>,
  axis: CanvasSizeAxis,
): number {
  if (container.display === 'grid') {
    const specificGap = axis === 'width' ? container.gapX : container.gapY;
    if (typeof specificGap === 'number' && specificGap > 0) {
      return specificGap;
    }
  }
  return typeof container.gap === 'number' && container.gap > 0 ? container.gap : 0;
}

function isOverflowClippingMode(mode: CanvasOverflowMode): boolean {
  return mode === 'clip' || mode === 'hidden' || mode === 'scroll';
}
