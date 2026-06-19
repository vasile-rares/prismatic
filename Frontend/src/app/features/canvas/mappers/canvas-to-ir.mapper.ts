import {
  AlignItems,
  BorderStyle,
  CanvasAlignItems,
  CanvasBorderWidths,
  CanvasDisplayMode,
  CanvasElement,
  CanvasFlexDirection,
  CanvasJustifyContent,
  CanvasPageModel,
  CanvasPositionMode,
  CanvasSpacing,
  ConverterPageRequest,
  FlexDirection,
  IRBorder,
  IREffect,
  IRLayout,
  IRMeta,
  IRNode,
  IRNodeType,
  IRPosition,
  IRShadow,
  IRSpacing,
  IRStyle,
  JustifyContent,
  LayoutMode,
  OverflowMode,
  PositionMode,
  length,
  px,
} from '@app/core';
import { gradientToCss } from '../utils/canvas-gradient.util';
import {
  buildCanvasElementBackfaceVisibility,
  buildCanvasElementTransform,
  buildCanvasElementTransformOrigin,
  buildCanvasElementTransformStyle,
} from '../utils/element/canvas-transform.util';
import {
  hasCanvasElementLink,
  normalizeCanvasAccessibilityLabel,
  normalizeStoredCanvasTag,
} from '../utils/element/canvas-accessibility.util';
import {
  getCanvasConstraintMode,
  getCanvasConstraintSizingValue,
  getCanvasConstraintValue,
  getCanvasSizeMode,
  getCanvasSizingValue,
} from '../utils/element/canvas-sizing.util';
import { normalizeCanvasShadowValue } from '../utils/element/canvas-shadow.util';
import { resolveCanvasEffect } from '../utils/element/canvas-effect.util';
import { collectFrameSubtree, syncBreakpointElements } from './canvas-breakpoint.mapper';

const ROOT_ROLE = 'canvas-root';
const ROOT_TYPE = 'Container';
const DEFAULT_STROKE_WIDTH = 1;

const DEFAULT_ELEMENT_SIZE = {
  text: { width: 150, height: 40 },
  generic: { width: 100, height: 100 },
} as const;

export function buildCanvasIR(
  elements: CanvasElement[],
  projectId: string,
  pageName?: string,
): IRNode {
  const rootId = `canvas-${projectId}`;
  const nodesById = createNodeIndex(elements);
  const rootChildren = resolveRootChildren(elements, nodesById, rootId);

  return createRootNode(projectId, rootId, rootChildren, pageName);
}

export function buildCanvasIRPages(
  pages: CanvasPageModel[],
  projectId: string,
): ConverterPageRequest[] {
  const requests: ConverterPageRequest[] = [];

  for (const page of pages) {
    if (page.elements.length === 0) continue;

    const visibleElements = page.elements.filter((e) => e.visible !== false);
    const rootFrames = visibleElements.filter((e) => e.type === 'frame' && !e.parentId);

    if (rootFrames.length > 0) {
      const primaryFrame = rootFrames.find((f) => f.isPrimary) ?? rootFrames[0];
      const primaryElements = collectFrameSubtree(primaryFrame.id, visibleElements);

      requests.push({
        viewportWidth: primaryFrame.width,
        pageName: page.name,
        ir: buildCanvasIR(primaryElements, projectId, page.name),
      });

      for (const frame of rootFrames) {
        if (frame.id === primaryFrame.id) continue;

        const frameElements = collectFrameSubtree(frame.id, visibleElements);
        const syncedElements = syncBreakpointElements(
          frameElements,
          frame.id,
          primaryFrame,
          primaryElements,
        );
        requests.push({
          viewportWidth: frame.width,
          pageName: page.name,
          ir: buildCanvasIR(syncedElements, projectId, page.name),
        });
      }
    } else {
      requests.push({
        viewportWidth: page.viewportWidth ?? 1280,
        pageName: page.name,
        ir: buildCanvasIR(visibleElements, projectId, page.name),
      });
    }
  }

  return requests.sort((a, b) => b.viewportWidth - a.viewportWidth);
}

