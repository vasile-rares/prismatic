import { Injectable, inject } from '@angular/core';
import { CanvasElement, CanvasPageModel } from '@app/core';
import { CanvasElementService } from './canvas-element.service';
import { getCanvasShadowCss } from '../utils/element/canvas-shadow.util';
import {
  buildCanvasElementTransform,
  buildCanvasElementTransformOrigin,
  buildCanvasElementBackfaceVisibility,
  buildCanvasElementTransformStyle,
} from '../utils/element/canvas-transform.util';
import {
  getResolvedCornerRadii,
  hasPerCornerRadius,
  getStrokeWidth,
  hasPerSideStrokeWidths,
  getStrokeWidths,
} from '../utils/element/canvas-element-normalization.util';
import { gradientToCss } from '../utils/canvas-gradient.util';
import { buildSquircleMaskImage } from '../utils/element/canvas-transform.util';

export type DomStyleMap = Record<string, string | null | undefined>;

@Injectable()
export class CanvasDomStyleService {
  private readonly elService = inject(CanvasElementService);

  // WeakMap keyed on element ref — invalidated automatically when element/parent gets new reference.
  // Page cached by scalar dimensions, not reference, to survive the page-object spread on every mutation.
  private readonly _styleCache = new WeakMap<
    CanvasElement,
    {
      parent: CanvasElement | null;
      viewportW: number | undefined;
      viewportH: number | undefined;
      style: DomStyleMap;
    }
  >();

  buildStyle(
    element: CanvasElement,
    allElements: CanvasElement[],
    page?: CanvasPageModel | null,
  ): DomStyleMap {
    const parent = this.elService.findElementById(element.parentId ?? null, allElements);
    const vw = page?.viewportWidth;
    const vh = page?.viewportHeight;
    const cached = this._styleCache.get(element);
    if (
      cached !== undefined &&
      cached.parent === parent &&
      cached.viewportW === vw &&
      cached.viewportH === vh
    ) {
      return cached.style;
    }
    const style = {
      ...this.buildElementStyle(element, allElements, page),
      ...this.buildPositionStyle(element, parent),
      ...this.buildFlexChildStyle(element, parent),
      ...this.buildGridChildStyle(element, parent),
    };
    this._styleCache.set(element, { parent, viewportW: vw, viewportH: vh, style });
    return style;
  }

