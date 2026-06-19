import { CanvasBorderWidths, CanvasCornerRadii, CanvasElement, CanvasElementType } from '@app/core';
import { clamp, roundToTwoDecimals } from '../canvas-math.util';
import {
  hasCanvasElementLink,
  normalizeCanvasAccessibilityLabel,
  normalizeStoredCanvasTag,
} from './canvas-accessibility.util';
import {
  deriveCanvasConstraintValueFromPixels,
  getCanvasConstraintAxis,
  getCanvasConstraintMode,
  getCanvasConstraintValue,
  getCanvasSizeMode,
  deriveCanvasSizeValueFromPixels,
  normalizeCanvasConstraintMode,
  normalizeCanvasConstraintValue,
  normalizeCanvasSizeMode,
  normalizeCanvasSizeValue,
  resolveCanvasConstraintPixels,
  resolveCanvasPixelsFromMode,
} from './canvas-sizing.util';
import { normalizeCanvasShadowValue } from './canvas-shadow.util';

const MIN_SIZE = 1;
const DEFAULT_STROKE_WIDTH = 1;

export function withRoundedPrecision(element: CanvasElement): CanvasElement {
  return {
    ...element,
    x: roundToTwoDecimals(element.x),
    y: roundToTwoDecimals(element.y),
    width: roundToTwoDecimals(element.width),
    height: roundToTwoDecimals(element.height),
    widthSizingValue:
      typeof element.widthSizingValue === 'number'
        ? roundToTwoDecimals(element.widthSizingValue)
        : undefined,
    minWidth:
      typeof element.minWidth === 'number' ? roundToTwoDecimals(element.minWidth) : undefined,
    minWidthSizingValue:
      typeof element.minWidthSizingValue === 'number'
        ? roundToTwoDecimals(element.minWidthSizingValue)
        : undefined,
    maxWidth:
      typeof element.maxWidth === 'number' ? roundToTwoDecimals(element.maxWidth) : undefined,
    maxWidthSizingValue:
      typeof element.maxWidthSizingValue === 'number'
        ? roundToTwoDecimals(element.maxWidthSizingValue)
        : undefined,
    heightSizingValue:
      typeof element.heightSizingValue === 'number'
        ? roundToTwoDecimals(element.heightSizingValue)
        : undefined,
    minHeight:
      typeof element.minHeight === 'number' ? roundToTwoDecimals(element.minHeight) : undefined,
    minHeightSizingValue:
      typeof element.minHeightSizingValue === 'number'
        ? roundToTwoDecimals(element.minHeightSizingValue)
        : undefined,
    maxHeight:
      typeof element.maxHeight === 'number' ? roundToTwoDecimals(element.maxHeight) : undefined,
    maxHeightSizingValue:
      typeof element.maxHeightSizingValue === 'number'
        ? roundToTwoDecimals(element.maxHeightSizingValue)
        : undefined,
    gap: typeof element.gap === 'number' ? roundToTwoDecimals(element.gap) : undefined,
    gapX: typeof element.gapX === 'number' ? roundToTwoDecimals(element.gapX) : undefined,
    gapY: typeof element.gapY === 'number' ? roundToTwoDecimals(element.gapY) : undefined,
    strokeWidth:
      typeof element.strokeWidth === 'number' ? roundToTwoDecimals(element.strokeWidth) : undefined,
    fontSize:
      typeof element.fontSize === 'number' ? roundToTwoDecimals(element.fontSize) : undefined,
    letterSpacing:
      typeof element.letterSpacing === 'number'
        ? roundToTwoDecimals(element.letterSpacing)
        : undefined,
    lineHeight:
      typeof element.lineHeight === 'number' ? roundToTwoDecimals(element.lineHeight) : undefined,
    cornerRadius:
      typeof element.cornerRadius === 'number'
        ? roundToTwoDecimals(element.cornerRadius)
        : undefined,
    cornerRadii: element.cornerRadii ? roundCornerRadii(element.cornerRadii) : undefined,
    strokeWidths: element.strokeWidths
      ? {
          top: Math.max(0, roundToTwoDecimals(element.strokeWidths.top)),
          right: Math.max(0, roundToTwoDecimals(element.strokeWidths.right)),
          bottom: Math.max(0, roundToTwoDecimals(element.strokeWidths.bottom)),
          left: Math.max(0, roundToTwoDecimals(element.strokeWidths.left)),
        }
      : undefined,
  };
}