function createNodeIndex(elements: CanvasElement[]): Map<string, IRNode> {
  const nodesById = new Map<string, IRNode>();

  const parentById = new Map<string, CanvasElement>();
  for (const element of elements) {
    if (element.parentId) {
      const parent = elements.find((e) => e.id === element.parentId);
      if (parent) parentById.set(element.id, parent);
    }
  }

  for (const element of elements) {
    nodesById.set(element.id, mapCanvasElementToIR(element, parentById.get(element.id)));
  }

  return nodesById;
}

function resolveRootChildren(
  elements: CanvasElement[],
  nodesById: Map<string, IRNode>,
  rootId: string,
): IRNode[] {
  const rootChildren: IRNode[] = [];

  for (const element of elements) {
    const currentNode = nodesById.get(element.id);
    if (!currentNode) {
      continue;
    }

    const parentId = element.parentId;
    if (!parentId || parentId === rootId || parentId === element.id) {
      rootChildren.push(currentNode);
      continue;
    }

    const parentNode = nodesById.get(parentId);
    if (!parentNode) {
      rootChildren.push(currentNode);
      continue;
    }

    parentNode.children.push(currentNode);
  }

  return rootChildren;
}

function createRootNode(
  projectId: string,
  rootId: string,
  children: IRNode[],
  pageName?: string,
): IRNode {
  return {
    id: rootId,
    type: ROOT_TYPE,
    props: {
      projectId,
      role: ROOT_ROLE,
      ...(pageName ? { pageName } : {}),
    },
    layout: {
      mode: 'Flex' satisfies LayoutMode,
      direction: 'Column',
    },
    style: {
      width: { value: 100, unit: '%' },
      height: { value: 100, unit: '%' },
    },
    variants: {},
    meta: { hidden: false },
    children,
  };
}

function mapCanvasElementToIR(element: CanvasElement, parent?: CanvasElement): IRNode {
  const primitiveType = mapElementType(element.type);

  return {
    id: element.id,
    type: primitiveType,
    props: buildNodeProps(element, primitiveType),
    layout: buildNodeLayout(element),
    style: buildNodeStyle(element),
    position: buildNodePosition(element, parent),
    effects: buildNodeEffects(element),
    meta: buildNodeMeta(element),
    variants: {},
    children: [],
  };
}

function buildNodeLayout(element: CanvasElement): IRLayout | undefined {
  const isText = element.type === 'text';
  const textVA = isText ? (element.textVerticalAlign ?? 'top') : null;
  const needsFlexForVA = textVA !== null && textVA !== 'top';

  if (!element.display && !needsFlexForVA) return undefined;

  const mode: LayoutMode = element.display ? mapDisplayMode(element.display) : 'Flex';
  const layout: IRLayout = { mode };

  if (element.display === 'flex') {
    if (element.flexDirection) layout.direction = mapFlexDirection(element.flexDirection);
    if (element.flexWrap !== undefined) layout.wrap = element.flexWrap === 'wrap';
    if (element.justifyContent) layout.justify = mapJustifyContent(element.justifyContent);
    layout.align = mapAlignItems(element.alignItems ?? 'flex-start');
    if (typeof element.gap === 'number') layout.gap = px(element.gap);
  }
  if (element.display === 'grid') {
    const gridColumns = resolveGridTrackCount(element.gridTemplateColumns);
    const gridRows = resolveGridTrackCount(element.gridTemplateRows);

    if (gridColumns !== undefined) layout.columns = gridColumns;
    if (gridRows !== undefined) layout.rows = gridRows;
    if (element.gridTemplateColumns) layout.gridTemplateColumns = element.gridTemplateColumns;
    if (element.gridTemplateRows) layout.gridTemplateRows = element.gridTemplateRows;

    const gapX = typeof element.gapX === 'number' ? element.gapX : element.gap;
    const gapY = typeof element.gapY === 'number' ? element.gapY : element.gap;

    if (typeof gapX === 'number' && typeof gapY === 'number') {
      if (gapX === gapY) {
        layout.gap = px(gapX);
      } else {
        layout.columnGap = px(gapX);
        layout.rowGap = px(gapY);
      }
    } else if (typeof element.gap === 'number') {
      layout.gap = px(element.gap);
    }
  }

  if (needsFlexForVA && textVA !== null) {
    layout.align ??= textVA === 'bottom' ? 'End' : 'Center';
    if (element.textAlign === 'center') layout.justify ??= 'Center';
    else if (element.textAlign === 'right') layout.justify ??= 'End';
  }

  return layout;
}

