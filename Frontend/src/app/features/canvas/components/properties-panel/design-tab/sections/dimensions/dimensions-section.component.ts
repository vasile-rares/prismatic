import { Component, input, output, ViewEncapsulation } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { DropdownSelectComponent, ContextMenuComponent, ToggleGroupComponent } from '@app/shared';
import { NumberInputComponent } from '../../../number-input/number-input.component';
import type { DropdownSelectOption, ContextMenuItem, ToggleGroupOption } from '@app/shared';
import {
  CanvasConstraintSizeMode,
  CanvasElement,
  CanvasPageModel,
  CanvasSizeMode,
} from '@app/core';

import {
  CanvasConstraintField,
  CanvasSizeAxis,
  deriveCanvasConstraintValueFromPixels,
  deriveCanvasSizeValueFromPixels,
  getCanvasConstraintMode,
  getCanvasConstraintModeField,
  getCanvasConstraintSizeValueField,
  getCanvasConstraintSizingValue,
  getCanvasConstraintSuffix,
  getCanvasConstraintValue,
  getCanvasFixedSize,
  getCanvasSizeMode,
  getCanvasSizeModeField,
  getCanvasSizeValueField,
  getCanvasSizeSuffix,
  getCanvasSizingValue,
  normalizeCanvasConstraintMode,
  normalizeCanvasConstraintValue,
  normalizeCanvasSizeMode,
  normalizeCanvasSizeValue,
  resolveCanvasConstraintPixels,
  resolveCanvasPixelsFromMode,
  shouldDisableCanvasSizeInput,
  supportsCanvasConstraintSizeMode,
  supportsCanvasSizeMode,
} from '../../../../../utils/element/canvas-sizing.util';
import { roundToTwoDecimals } from '../../../../../utils/canvas-math.util';

type DimensionConstraintField = 'minWidth' | 'maxWidth' | 'minHeight' | 'maxHeight';

interface DimensionModeDefinition {
  mode: CanvasSizeMode;
  label: string;
}

interface DimensionConstraintModeDefinition {
  mode: CanvasConstraintSizeMode;
  label: string;
}

interface DimensionConstraintFieldDefinition {
  id: DimensionConstraintField;
  label: string;
}

const DIMENSION_MODE_DEFINITIONS: readonly DimensionModeDefinition[] = [
  { mode: 'fixed', label: 'Fixed' },
  { mode: 'relative', label: 'Relative' },
  { mode: 'fill', label: 'Fill' },
  { mode: 'fit-content', label: 'Fit Content' },
  { mode: 'viewport', label: 'Viewport' },
  { mode: 'fit-image', label: 'Fit Image' },
] as const;

const DIMENSION_CONSTRAINT_MODE_DEFINITIONS: readonly DimensionConstraintModeDefinition[] = [
  { mode: 'fixed', label: 'Fixed' },
  { mode: 'relative', label: 'Relative' },
] as const;

const DIMENSION_CONSTRAINT_FIELD_DEFINITIONS: readonly DimensionConstraintFieldDefinition[] = [
  { id: 'minWidth', label: 'Min Width' },
  { id: 'maxWidth', label: 'Max Width' },
  { id: 'minHeight', label: 'Min Height' },
  { id: 'maxHeight', label: 'Max Height' },
] as const;

@Component({
  selector: 'app-design-tab-dimensions-section',
  standalone: true,
  imports: [
    FormsModule,
    DropdownSelectComponent,
    NumberInputComponent,
    ContextMenuComponent,
    ToggleGroupComponent,
  ],
  templateUrl: './dimensions-section.component.html',
  encapsulation: ViewEncapsulation.None,
})
export class DimensionsSectionComponent {
  readonly element = input.required<CanvasElement>();
  readonly liveSize = input<{ width: number; height: number } | null>(null);
  readonly pages = input<readonly CanvasPageModel[]>([]);
  readonly currentPageId = input<string | null>(null);

  readonly elementPatch = output<Partial<CanvasElement>>();
  readonly numberInputGestureStarted = output<void>();
  readonly numberInputGestureCommitted = output<void>();

  dimensionMenuItems: ContextMenuItem[] = [];
  dimensionMenuX = 0;
  dimensionMenuY = 0;

  private readonly imageDimensionsCache = new Map<
    string,
    Promise<{ width: number; height: number } | null>
  >();

  readonly dimensionModeDefinitions = DIMENSION_MODE_DEFINITIONS;
  readonly dimensionConstraintModeDefinitions = DIMENSION_CONSTRAINT_MODE_DEFINITIONS;