  private buildElementStyle(
    element: CanvasElement,
    allElements: CanvasElement[],
    page?: CanvasPageModel | null,
  ): DomStyleMap {
    const style: DomStyleMap = {};

    // ── Sizing ────────────────────────────────────────────
    style['width'] = this.elService.getRenderedWidthStyle(element, allElements, page);
    style['height'] = this.elService.getRenderedHeightStyle(element, allElements, page);
    style['box-sizing'] = 'border-box';

    const minW = this.elService.getRenderedMinWidthStyle(element, allElements, page);
    const maxW = this.elService.getRenderedMaxWidthStyle(element, allElements, page);
    const minH = this.elService.getRenderedMinHeightStyle(element, allElements, page);
    const maxH = this.elService.getRenderedMaxHeightStyle(element, allElements, page);
    if (minW) style['min-width'] = minW;
    if (maxW) style['max-width'] = maxW;
    if (minH) style['min-height'] = minH;
    if (maxH) style['max-height'] = maxH;

    // ── Fill / Background ────────────────────────────────
    if (element.type !== 'text' && element.type !== 'image') {
      if (element.fillMode === 'image' && element.backgroundImage) {
        style['background-image'] = `url("${element.backgroundImage}")`;
        style['background-size'] = element.backgroundSize ?? 'cover';
        style['background-position'] = element.backgroundPosition ?? 'center';
        style['background-repeat'] = element.backgroundRepeat ?? 'no-repeat';
      } else if (element.fillMode === 'gradient' && element.gradient) {
        style['background'] = gradientToCss(element.gradient);
      } else if (element.fill) {
        const fillStr = element.fill;
        if (fillStr.startsWith('linear-gradient') || fillStr.startsWith('radial-gradient')) {
          style['background'] = fillStr;
        } else {
          style['background-color'] = fillStr;
        }
      }
    }

    // ── Corner Radius ─────────────────────────────────────
    {
      const effectiveRadius =
        (element.cornerRadius ?? 0) > 0 || hasPerCornerRadius(element) || element.type === 'image';
      if (effectiveRadius) {
        const radii = getResolvedCornerRadii(element);
        if (
          radii.topLeft === radii.topRight &&
          radii.topRight === radii.bottomRight &&
          radii.bottomRight === radii.bottomLeft
        ) {
          style['border-radius'] = `${radii.topLeft}px`;
        } else {
          style['border-radius'] =
            `${radii.topLeft}px ${radii.topRight}px ${radii.bottomRight}px ${radii.bottomLeft}px`;
        }
      }
    }

    // ── Overflow ──────────────────────────────────────────
    if (element.type === 'frame' || element.type === 'rectangle') {
      const ov = element.overflow ?? 'clip';
      style['overflow'] =
        ov === 'clip' || ov === 'hidden' ? 'hidden' : ov === 'scroll' ? 'auto' : 'visible';
    }

    // ── Opacity ───────────────────────────────────────────
    if (typeof element.opacity === 'number' && element.opacity !== 1) {
      style['opacity'] = String(element.opacity);
    }

    // ── Z-Index ───────────────────────────────────────────
    if (typeof element.zIndex === 'number') {
      style['z-index'] = String(element.zIndex);
    }

    // ── Blend Mode ────────────────────────────────────────
    if (element.blendMode && element.blendMode !== 'normal') {
      style['mix-blend-mode'] = element.blendMode;
    }

    // ── Box Shadow ────────────────────────────────────────
    if (element.shadow) {
      const shadowCss = getCanvasShadowCss(element.shadow);
      if (shadowCss !== 'none') {
        style['box-shadow'] = shadowCss;
      }
    }

    // ── Stroke / Border ──────────────────────────────────
    if (element.type !== 'text' && element.stroke) {
      const strokeStyleCss = (element.strokeStyle ?? 'Solid').toLowerCase();
      if (hasPerSideStrokeWidths(element)) {
        const widths = getStrokeWidths(element);
        style['border-top'] = `${widths.top}px ${strokeStyleCss} ${element.stroke}`;
        style['border-right'] = `${widths.right}px ${strokeStyleCss} ${element.stroke}`;
        style['border-bottom'] = `${widths.bottom}px ${strokeStyleCss} ${element.stroke}`;
        style['border-left'] = `${widths.left}px ${strokeStyleCss} ${element.stroke}`;
      } else {
        const sw = getStrokeWidth(element);
        if (sw > 0) {
          style['border'] = `${sw}px ${strokeStyleCss} ${element.stroke}`;
        }
      }
    }

    // ── Layout (flex / grid / block) ──────────────────────
    if (element.display === 'flex') {
      style['display'] = 'flex';
      style['flex-direction'] = element.flexDirection ?? 'row';
      style['justify-content'] = element.justifyContent ?? 'flex-start';
      style['align-items'] = element.alignItems ?? 'flex-start';
      style['flex-wrap'] = element.flexWrap ?? 'nowrap';
      const alignContent = this.resolveFlexAlignContent(element);
      if (alignContent) {
        style['align-content'] = alignContent;
      }
      const gapX = element.gapX ?? element.gap;
      const gapY = element.gapY ?? element.gap;
      if (typeof gapX === 'number' && typeof gapY === 'number') {
        style['gap'] = `${gapY}px ${gapX}px`;
      } else if (typeof gapX === 'number') {
        style['column-gap'] = `${gapX}px`;
      } else if (typeof gapY === 'number') {
        style['row-gap'] = `${gapY}px`;
      }
    } else if (element.display === 'grid') {
      style['display'] = 'grid';
      if (element.gridTemplateColumns) style['grid-template-columns'] = element.gridTemplateColumns;
      if (element.gridTemplateRows) style['grid-template-rows'] = element.gridTemplateRows;
      const gapX = element.gapX ?? element.gap;
      const gapY = element.gapY ?? element.gap;
      if (typeof gapX === 'number' && typeof gapY === 'number') {
        style['gap'] = `${gapY}px ${gapX}px`;
      } else if (typeof gapX === 'number') {
        style['column-gap'] = `${gapX}px`;
      } else if (typeof gapY === 'number') {
        style['row-gap'] = `${gapY}px`;
      }
    } else if (element.display === 'block') {
      style['display'] = 'block';
    }

    // ── Padding ───────────────────────────────────────────
    if (element.padding) {
      const p = element.padding;
      style['padding'] = `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`;
    }

    // ── Margin ────────────────────────────────────────────
    if (element.margin) {
      const m = element.margin;
      style['margin'] = `${m.top}px ${m.right}px ${m.bottom}px ${m.left}px`;
    }

    // ── Transform ─────────────────────────────────────────
    const transform = buildCanvasElementTransform(element);
    if (transform) style['transform'] = transform;
    const transformOrigin = buildCanvasElementTransformOrigin(element);
    if (transformOrigin) style['transform-origin'] = transformOrigin;
    const backfaceVisibility = buildCanvasElementBackfaceVisibility(element);
    if (backfaceVisibility) style['backface-visibility'] = backfaceVisibility;
    const transformStyle = buildCanvasElementTransformStyle(element);
    if (transformStyle) style['transform-style'] = transformStyle;

    // ── CSS Filters ───────────────────────────────────────
    const filterOptions = element.cssFilterOptions;
    if (filterOptions && filterOptions.length > 0) {
      const filterParts: string[] = [];
      if (filterOptions.includes('blur') && element.filterBlur != null)
        filterParts.push(`blur(${element.filterBlur}px)`);
      if (filterOptions.includes('brightness') && element.filterBrightness != null)
        filterParts.push(`brightness(${element.filterBrightness}%)`);
      if (filterOptions.includes('contrast') && element.filterContrast != null)
        filterParts.push(`contrast(${element.filterContrast}%)`);
      if (filterOptions.includes('grayscale') && element.filterGrayscale != null)
        filterParts.push(`grayscale(${element.filterGrayscale}%)`);
      if (filterOptions.includes('hueRotate') && element.filterHueRotate != null)
        filterParts.push(`hue-rotate(${element.filterHueRotate}deg)`);
      if (filterOptions.includes('invert') && element.filterInvert != null)
        filterParts.push(`invert(${element.filterInvert}%)`);
      if (filterOptions.includes('saturate') && element.filterSaturate != null)
        filterParts.push(`saturate(${element.filterSaturate}%)`);
      if (filterOptions.includes('sepia') && element.filterSepia != null)
        filterParts.push(`sepia(${element.filterSepia}%)`);
      if (filterParts.length > 0) {
        style['filter'] = filterParts.join(' ');
      }
      if (filterOptions.includes('backdropBlur') && element.filterBackdropBlur != null) {
        style['backdrop-filter'] = `blur(${element.filterBackdropBlur}px)`;
      }
    }

    // ── Text color ────────────────────────────────────────
    if (element.type === 'text' && element.fillMode !== 'gradient' && element.fill) {
      style['color'] = element.fill;
    }

    // ── Text shadow ───────────────────────────────────────
    if (element.type === 'text' && element.textShadow) {
      style['text-shadow'] = element.textShadow;
    }

    // ── Text transform ────────────────────────────────────
    if (element.type === 'text' && element.textTransform) {
      style['text-transform'] = element.textTransform;
    }

    // ── Text balance ──────────────────────────────────────
    if (element.type === 'text' && element.textBalance) {
      style['text-wrap'] = 'balance';
    }

    // ── Text decoration ───────────────────────────────────
    if (element.type === 'text' && element.textDecorationLine) {
      style['text-decoration-line'] = element.textDecorationLine;
      if (element.textDecorationColor) {
        style['text-decoration-color'] = element.textDecorationColor;
      }
      if (element.textDecorationStyle) {
        style['text-decoration-style'] = element.textDecorationStyle;
      }
      if (element.textDecorationThickness != null) {
        const unit = element.textDecorationThicknessUnit ?? 'px';
        style['text-decoration-thickness'] = `${element.textDecorationThickness}${unit}`;
      }
    }

    // ── Squircle mask ─────────────────────────────────────
    if (element.type === 'text' && element.squircle != null && element.squircle > 0) {
      const maskImage = buildSquircleMaskImage(element.squircle);
      if (maskImage) {
        style['mask-image'] = maskImage;
        style['mask-size'] = '100% 100%';
        style['-webkit-mask-image'] = maskImage;
        style['-webkit-mask-size'] = '100% 100%';
      }
    }

    return style;
  }