function buildNodePosition(element: CanvasElement, parent?: CanvasElement): IRPosition {
  const parentBorderLeftWidth = resolveCanvasBorderSideWidth(parent, 'left');
  const parentBorderTopWidth = resolveCanvasBorderSideWidth(parent, 'top');

  if (!element.position) {
    if (parent?.display) {
      return { mode: 'Flow' };
    }
    return {
      mode: 'Absolute',
      left: px(element.x - parentBorderLeftWidth),
      top: px(element.y - parentBorderTopWidth),
    };
  }
  const mode = mapPositionMode(element.position);
  const pos: IRPosition = { mode };
  if (element.position === 'absolute' || element.position === 'fixed') {
    pos.left = px(element.x - parentBorderLeftWidth);
    pos.top = px(element.y - parentBorderTopWidth);
  }
  if (element.position === 'sticky') {
    pos.top = px(element.y);
  }
  return pos;
}

function buildNodeMeta(element: CanvasElement): IRMeta {
  return {
    name: element.name || undefined,
    hidden: element.visible === false,
  };
}

function buildNodeEffects(element: CanvasElement): IREffect[] | undefined {
  if (!element.effects?.length) return undefined;
  return element.effects.map((effect) => {
    const e = resolveCanvasEffect(effect);

    return {
      preset: e.preset,
      trigger: e.trigger,
      opacity: e.opacity,
      scale: e.scale,
      rotate: e.rotate,
      rotationMode: e.rotationMode,
      skewX: e.skewX,
      skewY: e.skewY,
      offsetX: e.offsetX,
      offsetY: e.offsetY,
      fill: e.fill,
      shadow: e.shadow,
      duration: e.duration,
      delay: e.delay,
      iterations: String(e.iterations),
      easing: e.easing,
      direction: e.direction,
      fillMode: e.fillMode,
      offScreenBehavior: e.offScreenBehavior,
    };
  });
}