  readonly textGrowOptions: readonly ToggleGroupOption[] = [
    { label: '', value: 'auto-width', icon: 'grow-auto-width', title: 'Auto Width' },
    { label: '', value: 'auto-height', icon: 'grow-auto-height', title: 'Auto Height' },
    { label: '', value: 'fixed', icon: 'grow-fixed', title: 'Fixed Size' },
  ];

  textGrowValue(element: CanvasElement): string {
    const wMode = element.widthMode ?? 'fixed';
    const hMode = element.heightMode ?? 'fixed';
    if (wMode === 'fit-content' && hMode === 'fit-content') return 'auto-width';
    if ((wMode === 'fixed' || !element.widthMode) && hMode === 'fit-content') return 'auto-height';
    return 'fixed';
  }

  onTextGrowChange(value: string | number | boolean): void {
    if (typeof value !== 'string') return;
    const element = this.element();
    const parent = this.parentElement(element);
    const page = this.currentPageModel();

    if (value === 'auto-width') {
      this.elementPatch.emit({ widthMode: 'fit-content', heightMode: 'fit-content' });
    } else if (value === 'auto-height') {
      this.elementPatch.emit({
        widthMode: undefined,
        widthSizingValue: undefined,
        heightMode: 'fit-content',
      });
    } else {
      const wFixed = getCanvasFixedSize(element, 'width');
      const hFixed = getCanvasFixedSize(element, 'height');
      const wPixels = resolveCanvasPixelsFromMode(
        'fixed',
        wFixed,
        'width',
        undefined,
        parent,
        page,
      );
      const hPixels = resolveCanvasPixelsFromMode(
        'fixed',
        hFixed,
        'height',
        undefined,
        parent,
        page,
      );
      this.elementPatch.emit({
        widthMode: undefined,
        heightMode: undefined,
        width: wPixels,
        height: hPixels,
        widthSizingValue: undefined,
        heightSizingValue: undefined,
      });
    }
  }

  onNumberInputGestureStarted(): void {
    this.numberInputGestureStarted.emit();
  }

  onNumberInputGestureCommitted(): void {
    this.numberInputGestureCommitted.emit();
  }

  onDimensionSectionHeaderClick(event: MouseEvent): void {
    this.openDimensionMenu(event, this.resolveSectionHeaderTrigger(event));
  }

  onDimensionSectionToggleClick(event: MouseEvent): void {
    event.stopPropagation();
    this.onDimensionSectionHeaderClick(event);
  }

  closeDimensionMenu(): void {
    this.dimensionMenuItems = [];
  }

  dimensionModeValue(element: CanvasElement, axis: CanvasSizeAxis): CanvasSizeMode {
    return normalizeCanvasSizeMode(
      getCanvasSizeMode(element, axis),
      element,
      this.parentElement(element),
      axis,
    );
  }

  dimensionModeOptions(element: CanvasElement, axis: CanvasSizeAxis): DropdownSelectOption[] {
    const parent = this.parentElement(element);
    const hasChildren = (this.currentPageModel()?.elements ?? []).some(
      (e) => e.parentId === element.id,
    );
    return this.dimensionModeDefinitions.map((definition) => ({
      label: definition.label,
      triggerLabel: this.getDimensionModeTriggerLabel(definition.mode),
      value: definition.mode,
      disabled: !supportsCanvasSizeMode(definition.mode, element, parent, hasChildren, axis),
    }));
  }

  dimensionInputValue(element: CanvasElement, axis: CanvasSizeAxis): number {
    const mode = this.dimensionModeValue(element, axis);
    const parent = this.parentElement(element);
    const page = this.currentPageModel();
    const fixedPixels = getCanvasFixedSize(element, axis);
    const sizingValue = getCanvasSizingValue(element, axis);

    if (mode === 'fit-content' || mode === 'fit-image') {
      const live = this.liveSize();
      return live
        ? axis === 'width'
          ? Math.round(live.width)
          : Math.round(live.height)
        : fixedPixels;
    }
    if (mode === 'fixed') {
      return fixedPixels;
    }
    if (mode === 'fill') {
      return 100;
    }
    return (
      sizingValue ?? deriveCanvasSizeValueFromPixels(mode, fixedPixels, axis, parent, page) ?? 100
    );
  }

  dimensionInputSuffix(element: CanvasElement, axis: CanvasSizeAxis): string | null {
    return getCanvasSizeSuffix(this.dimensionModeValue(element, axis), axis);
  }

