import { Component, input, output, ViewEncapsulation } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { ToggleGroupComponent, ContextMenuComponent } from '@app/shared';
import { NumberInputComponent } from '../../../number-input/number-input.component';
import { FieldInputComponent } from '../../../field-input/field-input.component';
import type { ToggleGroupOption, ContextMenuItem } from '@app/shared';
import {
  CanvasBorderSides,
  CanvasBorderWidths,
  CanvasCornerRadii,
  CanvasElement,
  CanvasFilterType,
  CanvasOverflowMode,
  GradientFill,
} from '@app/core';
import { gradientToCss } from '../../../../../utils/canvas-gradient.util';

import {
  getDefaultCornerRadius,
  getResolvedCornerRadii,
  hasPerCornerRadius,
} from '../../../../../utils/element/canvas-element-normalization.util';
import { roundToTwoDecimals } from '../../../../../utils/canvas-math.util';
import {
  buildCanvasShadowCss,
  DEFAULT_EDITABLE_CANVAS_SHADOW,
  hasCanvasShadow,
  normalizeCanvasShadowValue,
  resolveEditableCanvasShadow,
} from '../../../../../utils/element/canvas-shadow.util';
import { DropdownSelectComponent } from '@app/shared';
import type { DropdownSelectOption } from '@app/shared';
import {
  DEFAULT_FILL_COLOR,
  DEFAULT_FRAME_FILL_COLOR,
  DEFAULT_STROKE_COLOR,
} from '../../../../../utils/canvas-defaults.constants';

type CornerRadiusMode = 'full' | 'per-corner';
type EditableNumericField = 'opacity' | 'cornerRadius';

interface FilterDefinition {
  id: CanvasFilterType;
  label: string;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  unit: string;
}

const FILTER_DEFINITIONS: readonly FilterDefinition[] = [
  { id: 'blur', label: 'Blur', defaultValue: 4, min: 0, max: 100, step: 1, unit: '' },
  { id: 'backdropBlur', label: 'BG Blur', defaultValue: 4, min: 0, max: 100, step: 1, unit: '' },
  {
    id: 'brightness',
    label: 'Brightness',
    defaultValue: 100,
    min: 0,
    max: 200,
    step: 1,
    unit: '%',
  },
  { id: 'contrast', label: 'Contrast', defaultValue: 100, min: 0, max: 200, step: 1, unit: '%' },
  { id: 'grayscale', label: 'Grayscale', defaultValue: 100, min: 0, max: 200, step: 1, unit: '%' },
  { id: 'hueRotate', label: 'Hue', defaultValue: 0, min: -360, max: 360, step: 1, unit: '°' },
  { id: 'invert', label: 'Invert', defaultValue: 100, min: 0, max: 200, step: 1, unit: '%' },
  { id: 'saturate', label: 'Saturate', defaultValue: 100, min: 0, max: 200, step: 1, unit: '%' },
  { id: 'sepia', label: 'Sepia', defaultValue: 100, min: 0, max: 200, step: 1, unit: '%' },
] as const;

const FILTER_FIELD_MAP: Record<CanvasFilterType, keyof CanvasElement> = {
  blur: 'filterBlur',
  backdropBlur: 'filterBackdropBlur',
  brightness: 'filterBrightness',
  contrast: 'filterContrast',
  grayscale: 'filterGrayscale',
  hueRotate: 'filterHueRotate',
  invert: 'filterInvert',
  saturate: 'filterSaturate',
  sepia: 'filterSepia',
};

const FILTER_DEFAULT_VALUES: Record<CanvasFilterType, number> = {
  blur: 0,
  backdropBlur: 0,
  brightness: 100,
  contrast: 100,
  grayscale: 0,
  hueRotate: 0,
  invert: 0,
  saturate: 100,
  sepia: 0,
};

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
] as const;

@Component({
  selector: 'app-design-tab-appearance-section',
  standalone: true,
  imports: [
    FormsModule,
    DropdownSelectComponent,
    ToggleGroupComponent,
    NumberInputComponent,
    FieldInputComponent,
    ContextMenuComponent,
  ],
  templateUrl: './appearance-section.component.html',
  encapsulation: ViewEncapsulation.None,
})
export class AppearanceSectionComponent {
  readonly element = input.required<CanvasElement>();
  readonly projectId = input<number | null>(null);
  readonly autoOpenFillPopupElementId = input<string | null>(null);