function buildNodeStyle(element: CanvasElement): IRStyle {
  const style: IRStyle = {};
  applyNodeDimensionStyle(style, element, 'width');
  applyNodeDimensionStyle(style, element, 'height');
  applyNodeConstraintStyle(style, element, 'minWidth');
  applyNodeConstraintStyle(style, element, 'maxWidth');
  applyNodeConstraintStyle(style, element, 'minHeight');
  applyNodeConstraintStyle(style, element, 'maxHeight');

  if (element.fill && element.fillMode !== 'image' && element.fillMode !== 'gradient') {
    if (element.type === 'text') {
      style.color = element.fill;
    } else {
      style.background = element.fill;
    }
  }

  if (element.fillMode === 'gradient' && element.gradient) {
    if (element.type === 'text') {
      style.background = gradientToCss(element.gradient);
      style.backgroundClip = 'text';
      style.color = 'transparent';
    } else {
      style.background = gradientToCss(element.gradient);
    }
    style.gradient = {
      type: element.gradient.type,
      angle:
        'angle' in element.gradient ? (element.gradient as { angle: number }).angle : undefined,
      stops: element.gradient.stops.map((s) => ({ color: s.color, position: s.position })),
    };
  }

  if (element.fillMode === 'image' && element.backgroundImage) {
    style.backgroundImage = `url(${element.backgroundImage})`;
    if (element.backgroundSize) {
      style.backgroundSize = element.backgroundSize;
    }
    if (element.backgroundPosition) {
      style.backgroundPosition = element.backgroundPosition;
    }
    if (element.backgroundRepeat) {
      style.backgroundRepeat = element.backgroundRepeat;
    }
    if (element.objectFit) {
      style.objectFit = element.objectFit;
    }
  }

  if (element.stroke) {
    const strokeWidths = element.strokeWidths;
    const hasPerSideStrokeWidths =
      strokeWidths !== undefined &&
      Object.values(strokeWidths).some((value) => Math.max(0, value) > 0);

    if (hasPerSideStrokeWidths && strokeWidths) {
      style.border = {
        color: element.stroke,
        style: (element.strokeStyle as BorderStyle | undefined) ?? 'Solid',
        topWidth: px(Math.max(0, strokeWidths.top)),
        rightWidth: px(Math.max(0, strokeWidths.right)),
        bottomWidth: px(Math.max(0, strokeWidths.bottom)),
        leftWidth: px(Math.max(0, strokeWidths.left)),
      } satisfies IRBorder;
    } else {
      const strokeWidth =
        typeof element.strokeWidth === 'number'
          ? Math.max(0, element.strokeWidth)
          : DEFAULT_STROKE_WIDTH;

      if (strokeWidth > 0) {
        const sides = element.strokeSides;
        style.border = {
          width: px(strokeWidth),
          color: element.stroke,
          style: (element.strokeStyle as BorderStyle | undefined) ?? 'Solid',
          ...(sides
            ? { top: sides.top, right: sides.right, bottom: sides.bottom, left: sides.left }
            : {}),
        } satisfies IRBorder;
      }
    }
  }

  if (typeof element.opacity === 'number') {
    style.opacity = element.opacity;
  }

  if (element.blendMode && element.blendMode !== 'normal') {
    style.mixBlendMode = element.blendMode;
  }

  if (element.type === 'frame' || element.type === 'rectangle') {
    style.overflow = mapCanvasOverflowToIr(element.overflow ?? 'clip');
  }

  const shadowStr = normalizeCanvasShadowValue(element.shadow);
  if (shadowStr) {
    style.shadows = parseAllCanvasShadowLayers(shadowStr);
  }

  if (element.cssFilterOptions && element.cssFilterOptions.length > 0) {
    const filterParts: string[] = [];
    if (element.cssFilterOptions.includes('blur') && element.filterBlur != null)
      filterParts.push(`blur(${element.filterBlur}px)`);
    if (element.cssFilterOptions.includes('brightness') && element.filterBrightness != null)
      filterParts.push(`brightness(${element.filterBrightness}%)`);
    if (element.cssFilterOptions.includes('contrast') && element.filterContrast != null)
      filterParts.push(`contrast(${element.filterContrast}%)`);
    if (element.cssFilterOptions.includes('grayscale') && element.filterGrayscale != null)
      filterParts.push(`grayscale(${element.filterGrayscale}%)`);
    if (element.cssFilterOptions.includes('hueRotate') && element.filterHueRotate != null)
      filterParts.push(`hue-rotate(${element.filterHueRotate}deg)`);
    if (element.cssFilterOptions.includes('invert') && element.filterInvert != null)
      filterParts.push(`invert(${element.filterInvert}%)`);
    if (element.cssFilterOptions.includes('saturate') && element.filterSaturate != null)
      filterParts.push(`saturate(${element.filterSaturate}%)`);
    if (element.cssFilterOptions.includes('sepia') && element.filterSepia != null)
      filterParts.push(`sepia(${element.filterSepia}%)`);
    if (filterParts.length > 0) style.filter = filterParts.join(' ');
    if (element.cssFilterOptions.includes('backdropBlur') && element.filterBackdropBlur != null)
      style.backdropFilter = `blur(${element.filterBackdropBlur}px)`;
  }

  if (typeof element.cornerRadius === 'number') {
    style.borderRadius = px(element.cornerRadius);
  }

  if (element.cornerRadii) {
    style.borderTopLeftRadius = px(element.cornerRadii.topLeft);
    style.borderTopRightRadius = px(element.cornerRadii.topRight);
    style.borderBottomRightRadius = px(element.cornerRadii.bottomRight);
    style.borderBottomLeftRadius = px(element.cornerRadii.bottomLeft);
  }

  if (element.type === 'text') {
    if (element.fontSize) {
      style.fontSize = length(element.fontSize, element.fontSizeUnit ?? 'px');
    }

    style.fontFamily = element.fontFamily || 'Inter';

    if (typeof element.fontWeight === 'number') {
      style.fontWeight = element.fontWeight;
    }

    if (element.fontStyle) {
      style.fontStyle = element.fontStyle;
    }

    if (element.textAlign) {
      style.textAlign = element.textAlign;
    }

    if (typeof element.lineHeight === 'number') {
      style.lineHeight = length(element.lineHeight, element.lineHeightUnit ?? 'em');
    }

    if (typeof element.letterSpacing === 'number') {
      style.letterSpacing = length(element.letterSpacing, element.letterSpacingUnit ?? 'px');
    }

    if (element.backgroundColor) {
      style.backgroundColor = element.backgroundColor;
    }
    if (element.textShadow) {
      style.textShadow = element.textShadow;
    }
    if (element.textTransform && element.textTransform !== 'inherit') {
      style.textTransform = element.textTransform;
    }
    if (element.textBalance === true) {
      style.textWrap = 'balance';
    }

    const widthMode = element.widthMode ?? 'fixed';
    if (widthMode === 'fit-content') {
      style.whiteSpace = 'pre';
    } else {
      style.whiteSpace = 'pre-wrap';
      style.wordBreak = 'break-word';
    }
    if (element.textDecorationLine) {
      style.textDecorationLine = element.textDecorationLine;
      if (element.textDecorationColor) style.textDecorationColor = element.textDecorationColor;
      if (element.textDecorationStyle) style.textDecorationStyle = element.textDecorationStyle;
      if (element.textDecorationThickness != null) {
        const unit = element.textDecorationThicknessUnit ?? 'px';
        style.textDecorationThickness = `${element.textDecorationThickness}${unit}`;
      }
    }
  }

  if (element.padding) style.padding = buildIRSpacing(element.padding);
  if (element.margin) style.margin = buildIRSpacing(element.margin);

  if (element.cursor) style.cursor = element.cursor;

  const transform = buildCanvasElementTransform(element);
  if (transform) {
    style.transform = transform;
  }

  const transformOrigin = buildCanvasElementTransformOrigin(element);
  if (transformOrigin) {
    style.transformOrigin = transformOrigin;
  }

  const backfaceVisibility = buildCanvasElementBackfaceVisibility(element);
  if (backfaceVisibility) {
    style.backfaceVisibility = backfaceVisibility;
  }

  const transformStyle = buildCanvasElementTransformStyle(element);
  if (transformStyle) {
    style.transformStyle = transformStyle;
  }

  return style;
}