export function getDefaultCornerRadius(
  element: Pick<CanvasElement, 'type' | 'cornerRadius'>,
): number {
  return Number.isFinite(element.cornerRadius ?? Number.NaN)
    ? roundToTwoDecimals(element.cornerRadius as number)
    : element.type === 'image'
      ? 6
      : 0;
}

export function buildUniformCornerRadii(radius: number): CanvasCornerRadii {
  const normalizedRadius = Math.max(0, roundToTwoDecimals(radius));
  return {
    topLeft: normalizedRadius,
    topRight: normalizedRadius,
    bottomRight: normalizedRadius,
    bottomLeft: normalizedRadius,
  };
}

export function roundCornerRadii(radii: CanvasCornerRadii): CanvasCornerRadii {
  return {
    topLeft: Math.max(0, roundToTwoDecimals(radii.topLeft)),
    topRight: Math.max(0, roundToTwoDecimals(radii.topRight)),
    bottomRight: Math.max(0, roundToTwoDecimals(radii.bottomRight)),
    bottomLeft: Math.max(0, roundToTwoDecimals(radii.bottomLeft)),
  };
}

export function getResolvedCornerRadii(
  element: Pick<CanvasElement, 'type' | 'cornerRadius' | 'cornerRadii'>,
): CanvasCornerRadii {
  if (element.cornerRadii) {
    return roundCornerRadii(element.cornerRadii);
  }

  return buildUniformCornerRadii(getDefaultCornerRadius(element));
}

export function hasPerCornerRadius(element: Pick<CanvasElement, 'cornerRadii'>): boolean {
  return !!element.cornerRadii;
}

export function getElementBorderRadiusCss(
  element: Pick<CanvasElement, 'type' | 'cornerRadius' | 'cornerRadii'>,
): string {
  if (!hasPerCornerRadius(element)) {
    return `${getDefaultCornerRadius(element)}px`;
  }

  const radii = getResolvedCornerRadii(element);
  return `${radii.topLeft}px ${radii.topRight}px ${radii.bottomRight}px ${radii.bottomLeft}px`;
}

export function getStrokeWidth(element: CanvasElement): number {
  const widths = getStrokeWidths(element);
  return Math.max(widths.top, widths.right, widths.bottom, widths.left);
}

export function getStrokeWidths(element: CanvasElement): CanvasBorderWidths {
  const hasActiveStroke = element.stroke != null;
  if (!hasActiveStroke || element.type === 'text') {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }

  if (element.strokeWidths) {
    return {
      top: Math.max(0, roundToTwoDecimals(element.strokeWidths.top)),
      right: Math.max(0, roundToTwoDecimals(element.strokeWidths.right)),
      bottom: Math.max(0, roundToTwoDecimals(element.strokeWidths.bottom)),
      left: Math.max(0, roundToTwoDecimals(element.strokeWidths.left)),
    };
  }

  const baseWidth =
    typeof element.strokeWidth === 'number' && Number.isFinite(element.strokeWidth)
      ? Math.max(0, roundToTwoDecimals(element.strokeWidth))
      : DEFAULT_STROKE_WIDTH;
  const sides = element.strokeSides ?? { top: true, right: true, bottom: true, left: true };

  return {
    top: sides.top ? baseWidth : 0,
    right: sides.right ? baseWidth : 0,
    bottom: sides.bottom ? baseWidth : 0,
    left: sides.left ? baseWidth : 0,
  };
}

export function hasPerSideStrokeWidths(element: CanvasElement): boolean {
  const widths = getStrokeWidths(element);
  return widths.top !== widths.right || widths.top !== widths.bottom || widths.top !== widths.left;
}

