import { roundToTwoDecimals } from '../canvas-math.util';

export interface EditableTextShadow {
  x: number;
  y: number;
  blur: number;
  color: string;
}

export const DEFAULT_EDITABLE_TEXT_SHADOW: EditableTextShadow = {
  x: 0,
  y: 2,
  blur: 4,
  color: 'rgba(0, 0, 0, 0.4)',
};

const TEXT_SHADOW_PATTERN =
  /^(-?(?:\d+|\d*\.\d+))px\s+(-?(?:\d+|\d*\.\d+))px\s+((?:\d+|\d*\.\d+))px\s+(.+)$/i;

export function normalizeTextShadowValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.toLowerCase() === 'none') return undefined;
  return normalized;
}

export function hasTextShadow(value: unknown): boolean {
  return !!normalizeTextShadowValue(value);
}

export function buildTextShadowCss(shadow: EditableTextShadow): string {
  const x = roundToTwoDecimals(shadow.x);
  const y = roundToTwoDecimals(shadow.y);
  const blur = roundToTwoDecimals(Math.max(0, shadow.blur));
  return `${x}px ${y}px ${blur}px ${shadow.color}`;
}

export function resolveEditableTextShadow(
  value: unknown,
  fallback: EditableTextShadow = DEFAULT_EDITABLE_TEXT_SHADOW,
): EditableTextShadow {
  if (typeof value !== 'string') return copyEditableTextShadow(fallback);
  const normalized = value.trim();
  if (!normalized || normalized.toLowerCase() === 'none') return copyEditableTextShadow(fallback);

  const match = normalized.match(TEXT_SHADOW_PATTERN);
  if (!match) return copyEditableTextShadow(fallback);

  const x = Number(match[1]);
  const y = Number(match[2]);
  const blur = Number(match[3]);
  const color = match[4].trim();

  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(blur)) {
    return copyEditableTextShadow(fallback);
  }

  return {
    x: roundToTwoDecimals(x),
    y: roundToTwoDecimals(y),
    blur: roundToTwoDecimals(blur),
    color,
  };
}

function copyEditableTextShadow(shadow: EditableTextShadow): EditableTextShadow {
  return { ...shadow };
}