  private buildFlexChildStyle(
    element: CanvasElement,
    parent: CanvasElement | null | undefined,
  ): DomStyleMap {
    const pos = element.position;
    const isFlow = !pos || pos === 'static' || pos === 'relative' || pos === 'sticky';
    if (!isFlow || parent?.display !== 'flex') return {};

    const style: DomStyleMap = {};
    const dir = parent.flexDirection;
    const mainIsWidth = dir !== 'column' && dir !== 'column-reverse';
    const mainFill = mainIsWidth ? element.widthMode === 'fill' : element.heightMode === 'fill';
    const crossFill = mainIsWidth ? element.heightMode === 'fill' : element.widthMode === 'fill';

    if (mainFill) {
      // flex-basis:0 so all fill siblings share space equally regardless of content size.
      if (mainIsWidth) {
        style['width'] = null;
        style['flex-grow'] = '1';
        style['flex-shrink'] = '1';
        style['flex-basis'] = '0px';
        // min-width:0 allows shrink below content width; skip if explicit minWidth is set.
        if (element.minWidth == null) {
          style['min-width'] = '0';
        }
      } else {
        style['height'] = null;
        style['flex-grow'] = '1';
        style['flex-shrink'] = '1';
        style['flex-basis'] = '0px';
        if (element.minHeight == null) {
          style['min-height'] = '0';
        }
      }
    } else {
      // Fixed or fit-content on main axis — must NOT be shrunk or grown by flex layout.
      style['flex-grow'] = '0';
      style['flex-shrink'] = '0';
    }

    if (crossFill) {
      // Remove explicit cross-axis size so align-self:stretch takes effect for fill children.
      if (mainIsWidth) style['height'] = null;
      else style['width'] = null;
      style['align-self'] = 'stretch';
    }

    return style;
  }

