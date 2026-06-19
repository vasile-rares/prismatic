export interface IRNode {
  id: string;
  type: IRNodeType;
  props: Record<string, unknown>;
  layout?: IRLayout;
  style?: IRStyle;
  position?: IRPosition;
  effects?: IREffect[];
  variants: Record<string, IRVariant>;
  children: IRNode[];
  meta: IRMeta;
}

export interface IRLayout {
  mode: LayoutMode;
  direction?: FlexDirection;
  align?: AlignItems;
  justify?: JustifyContent;
  gap?: IRLength;
  rowGap?: IRLength;
  columnGap?: IRLength;
  wrap?: boolean;
  columns?: number;
  rows?: number;
  gridTemplateColumns?: string;
  gridTemplateRows?: string;
}

export interface IRPosition {
  mode: PositionMode;
  top?: IRLength;
  right?: IRLength;
  bottom?: IRLength;
  left?: IRLength;
}

export interface IRGradientStop {
  color: string;
  position: number;
}

export interface IRGradient {
  type: 'linear' | 'radial' | 'conic';
  angle?: number;
  stops: IRGradientStop[];
}

export interface IRStyle {
  color?: string;
  background?: string;
  gradient?: IRGradient;
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  backgroundRepeat?: string;
  objectFit?: string;
  transform?: string;
  transformOrigin?: string;
  backfaceVisibility?: string;
  transformStyle?: string;

  width?: IRLength;
  height?: IRLength;

  minWidth?: IRLength;
  maxWidth?: IRLength;

  minHeight?: IRLength;
  maxHeight?: IRLength;

  fontSize?: IRLength;
  fontWeight?: number;
  fontFamily?: string;
  fontStyle?: string;

  lineHeight?: IRLength;
  letterSpacing?: IRLength;

  textAlign?: string;

  textShadow?: string;
  textTransform?: string;
  textWrap?: string;
  whiteSpace?: string;
  wordBreak?: string;
  textDecorationLine?: string;
  textDecorationColor?: string;
  textDecorationStyle?: string;
  textDecorationThickness?: string;

  backgroundColor?: string;

  borderRadius?: IRLength;
  borderTopLeftRadius?: IRLength;
  borderTopRightRadius?: IRLength;
  borderBottomRightRadius?: IRLength;
  borderBottomLeftRadius?: IRLength;
  border?: IRBorder;

  overflow?: OverflowMode;
  shadows?: IRShadow[];

  opacity?: number;

  mixBlendMode?: string;

  cursor?: string;

  filter?: string;
  backdropFilter?: string;

  backgroundClip?: string;

  padding?: IRSpacing;
  margin?: IRSpacing;
}

export interface IRShadow {
  inset: boolean;
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
}

export interface IRLength {
  value: number;
  unit: string;
}

export interface IRSpacing {
  top?: IRLength;
  right?: IRLength;
  bottom?: IRLength;
  left?: IRLength;
}

export interface IRBorder {
  width?: IRLength;
  color?: string;

  style: BorderStyle;
  topWidth?: IRLength;
  rightWidth?: IRLength;
  bottomWidth?: IRLength;
  leftWidth?: IRLength;

  top?: boolean;
  right?: boolean;
  bottom?: boolean;
  left?: boolean;
}

export interface IRMeta {
  name?: string;
  hidden: boolean;
  componentInstanceId?: string;
}

export interface IREffect {
  preset: string;
  trigger: string;
  opacity?: number;
  scale?: number;
  rotate?: number;
  rotationMode?: string;
  skewX?: number;
  skewY?: number;
  offsetX?: number;
  offsetY?: number;
  fill?: string;
  shadow?: string;
  duration: number;
  delay: number;
  iterations: string;
  easing: string;
  direction: string;
  fillMode: string;
  offScreenBehavior?: string;
}

export interface IRVariant {
  layout?: IRLayout;
  style?: IRStyle;
  props?: Record<string, unknown>;
}

export type IRNodeType = 'Frame' | 'Container' | 'Text' | 'Image' | 'Svg';
export type OverflowMode = 'Clip' | 'Visible' | 'Hidden' | 'Scroll';
export type LayoutMode = 'Block' | 'Flex' | 'Grid';
export type PositionMode = 'Flow' | 'Relative' | 'Absolute' | 'Fixed' | 'Sticky';
export type FlexDirection = 'Row' | 'Column' | 'RowReverse' | 'ColumnReverse';
export type AlignItems = 'Start' | 'Center' | 'End' | 'Stretch' | 'Baseline';
export type JustifyContent =
  | 'Start'
  | 'Center'
  | 'End'
  | 'SpaceBetween'
  | 'SpaceAround'
  | 'SpaceEvenly';
export type BorderStyle = 'Solid' | 'Dashed' | 'Dotted' | 'Double' | 'None';

export function px(value: number): IRLength {
  return { value, unit: 'px' };
}

export function length(value: number, unit: string): IRLength {
  return { value, unit };
}