export function mutateNormalizeElement(element: CanvasElement, elements: CanvasElement[]): void {
  element.width = Math.max(MIN_SIZE, element.width);
  element.height = Math.max(MIN_SIZE, element.height);
  element.shadow = normalizeCanvasShadowValue(element.shadow);

  const hasLink = hasCanvasElementLink(element);
  element.tag = normalizeStoredCanvasTag(element.type, element.tag, hasLink);
  element.ariaLabel = normalizeCanvasAccessibilityLabel(element.ariaLabel);

  if (element.type === 'text') {
    element.fontSizeUnit = element.fontSizeUnit === 'rem' ? 'rem' : 'px';
    element.letterSpacingUnit = element.letterSpacingUnit === 'em' ? 'em' : 'px';
    element.lineHeightUnit = element.lineHeightUnit === 'px' ? 'px' : 'em';
    element.fontSize = Math.max(
      element.fontSizeUnit === 'rem' ? 0.1 : 8,
      roundToTwoDecimals(element.fontSize ?? (element.fontSizeUnit === 'rem' ? 1 : 16)),
    );
    element.fontFamily = element.fontFamily?.trim() || 'Inter';
    element.fontWeight = [300, 400, 500, 600, 700].includes(element.fontWeight ?? 400)
      ? (element.fontWeight ?? 400)
      : 400;
    element.fontStyle = element.fontStyle === 'italic' ? 'italic' : 'normal';
    element.textAlign =
      element.textAlign === 'left' ||
      element.textAlign === 'right' ||
      element.textAlign === 'justify'
        ? element.textAlign
        : 'center';
    element.textVerticalAlign =
      element.textVerticalAlign === 'top' || element.textVerticalAlign === 'bottom'
        ? element.textVerticalAlign
        : 'middle';
    element.letterSpacing = roundToTwoDecimals(element.letterSpacing ?? 0);
    element.lineHeight = Math.max(
      element.lineHeightUnit === 'em' ? 0.8 : 1,
      roundToTwoDecimals(element.lineHeight ?? 1.2),
    );
  }

  const normalizedOpacity = Number.isFinite(element.opacity ?? Number.NaN)
    ? (element.opacity as number)
    : 1;
  element.opacity = clamp(normalizedOpacity, 0, 1);

  element.gap = Number.isFinite(element.gap ?? Number.NaN)
    ? Math.max(0, roundToTwoDecimals(element.gap as number))
    : undefined;
  element.gapX = Number.isFinite(element.gapX ?? Number.NaN)
    ? Math.max(0, roundToTwoDecimals(element.gapX as number))
    : undefined;
  element.gapY = Number.isFinite(element.gapY ?? Number.NaN)
    ? Math.max(0, roundToTwoDecimals(element.gapY as number))
    : undefined;

  if (element.type !== 'text') {
    element.cornerRadius = getDefaultCornerRadius(element);
    element.cornerRadii = element.cornerRadii ? roundCornerRadii(element.cornerRadii) : undefined;
  }

  if (element.type !== 'text') {
    const normalizedStrokeWidth = Number.isFinite(element.strokeWidth ?? Number.NaN)
      ? (element.strokeWidth as number)
      : DEFAULT_STROKE_WIDTH;
    element.strokeWidth = Math.max(0, roundToTwoDecimals(normalizedStrokeWidth));
    element.strokeWidths = element.strokeWidths
      ? {
          top: Math.max(0, roundToTwoDecimals(element.strokeWidths.top)),
          right: Math.max(0, roundToTwoDecimals(element.strokeWidths.right)),
          bottom: Math.max(0, roundToTwoDecimals(element.strokeWidths.bottom)),
          left: Math.max(0, roundToTwoDecimals(element.strokeWidths.left)),
        }
      : undefined;
  } else {
    element.strokeWidth = undefined;
    element.strokeSides = undefined;
    element.strokeWidths = undefined;
  }

  const parent = element.parentId
    ? (elements.find((candidate) => candidate.id === element.parentId) ?? null)
    : null;
  const widthMode = normalizeCanvasSizeMode(element.widthMode, element, parent, 'width');
  const heightMode = normalizeCanvasSizeMode(element.heightMode, element, parent, 'height');
  const minWidthMode = normalizeCanvasConstraintMode(element.minWidthMode, element, parent);
  const maxWidthMode = normalizeCanvasConstraintMode(element.maxWidthMode, element, parent);
  const minHeightMode = normalizeCanvasConstraintMode(element.minHeightMode, element, parent);
  const maxHeightMode = normalizeCanvasConstraintMode(element.maxHeightMode, element, parent);

  element.widthMode = widthMode === 'fixed' ? undefined : widthMode;
  element.heightMode = heightMode === 'fixed' ? undefined : heightMode;
  element.widthSizingValue = normalizeCanvasSizeValue(widthMode, element.widthSizingValue);
  element.heightSizingValue = normalizeCanvasSizeValue(heightMode, element.heightSizingValue);
  normalizeConstraintField(element, 'minWidth', minWidthMode, parent);
  normalizeConstraintField(element, 'maxWidth', maxWidthMode, parent);
  normalizeConstraintField(element, 'minHeight', minHeightMode, parent);
  normalizeConstraintField(element, 'maxHeight', maxHeightMode, parent);

  const minWidthConstraint = resolveConstraintField(element, 'minWidth', parent);
  const maxWidthConstraint = resolveConstraintField(element, 'maxWidth', parent);
  const minHeightConstraint = resolveConstraintField(element, 'minHeight', parent);
  const maxHeightConstraint = resolveConstraintField(element, 'maxHeight', parent);
  const widthMin = Math.max(MIN_SIZE, minWidthConstraint ?? MIN_SIZE);
  const heightMin = Math.max(MIN_SIZE, minHeightConstraint ?? MIN_SIZE);
  const widthMaxConstraint =
    maxWidthConstraint !== undefined ? Math.max(widthMin, maxWidthConstraint) : undefined;
  const heightMaxConstraint =
    maxHeightConstraint !== undefined ? Math.max(heightMin, maxHeightConstraint) : undefined;
  const parentSizeRef = getParentSizeReference(element, parent);
  const isFlowInLayoutParent = isFlowLayoutChild(element, parent);

  if (!parent || element.type === 'frame') {
    element.x = roundToTwoDecimals(element.x);
    element.y = roundToTwoDecimals(element.y);
    element.width = roundToTwoDecimals(
      clamp(element.width, widthMin, widthMaxConstraint ?? Number.POSITIVE_INFINITY),
    );
    element.height = roundToTwoDecimals(
      clamp(element.height, heightMin, heightMaxConstraint ?? Number.POSITIVE_INFINITY),
    );
    if (typeof element.fontSize === 'number') {
      element.fontSize = roundToTwoDecimals(element.fontSize);
    }
    return;
  }

  const parentWidthFit = getCanvasSizeMode(parent, 'width') === 'fit-content';
  const parentHeightFit = getCanvasSizeMode(parent, 'height') === 'fit-content';
  const maxWidth = parentWidthFit
    ? Number.POSITIVE_INFINITY
    : isFlowInLayoutParent
      ? Math.max(MIN_SIZE, parentSizeRef?.width ?? parent.width)
      : Math.max(MIN_SIZE, parent.width - element.x);
  const maxHeight = parentHeightFit
    ? Number.POSITIVE_INFINITY
    : isFlowInLayoutParent
      ? Math.max(MIN_SIZE, parentSizeRef?.height ?? parent.height)
      : Math.max(MIN_SIZE, parent.height - element.y);

  if (widthMode === 'fill') {
    element.width = resolveCanvasPixelsFromMode(
      'fill',
      element.width,
      'width',
      element.widthSizingValue,
      parentSizeRef,
      null,
    );
  } else if (widthMode === 'relative') {
    element.width = resolveCanvasPixelsFromMode(
      'relative',
      element.width,
      'width',
      element.widthSizingValue,
      parentSizeRef,
      null,
    );
  }

  if (heightMode === 'fill') {
    element.height = resolveCanvasPixelsFromMode(
      'fill',
      element.height,
      'height',
      element.heightSizingValue,
      parentSizeRef,
      null,
    );
  } else if (heightMode === 'relative') {
    element.height = resolveCanvasPixelsFromMode(
      'relative',
      element.height,
      'height',
      element.heightSizingValue,
      parentSizeRef,
      null,
    );
  }

  element.width = clamp(
    element.width,
    widthMin,
    Math.min(maxWidth, widthMaxConstraint ?? maxWidth),
  );
  element.height = clamp(
    element.height,
    heightMin,
    Math.min(maxHeight, heightMaxConstraint ?? maxHeight),
  );

  if (!isFlowInLayoutParent) {
    element.x = clamp(
      element.x,
      0,
      parentWidthFit ? Number.POSITIVE_INFINITY : parent.width - element.width,
    );
    element.y = clamp(
      element.y,
      0,
      parentHeightFit ? Number.POSITIVE_INFINITY : parent.height - element.height,
    );
  }
  if (widthMode === 'relative') {
    element.widthSizingValue = deriveCanvasSizeValueFromPixels(
      'relative',
      element.width,
      'width',
      parentSizeRef,
      null,
    );
  }

  if (heightMode === 'relative') {
    element.heightSizingValue = deriveCanvasSizeValueFromPixels(
      'relative',
      element.height,
      'height',
      parentSizeRef,
      null,
    );
  }
  element.x = roundToTwoDecimals(element.x);
  element.y = roundToTwoDecimals(element.y);
  element.width = roundToTwoDecimals(element.width);
  element.height = roundToTwoDecimals(element.height);
  if (typeof element.fontSize === 'number') {
    element.fontSize = roundToTwoDecimals(element.fontSize);
  }
}

