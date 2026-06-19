import { Component, OnInit, inject, input, output, ViewEncapsulation } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { DropdownSelectComponent, ToggleGroupComponent, ContextMenuComponent } from '@app/shared';
import { NumberInputComponent } from '../../../number-input/number-input.component';
import { FieldInputComponent } from '../../../field-input/field-input.component';
import type { DropdownSelectOption, ToggleGroupOption, ContextMenuItem } from '@app/shared';
import {
  CanvasCornerRadii,
  CanvasElement,
  CanvasFontSizeUnit,
  CanvasFontStyle,
  CanvasSpacing,
  CanvasTextAlign,
  CanvasTextDecorationLine,
  CanvasTextDecorationStyle,
  CanvasTextSpacingUnit,
  CanvasTextTransform,
  CanvasTextVerticalAlign,
  GradientFill,
} from '@app/core';

import { roundToTwoDecimals } from '../../../../../utils/canvas-math.util';
import { gradientToCss } from '../../../../../utils/canvas-gradient.util';
import { CanvasFontsService } from '../../../../../services/canvas-fonts.service';
import {
  getDefaultCornerRadius,
  getResolvedCornerRadii,
  hasPerCornerRadius,
} from '../../../../../utils/element/canvas-element-normalization.util';
import {
  buildTextShadowCss,
  DEFAULT_EDITABLE_TEXT_SHADOW,
  hasTextShadow,
  normalizeTextShadowValue,
  resolveEditableTextShadow,
} from '../../../../../utils/element/canvas-text-shadow.util';
import { DEFAULT_FILL_COLOR } from '../../../../../utils/canvas-defaults.constants';

type EditableTypographyField =
  | 'fontFamily'
  | 'fontWeight'
  | 'fontStyle'
  | 'textAlign'
  | 'textVerticalAlign';
type EditableTextMetricUnitField = 'fontSizeUnit' | 'letterSpacingUnit' | 'lineHeightUnit';
type EditableNumericTypographyField = 'fontSize' | 'letterSpacing' | 'lineHeight';
type TypographyOptionalId =
  | 'fill'
  | 'radius'
  | 'padding'
  | 'shadow'
  | 'transform'
  | 'decoration'
  | 'balance';
type CornerRadiusMode = 'full' | 'per-corner';
type PaddingMode = 'uniform' | 'per-side';

interface TypographyOptionalDef {
  id: TypographyOptionalId;
  label: string;
  isAdded: (el: CanvasElement) => boolean;
}

interface CornerRadiusFieldDefinition {
  key: keyof CanvasCornerRadii;
  label: string;
  ariaLabel: string;
}

const CORNER_RADIUS_FIELD_DEFINITIONS: readonly CornerRadiusFieldDefinition[] = [
  { key: 'topLeft', label: 'TL', ariaLabel: 'Top left corner radius' },
  { key: 'topRight', label: 'TR', ariaLabel: 'Top right corner radius' },
  { key: 'bottomLeft', label: 'BL', ariaLabel: 'Bottom left corner radius' },
  { key: 'bottomRight', label: 'BR', ariaLabel: 'Bottom right corner radius' },
];

const TYPOGRAPHY_OPTIONAL_DEFS: readonly TypographyOptionalDef[] = [
  { id: 'fill', label: 'Fill', isAdded: (el) => el.backgroundColor != null },
  {
    id: 'radius',
    label: 'Radius',
    isAdded: (el) => el.cornerRadius != null || hasPerCornerRadius(el),
  },
  { id: 'padding', label: 'Padding', isAdded: (el) => el.padding != null },
  { id: 'shadow', label: 'Shadows', isAdded: (el) => hasTextShadow(el.textShadow) },
  { id: 'transform', label: 'Transform', isAdded: (el) => el.textTransform != null },
  { id: 'decoration', label: 'Decoration', isAdded: (el) => el.textDecorationLine != null },
  { id: 'balance', label: 'Balance', isAdded: (el) => typeof el.textBalance === 'boolean' },
];

