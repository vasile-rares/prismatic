import {
  CanvasAlignItems,
  CanvasBlendMode,
  CanvasBorderSides,
  CanvasBorderWidths,
  CanvasCornerRadii,
  CanvasDisplayMode,
  CanvasEffect,
  CanvasEffectTrigger,
  CanvasElement,
  CanvasFlexDirection,
  CanvasFlexWrap,
  CanvasFontSizeUnit,
  CanvasJustifyContent,
  CanvasLinkType,
  CanvasPositionMode,
  CanvasSizeMode,
  CanvasSpacing,
  CanvasTextSpacingUnit,
  GradientFill,
  IRBorder,
  IRGradient,
  IRLayout,
  IRLength,
  IRNode,
  IRShadow,
  IRSpacing,
  IRStyle,
} from '@app/core';
import {
  hasCanvasElementLink,
  normalizeCanvasAccessibilityLabel,
  normalizeStoredCanvasTag,
} from '../utils/element/canvas-accessibility.util';
import { buildCanvasShadowCss } from '../utils/element/canvas-shadow.util';
import { resolveCanvasEffect } from '../utils/element/canvas-effect.util';
import { parseCanvasTransformStyle } from '../utils/element/canvas-transform.util';

const DEFAULT_POSITION = 24;
const DEFAULT_FILL = 'transparent';
const DEFAULT_FRAME_FILL = '#3f3f46';
const DEFAULT_IMAGE_RADIUS = 6;
const DEFAULT_OPACITY = 1;
const DEFAULT_STROKE_WIDTH = 1;

const DEFAULT_ELEMENT_SIZE = {
  text: { width: 150, height: 40 },
  generic: { width: 100, height: 100 },
} as const;

const MANAGED_PROP_KEYS = [
  'content',
  'src',
  'svgContent',
  'name',
  'primitive',
  'sourceType',
  'tag',
  'ariaLabel',
  'alt',
  'href',
  'target',
  'linkType',
  'linkPageId',
] as const;

export function buildCanvasElementsFromIR(root: IRNode | null | undefined): CanvasElement[] {
  if (!root || !Array.isArray(root.children)) {
    return [];
  }

  const flattened: CanvasElement[] = [];

  const rootElement = mapIRNodeToCanvasElement(root);
  rootElement.parentId = null;
  flattened.push(rootElement);

  for (const child of root.children) {
    flattenIRNode(child, root.id, flattened, root);
  }

  return flattened;
}