  isDimensionInputDisabled(element: CanvasElement, axis: CanvasSizeAxis): boolean {
    return shouldDisableCanvasSizeInput(this.dimensionModeValue(element, axis));
  }

  onDimensionValueChange(axis: CanvasSizeAxis, value: number): void {
    if (!Number.isFinite(value)) return;

    const element = this.element();
    const mode = this.dimensionModeValue(element, axis);
    if (shouldDisableCanvasSizeInput(mode)) return;

    const parent = this.parentElement(element);
    const page = this.currentPageModel();
    const normalizedValue = Math.max(1, roundToTwoDecimals(value));
    const nextPixels =
      mode === 'fixed'
        ? normalizedValue
        : resolveCanvasPixelsFromMode(
            mode,
            getCanvasFixedSize(element, axis),
            axis,
            normalizedValue,
            parent,
            page,
          );

    this.elementPatch.emit(
      mode === 'fixed'
        ? ({ [axis]: nextPixels } as Partial<CanvasElement>)
        : ({
            [axis]: nextPixels,
            [getCanvasSizeValueField(axis)]: normalizeCanvasSizeValue(mode, normalizedValue),
          } as Partial<CanvasElement>),
    );

    this.syncFitImageAxisFromOpposite(axis, element, nextPixels);
  }

  onDimensionModeChange(axis: CanvasSizeAxis, value: string | number | boolean | null): void {
    if (typeof value !== 'string') return;

    const element = this.element();
    const parent = this.parentElement(element);
    const nextMode = normalizeCanvasSizeMode(value, element, parent, axis);

    if (nextMode === 'fit-image') {
      void this.applyFitImageSize(axis, element);
      return;
    }

    const currentMode = this.dimensionModeValue(element, axis);
    if (nextMode === currentMode) return;

    const page = this.currentPageModel();
    const fixedPixels = getCanvasFixedSize(element, axis);
    const nextSizingValue =
      nextMode === 'fixed' || nextMode === 'fit-content'
        ? undefined
        : nextMode === 'fill'
          ? 100
          : (deriveCanvasSizeValueFromPixels(nextMode, fixedPixels, axis, parent, page) ?? 100);

    this.elementPatch.emit({
      [axis]: resolveCanvasPixelsFromMode(
        nextMode,
        fixedPixels,
        axis,
        nextSizingValue,
        parent,
        page,
      ),
      [getCanvasSizeModeField(axis)]: nextMode === 'fixed' ? undefined : nextMode,
      [getCanvasSizeValueField(axis)]: normalizeCanvasSizeValue(nextMode, nextSizingValue),
    } as Partial<CanvasElement>);
  }

  hasDimensionConstraintField(element: CanvasElement, field: DimensionConstraintField): boolean {
    return Number.isFinite(getCanvasConstraintValue(element, field) ?? Number.NaN);
  }

  dimensionConstraintModeValue(
    element: CanvasElement,
    field: DimensionConstraintField,
  ): CanvasConstraintSizeMode {
    return normalizeCanvasConstraintMode(
      getCanvasConstraintMode(element, field),
      element,
      this.parentElement(element),
    );
  }

  dimensionConstraintModeOptions(
    element: CanvasElement,
    field: DimensionConstraintField,
  ): DropdownSelectOption[] {
    const parent = this.parentElement(element);
    return this.dimensionConstraintModeDefinitions.map((definition) => ({
      label: definition.label,
      triggerLabel: this.getDimensionModeTriggerLabel(definition.mode),
      value: definition.mode,
      disabled: !supportsCanvasConstraintSizeMode(definition.mode, element, parent),
    }));
  }

  dimensionConstraintInputValue(element: CanvasElement, field: DimensionConstraintField): number {
    const pixels = getCanvasConstraintValue(element, field);
    const mode = this.dimensionConstraintModeValue(element, field);
    if (!Number.isFinite(pixels ?? Number.NaN)) return 0;
    if (mode === 'fixed') return pixels as number;
    return (
      getCanvasConstraintSizingValue(element, field) ??
      deriveCanvasConstraintValueFromPixels(
        'relative',
        pixels as number,
        field === 'minWidth' || field === 'maxWidth' ? 'width' : 'height',
        this.parentElement(element),
      ) ??
      100
    );
  }

  dimensionConstraintInputSuffix(
    element: CanvasElement,
    field: DimensionConstraintField,
  ): string | null {
    return getCanvasConstraintSuffix(this.dimensionConstraintModeValue(element, field));
  }

