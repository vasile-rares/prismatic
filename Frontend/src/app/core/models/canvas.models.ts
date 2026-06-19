import { IRStyle } from './ir.models';

export type CanvasElementType = 'frame' | 'rectangle' | 'text' | 'image' | 'svg';
export type CanvasTextAlign = 'left' | 'center' | 'right' | 'justify';
export type CanvasTextVerticalAlign = 'top' | 'middle' | 'bottom';
export type CanvasFontStyle = 'normal' | 'italic';
export type CanvasFontSizeUnit = 'px' | 'rem';
export type CanvasTextSpacingUnit = 'px' | 'em';
export type CanvasOverflowMode = 'clip' | 'visible' | 'hidden' | 'scroll';
export type CanvasFillMode = 'color' | 'image' | 'gradient';
export type CanvasTextTransform = 'inherit' | 'capitalize' | 'uppercase' | 'lowercase';
export type CanvasTextDecorationLine = 'underline' | 'line-through';
export type CanvasTextDecorationStyle = 'solid' | 'double' | 'dotted' | 'dashed' | 'wavy';

export interface GradientStop {
  color: string;
  position: number;
}

export interface LinearGradientFill {
  type: 'linear';
  angle: number;
  stops: GradientStop[];
}

export interface RadialGradientFill {
  type: 'radial';
  stops: GradientStop[];
}

export interface ConicGradientFill {
  type: 'conic';
  angle: number;
  stops: GradientStop[];
}

export type GradientFill = LinearGradientFill | RadialGradientFill | ConicGradientFill;
export type CanvasObjectFit = 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
export type CanvasShadowPreset = 'none' | 'sm' | 'md' | 'lg' | 'xl';
export type CanvasShadow = string;
export type CanvasPageViewportPreset = 'desktop' | 'tablet' | 'mobile' | 'custom';
export type CanvasLinkType = 'page' | 'url';
export type CanvasSizeMode =
  | 'fixed'
  | 'relative'
  | 'fill'
  | 'fit-content'
  | 'viewport'
  | 'fit-image';
export type CanvasConstraintSizeMode = 'fixed' | 'relative';
export type CanvasSemanticTag =
  | 'a'
  | 'article'
  | 'aside'
  | 'div'
  | 'footer'
  | 'header'
  | 'img'
  | 'label'
  | 'main'
  | 'nav'
  | 'p'
  | 'section'
  | 'span';
export type CanvasRotationMode = '2d' | '3d';
export type CanvasBackfaceVisibility = 'visible' | 'hidden';
export type CanvasCursorType =
  | 'auto'
  | 'default'
  | 'pointer'
  | 'text'
  | 'move'
  | 'grab'
  | 'grabbing'
  | 'not-allowed'
  | 'wait'
  | 'progress'
  | 'crosshair'
  | 'zoom-in'
  | 'zoom-out'
  | 'help'
  | 'ns-resize'
  | 'ew-resize'
  | 'col-resize'
  | 'row-resize'
  | 'none';
export type CanvasEffectPreset =
  | 'custom'
  | 'fadeIn'
  | 'scaleIn'
  | 'scaleInBottom'
  | 'flipHorizontal'
  | 'flipVertical'
  | 'slideInTop'
  | 'slideInLeft'
  | 'slideInRight'
  | 'slideInBottom'
  | 'fadeOut'
  | 'slideInUp'
  | 'slideInDown'
  | 'scaleOut'
  | 'spin'
  | 'pulse'
  | 'bounce'
  | 'shake';
export type CanvasEffectEasing = 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'linear';
export type CanvasEffectDirection = 'normal' | 'reverse' | 'alternate' | 'alternate-reverse';
export type CanvasEffectFillMode = 'none' | 'forwards' | 'backwards' | 'both';
export type CanvasEffectOffScreenBehavior = 'play' | 'pause';
export type CanvasEffectTrigger = 'onLoad' | 'hover' | 'click' | 'focus' | 'loop';

export interface CanvasEffect {
  preset: CanvasEffectPreset;
  trigger: CanvasEffectTrigger;
  opacity: number;
  scale: number;
  rotate: number;
  rotationMode: CanvasRotationMode;
  skewX: number;
  skewY: number;
  offsetX: number;
  offsetY: number;
  fill?: string;
  shadow?: string;
  duration: number;
  delay: number;
  iterations: number | 'infinite';
  easing: CanvasEffectEasing;
  direction: CanvasEffectDirection;
  fillMode: CanvasEffectFillMode;
  offScreenBehavior: CanvasEffectOffScreenBehavior;
}
export type CanvasTransformOption =
  | 'scale'
  | 'rotate'
  | 'skew'
  | 'depth'
  | 'perspective'
  | 'origin'
  | 'backface'
  | 'preserve3d';

export type CanvasFilterType =
  | 'blur'
  | 'backdropBlur'
  | 'brightness'
  | 'contrast'
  | 'grayscale'
  | 'hueRotate'
  | 'invert'
  | 'saturate'
  | 'sepia';