function mapIRNodeToCanvasElement(node: IRNode): CanvasElement {
  const mappedType = mapIRType(node.type);
  const isImageNode = node.type === 'Image';
  const defaults = mappedType === 'text' ? DEFAULT_ELEMENT_SIZE.text : DEFAULT_ELEMENT_SIZE.generic;
  const linkType = readLinkTypeFromProps(node.props);
  const importedTag = readOptionalStringProp(node.props, 'tag');
  const importedWidthMode = readSizeModeFromLength(node.style?.width);
  const importedHeightMode = readSizeModeFromLength(node.style?.height);
  const importedAriaLabel =
    mappedType === 'image' || isImageNode
      ? (readOptionalStringProp(node.props, 'alt') ??
        readOptionalStringProp(node.props, 'ariaLabel'))
      : readOptionalStringProp(node.props, 'ariaLabel');
  const defaultCornerRadius = mappedType === 'image' || isImageNode ? DEFAULT_IMAGE_RADIUS : 0;
  const cornerRadius =
    mappedType !== 'text'
      ? resolveImportedCornerRadius(node.style, defaultCornerRadius)
      : undefined;
  const cornerRadii =
    mappedType !== 'text'
      ? readCornerRadii(node.style, cornerRadius ?? defaultCornerRadius)
      : undefined;

  const preservedProps = removeManagedProps(node.props);
  const transformFields = parseCanvasTransformStyle(node.style);

  const effectiveWidthMode =
    importedWidthMode === 'fixed' &&
    mappedType !== 'text' &&
    node.style?.width?.unit === 'px' &&
    node.style.width.value === 0
      ? 'fill'
      : importedWidthMode;

  return {
    id: node.id,
    type: mappedType,
    name: node.meta?.name ?? readOptionalStringProp(node.props, 'name'), // prefer descriptive name from AI meta
    x: readLength(node.position?.left, DEFAULT_POSITION),
    y: readLength(node.position?.top, DEFAULT_POSITION),
    width:
      effectiveWidthMode === 'fixed'
        ? Math.max(1, readLength(node.style?.width, defaults.width))
        : defaults.width,
    widthMode: effectiveWidthMode === 'fixed' ? undefined : effectiveWidthMode,
    widthSizingValue: readImportedSizeValue(node.style?.width, effectiveWidthMode),
    minWidth: readOptionalLength(node.style?.minWidth),
    minWidthMode: readConstraintModeFromLength(node.style?.minWidth),
    minWidthSizingValue: readImportedConstraintValue(node.style?.minWidth),
    maxWidth:
      node.style?.maxWidth?.unit === 'px' && importedWidthMode !== 'fixed'
        ? undefined
        : readOptionalLength(node.style?.maxWidth),
    maxWidthMode:
      node.style?.maxWidth?.unit === 'px' && importedWidthMode !== 'fixed'
        ? undefined
        : readConstraintModeFromLength(node.style?.maxWidth),
    maxWidthSizingValue: readImportedConstraintValue(node.style?.maxWidth),
    height:
      mappedType === 'text'
        ? defaults.height
        : importedHeightMode === 'fixed'
          ? Math.max(
              1,
              readLength(
                node.style?.height,
                readLength(
                  node.style?.minHeight?.unit === 'px' ? node.style?.minHeight : undefined,
                  defaults.height,
                ),
              ),
            )
          : defaults.height,
    heightMode:
      mappedType === 'text'
        ? 'fit-content'
        : importedHeightMode === 'fixed'
          ? undefined
          : importedHeightMode,
    heightSizingValue: readImportedSizeValue(node.style?.height, importedHeightMode),
    minHeight: readOptionalLength(node.style?.minHeight),
    minHeightMode: readConstraintModeFromLength(node.style?.minHeight),
    minHeightSizingValue: readImportedConstraintValue(node.style?.minHeight),
    maxHeight: readOptionalLength(node.style?.maxHeight),
    maxHeightMode: readConstraintModeFromLength(node.style?.maxHeight),
    maxHeightSizingValue: readImportedConstraintValue(node.style?.maxHeight),
    visible: !(node.meta?.hidden ?? false),
    fill:
      mappedType !== 'text'
        ? (node.style?.gradient?.stops[0]?.color ??
          node.style?.background ??
          (mappedType === 'frame' ? DEFAULT_FRAME_FILL : DEFAULT_FILL))
        : (node.style?.color ?? '#000000'),
    stroke: node.style?.border?.color,
    strokeWidth:
      mappedType !== 'text'
        ? resolveImportedBorderWidth(node.style?.border, DEFAULT_STROKE_WIDTH)
        : undefined,
    strokeStyle: mappedType !== 'text' ? (node.style?.border?.style ?? 'Solid') : undefined,
    strokeSides: mappedType !== 'text' ? readImportedBorderSides(node.style?.border) : undefined,
    strokeWidths: mappedType !== 'text' ? readImportedBorderWidths(node.style?.border) : undefined,
    opacity: readNumber(node.style?.opacity, DEFAULT_OPACITY),
    blendMode: readBlendMode(node.style?.mixBlendMode),
    cornerRadius,
    cornerRadii,
    overflow:
      mappedType === 'frame' || mappedType === 'rectangle'
        ? (() => {
            const ov = readOverflow(node.style?.overflow, 'visible');
            if ((ov === 'clip' || ov === 'hidden') && !((cornerRadius ?? 0) > 0)) {
              return 'visible';
            }
            return ov;
          })()
        : undefined,
    fillMode: node.style?.gradient
      ? 'gradient'
      : isImageNode || node.style?.backgroundImage
        ? 'image'
        : undefined,
    gradient: node.style?.gradient ? mapIRGradientToCanvas(node.style.gradient) : undefined,
    backgroundImage: isImageNode
      ? readStringProp(node.props, 'src', '')
      : readBackgroundImageUrl(node.style?.backgroundImage),
    backgroundSize: isImageNode
      ? (node.style?.backgroundSize ?? 'cover')
      : node.style?.backgroundSize,
    backgroundPosition: isImageNode
      ? (node.style?.backgroundPosition ?? 'center')
      : node.style?.backgroundPosition,
    backgroundRepeat: isImageNode
      ? (node.style?.backgroundRepeat ?? 'no-repeat')
      : node.style?.backgroundRepeat,
    objectFit: node.style?.objectFit as CanvasElement['objectFit'],
    imageAltText:
      isImageNode || node.style?.backgroundImage
        ? normalizeCanvasAccessibilityLabel(importedAriaLabel)
        : undefined,
    shadow: readShadow(node.style?.shadows),
    text:
      mappedType === 'text'
        ? readStringPropAny(node.props, ['content', 'text'], 'New text')
        : undefined,
    fontSize: mappedType === 'text' ? readLength(node.style?.fontSize, 16) : undefined,
    fontSizeUnit:
      mappedType === 'text'
        ? readLengthUnit<CanvasFontSizeUnit>(node.style?.fontSize, 'px', ['px', 'rem'])
        : undefined,
    fontFamily:
      mappedType === 'text'
        ? (readOptionalStringStyle(node.style, 'fontFamily') ?? 'Inter')
        : undefined,
    fontWeight: mappedType === 'text' ? readNumber(node.style?.fontWeight, 400) : undefined,
    fontStyle: mappedType === 'text' ? readFontStyleFromStyle(node.style) : undefined,
    textAlign: mappedType === 'text' ? readTextAlign(node.style?.textAlign, 'center') : undefined,
    textVerticalAlign:
      mappedType === 'text' ? readTextVerticalAlignFromLayout(node.layout, 'middle') : undefined,
    letterSpacing: mappedType === 'text' ? readLength(node.style?.letterSpacing, 0) : undefined,
    letterSpacingUnit:
      mappedType === 'text'
        ? readLengthUnit<CanvasTextSpacingUnit>(node.style?.letterSpacing, 'px', ['px', 'em'])
        : undefined,
    lineHeight: mappedType === 'text' ? readLength(node.style?.lineHeight, 1.2) : undefined,
    lineHeightUnit:
      mappedType === 'text'
        ? readLengthUnit<CanvasTextSpacingUnit>(node.style?.lineHeight, 'em', ['px', 'em'])
        : undefined,
    imageUrl: mappedType === 'image' ? readStringProp(node.props, 'src', '') : undefined,
    svgContent: mappedType === 'svg' ? readStringProp(node.props, 'svgContent', '') : undefined,
    linkType,
    linkPageId: readOptionalStringProp(node.props, 'linkPageId') ?? undefined,
    linkUrl: readOptionalStringProp(node.props, 'href') ?? undefined,
    tag: normalizeStoredCanvasTag(mappedType, importedTag, linkType !== undefined),
    ariaLabel: normalizeCanvasAccessibilityLabel(importedAriaLabel),
    cursor: (readOptionalStringStyle(node.style, 'cursor') as CanvasElement['cursor']) ?? undefined,
    display: mappedType !== 'text' ? readDisplayMode(node.layout) : undefined,
    flexDirection: mappedType !== 'text' ? readFlexDirection(node.layout?.direction) : undefined,
    flexWrap: mappedType !== 'text' ? readFlexWrap(node.layout?.wrap) : undefined,
    justifyContent: mappedType !== 'text' ? readJustifyContent(node.layout?.justify) : undefined,
    alignItems: mappedType !== 'text' ? readAlignItems(node.layout?.align) : undefined,
    gap: mappedType !== 'text' ? readLength(node.layout?.gap, 0) || undefined : undefined,
    gapX: mappedType !== 'text' ? readLength(node.layout?.columnGap, 0) || undefined : undefined,
    gapY: mappedType !== 'text' ? readLength(node.layout?.rowGap, 0) || undefined : undefined,
    gridTemplateColumns: mappedType !== 'text' ? node.layout?.gridTemplateColumns : undefined,
    gridTemplateRows: mappedType !== 'text' ? node.layout?.gridTemplateRows : undefined,
    padding: readSpacing(node.style?.padding),
    margin: readSpacing(node.style?.margin),
    position: readPositionMode(node.position?.mode),
    effects: readNodeEffects(node),
    ...transformFields,
    irMeta: {
      type: node.type,
      props: preservedProps,
      style: node.style ? { ...node.style } : undefined,
    },
  };
}

