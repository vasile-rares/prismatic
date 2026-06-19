import { CanvasBackfaceVisibility, CanvasElement, CanvasTransformOption } from '@app/core';
import { roundToTwoDecimals } from '../canvas-math.util';

export interface CanvasTransformStyleProperties {
  transform?: string | null;
  transformOrigin?: string | null;
  backfaceVisibility?: string | null;
  transformStyle?: string | null;
}

const TRANSFORM_OPTION_ORDER: CanvasTransformOption[] = [
  'scale',
  'rotate',
  'skew',
  'depth',
  'perspective',
  'origin',
  'backface',
  'preserve3d',
];

export function buildCanvasElementTransform(element: CanvasElement): string | null {
  const transforms: string[] = [];

  if (typeof element.perspective === 'number' && element.perspective > 0) {
    transforms.push(`perspective(${roundToTwoDecimals(element.perspective)}px)`);
  }

  if (typeof element.depth === 'number' && element.depth !== 0) {
    transforms.push(`translateZ(${roundToTwoDecimals(element.depth)}px)`);
  }

  const rotation = element.rotation ?? 0;
  if (rotation !== 0) {
    transforms.push(
      element.rotationMode === '3d'
        ? `rotateY(${roundToTwoDecimals(rotation)}deg)`
        : `rotate(${roundToTwoDecimals(rotation)}deg)`,
    );
  }

  const skewX = element.skewX ?? 0;
  const skewY = element.skewY ?? 0;
  if (skewX !== 0 || skewY !== 0) {
    transforms.push(`skew(${roundToTwoDecimals(skewX)}deg, ${roundToTwoDecimals(skewY)}deg)`);
  }

  const scaleX = element.scaleX ?? 1;
  const scaleY = element.scaleY ?? 1;
  if (scaleX !== 1 || scaleY !== 1) {
    transforms.push(`scale(${roundToTwoDecimals(scaleX)}, ${roundToTwoDecimals(scaleY)})`);
  }

  return transforms.length > 0 ? transforms.join(' ') : null;
}

export function buildCanvasElementTransformOrigin(element: CanvasElement): string | null {
  const originX = element.transformOriginX;
  const originY = element.transformOriginY;

  if (originX === undefined && originY === undefined) {
    return null;
  }

  return `${roundToTwoDecimals(originX ?? 50)}% ${roundToTwoDecimals(originY ?? 50)}%`;
}

export function buildCanvasElementBackfaceVisibility(element: CanvasElement): string | null {
  return element.backfaceVisibility ?? null;
}

export function buildCanvasElementTransformStyle(element: CanvasElement): string | null {
  if (element.preserve3D === undefined) {
    return null;
  }

  return element.preserve3D ? 'preserve-3d' : 'flat';
}

export function parseCanvasTransformStyle(
  style: CanvasTransformStyleProperties | null | undefined,
): Pick<
  CanvasElement,
  | 'rotation'
  | 'rotationMode'
  | 'scaleX'
  | 'scaleY'
  | 'skewX'
  | 'skewY'
  | 'depth'
  | 'perspective'
  | 'transformOriginX'
  | 'transformOriginY'
  | 'backfaceVisibility'
  | 'preserve3D'
  | 'transformOptions'