function normalizeConstraintField(
  element: CanvasElement,
  field: 'minWidth' | 'maxWidth' | 'minHeight' | 'maxHeight',
  mode: 'fixed' | 'relative',
  parent: Pick<CanvasElement, 'width' | 'height' | 'padding' | 'display' | 'type'> | null,
): void {
  const currentValue = getCanvasConstraintValue(element, field);
  if (!Number.isFinite(currentValue ?? Number.NaN)) {
    element[field] = undefined;
    element[
      field === 'minWidth'
        ? 'minWidthMode'
        : field === 'maxWidth'
          ? 'maxWidthMode'
          : field === 'minHeight'
            ? 'minHeightMode'
            : 'maxHeightMode'
    ] = undefined;
    element[
      field === 'minWidth'
        ? 'minWidthSizingValue'
        : field === 'maxWidth'
          ? 'maxWidthSizingValue'
          : field === 'minHeight'
            ? 'minHeightSizingValue'
            : 'maxHeightSizingValue'
    ] = undefined;
    return;
  }

  const modeField =
    field === 'minWidth'
      ? 'minWidthMode'
      : field === 'maxWidth'
        ? 'maxWidthMode'
        : field === 'minHeight'
          ? 'minHeightMode'
          : 'maxHeightMode';
  const sizingValueField =
    field === 'minWidth'
      ? 'minWidthSizingValue'
      : field === 'maxWidth'
        ? 'maxWidthSizingValue'
        : field === 'minHeight'
          ? 'minHeightSizingValue'
          : 'maxHeightSizingValue';
  const axis = getCanvasConstraintAxis(field);
  const normalizedPixels = Math.max(1, roundToTwoDecimals(currentValue as number));

  element[field] = normalizedPixels;
  element[modeField] = mode === 'fixed' ? undefined : mode;
  element[sizingValueField] = normalizeCanvasConstraintValue(mode, element[sizingValueField]);

  if (mode === 'relative' && element[sizingValueField] === undefined) {
    element[sizingValueField] = deriveCanvasConstraintValueFromPixels(
      'relative',
      normalizedPixels,
      axis,
      getParentSizeReference(element, parent),
    );
  }
}