  onDimensionConstraintValueChange(field: DimensionConstraintField, value: number): void {
    if (!Number.isFinite(value)) return;

    const element = this.element();
    const mode = this.dimensionConstraintModeValue(element, field);
    const axis: CanvasSizeAxis = field === 'minWidth' || field === 'maxWidth' ? 'width' : 'height';
    const normalizedValue = Math.max(1, roundToTwoDecimals(value));

    if (mode === 'fixed') {
      this.elementPatch.emit({
        [field]: normalizedValue,
        [getCanvasConstraintModeField(field)]: undefined,
        [getCanvasConstraintSizeValueField(field)]: undefined,
      } as Partial<CanvasElement>);
      return;
    }

    this.elementPatch.emit({
      [field]: resolveCanvasConstraintPixels(
        mode,
        getCanvasConstraintValue(element, field) ?? normalizedValue,
        axis,
        normalizedValue,
        this.parentElement(element),
      ),
      [getCanvasConstraintSizeValueField(field)]: normalizeCanvasConstraintValue(
        mode,
        normalizedValue,
      ),
    } as Partial<CanvasElement>);
  }

  onDimensionConstraintModeChange(
    field: DimensionConstraintField,
    value: string | number | boolean | null,
  ): void {
    if (typeof value !== 'string') return;

    const element = this.element();
    const parent = this.parentElement(element);
    const nextMode = normalizeCanvasConstraintMode(value, element, parent);
    const currentMode = this.dimensionConstraintModeValue(element, field);
    if (nextMode === currentMode) return;

    const currentPixels = getCanvasConstraintValue(element, field);
    if (!Number.isFinite(currentPixels ?? Number.NaN)) return;

    const axis: CanvasSizeAxis = field === 'minWidth' || field === 'maxWidth' ? 'width' : 'height';
    const nextSizingValue =
      nextMode === 'fixed'
        ? undefined
        : (deriveCanvasConstraintValueFromPixels(nextMode, currentPixels as number, axis, parent) ??
          100);

    this.elementPatch.emit({
      [field]:
        nextMode === 'fixed'
          ? roundToTwoDecimals(currentPixels as number)
          : resolveCanvasConstraintPixels(
              nextMode,
              currentPixels as number,
              axis,
              nextSizingValue,
              parent,
            ),
      [getCanvasConstraintModeField(field)]: nextMode === 'fixed' ? undefined : nextMode,
      [getCanvasConstraintSizeValueField(field)]: normalizeCanvasConstraintValue(
        nextMode,
        nextSizingValue,
      ),
    } as Partial<CanvasElement>);
  }

  private getDimensionModeTriggerLabel(mode: CanvasSizeMode | CanvasConstraintSizeMode): string {
    switch (mode) {
      case 'fixed':
        return 'Fixed';
      case 'relative':
        return 'Rel';
      case 'fill':
        return 'Fill';
      case 'fit-content':
        return 'Fit';
      case 'viewport':
        return 'View';
      case 'fit-image':
        return 'Fit Img';
      default:
        return 'Fixed';
    }
  }

  private async applyFitImageSize(axis: CanvasSizeAxis, element: CanvasElement): Promise<void> {
    if (element.fillMode !== 'image' || !element.backgroundImage) return;

    const dimensions = await this.loadImageDimensions(element.backgroundImage);
    if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) return;