export type CanvasDisplayMode = 'block' | 'flex' | 'grid';
export type CanvasPositionMode = 'static' | 'relative' | 'absolute' | 'fixed' | 'sticky';
export type CanvasFlexDirection = 'row' | 'column' | 'row-reverse' | 'column-reverse';
export type CanvasFlexWrap = 'nowrap' | 'wrap';
export type CanvasJustifyContent =
  | 'flex-start'
  | 'flex-end'
  | 'center'
  | 'space-between'
  | 'space-around'
  | 'space-evenly';
export type CanvasAlignItems = 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'baseline';
export type CanvasBlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

export interface CanvasSpacing {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface CanvasCornerRadii {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}

export interface CanvasBorderSides {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
}

export interface CanvasBorderWidths {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface CanvasElementIrMeta {
  type?: string;
  props?: Record<string, unknown>;
  style?: IRStyle;
}

export interface CanvasElement {
  id: string;
  type: CanvasElementType;
  name?: string;
  x: number;
  y: number;
  width: number;
  widthMode?: CanvasSizeMode;
  widthSizingValue?: number;
  minWidth?: number;
  minWidthMode?: CanvasConstraintSizeMode;
  minWidthSizingValue?: number;
  maxWidth?: number;
  maxWidthMode?: CanvasConstraintSizeMode;
  maxWidthSizingValue?: number;
  height: number;
  heightMode?: CanvasSizeMode;
  heightSizingValue?: number;
  minHeight?: number;
  minHeightMode?: CanvasConstraintSizeMode;
  minHeightSizingValue?: number;
  maxHeight?: number;
  maxHeightMode?: CanvasConstraintSizeMode;
  maxHeightSizingValue?: number;
  rotation?: number;
  rotationMode?: CanvasRotationMode;
  scaleX?: number;
  scaleY?: number;
  skewX?: number;
  skewY?: number;
  depth?: number;
  perspective?: number;
  transformOriginX?: number;
  transformOriginY?: number;
  backfaceVisibility?: CanvasBackfaceVisibility;
  preserve3D?: boolean;
  transformOptions?: CanvasTransformOption[];
  cssFilterOptions?: CanvasFilterType[];
  filterBlur?: number;
  filterBackdropBlur?: number;
  filterBrightness?: number;
  filterContrast?: number;
  filterGrayscale?: number;
  filterHueRotate?: number;
  filterInvert?: number;
  filterSaturate?: number;
  filterSepia?: number;
  visible?: boolean;
  fill?: string;
  fillMode?: CanvasFillMode;
  gradient?: GradientFill;
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  backgroundRepeat?: string;
  objectFit?: CanvasObjectFit;
  imageAltText?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeStyle?: string;
  strokeSides?: CanvasBorderSides;
  strokeWidths?: CanvasBorderWidths;
  opacity?: number;
  zIndex?: number;
  blendMode?: CanvasBlendMode;
  cornerRadius?: number;
  cornerRadii?: CanvasCornerRadii;
  overflow?: CanvasOverflowMode;
  shadow?: CanvasShadow;
  text?: string;
  fontSize?: number;
  fontSizeUnit?: CanvasFontSizeUnit;
  fontFamily?: string;
  fontWeight?: number;
  fontStyle?: CanvasFontStyle;
  textAlign?: CanvasTextAlign;
  textVerticalAlign?: CanvasTextVerticalAlign;
  letterSpacing?: number;
  letterSpacingUnit?: CanvasTextSpacingUnit;
  lineHeight?: number;
  lineHeightUnit?: CanvasTextSpacingUnit;
  textShadow?: string;
  textTransform?: CanvasTextTransform;
  textBalance?: boolean;
  textDecorationLine?: CanvasTextDecorationLine;
  textDecorationColor?: string;
  textDecorationStyle?: CanvasTextDecorationStyle;
  textDecorationThickness?: number;
  textDecorationThicknessUnit?: 'px' | 'em';
  backgroundColor?: string;
  squircle?: number;
  imageUrl?: string;
  svgContent?: string;
  linkType?: CanvasLinkType;
  linkPageId?: string | null;
  linkUrl?: string;
  tag?: CanvasSemanticTag;
  ariaLabel?: string;
  display?: CanvasDisplayMode;
  flexDirection?: CanvasFlexDirection;
  flexWrap?: CanvasFlexWrap;
  justifyContent?: CanvasJustifyContent;
  alignItems?: CanvasAlignItems;
  gap?: number;
  gapX?: number;
  gapY?: number;
  gridTemplateColumns?: string;
  gridTemplateRows?: string;
  padding?: CanvasSpacing;
  paddingPerSide?: boolean;
  position?: CanvasPositionMode;
  margin?: CanvasSpacing;
  cursor?: CanvasCursorType;
  effects?: CanvasEffect[];
  parentId?: string | null;
  isPrimary?: boolean;
  primarySyncId?: string;
  detachedPrimarySyncId?: string;
  irMeta?: CanvasElementIrMeta;
}

export interface CanvasPageModel {
  id: string;
  name: string;
  viewportPreset?: CanvasPageViewportPreset;
  viewportWidth?: number;
  viewportHeight?: number;
  canvasX?: number;
  canvasY?: number;
  elements: CanvasElement[];
}

export interface CanvasProjectDocument {
  version: string;
  projectId: string;
  activePageId: string | null;
  pages: CanvasPageModel[];
}