function applyNodeDimensionStyle(
  style: IRStyle,
  element: CanvasElement,
  axis: 'width' | 'height',
): void {
  const mode = getCanvasSizeMode(element, axis);
  const sizingValue = getCanvasSizingValue(element, axis);

  if (mode === 'fit-content') {
    style[axis] = { value: 0, unit: 'fit-content' };
    return;
  }

  if (mode === 'fixed' || mode === 'fit-image') {
    const base = axis === 'width' ? element.width : element.height;
    style[axis] = px(base);
    return;
  }

  if (mode === 'fill') {
    style[axis] = length(100, '%');
    return;
  }

  if (mode === 'relative') {
    style[axis] = length(sizingValue ?? 100, '%');
    return;
  }

  style[axis] = length(sizingValue ?? 100, axis === 'width' ? 'vw' : 'vh');
}

function applyNodeConstraintStyle(
  style: IRStyle,
  element: CanvasElement,
  field: 'minWidth' | 'maxWidth' | 'minHeight' | 'maxHeight',
): void {
  const pixels = getCanvasConstraintValue(element, field);
  if (!Number.isFinite(pixels ?? Number.NaN)) {
    return;
  }

  const mode = getCanvasConstraintMode(element, field);
  if (mode === 'relative') {
    style[field] = length(getCanvasConstraintSizingValue(element, field) ?? 100, '%');
    return;
  }

  style[field] = px(pixels as number);
}