@Component({
  selector: 'app-design-tab-typography-section',
  standalone: true,
  imports: [
    FormsModule,
    DropdownSelectComponent,
    ToggleGroupComponent,
    NumberInputComponent,
    FieldInputComponent,
    ContextMenuComponent,
  ],
  templateUrl: './typography-section.component.html',
  encapsulation: ViewEncapsulation.None,
})
export class TypographySectionComponent implements OnInit {
  private readonly googleFonts = inject(CanvasFontsService);

  readonly element = input.required<CanvasElement>();
  readonly projectId = input<number | null>(null);

  readonly elementPatch = output<Partial<CanvasElement>>();
  readonly numberInputGestureStarted = output<void>();
  readonly numberInputGestureCommitted = output<void>();

  // Optional props menu state
  typographyMenuItems: ContextMenuItem[] = [];
  typographyMenuX = 0;
  typographyMenuY = 0;

  // Corner radius
  readonly cornerRadiusFields = CORNER_RADIUS_FIELD_DEFINITIONS;
  readonly cornerRadiusModeOptions: readonly ToggleGroupOption[] = [
    {
      label: '',
      value: 'full',
      icon: 'radius-full',
      ariaLabel: 'Full corner radius',
      title: 'Full radius',
    },
    {
      label: '',
      value: 'per-corner',
      icon: 'radius-corners',
      ariaLabel: 'Per-corner radius',
      title: 'Per-corner radius',
    },
  ];

  // Padding
  readonly paddingModeOptions: readonly ToggleGroupOption[] = [
    {
      label: '',
      value: 'uniform',
      icon: 'radius-full',
      ariaLabel: 'Uniform padding',
      title: 'Uniform',
    },
    {
      label: '',
      value: 'per-side',
      icon: 'border-sides',
      ariaLabel: 'Per-side padding',
      title: 'Per side',
    },
  ];
  readonly paddingSideFields: readonly {
    key: keyof CanvasSpacing;
    label: string;
    ariaLabel: string;
  }[] = [
    { key: 'top', label: 'T', ariaLabel: 'Top padding' },
    { key: 'right', label: 'R', ariaLabel: 'Right padding' },
    { key: 'bottom', label: 'B', ariaLabel: 'Bottom padding' },
    { key: 'left', label: 'L', ariaLabel: 'Left padding' },
  ];

  // Text transform
  readonly textTransformOptions: DropdownSelectOption[] = [
    { label: 'Inherit', value: 'inherit' },
    { label: 'Capitalize', value: 'capitalize' },
    { label: 'Uppercase', value: 'uppercase' },
    { label: 'Lowercase', value: 'lowercase' },
  ];

  // Balance
  readonly balanceOptions: readonly ToggleGroupOption[] = [
    { label: 'On', value: true },
    { label: 'Off', value: false },
  ];

  readonly fontFamilyOptions: DropdownSelectOption[] = this.googleFonts.fontList.map((f) => ({
    label: f.family,
    value: f.family,
  }));

  ngOnInit(): void {
    this.googleFonts.ensureLoaded(this.element().fontFamily);
  }
  readonly fontWeightOptions: DropdownSelectOption[] = [
    { label: 'Light', value: 300 },
    { label: 'Regular', value: 400 },
    { label: 'Medium', value: 500 },
    { label: 'Semibold', value: 600 },
    { label: 'Bold', value: 700 },
  ];
  readonly fontSizeUnitOptions: DropdownSelectOption[] = [
    { label: 'Px', value: 'px' },
    { label: 'Rem', value: 'rem' },
  ];
  readonly textSpacingUnitOptions: DropdownSelectOption[] = [
    { label: 'Px', value: 'px' },
    { label: 'Em', value: 'em' },
  ];
  readonly textAlignToggleOptions: readonly ToggleGroupOption[] = [
    {
      label: '',
      value: 'left',
      icon: 'text-align-left',
      ariaLabel: 'Align text left',
      title: 'Left',
    },
    {
      label: '',
      value: 'center',
      icon: 'text-align-center',
      ariaLabel: 'Align text center',
      title: 'Center',
    },
    {
      label: '',
      value: 'right',
      icon: 'text-align-right',
      ariaLabel: 'Align text right',
      title: 'Right',
    },
    {
      label: '',
      value: 'justify',
      icon: 'text-align-justify',
      ariaLabel: 'Justify text',
      title: 'Justify',
    },
  ];