function mapIRType(type: string): CanvasElement['type'] {
  switch (type) {
    case 'Frame':
      return 'frame';
    case 'Container':
      return 'rectangle';
    case 'Text':
    case 'Heading':
    case 'Link':
      return 'text';
    case 'Image':
      return 'rectangle';
    case 'Svg':
      return 'svg';
    default:
      return 'rectangle';
  }
}

function flattenIRNode(
  node: IRNode,
  parentId: string | null,
  target: CanvasElement[],
  parentNode?: IRNode,
) {
  const mapped = mapIRNodeToCanvasElement(node);
  mapped.parentId = parentId;

  if (parentNode?.style?.border) {
    mapped.x += readImportedBorderSideWidth(parentNode.style.border, 'left');
    mapped.y += readImportedBorderSideWidth(parentNode.style.border, 'top');
  }

  target.push(mapped);

  if (!Array.isArray(node.children)) {
    return;
  }

  for (const child of node.children) {
    flattenIRNode(child, node.id, target, node);
  }
}

function readNodeEffects(node: IRNode): CanvasEffect[] | undefined {
  if (!node.effects?.length) return undefined;
  return node.effects.map((e) =>
    resolveCanvasEffect({
      preset: e.preset as CanvasEffect['preset'],
      trigger: (e.trigger ?? 'onLoad') as CanvasEffectTrigger,
      opacity: e.opacity,
      scale: e.scale,
      rotate: e.rotate,
      rotationMode: (e.rotationMode ?? '2d') as CanvasEffect['rotationMode'],
      skewX: e.skewX,
      skewY: e.skewY,
      offsetX: e.offsetX,
      offsetY: e.offsetY,
      fill: e.fill,
      shadow: e.shadow,
      duration: e.duration ?? 500,
      delay: e.delay ?? 0,
      iterations: e.iterations === 'infinite' ? 'infinite' : Number(e.iterations) || 1,
      easing: (e.easing ?? 'ease') as CanvasEffect['easing'],
      direction: (e.direction ?? 'normal') as CanvasEffect['direction'],
      fillMode: (e.fillMode ?? 'forwards') as CanvasEffect['fillMode'],
      offScreenBehavior: (e.offScreenBehavior ?? 'play') as CanvasEffect['offScreenBehavior'],
    }),
  );
}