function buildNodeProps(element: CanvasElement, primitiveType: string): Record<string, unknown> {
  const props: Record<string, unknown> = {
    ...(element.irMeta?.props ?? {}),
    primitive: true,
  };
  const hasLink = hasCanvasElementLink(element);
  const tag = normalizeStoredCanvasTag(element.type, element.tag, hasLink);
  const ariaLabel = normalizeCanvasAccessibilityLabel(element.ariaLabel);
  const imageAltText = normalizeCanvasAccessibilityLabel(element.imageAltText);
  const accessibleLabel = element.fillMode === 'image' ? (imageAltText ?? ariaLabel) : ariaLabel;

  if (element.type === 'text') {
    props['content'] = element.text ?? '';
  }

  if (element.type === 'image') {
    props['src'] = element.imageUrl ?? '';
  }

  if (element.type === 'svg') {
    props['svgContent'] = element.svgContent ?? '';
  }

  if (element.irMeta?.type && element.irMeta.type !== primitiveType) {
    props['sourceType'] = element.irMeta.type;
  }

  if (typeof element.name === 'string') {
    props['name'] = element.name;
  }

  if (tag) {
    props['tag'] = tag;
  }

  if (accessibleLabel) {
    if (element.type === 'image') {
      props['alt'] = accessibleLabel;
    } else {
      props['ariaLabel'] = accessibleLabel;
    }
  }

  if (element.linkType === 'page' && typeof element.linkPageId === 'string') {
    const linkPageId = element.linkPageId.trim();
    if (linkPageId.length > 0) {
      props['linkType'] = 'page';
      props['linkPageId'] = linkPageId;
      props['href'] = `#${linkPageId}`;
    }
  }

  if (element.linkType === 'url') {
    const href = normalizeExternalLinkUrl(element.linkUrl);
    if (href) {
      props['linkType'] = 'url';
      props['href'] = href;
      props['target'] = '_blank';
    }
  }

  return props;
}

function mapElementType(type: CanvasElement['type']): IRNodeType {
  switch (type) {
    case 'frame':
      return 'Frame';
    case 'rectangle':
      return 'Container';
    case 'text':
      return 'Text';
    case 'image':
      return 'Image';
    case 'svg':
      return 'Svg';
    default:
      return 'Frame';
  }
}

function buildIRSpacing(s: CanvasSpacing): IRSpacing {
  return { top: px(s.top), right: px(s.right), bottom: px(s.bottom), left: px(s.left) };
}

function mapDisplayMode(display: CanvasDisplayMode): LayoutMode {
  switch (display) {
    case 'block':
      return 'Block';
    case 'flex':
      return 'Flex';
    case 'grid':
      return 'Grid';
  }
}

function mapFlexDirection(dir: CanvasFlexDirection): FlexDirection {
  switch (dir) {
    case 'row':
      return 'Row';
    case 'column':
      return 'Column';
    case 'row-reverse':
      return 'RowReverse';
    case 'column-reverse':
      return 'ColumnReverse';
  }
}

function mapJustifyContent(jc: CanvasJustifyContent): JustifyContent {
  switch (jc) {
    case 'flex-start':
      return 'Start';
    case 'flex-end':
      return 'End';
    case 'center':
      return 'Center';
    case 'space-between':
      return 'SpaceBetween';
    case 'space-around':
      return 'SpaceAround';
    case 'space-evenly':
      return 'SpaceEvenly';
  }
}