  readonly textVerticalAlignOptions: readonly ToggleGroupOption[] = [
    { label: '', value: 'top', icon: 'align-vertical-start', ariaLabel: 'Align top', title: 'Top' },
    {
      label: '',
      value: 'middle',
      icon: 'align-vertical-center',
      ariaLabel: 'Align middle',
      title: 'Middle',
    },
    {
      label: '',
      value: 'bottom',
      icon: 'align-vertical-end',
      ariaLabel: 'Align bottom',
      title: 'Bottom',
    },
  ];

  isTextFixedSize(element: CanvasElement): boolean {
    return (
      element.type === 'text' &&
      (!element.widthMode || element.widthMode === 'fixed') &&
      (!element.heightMode || element.heightMode === 'fixed')
    );
  }

  textVerticalAlignValue(element: CanvasElement): CanvasTextVerticalAlign {
    return element.textVerticalAlign ?? 'middle';
  }

  onTextVerticalAlignChange(value: string | number | boolean | null): void {
    if (value === 'top' || value === 'middle' || value === 'bottom') {
      this.elementPatch.emit({ textVerticalAlign: value as CanvasTextVerticalAlign });
    }
  }

  onNumberInputGestureStarted(): void {
    this.numberInputGestureStarted.emit();
  }

  onNumberInputGestureCommitted(): void {
    this.numberInputGestureCommitted.emit();
  }

  // Optional props management

  activeOptionals(element: CanvasElement): readonly TypographyOptionalDef[] {
    return TYPOGRAPHY_OPTIONAL_DEFS.filter((def) => def.isAdded(element));
  }

  onTypographyPlusClick(event: MouseEvent): void {
    event.stopPropagation();
    if (this.typographyMenuItems.length > 0) {
      this.closeTypographyMenu();
      return;
    }
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.typographyMenuX = rect.right;
    this.typographyMenuY = rect.top;
    this.typographyMenuItems = this.buildTypographyMenuItems();
  }

  closeTypographyMenu(): void {
    this.typographyMenuItems = [];
  }

  private buildTypographyMenuItems(): ContextMenuItem[] {
    const element = this.element();
    return TYPOGRAPHY_OPTIONAL_DEFS.filter((def) => !def.isAdded(element)).map((def) => ({
      id: def.id,
      label: def.label,
      action: () => {
        this.addOptional(def.id);
        this.closeTypographyMenu();
      },
    }));
  }

  private addOptional(id: TypographyOptionalId): void {
    switch (id) {
      case 'fill':
        this.elementPatch.emit({ backgroundColor: '#e0e0e0' });
        break;
      case 'radius':
        this.elementPatch.emit({ cornerRadius: 8 });
        break;
      case 'padding':
        this.elementPatch.emit({ padding: { top: 8, right: 8, bottom: 8, left: 8 } });
        break;
      case 'shadow':
        this.elementPatch.emit({ textShadow: buildTextShadowCss(DEFAULT_EDITABLE_TEXT_SHADOW) });
        break;
      case 'transform':
        this.elementPatch.emit({ textTransform: 'uppercase' });
        break;
      case 'decoration':
        this.elementPatch.emit({
          textDecorationLine: 'underline',
          textDecorationColor: '#000000',
          textDecorationStyle: 'solid',
          textDecorationThickness: 1,
          textDecorationThicknessUnit: 'px',
        });
        break;
      case 'balance':
        this.elementPatch.emit({ textBalance: true });
        break;
    }
  }

  removeOptional(id: TypographyOptionalId): void {
    switch (id) {
      case 'fill':
        this.elementPatch.emit({ backgroundColor: undefined });
        break;
      case 'radius':
        this.elementPatch.emit({ cornerRadius: undefined, cornerRadii: undefined });
        break;
      case 'padding':
        this.elementPatch.emit({ padding: undefined, paddingPerSide: undefined });
        break;
      case 'shadow':
        this.elementPatch.emit({ textShadow: undefined });
        break;
      case 'transform':
        this.elementPatch.emit({ textTransform: undefined });
        break;
      case 'decoration':
        this.elementPatch.emit({
          textDecorationLine: undefined,
          textDecorationColor: undefined,
          textDecorationStyle: undefined,
          textDecorationThickness: undefined,
          textDecorationThicknessUnit: undefined,
        });
        break;
      case 'balance':
        this.elementPatch.emit({ textBalance: undefined });
        break;
    }
  }