function removeManagedProps(props: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!props) {
    return {};
  }

  const clone: Record<string, unknown> = { ...props };
  for (const key of MANAGED_PROP_KEYS) {
    delete clone[key];
  }

  return clone;
}

function readLength(len: IRLength | undefined, fallback: number): number {
  if (!len) {
    return fallback;
  }
  return Number.isFinite(len.value) ? len.value : fallback;
}

function readOptionalLength(len: IRLength | undefined): number | undefined {
  return Number.isFinite(len?.value ?? Number.NaN) ? len?.value : undefined;
}

function readConstraintModeFromLength(len: IRLength | undefined): 'fixed' | 'relative' | undefined {
  if (!len) {
    return undefined;
  }

  return len.unit === '%' ? 'relative' : 'fixed';
}

function readImportedConstraintValue(len: IRLength | undefined): number | undefined {
  if (!len || len.unit !== '%') {
    return undefined;
  }

  return Number.isFinite(len.value) ? len.value : undefined;
}

function readSizeModeFromLength(styleLength: IRLength | undefined): CanvasSizeMode {
  if (styleLength) {
    if (styleLength.unit === 'fit-content') return 'fit-content';
    if (styleLength.unit === '%') return styleLength.value === 100 ? 'fill' : 'relative';
    if (styleLength.unit === 'vw' || styleLength.unit === 'vh') return 'viewport';
  }
  return 'fixed';
}

function readImportedSizeValue(
  len: IRLength | undefined,
  mode: CanvasSizeMode,
): number | undefined {
  if (mode === 'fixed' || mode === 'fit-content' || mode === 'fit-image') {
    return undefined;
  }

  if (mode === 'fill') {
    return 100;
  }

  return Number.isFinite(len?.value ?? Number.NaN) ? len?.value : undefined;
}

function readImportedBorderSideWidth(
  border: IRBorder,
  side: 'top' | 'right' | 'bottom' | 'left',
): number {
  const specificWidth = border[`${side}Width` as keyof IRBorder] as IRLength | undefined;
  if (specificWidth) return readLength(specificWidth, 0);
  const uniform = border.width ? readLength(border.width, 0) : 0;
  const enabled = border[side as keyof IRBorder] as boolean | undefined;
  return enabled === false ? 0 : uniform;
}

function readImportedBorderWidths(border: IRBorder | undefined): CanvasBorderWidths | undefined {
  if (!border) {
    return undefined;
  }

  const hasSpecificWidths =
    border.topWidth !== undefined ||
    border.rightWidth !== undefined ||
    border.bottomWidth !== undefined ||
    border.leftWidth !== undefined;

  if (!hasSpecificWidths) {
    return undefined;
  }

  return {
    top: readLength(border.topWidth, 0),
    right: readLength(border.rightWidth, 0),
    bottom: readLength(border.bottomWidth, 0),
    left: readLength(border.leftWidth, 0),
  };
}