function mapAlignItems(ai: CanvasAlignItems): AlignItems {
  switch (ai) {
    case 'flex-start':
      return 'Start';
    case 'flex-end':
      return 'End';
    case 'center':
      return 'Center';
    case 'stretch':
      return 'Stretch';
    case 'baseline':
      return 'Baseline';
  }
}

function resolveGridTrackCount(template: string | undefined): number | undefined {
  const normalized = template?.trim();
  if (!normalized) {
    return undefined;
  }

  const repeatMatch = normalized.match(/^repeat\(\s*(\d+)\s*,/i);
  if (repeatMatch) {
    return Math.max(1, Number.parseInt(repeatMatch[1], 10));
  }

  const tracks = splitGridTrackTemplate(normalized);
  return tracks.length > 0 ? tracks.length : undefined;
}

function splitGridTrackTemplate(template: string): string[] {
  const tracks: string[] = [];
  let depth = 0;
  let token = '';

  for (const char of template.trim()) {
    if (char === '(') {
      depth++;
      token += char;
      continue;
    }

    if (char === ')') {
      depth = Math.max(0, depth - 1);
      token += char;
      continue;
    }

    if (/\s/.test(char) && depth === 0) {
      if (token.trim().length > 0) {
        tracks.push(token.trim());
        token = '';
      }
      continue;
    }

    token += char;
  }

  if (token.trim().length > 0) {
    tracks.push(token.trim());
  }

  return tracks;
}

function mapPositionMode(pos: CanvasPositionMode): PositionMode {
  switch (pos) {
    case 'static':
      return 'Flow';
    case 'relative':
      return 'Relative';
    case 'absolute':
      return 'Absolute';
    case 'fixed':
      return 'Fixed';
    case 'sticky':
      return 'Sticky';
  }
}

function mapCanvasOverflowToIr(value: 'clip' | 'visible' | 'hidden' | 'scroll'): OverflowMode {
  switch (value) {
    case 'visible':
      return 'Visible';
    case 'hidden':
      return 'Hidden';
    case 'scroll':
      return 'Scroll';
    case 'clip':
    default:
      return 'Clip';
  }
}

function resolveCanvasBorderSideWidth(
  element: CanvasElement | undefined,
  side: keyof CanvasBorderWidths,
): number {
  if (!element?.stroke) {
    return 0;
  }

  if (element.strokeWidths) {
    return Math.max(0, element.strokeWidths[side]);
  }

  if (element.strokeSides && !element.strokeSides[side]) {
    return 0;
  }

  return typeof element.strokeWidth === 'number'
    ? Math.max(0, element.strokeWidth)
    : DEFAULT_STROKE_WIDTH;
}

function normalizeExternalLinkUrl(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }

  if (
    normalized.startsWith('/') ||
    normalized.startsWith('#') ||
    normalized.startsWith('//') ||
    /^[a-z][a-z0-9+.-]*:/i.test(normalized)
  ) {
    return normalized;
  }

  return `https://${normalized}`;
}

const SHADOW_LAYER_PATTERN =
  /^(inset\s+)?(-?(?:\d+|\d*\.\d+))px\s+(-?(?:\d+|\d*\.\d+))px\s+((?:\d+|\d*\.\d+))px\s+(-?(?:\d+|\d*\.\d+))px\s+(.+)$/i;

function parseAllCanvasShadowLayers(shadowStr: string): IRShadow[] {
  const layers = shadowStr.split(/,(?![^(]*\))/).map((s) => s.trim());
  const results: IRShadow[] = [];

  for (const layer of layers) {
    if (!layer) continue;
    const match = SHADOW_LAYER_PATTERN.exec(layer);
    if (!match) continue;

    results.push({
      inset: !!match[1],
      x: parseFloat(match[2]),
      y: parseFloat(match[3]),
      blur: Math.max(0, parseFloat(match[4])),
      spread: parseFloat(match[5]),
      color: match[6].trim(),
    });
  }

  return results;
}