> {
  const patch: Pick<
    CanvasElement,
    | 'rotation'
    | 'rotationMode'
    | 'scaleX'
    | 'scaleY'
    | 'skewX'
    | 'skewY'
    | 'depth'
    | 'perspective'
    | 'transformOriginX'
    | 'transformOriginY'
    | 'backfaceVisibility'
    | 'preserve3D'
    | 'transformOptions'
  > = {};
  const options = new Set<CanvasTransformOption>();

  const transform = typeof style?.transform === 'string' ? style.transform : '';
  const perspective = readTransformNumber(transform, /perspective\(([-+]?\d*\.?\d+)px\)/i);
  if (perspective !== undefined) {
    patch.perspective = perspective;
    options.add('perspective');
  }

  const depth = readTransformNumber(transform, /translateZ\(([-+]?\d*\.?\d+)px\)/i);
  if (depth !== undefined) {
    patch.depth = depth;
    options.add('depth');
  }

  const rotate3d = readTransformNumber(transform, /rotateY\(([-+]?\d*\.?\d+)deg\)/i);
  if (rotate3d !== undefined) {
    patch.rotation = rotate3d;
    patch.rotationMode = '3d';
    options.add('rotate');
  } else {
    const rotate2d = readTransformNumber(transform, /rotate\(([-+]?\d*\.?\d+)deg\)/i);
    if (rotate2d !== undefined) {
      patch.rotation = rotate2d;
      patch.rotationMode = '2d';
      options.add('rotate');
    }
  }

  const skewMatch = /skew\(([-+]?\d*\.?\d+)deg,\s*([-+]?\d*\.?\d+)deg\)/i.exec(transform);
  if (skewMatch) {
    patch.skewX = Number.parseFloat(skewMatch[1]);
    patch.skewY = Number.parseFloat(skewMatch[2]);
    options.add('skew');
  }

  const scaleMatch = /scale\(([-+]?\d*\.?\d+)(?:,\s*([-+]?\d*\.?\d+))?\)/i.exec(transform);
  if (scaleMatch) {
    patch.scaleX = Number.parseFloat(scaleMatch[1]);
    patch.scaleY = Number.parseFloat(scaleMatch[2] ?? scaleMatch[1]);
    options.add('scale');
  }

  const transformOrigin = typeof style?.transformOrigin === 'string' ? style.transformOrigin : '';
  const originMatch = /([-+]?\d*\.?\d+)%\s+([-+]?\d*\.?\d+)%/i.exec(transformOrigin);
  if (originMatch) {
    patch.transformOriginX = Number.parseFloat(originMatch[1]);
    patch.transformOriginY = Number.parseFloat(originMatch[2]);
    options.add('origin');
  }

  const backfaceVisibility = normalizeBackfaceVisibility(style?.backfaceVisibility);
  if (backfaceVisibility) {
    patch.backfaceVisibility = backfaceVisibility;
    options.add('backface');
  }

  if (style?.transformStyle === 'preserve-3d' || style?.transformStyle === 'flat') {
    patch.preserve3D = style.transformStyle === 'preserve-3d';
    options.add('preserve3d');
  }

  if (options.size > 0) {
    patch.transformOptions = TRANSFORM_OPTION_ORDER.filter((option) => options.has(option));
  }

  return patch;
}

function readTransformNumber(transform: string, pattern: RegExp): number | undefined {
  const match = pattern.exec(transform);
  if (!match) {
    return undefined;
  }

  const value = Number.parseFloat(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

function normalizeBackfaceVisibility(
  value: string | null | undefined,
): CanvasBackfaceVisibility | undefined {
  if (value === 'visible' || value === 'hidden') {
    return value;
  }

  return undefined;
}

export function buildSquircleMaskImage(squircle: number): string {
  const s = Math.max(0, Math.min(100, squircle)) / 100;
  if (s <= 0) return '';

  const r = s * 0.45;
  const p = Math.min(r * (1 + s * 0.75), 0.499);
  const c = Math.min(r * (0.55 + s * 0.35), p);

  const fmt = (n: number) => n.toFixed(5).replace(/0+$/, '').replace(/\.$/, '');

  const d = [
    `M ${fmt(p)} 0`,
    `H ${fmt(1 - p)}`,
    `C ${fmt(1 - p + c)} 0 1 ${fmt(p - c)} 1 ${fmt(p)}`,
    `V ${fmt(1 - p)}`,
    `C 1 ${fmt(1 - p + c)} ${fmt(1 - p + c)} 1 ${fmt(1 - p)} 1`,
    `H ${fmt(p)}`,
    `C ${fmt(p - c)} 1 0 ${fmt(1 - p + c)} 0 ${fmt(1 - p)}`,
    `V ${fmt(p)}`,
    `C 0 ${fmt(p - c)} ${fmt(p - c)} 0 ${fmt(p)} 0`,
    `Z`,
  ].join(' ');

  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'><path d='${d}' fill='black'/></svg>`;
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
}