function readImportedBorderSides(border: IRBorder | undefined): CanvasBorderSides | undefined {
  if (!border) {
    return undefined;
  }

  const widths = readImportedBorderWidths(border);
  const hasSpecificSides =
    border.top !== undefined ||
    border.right !== undefined ||
    border.bottom !== undefined ||
    border.left !== undefined;

  if (!hasSpecificSides && !widths) {
    return undefined;
  }

  return {
    top: border.top ?? (widths?.top ?? 0) > 0,
    right: border.right ?? (widths?.right ?? 0) > 0,
    bottom: border.bottom ?? (widths?.bottom ?? 0) > 0,
    left: border.left ?? (widths?.left ?? 0) > 0,
  };
}

function resolveImportedBorderWidth(
  border: IRBorder | undefined,
  fallback: number,
): number | undefined {
  if (!border) {
    return undefined;
  }

  if (border.width) {
    return readLength(border.width, fallback);
  }

  const widths = readImportedBorderWidths(border);
  if (!widths) {
    return fallback;
  }

  return [widths.top, widths.right, widths.bottom, widths.left].find((value) => value > 0) ?? 0;
}

function readCornerRadii(
  style: IRStyle | undefined,
  fallback: number,
): CanvasCornerRadii | undefined {
  if (!style) {
    return undefined;
  }

  const hasSpecificCornerRadius =
    style.borderTopLeftRadius !== undefined ||
    style.borderTopRightRadius !== undefined ||
    style.borderBottomRightRadius !== undefined ||
    style.borderBottomLeftRadius !== undefined;

  if (!hasSpecificCornerRadius) {
    return undefined;
  }

  return {
    topLeft: readLength(style.borderTopLeftRadius, fallback),
    topRight: readLength(style.borderTopRightRadius, fallback),
    bottomRight: readLength(style.borderBottomRightRadius, fallback),
    bottomLeft: readLength(style.borderBottomLeftRadius, fallback),
  };
}

function resolveImportedCornerRadius(style: IRStyle | undefined, fallback: number): number {
  if (!style) {
    return fallback;
  }

  if (style.borderRadius) {
    return readLength(style.borderRadius, fallback);
  }

  return readLength(
    style.borderTopLeftRadius ??
      style.borderTopRightRadius ??
      style.borderBottomRightRadius ??
      style.borderBottomLeftRadius,
    fallback,
  );
}

function readLengthUnit<TUnit extends string>(
  len: IRLength | undefined,
  fallback: TUnit,
  allowedUnits: readonly TUnit[],
): TUnit {
  if (!len || typeof len.unit !== 'string') {
    return fallback;
  }

  return allowedUnits.includes(len.unit as TUnit) ? (len.unit as TUnit) : fallback;
}