  readonly elementPatch = output<Partial<CanvasElement>>();
  readonly numberInputGestureStarted = output<void>();
  readonly numberInputGestureCommitted = output<void>();

  readonly overflowOptions: DropdownSelectOption[] = [
    { label: 'Clip', value: 'clip' },
    { label: 'Visible', value: 'visible' },
    { label: 'Hidden', value: 'hidden' },
    { label: 'Scroll', value: 'scroll' },
  ];
  readonly shadowActivationPatch: Partial<CanvasElement> = {
    shadow: buildCanvasShadowCss(DEFAULT_EDITABLE_CANVAS_SHADOW),
  };
  readonly shadowClearPatch: Partial<CanvasElement> = { shadow: undefined };
  readonly visibleOptions: readonly ToggleGroupOption[] = [
    { label: 'Yes', value: true },
    { label: 'No', value: false },
  ];
  readonly cornerRadiusModeOptions: readonly ToggleGroupOption[] = [
    {
      label: '',
      value: 'full',
      icon: 'radius-full',
      ariaLabel: 'Use full corner radius',
      title: 'Full radius',
    },
    {
      label: '',
      value: 'per-corner',
      icon: 'radius-corners',
      ariaLabel: 'Use per-corner radius',
      title: 'Per-corner radius',
    },
  ];
  readonly cornerRadiusFields = CORNER_RADIUS_FIELD_DEFINITIONS;
  readonly borderStyleOptions = ['Solid', 'Dashed', 'Dotted', 'Double'];

  styleMenuItems: ContextMenuItem[] = [];
  styleMenuX = 0;
  styleMenuY = 0;

  readonly filterDefinitions = FILTER_DEFINITIONS;

  onNumberInputGestureStarted(): void {
    this.numberInputGestureStarted.emit();
  }

  onNumberInputGestureCommitted(): void {
    this.numberInputGestureCommitted.emit();
  }

  onNumberChange(field: EditableNumericField, valueOrEvent: number | Event): void {
    const value =
      typeof valueOrEvent === 'number'
        ? valueOrEvent
        : Number((valueOrEvent.target as HTMLInputElement).value);
    if (!Number.isFinite(value)) return;

    const element = this.element();
    if (field === 'cornerRadius' && this.cornerRadiusMode(element) === 'per-corner') {
      this.elementPatch.emit({
        cornerRadius: Math.max(0, roundToTwoDecimals(value)),
        cornerRadii: undefined,
      });
      return;
    }
    this.elementPatch.emit({ [field]: value } as Partial<CanvasElement>);
  }

  opacitySliderPercent(element: CanvasElement): string {
    const value = Number.isFinite(element.opacity ?? Number.NaN) ? (element.opacity as number) : 1;
    return `${Math.max(0, Math.min(100, Math.round(value * 100)))}%`;
  }

  isVisible(element: CanvasElement): boolean {
    return element.visible !== false;
  }

  setVisible(visible: boolean): void {
    this.elementPatch.emit({ visible });
  }

  hasFill(type: CanvasElement['type']): boolean {
    return type !== 'text' && type !== 'image';
  }

  isTransparentFill(element: CanvasElement): boolean {
    if (element.fillMode === 'image' || element.fillMode === 'gradient') return false;
    return isTransparentColor(this.fillInputValue(element));
  }

  fillLabel(element: CanvasElement): string {
    if (element.fillMode === 'image') return 'Image';
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
    if (element.fillMode === 'image' && element.backgroundImage) {
      return `url(${element.backgroundImage}) center/cover no-repeat`;
    }
    if (element.fillMode === 'gradient' && element.gradient) {
      return gradientToCss(element.gradient);
    }
    const value = this.fillInputValue(element);
    return value === 'transparent' ? null : value;
  }

  fillInputValue(element: CanvasElement): string {
    if (element.fillMode === 'gradient') {
      return element.gradient?.stops[0]?.color ?? '#000000';
    }
    if (element.type === 'svg' && !element.fill) return 'transparent';
    const fallback = element.type === 'frame' ? DEFAULT_FRAME_FILL_COLOR : DEFAULT_FILL_COLOR;
    return this.toHexColorOrFallback(element.fill, fallback);
  }