  // Corner radius

  cornerRadiusMode(element: CanvasElement): CornerRadiusMode {
    return hasPerCornerRadius(element) ? 'per-corner' : 'full';
  }

  fullCornerRadiusInputValue(element: CanvasElement): number | null {
    return this.cornerRadiusMode(element) === 'per-corner' ? null : getDefaultCornerRadius(element);
  }

  cornerRadiusValue(element: CanvasElement, corner: keyof CanvasCornerRadii): number {
    return getResolvedCornerRadii(element)[corner];
  }

  onCornerRadiusModeChange(value: string | number | boolean | null): void {
    if (value !== 'full' && value !== 'per-corner') return;
    const element = this.element();
    const uniformValue = getDefaultCornerRadius(element);
    if (value === 'per-corner') {
      this.elementPatch.emit({
        cornerRadius: uniformValue,
        cornerRadii: getResolvedCornerRadii(element),
      });
    } else {
      this.elementPatch.emit({ cornerRadius: uniformValue, cornerRadii: undefined });
    }
  }

  onCornerRadiusChange(value: number): void {
    if (!Number.isFinite(value)) return;
    this.elementPatch.emit({ cornerRadius: Math.max(0, roundToTwoDecimals(value)) });
  }

  onCornerRadiusCornerChange(corner: keyof CanvasCornerRadii, value: number): void {
    if (!Number.isFinite(value)) return;
    const nextRadii: CanvasCornerRadii = {
      ...getResolvedCornerRadii(this.element()),
      [corner]: Math.max(0, roundToTwoDecimals(value)),
    };
    this.elementPatch.emit({ cornerRadii: nextRadii });
  }

  // Padding

  paddingMode(element: CanvasElement): PaddingMode {
    return element.paddingPerSide === true ? 'per-side' : 'uniform';
  }

  uniformPaddingValue(element: CanvasElement): number {
    return element.padding?.top ?? 0;
  }

  paddingSideValue(element: CanvasElement, side: keyof CanvasSpacing): number {
    return element.padding?.[side] ?? 0;
  }

  onPaddingModeChange(value: string | number | boolean | null): void {
    if (value !== 'uniform' && value !== 'per-side') return;
    const el = this.element();
    if (value === 'uniform') {
      const uniform = this.uniformPaddingValue(el);
      this.elementPatch.emit({
        paddingPerSide: undefined,
        padding: { top: uniform, right: uniform, bottom: uniform, left: uniform },
      });
    } else {
      this.elementPatch.emit({ paddingPerSide: true });
    }
  }

  onUniformPaddingChange(value: number): void {
    if (!Number.isFinite(value)) return;
    const v = Math.max(0, roundToTwoDecimals(value));
    this.elementPatch.emit({ padding: { top: v, right: v, bottom: v, left: v } });
  }

  onPaddingSideChange(side: keyof CanvasSpacing, value: number): void {
    if (!Number.isFinite(value)) return;
    const current = this.element().padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
    this.elementPatch.emit({
      padding: { ...current, [side]: Math.max(0, roundToTwoDecimals(value)) },
    });
  }

  // Squircle

  squircleValue(element: CanvasElement): number {
    return element.squircle ?? 0;
  }

  onSquircleChange(value: number): void {
    if (!Number.isFinite(value)) return;
    this.elementPatch.emit({ squircle: Math.max(0, Math.min(100, roundToTwoDecimals(value))) });
  }

  // Background color

  backgroundColorValue(element: CanvasElement): string {
    return element.backgroundColor ?? '#e0e0e0';
  }

  onBackgroundColorPatch(patch: Partial<CanvasElement>): void {
    if ('fill' in patch) {
      this.elementPatch.emit({ backgroundColor: (patch as Record<string, string>)['fill'] });
    } else {
      this.elementPatch.emit(patch);
    }
  }

  // Text shadow