  private buildGridChildStyle(
    element: CanvasElement,
    parent: CanvasElement | null | undefined,
  ): DomStyleMap {
    const pos = element.position;
    const isFlow = !pos || pos === 'static' || pos === 'relative' || pos === 'sticky';
    if (!isFlow || parent?.display !== 'grid') return {};

    const style: DomStyleMap = {};
    if (element.widthMode === 'fill') style['width'] = null;
    if (element.heightMode === 'fill') style['height'] = null;
    return style;
  }

  private buildPositionStyle(
    element: CanvasElement,
    parent: CanvasElement | null | undefined,
  ): DomStyleMap {
    const pos = element.position;
    const isFlowPosition = !pos || pos === 'static' || pos === 'relative' || pos === 'sticky';

    // Only flow children; root elements and non-layout container children use absolute x/y.
    if (isFlowPosition && parent?.display) {
      return { position: 'relative' };
    }

    const effectivePos = pos === 'fixed' ? 'fixed' : 'absolute';
    const style: DomStyleMap = { position: effectivePos };

    // x/y stored from outer edge; CSS left/top from padding-box — subtract parent border.
    const parentWidths = parent ? getStrokeWidths(parent) : null;
    style['left'] = `${element.x - (parentWidths?.left ?? 0)}px`;
    style['top'] = `${element.y - (parentWidths?.top ?? 0)}px`;
    return style;
  }

  buildTextContentStyle(element: CanvasElement): DomStyleMap {
    const lineHeightValue =
      element.lineHeight != null
        ? element.lineHeightUnit === 'px'
          ? `${element.lineHeight}px`
          : String(element.lineHeight)
        : '1.2';

    const letterSpacingValue =
      element.letterSpacing != null
        ? element.letterSpacingUnit === 'em'
          ? `${element.letterSpacing}em`
          : `${element.letterSpacing}px`
        : null;

    return {
      'font-family': element.fontFamily ?? 'Inter, sans-serif',
      'font-size':
        element.fontSize != null ? `${element.fontSize}${element.fontSizeUnit ?? 'px'}` : '16px',
      'font-weight': String(element.fontWeight ?? 400),
      'font-style': element.fontStyle ?? 'normal',
      'text-align': element.textAlign ?? 'left',
      'line-height': lineHeightValue,
      'letter-spacing': letterSpacingValue,
      // pre for fit-content (never wrap); pre-wrap for fixed/fill (break at bounds).
      'white-space': (element.widthMode ?? 'fixed') === 'fit-content' ? 'pre' : 'pre-wrap',
      'word-break': (element.widthMode ?? 'fixed') === 'fit-content' ? null : 'break-word',
      // max-width on span prevents flex-start from expanding past container width.
      'max-width': (element.widthMode ?? 'fixed') === 'fit-content' ? null : '100%',
      // Background fill applied here so it covers only the text content area.
      ...(element.fillMode === 'gradient' && element.gradient
        ? {
            'background-color': 'transparent',
            'background-image': gradientToCss(element.gradient),
            '-webkit-background-clip': 'text',
            'background-clip': 'text',
            color: 'transparent',
          }
        : {
            'background-color': element.backgroundColor ?? null,
            'background-image': null,
            '-webkit-background-clip': null,
            'background-clip': null,
            color: null,
          }),
    };
  }

  buildStrokeOverlayStyle(_element: CanvasElement): DomStyleMap {
    return {};
  }

  buildTextVerticalAlignStyle(element: CanvasElement): DomStyleMap {
    const va = element.textVerticalAlign ?? 'top';
    const justifyContent = va === 'middle' ? 'center' : va === 'bottom' ? 'flex-end' : 'flex-start';
    // Map textAlign → cross-axis alignment so the span shrinks to its content width
    // instead of stretching full-width. This lets background-color on the span cover
    // only the actual text characters rather than the whole element box.
    const ta = element.textAlign ?? 'left';
    const alignItems = ta === 'center' ? 'center' : ta === 'right' ? 'flex-end' : 'flex-start';
    return {
      display: 'flex',
      'flex-direction': 'column',
      'align-items': alignItems,
      'justify-content': justifyContent,
      width: '100%',
      height: '100%',
    };
  }

  private resolveFlexAlignContent(element: CanvasElement): string | null {
    if (element.flexWrap !== 'wrap') {
      return null;
    }

    switch (element.alignItems) {
      case 'center':
      case 'flex-end':
      case 'stretch':
      case 'baseline':
        return element.alignItems;
      default:
        return 'flex-start';
    }
  }
}