function resolveConstraintField(
  element: CanvasElement,
  field: 'minWidth' | 'maxWidth' | 'minHeight' | 'maxHeight',
  parent: Pick<CanvasElement, 'width' | 'height' | 'padding' | 'display' | 'type'> | null,
): number | undefined {
  const pixels = getCanvasConstraintValue(element, field);
  if (!Number.isFinite(pixels ?? Number.NaN)) {
    return undefined;
  }

  return resolveCanvasConstraintPixels(
    getCanvasConstraintMode(element, field),
    pixels as number,
    getCanvasConstraintAxis(field),
    field === 'minWidth'
      ? element.minWidthSizingValue
      : field === 'maxWidth'
        ? element.maxWidthSizingValue
        : field === 'minHeight'
          ? element.minHeightSizingValue
          : element.maxHeightSizingValue,
    getParentSizeReference(element, parent),
  );
}

function getParentSizeReference(
  element: CanvasElement,
  parent: Pick<CanvasElement, 'width' | 'height' | 'padding' | 'display' | 'type'> | null,
): { width: number; height: number; padding?: CanvasElement['padding'] } | null {
  if (!parent) {
    return null;
  }

  if (isFlowLayoutChild(element, parent)) {
    return { width: parent.width, height: parent.height, padding: parent.padding };
  }

  return { width: parent.width, height: parent.height };
}

function isFlowLayoutChild(
  element: Pick<CanvasElement, 'position'>,
  parent: Pick<CanvasElement, 'display' | 'type'> | null,
): boolean {
  if (!parent || !parent.display || (parent.type !== 'frame' && parent.type !== 'rectangle')) {
    return false;
  }

  const position = element.position;
  return !position || position === 'static' || position === 'relative' || position === 'sticky';
}

export function formatCanvasElementTypeLabel(type: CanvasElementType): string {
  if (type === 'svg') return 'SVG';
  return `${type.charAt(0).toUpperCase()}${type.slice(1)}`;
}