  textShadowSummary(element: CanvasElement): string {
    if (!hasTextShadow(element.textShadow)) return 'None';
    const s = resolveEditableTextShadow(element.textShadow);
    return `${s.x}, ${s.y}, ${s.blur}`;
  }

  textShadowInputValue(element: CanvasElement): string | null {
    return normalizeTextShadowValue(element.textShadow) ?? null;
  }

  textShadowSwatchColor(element: CanvasElement): string {
    return resolveEditableTextShadow(element.textShadow).color;
  }

  // Text transform

  textTransformValue(element: CanvasElement): string {
    return element.textTransform ?? 'inherit';
  }

  onTextTransformChange(value: string | number | boolean | null): void {
    if (typeof value !== 'string') return;
    this.elementPatch.emit({ textTransform: value as CanvasTextTransform });
  }

  // Balance

  onTextBalanceChange(value: string | number | boolean | null): void {
    this.elementPatch.emit({ textBalance: value === true });
  }

  // Decoration

  isDecorationDisabled(element: CanvasElement): boolean {
    return element.fillMode === 'gradient';
  }

  decorationSummary(element: CanvasElement): string {
    if (!element.textDecorationLine) return 'None';
    return element.textDecorationLine === 'line-through' ? 'Linethrough' : 'Underline';
  }

  decorationSwatchColor(element: CanvasElement): string {
    return element.textDecorationColor ?? '#000000';
  }

  onTextChange(field: 'text', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.elementPatch.emit({ [field]: value } as Partial<CanvasElement>);
  }

  onNumberChange(field: EditableNumericTypographyField, valueOrEvent: number | Event): void {
    const value =
      typeof valueOrEvent === 'number'
        ? valueOrEvent
        : Number((valueOrEvent.target as HTMLInputElement).value);
    if (!Number.isFinite(value)) return;
    this.elementPatch.emit({ [field]: value } as Partial<CanvasElement>);
  }

  onTypographySelectChange(
    field: EditableTypographyField,
    value: string | number | boolean | null,
  ): void {
    if (field === 'fontWeight') {
      if (typeof value !== 'number') return;
      this.elementPatch.emit({ fontWeight: value });
      return;
    }
    if (typeof value !== 'string') return;
    if (field === 'fontFamily') {
      this.googleFonts.loadFont(value);
    }
    this.elementPatch.emit({ [field]: value } as Partial<CanvasElement>);
  }

  onTextMetricUnitChange(
    field: EditableTextMetricUnitField,
    value: string | number | boolean | null,
  ): void {
    if (typeof value !== 'string') return;
    const element = this.element();

    if (field === 'fontSizeUnit') {
      if (value !== 'px' && value !== 'rem') return;
      const currentUnit = this.fontSizeUnitValue(element);
      if (currentUnit === value) return;
      const currentValue = element.fontSize ?? 16;
      const nextValue =
        currentUnit === 'px'
          ? roundToTwoDecimals(currentValue / 16)
          : roundToTwoDecimals(currentValue * 16);
      this.elementPatch.emit({ fontSize: nextValue, fontSizeUnit: value });
      return;
    }

    if (value !== 'px' && value !== 'em') return;
    const currentValue =
      field === 'lineHeightUnit' ? (element.lineHeight ?? 1.2) : (element.letterSpacing ?? 0);
    const currentUnit =
      field === 'lineHeightUnit'
        ? this.lineHeightUnitValue(element)
        : this.letterSpacingUnitValue(element);
    if (currentUnit === value) return;

    const fontSizeInPixels = this.fontSizeInPixels(element);
    const nextValue =
      currentUnit === 'px'
        ? roundToTwoDecimals(currentValue / fontSizeInPixels)
        : roundToTwoDecimals(currentValue * fontSizeInPixels);

    this.elementPatch.emit(
      field === 'lineHeightUnit'
        ? { lineHeight: nextValue, lineHeightUnit: value }
        : { letterSpacing: nextValue, letterSpacingUnit: value },
    );
  }

  setFontStyle(style: CanvasFontStyle): void {
    this.elementPatch.emit({ fontStyle: style });
  }

  onTextAlignChange(value: string | number | boolean | null): void {
    if (value === 'left' || value === 'center' || value === 'right' || value === 'justify') {
      this.elementPatch.emit({ textAlign: value as CanvasTextAlign });
    }
  }