  fillPickerValue(element: CanvasElement): string {
    if (element.fillMode === 'gradient') {
      return element.gradient?.stops[0]?.color ?? '#000000';
    }
    const fillValue = this.fillInputValue(element);
    if (fillValue !== 'transparent') return fillValue;
    return element.type === 'frame' ? DEFAULT_FRAME_FILL_COLOR : DEFAULT_FILL_COLOR;
  }

  fillGradient(element: CanvasElement): GradientFill | null {
    return element.fillMode === 'gradient' ? (element.gradient ?? null) : null;
  }

  supportsOverflow(type: CanvasElement['type']): boolean {
    return type === 'frame' || type === 'rectangle';
  }

  overflowValue(element: CanvasElement): CanvasOverflowMode {
    return element.overflow ?? 'clip';
  }

  onOverflowChange(value: string | number | boolean | null): void {
    if (typeof value !== 'string') return;
    this.elementPatch.emit({ overflow: value as CanvasOverflowMode });
  }

  supportsCornerRadius(type: CanvasElement['type']): boolean {
    return type !== 'text' && type !== 'svg';
  }

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
      return;
    }
    this.elementPatch.emit({ cornerRadius: uniformValue, cornerRadii: undefined });
  }

  onCornerRadiusCornerChange(corner: keyof CanvasCornerRadii, value: number): void {
    if (!Number.isFinite(value)) return;
    const nextRadii = {
      ...getResolvedCornerRadii(this.element()),
      [corner]: Math.max(0, roundToTwoDecimals(value)),
    } satisfies CanvasCornerRadii;
    this.elementPatch.emit({ cornerRadii: nextRadii });
  }

  hasStroke(type: CanvasElement['type']): boolean {
    return type !== 'text' && type !== 'svg';
  }

  hasActiveBorder(element: CanvasElement): boolean {
    if (!element.stroke) return false;
    if (element.strokeWidths) return Object.values(element.strokeWidths).some((v) => v > 0);
    return (element.strokeWidth ?? 1) > 0;
  }

  borderSummary(element: CanvasElement): string {
    return this.borderStyleValue(element);
  }

  borderStyleValue(element: CanvasElement): string {
    return element.strokeStyle ?? 'Solid';
  }

  strokeSwatchBackground(element: CanvasElement): string {
    return this.strokeInputValue(element);
  }

  strokeInputValue(element: CanvasElement): string {
    return this.toHexColorOrFallback(element.stroke, DEFAULT_STROKE_COLOR);
  }

  strokeSidesValue(element: CanvasElement): CanvasBorderSides | null {
    if (element.strokeSides) return element.strokeSides;
    if (!element.strokeWidths) return null;
    return {
      top: element.strokeWidths.top > 0,
      right: element.strokeWidths.right > 0,
      bottom: element.strokeWidths.bottom > 0,
      left: element.strokeWidths.left > 0,
    };
  }

  strokeWidthsValue(element: CanvasElement): CanvasBorderWidths | null {
    return element.strokeWidths ?? null;
  }

  supportsShadow(type: CanvasElement['type']): boolean {
    return type !== 'text';
  }

  svgRotationValue(element: CanvasElement): number {
    return element.rotation ?? 0;
  }

  onSvgRotationChange(value: number): void {
    if (!Number.isFinite(value)) return;
    this.elementPatch.emit({ rotation: value });
  }

  hasActiveShadow(element: CanvasElement): boolean {
    return hasCanvasShadow(element.shadow);
  }

  shadowSummary(element: CanvasElement): string {
    if (!hasCanvasShadow(element.shadow)) return 'None';
    const shadow = resolveEditableCanvasShadow(element.shadow);
    return `${this.formatShadowMetric(shadow.x)}, ${this.formatShadowMetric(shadow.y)}, ${this.formatShadowMetric(shadow.spread)}`;
  }

  shadowValue(element: CanvasElement): string | null {
    return normalizeCanvasShadowValue(element.shadow) ?? null;
  }

  // Filters

  hasFilters(element: CanvasElement): boolean {
    return (element.cssFilterOptions?.length ?? 0) > 0;
  }

  isFilterAdded(element: CanvasElement, filterId: CanvasFilterType): boolean {
    return element.cssFilterOptions?.includes(filterId) ?? false;
  }

  activeFilterDefinitions(element: CanvasElement): readonly FilterDefinition[] {
    return FILTER_DEFINITIONS.filter((def) => this.isFilterAdded(element, def.id));
  }

  filterValue(element: CanvasElement, filterId: CanvasFilterType): number {
    return (
      (element[FILTER_FIELD_MAP[filterId]] as number | undefined) ?? FILTER_DEFAULT_VALUES[filterId]
    );
  }

  onFilterValueChange(filterId: CanvasFilterType, value: number): void {
    if (!Number.isFinite(value)) return;
    const element = this.element();
    this.elementPatch.emit({
      [FILTER_FIELD_MAP[filterId]]: value,
      cssFilterOptions: this.mergeFilterOptions(element, filterId),
    } as Partial<CanvasElement>);
  }

  onZIndexChange(value: number): void {
    if (!Number.isFinite(value)) return;
    this.elementPatch.emit({ zIndex: Math.round(Math.min(10, Math.max(-1, value))) });
  }

  onZIndexRemove(): void {
    this.elementPatch.emit({ zIndex: undefined });
  }

  removeFilter(filterId: CanvasFilterType): void {
    const element = this.element();
    const next = (element.cssFilterOptions ?? []).filter((o) => o !== filterId);
    this.elementPatch.emit({
      cssFilterOptions: next.length > 0 ? next : undefined,
      [FILTER_FIELD_MAP[filterId]]: undefined,
    } as Partial<CanvasElement>);
  }

  onStyleSectionHeaderClick(event: MouseEvent): void {
    this.openStyleMenu(event, this.resolveSectionHeaderTrigger(event));
  }

  onStyleSectionToggleClick(event: MouseEvent): void {
    event.stopPropagation();
    this.onStyleSectionHeaderClick(event);
  }

  closeStyleMenu(): void {
    this.styleMenuItems = [];
  }

  private openStyleMenu(event: MouseEvent | null, trigger: HTMLElement | null): void {
    const position = this.resolveMenuPosition(event, trigger);
    if (!position) return;
    if (this.styleMenuItems.length > 0) {
      this.closeStyleMenu();
      return;
    }
    this.styleMenuItems = this.buildStyleMenuItems();
    this.styleMenuX = position.x;
    this.styleMenuY = position.y;
  }

  private buildStyleMenuItems(): ContextMenuItem[] {
    const element = this.element();
    const items: ContextMenuItem[] = [];
    if (element.zIndex === undefined) {
      items.push({
        id: 'zIndex',
        label: 'Z Index',
        action: () => {
          this.elementPatch.emit({ zIndex: 0 });
          this.closeStyleMenu();
        },
      });
    }
    items.push({
      id: 'filters',
      label: 'Filters',
      children: FILTER_DEFINITIONS.map((def) => ({
        id: def.id,
        label: def.label,
        action: () => {
          this.addFilter(def.id);
          this.closeStyleMenu();
        },
      })),
    });
    return items;
  }

  private addFilter(filterId: CanvasFilterType): void {
    const element = this.element();
    if (this.isFilterAdded(element, filterId)) return;
    const def = FILTER_DEFINITIONS.find((d) => d.id === filterId);
    this.elementPatch.emit({
      cssFilterOptions: [...(element.cssFilterOptions ?? []), filterId],
      [FILTER_FIELD_MAP[filterId]]: def?.defaultValue ?? FILTER_DEFAULT_VALUES[filterId],
    } as Partial<CanvasElement>);
  }

  private mergeFilterOptions(
    element: CanvasElement,
    filterId: CanvasFilterType,
  ): CanvasFilterType[] {
    const current = element.cssFilterOptions ?? [];
    if (current.includes(filterId)) return current;
    return [...current, filterId];
  }

  private resolveMenuPosition(
    event: MouseEvent | null,
    trigger: HTMLElement | null,
  ): { x: number; y: number } | null {
    if (event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
      return { x: event.clientX, y: event.clientY };
    }
    if (!trigger) return null;
    const rect = trigger.getBoundingClientRect();
    return { x: rect.left, y: rect.top - 6 };
  }

  private resolveSectionHeaderTrigger(event: MouseEvent): HTMLElement | null {
    const currentTarget = event.currentTarget;
    if (!(currentTarget instanceof HTMLElement)) return null;
    return (
      (currentTarget.closest('.properties-section-header') as HTMLElement | null) ??
      (currentTarget.querySelector('.properties-section-header') as HTMLElement | null)
    );
  }

  private formatShadowMetric(value: number): string {
    return roundToTwoDecimals(value).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
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