    const aspectRatio = dimensions.width / dimensions.height;
    if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) return;

    const oppositeAxis: CanvasSizeAxis = axis === 'width' ? 'height' : 'width';
    const currentOppositeMode = this.dimensionModeValue(element, oppositeAxis);
    const patch: Partial<CanvasElement> = {
      [getCanvasSizeModeField(axis)]: 'fit-image',
      [getCanvasSizeValueField(axis)]: undefined,
    } as Partial<CanvasElement>;

    if (currentOppositeMode === 'fit-image') {
      patch[getCanvasSizeModeField(oppositeAxis)] = undefined;
      patch[getCanvasSizeValueField(oppositeAxis)] = undefined;
    }

    if (axis === 'width') {
      patch.width = Math.max(1, roundToTwoDecimals(element.height * aspectRatio));
    } else {
      patch.height = Math.max(1, roundToTwoDecimals(element.width / aspectRatio));
    }

    this.elementPatch.emit(patch);
  }

  private syncFitImageAxisFromOpposite(
    changedAxis: CanvasSizeAxis,
    element: CanvasElement,
    changedAxisPixels: number,
  ): void {
    const dependentAxis: CanvasSizeAxis = changedAxis === 'width' ? 'height' : 'width';
    if (this.dimensionModeValue(element, dependentAxis) !== 'fit-image' || !element.backgroundImage)
      return;
    void this.applyFitImageSizeFromPixels(
      dependentAxis,
      element.backgroundImage,
      changedAxisPixels,
    );
  }

  private async applyFitImageSizeFromPixels(
    axis: CanvasSizeAxis,
    imageUrl: string,
    oppositeAxisPixels: number,
  ): Promise<void> {
    const dimensions = await this.loadImageDimensions(imageUrl);
    if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) return;

    const aspectRatio = dimensions.width / dimensions.height;
    if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) return;

    const patch: Partial<CanvasElement> = {
      [getCanvasSizeValueField(axis)]: undefined,
    } as Partial<CanvasElement>;
    if (axis === 'width') {
      patch.width = Math.max(1, roundToTwoDecimals(oppositeAxisPixels * aspectRatio));
    } else {
      patch.height = Math.max(1, roundToTwoDecimals(oppositeAxisPixels / aspectRatio));
    }
    this.elementPatch.emit(patch);
  }

  private loadImageDimensions(imageUrl: string): Promise<{ width: number; height: number } | null> {
    const cached = this.imageDimensionsCache.get(imageUrl);
    if (cached) return cached;

    const promise = new Promise<{ width: number; height: number } | null>((resolve) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        resolve(
          image.naturalWidth > 0 && image.naturalHeight > 0
            ? { width: image.naturalWidth, height: image.naturalHeight }
            : null,
        );
      };
      image.onerror = () => {
        this.imageDimensionsCache.delete(imageUrl);
        resolve(null);
      };
      image.src = imageUrl;
    });

    this.imageDimensionsCache.set(imageUrl, promise);
    return promise;
  }

  private openDimensionMenu(event: MouseEvent | null, trigger: HTMLElement | null): void {
    const position = this.resolveMenuPosition(event, trigger);
    if (!position) return;
    if (this.dimensionMenuItems.length > 0) return;
    this.dimensionMenuItems = this.buildDimensionMenuItems(this.element());
    this.dimensionMenuX = position.x;
    this.dimensionMenuY = position.y;
  }

  private buildDimensionMenuItems(element: CanvasElement): ContextMenuItem[] {
    return DIMENSION_CONSTRAINT_FIELD_DEFINITIONS.map((field) => ({
      id: field.id,
      label: field.label,
      checked: this.hasDimensionConstraintField(element, field.id),
      showCheckSlot: true,
      action: () => this.toggleDimensionConstraintField(field.id),
    }));
  }

  private toggleDimensionConstraintField(field: DimensionConstraintField): void {
    const element = this.element();
    if (this.hasDimensionConstraintField(element, field)) {
      this.elementPatch.emit({
        [field]: undefined,
        [getCanvasConstraintModeField(field)]: undefined,
        [getCanvasConstraintSizeValueField(field)]: undefined,
      } as Partial<CanvasElement>);
      this.closeDimensionMenu();
      return;
    }
    const axis: CanvasSizeAxis = field === 'minWidth' || field === 'maxWidth' ? 'width' : 'height';
    this.elementPatch.emit({
      [field]: getCanvasFixedSize(element, axis),
      [getCanvasConstraintModeField(field)]: undefined,
      [getCanvasConstraintSizeValueField(field)]: undefined,
    } as Partial<CanvasElement>);
    this.closeDimensionMenu();
  }

  private currentPageModel(): CanvasPageModel | null {
    const currentPageId = this.currentPageId();
    if (!currentPageId) return this.pages()[0] ?? null;
    return this.pages().find((page) => page.id === currentPageId) ?? this.pages()[0] ?? null;
  }

  private parentElement(element: CanvasElement): CanvasElement | null {
    if (!element.parentId) return null;
    const parent = this.currentPageModel()?.elements.find((c) => c.id === element.parentId) ?? null;
    if (!parent) return null;
    const isFlowLayoutChild =
      !!parent.display &&
      (parent.type === 'frame' || parent.type === 'rectangle') &&
      (!element.position ||
        element.position === 'static' ||
        element.position === 'relative' ||
        element.position === 'sticky');
    return {
      ...parent,
      padding: isFlowLayoutChild ? parent.padding : undefined,
    };
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
}