  fontFamilyValue(element: CanvasElement): string {
    return element.fontFamily ?? 'Inter';
  }

  fontWeightValue(element: CanvasElement): number {
    return element.fontWeight ?? 400;
  }

  fontSizeUnitValue(element: CanvasElement): CanvasFontSizeUnit {
    return element.fontSizeUnit === 'rem' ? 'rem' : 'px';
  }

  fontStyleValue(element: CanvasElement): CanvasFontStyle {
    return element.fontStyle ?? 'normal';
  }

  letterSpacingUnitValue(element: CanvasElement): CanvasTextSpacingUnit {
    return element.letterSpacingUnit === 'em' ? 'em' : 'px';
  }

  lineHeightUnitValue(element: CanvasElement): CanvasTextSpacingUnit {
    return element.lineHeightUnit === 'px' ? 'px' : 'em';
  }

  textAlignValue(element: CanvasElement): CanvasTextAlign {
    return element.textAlign ?? 'left';
  }

  fillLabel(element: CanvasElement): string {
    if (element.fillMode === 'gradient') {
      switch (element.gradient?.type) {
        case 'linear':
          return 'Linear';
        case 'radial':
          return 'Radial';
        case 'conic':
          return 'Conic';
      }
    }
    const value = this.fillInputValue(element);
    return value === 'transparent' ? 'Transparent' : preserveColorDisplayValue(value);
  }

  fillSwatchBackground(element: CanvasElement): string | null {
    if (element.fillMode === 'gradient' && element.gradient) {
      return gradientToCss(element.gradient);
    }
    const value = this.fillInputValue(element);
    return value === 'transparent' ? null : value;
  }

  isTransparentFill(element: CanvasElement): boolean {
    if (element.fillMode === 'gradient') return false;
    return isTransparentColor(this.fillInputValue(element));
  }

  fillInputValue(element: CanvasElement): string {
    if (element.fillMode === 'gradient') {
      return element.gradient?.stops[0]?.color ?? '#000000';
    }
    return this.toHexColorOrFallback(element.fill, DEFAULT_FILL_COLOR);
  }

  fillPickerValue(element: CanvasElement): string {
    if (element.fillMode === 'gradient') {
      return element.gradient?.stops[0]?.color ?? DEFAULT_FILL_COLOR;
    }
    const fillValue = this.fillInputValue(element);
    return fillValue !== 'transparent' ? fillValue : DEFAULT_FILL_COLOR;
  }

  fillGradient(element: CanvasElement): GradientFill | null {
    return element.gradient ?? null;
  }

  private fontSizeInPixels(element: CanvasElement): number {
    const fontSize = element.fontSize ?? 16;
    return this.fontSizeUnitValue(element) === 'rem' ? fontSize * 16 : fontSize;
  }

  private toHexColorOrFallback(value: string | undefined, fallback: string): string {
    if (!value) return fallback;
    const normalized = value.trim();
    if (normalized.toLowerCase() === 'transparent') return 'transparent';
    if (
      /^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{4}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/.test(normalized) ||
      /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(
        normalized,
      ) ||
      /^hsla?\(\s*[+-]?\d*\.?\d+\s*(?:deg)?\s*,\s*\d*\.?\d+%\s*,\s*\d*\.?\d+%(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(
        normalized,
      )
    ) {
      return normalized;
    }
    return fallback;
  }
}

function preserveColorDisplayValue(value: string): string {
  return value.startsWith('#') ? value.toUpperCase() : value;
}

function isTransparentColor(value: string): boolean {
  if (value.toLowerCase() === 'transparent') return true;
  if (/^#([A-Fa-f0-9]{4}|[A-Fa-f0-9]{8})$/.test(value)) {
    const alphaHex = value.length === 5 ? value[4] : value.slice(7, 9);
    return alphaHex.toLowerCase() === '0' || alphaHex.toLowerCase() === '00';
  }
  const rgbaMatch = value.match(
    /^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(\d*\.?\d+)\s*\)$/i,
  );
  if (rgbaMatch) return Number(rgbaMatch[1]) === 0;
  return false;
}