function readOptionalStringStyle(
  style: IRStyle | undefined,
  key: keyof IRStyle,
): string | undefined {
  const value = style?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readFontStyleFromStyle(style: IRStyle | undefined): 'normal' | 'italic' {
  return style?.fontStyle === 'italic' ? 'italic' : 'normal';
}

function readTextAlign(
  value: unknown,
  fallback: 'left' | 'center' | 'right' | 'justify',
): 'left' | 'center' | 'right' | 'justify' {
  return value === 'left' || value === 'center' || value === 'right' || value === 'justify'
    ? value
    : fallback;
}

function normEnum(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

function readDisplayMode(layout: IRLayout | undefined): CanvasDisplayMode | undefined {
  const v = normEnum(layout?.mode);
  if (v === 'flex') return 'flex';
  if (v === 'grid') return 'grid';
  if (v === 'block') return 'block';
  return undefined;
}

function readFlexDirection(dir: unknown): CanvasFlexDirection | undefined {
  const v = normEnum(dir);
  if (v === 'row') return 'row';
  if (v === 'column') return 'column';
  if (v === 'rowreverse') return 'row-reverse';
  if (v === 'columnreverse') return 'column-reverse';
  return undefined;
}

function readFlexWrap(wrap: boolean | undefined): CanvasFlexWrap | undefined {
  if (wrap === undefined) return undefined;
  return wrap ? 'wrap' : 'nowrap';
}

function readJustifyContent(jc: unknown): CanvasJustifyContent | undefined {
  const v = normEnum(jc);
  if (v === 'start') return 'flex-start';
  if (v === 'end') return 'flex-end';
  if (v === 'center') return 'center';
  if (v === 'spacebetween') return 'space-between';
  if (v === 'spacearound') return 'space-around';
  if (v === 'spaceevenly') return 'space-evenly';
  return undefined;
}

function readAlignItems(ai: unknown): CanvasAlignItems | undefined {
  const v = normEnum(ai);
  if (v === 'start') return 'flex-start';
  if (v === 'end') return 'flex-end';
  if (v === 'center') return 'center';
  if (v === 'stretch') return 'stretch';
  if (v === 'baseline') return 'baseline';
  return undefined;
}

function readPositionMode(mode: unknown): CanvasPositionMode | undefined {
  const v = normEnum(mode);
  if (v === 'relative' || v === 'flow') return 'relative';
  if (v === 'absolute') return 'absolute';
  if (v === 'fixed') return 'fixed';
  if (v === 'sticky') return 'sticky';
  if (v === 'static') return 'static';
  return undefined;
}

function readSpacing(spacing: IRSpacing | undefined): CanvasSpacing | undefined {
  if (!spacing) return undefined;
  const top = readLength(spacing.top, 0);
  const right = readLength(spacing.right, 0);
  const bottom = readLength(spacing.bottom, 0);
  const left = readLength(spacing.left, 0);
  if (top === 0 && right === 0 && bottom === 0 && left === 0) return undefined;
  return { top, right, bottom, left };
}

function readTextVerticalAlignFromLayout(
  layout: IRLayout | undefined,
  fallback: 'top' | 'middle' | 'bottom',
): 'top' | 'middle' | 'bottom' {
  const v = normEnum(layout?.align);
  if (v === 'start') return 'top';
  if (v === 'center') return 'middle';
  if (v === 'end') return 'bottom';
  return fallback;
}

function readOverflow(
  value: unknown,
  fallback: 'clip' | 'visible' | 'hidden' | 'scroll',
): 'clip' | 'visible' | 'hidden' | 'scroll' {
  if (value === 'Clip') return 'clip';
  if (value === 'Visible') return 'visible';
  if (value === 'Hidden') return 'hidden';
  if (value === 'Scroll') return 'scroll';
  return fallback;
}

function readBackgroundImageUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = value.match(/^url\((.+)\)$/);
  return match ? match[1] : value;
}

function mapIRGradientToCanvas(irGradient: IRGradient): GradientFill {
  const stops = irGradient.stops.map((s) => ({ color: s.color, position: s.position }));
  switch (irGradient.type) {
    case 'linear':
      return { type: 'linear', angle: irGradient.angle ?? 90, stops };
    case 'radial':
      return { type: 'radial', stops };
    case 'conic':
      return { type: 'conic', angle: irGradient.angle ?? 0, stops };
  }
}

function readStringProp(
  props: Record<string, unknown> | undefined,
  key: string,
  fallback: string,
): string {
  const value = props?.[key];
  return typeof value === 'string' ? value : fallback;
}

function readStringPropAny(
  props: Record<string, unknown> | undefined,
  keys: string[],
  fallback: string,
): string {
  for (const key of keys) {
    const value = props?.[key];
    if (typeof value === 'string') return value;
  }
  return fallback;
}

function readOptionalStringProp(
  props: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = props?.[key];
  return typeof value === 'string' ? value : undefined;
}

function readLinkTypeFromProps(
  props: Record<string, unknown> | undefined,
): CanvasLinkType | undefined {
  const value = props?.['linkType'];
  if (value === 'page' || value === 'url') {
    return value;
  }

  return typeof props?.['href'] === 'string' ? 'url' : undefined;
}

function readShadow(value: unknown): string | undefined {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  const parts: string[] = [];

  for (const item of items) {
    if (
      item &&
      typeof item === 'object' &&
      'x' in item &&
      'y' in item &&
      'blur' in item &&
      'spread' in item &&
      'color' in item
    ) {
      const shadow = item as IRShadow;
      parts.push(
        buildCanvasShadowCss({
          position: shadow.inset ? 'inside' : 'outside',
          x: shadow.x,
          y: shadow.y,
          blur: shadow.blur,
          spread: shadow.spread,
          color: shadow.color,
        }),
      );
    }
  }

  return parts.length > 0 ? parts.join(', ') : undefined;
}

const VALID_BLEND_MODES: ReadonlySet<string> = new Set([
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
]);

function readBlendMode(value: unknown): CanvasBlendMode | undefined {
  if (typeof value === 'string' && VALID_BLEND_MODES.has(value) && value !== 'normal') {
    return value as CanvasBlendMode;
  }
  return undefined;
}

function readNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}
