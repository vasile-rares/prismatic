import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  Component,
  effect,
  ElementRef,
  HostListener,
  input,
  inject,
  OnDestroy,
  output,
  TemplateRef,
  ViewEncapsulation,
} from '@angular/core';
import { CanvasElement, GradientFill, GradientStop } from '@app/core';
import type {
  CanvasBorderSides,
  CanvasBorderWidths,
  CanvasObjectFit,
  CanvasTextDecorationLine,
  CanvasTextDecorationStyle,
} from '@app/core';
import { ProjectService } from '@app/core/services/project.service';
import { roundToTwoDecimals } from '../../../utils/canvas-math.util';
import {
  buildCanvasShadowCss,
  CanvasShadowPosition,
  DEFAULT_EDITABLE_CANVAS_SHADOW,
  resolveEditableCanvasShadow,
} from '../../../utils/element/canvas-shadow.util';
import {
  buildTextShadowCss,
  DEFAULT_EDITABLE_TEXT_SHADOW,
  resolveEditableTextShadow,
} from '../../../utils/element/canvas-text-shadow.util';
import { DropdownSelectComponent, ToggleGroupComponent } from '@app/shared';
import type { DropdownSelectOption, ToggleGroupOption, ToggleGroupValue } from '@app/shared';
import { NumberInputComponent } from '../number-input/number-input.component';
import {
  gradientToCss,
  defaultLinearGradient,
  defaultRadialGradient,
  defaultConicGradient,
  interpolateGradientColor,
  clampPosition,
  buildGradient,
} from '../../../utils/canvas-gradient.util';

type StylePopupFieldKind =
  | 'fill'
  | 'stroke'
  | 'shadow'
  | 'effect'
  | 'text-shadow'
  | 'text-decoration';
type ColorPickerDragTarget = 'surface' | 'hue' | 'alpha' | null;
type ColorPickerFormat = 'hex' | 'rgb' | 'hsl';
type ColorPickerMode = 'solid' | 'linear' | 'radial' | 'conic' | 'image';
type ShadowNumericField = 'x' | 'y' | 'blur' | 'spread';
type BorderNumericField = keyof CanvasBorderWidths;
type EyeDropperResult = { sRGBHex: string };
type EyeDropperInstance = { open(): Promise<EyeDropperResult> };
type EyeDropperConstructor = new () => EyeDropperInstance;

@Component({
  selector: 'app-dropdown-menu',
  standalone: true,
  imports: [
    FormsModule,
    NgTemplateOutlet,
    NumberInputComponent,
    DropdownSelectComponent,
    ToggleGroupComponent,
  ],
  templateUrl: './dropdown-menu.component.html',
  styleUrl: './dropdown-menu.component.css',
  encapsulation: ViewEncapsulation.None,
})
export class DropdownMenuComponent implements OnDestroy {
  // Inputs

  readonly projectId = input<number | null>(null);
  readonly kind = input<StylePopupFieldKind>('fill');
  readonly colorValue = input('#000000');
  readonly pickerColor = input('#000000');
  readonly isTransparent = input(false);
  readonly shadowValue = input<string | null>(null);
  readonly strokeWidth = input(1);
  readonly strokeStyle = input('Solid');
  readonly borderStyleOptions = input<string[]>([]);
  readonly strokeSides = input<CanvasBorderSides | null>(null);
  readonly strokeWidths = input<CanvasBorderWidths | null>(null);
  readonly effectTemplate = input<TemplateRef<unknown> | null>(null);
  readonly backgroundImage = input<string | null>(null);
  readonly backgroundSize = input('cover');
  readonly backgroundPosition = input('center');
  readonly backgroundRepeat = input('no-repeat');
  readonly objectFit = input<CanvasObjectFit>('cover');
  readonly imageAltText = input('');
  readonly initialColorMode = input<ColorPickerMode>('solid');
  readonly gradient = input<GradientFill | null>(null);
  readonly solidColorOnly = input(false);
  readonly textShadowValue = input<string | null>(null);
  readonly textDecorationLine = input<CanvasTextDecorationLine | null>(null);
  readonly textDecorationColor = input<string | null>(null);
  readonly textDecorationStyle = input<CanvasTextDecorationStyle | null>(null);
  readonly textDecorationThickness = input<number | null>(null);
  readonly textDecorationThicknessUnit = input<'px' | 'em'>('px');

  // Outputs

  readonly patchRequested = output<Partial<CanvasElement>>();
  readonly numberGestureStarted = output<void>();
  readonly numberGestureCommitted = output<void>();

  // Public state

  pickerHue = 0;
  pickerSaturation = 0;
  pickerValue = 0;
  pickerAlpha = 1;
  selectedStrokeStyleOption: string | null = null;
  borderSideMode: 'all' | 'per-side' = 'all';
  selectedColorFormat: ColorPickerFormat = 'hex';
  selectedColorMode: ColorPickerMode = 'solid';
  shadowPosition: CanvasShadowPosition = DEFAULT_EDITABLE_CANVAS_SHADOW.position;
  shadowX = DEFAULT_EDITABLE_CANVAS_SHADOW.x;
  shadowY = DEFAULT_EDITABLE_CANVAS_SHADOW.y;
  shadowBlur = DEFAULT_EDITABLE_CANVAS_SHADOW.blur;
  shadowSpread = DEFAULT_EDITABLE_CANVAS_SHADOW.spread;
  textShadowX = DEFAULT_EDITABLE_TEXT_SHADOW.x;
  textShadowY = DEFAULT_EDITABLE_TEXT_SHADOW.y;
  textShadowBlur = DEFAULT_EDITABLE_TEXT_SHADOW.blur;
  selectedDecorationLine: CanvasTextDecorationLine = 'underline';
  selectedDecorationStyle: CanvasTextDecorationStyle = 'solid';
  decorationThicknessValue: number | null = null;
  showDecorationColorPicker = false;
  showShadowColorPicker = false;
  isScreenPickerActive = false;
  isUploadingImage = false;
  imageUploadError = '';
  gradientStops: GradientStop[] = [
    { color: '#FFFFFF', position: 0 },
    { color: '#000000', position: 100 },
  ];
  gradientAngle = 90;
  selectedStopIndex = 0;

  // Options

  readonly colorFormatOptions: DropdownSelectOption[] = [
    { label: 'HEX', value: 'hex' },
    { label: 'RGB', value: 'rgb' },
    { label: 'HSL', value: 'hsl' },
  ];
  readonly colorModeOptions: readonly ToggleGroupOption[] = [
    { label: '', value: 'solid', icon: 'paint-solid', ariaLabel: 'Solid', title: 'Solid' },
    { label: '', value: 'linear', icon: 'paint-linear', ariaLabel: 'Linear', title: 'Linear' },
    { label: '', value: 'radial', icon: 'paint-radial', ariaLabel: 'Radial', title: 'Radial' },
    { label: '', value: 'conic', icon: 'paint-conic', ariaLabel: 'Conic', title: 'Conic' },
    { label: '', value: 'image', icon: 'paint-image', ariaLabel: 'Image', title: 'Image' },
  ];
  readonly colorModeOptionsSolid: readonly ToggleGroupOption[] = [
    { label: '', value: 'solid', icon: 'paint-solid', ariaLabel: 'Solid', title: 'Solid' },
  ];
  readonly decorationLineOptions: DropdownSelectOption[] = [
    { label: 'Underline', value: 'underline' },
    { label: 'Linethrough', value: 'line-through' },
  ];
  readonly decorationStyleOptions: DropdownSelectOption[] = [
    { label: 'Solid', value: 'solid' },
    { label: 'Double', value: 'double' },
    { label: 'Dotted', value: 'dotted' },
    { label: 'Dashed', value: 'dashed' },
    { label: 'Wavy', value: 'wavy' },
  ];
  readonly decorationThicknessUnitOptions: DropdownSelectOption[] = [
    { label: 'Px', value: 'px' },
    { label: 'Em', value: 'em' },
  ];
  readonly shadowPositionOptions: readonly ToggleGroupOption[] = [
    { label: 'Outside', value: 'outside', ariaLabel: 'Outside shadow', title: 'Outside' },
    { label: 'Inside', value: 'inside', ariaLabel: 'Inside shadow', title: 'Inside' },
  ];
  readonly borderSideModeOptions: readonly ToggleGroupOption[] = [
    {
      label: '',
      value: 'all',
      icon: 'border-all',
      ariaLabel: 'Apply border to all sides',
      title: 'All sides',
    },
    {
      label: '',
      value: 'per-side',
      icon: 'border-sides',
      ariaLabel: 'Apply border per side',
      title: 'Per-side border',
    },
  ];
  readonly borderWidthFields: ReadonlyArray<{
    key: BorderNumericField;
    label: string;
    ariaLabel: string;
  }> = [
    { key: 'top', label: 'T', ariaLabel: 'Top border width' },
    { key: 'right', label: 'R', ariaLabel: 'Right border width' },
    { key: 'bottom', label: 'B', ariaLabel: 'Bottom border width' },
    { key: 'left', label: 'L', ariaLabel: 'Left border width' },
  ];
  readonly imageTypeOptions: DropdownSelectOption[] = [
    { label: 'Fill', value: 'fill' },
    { label: 'Fit', value: 'fit' },
    { label: 'Stretch', value: 'stretch' },
  ];
  readonly backgroundPositionOptions: DropdownSelectOption[] = [
    { label: 'Center', value: 'center' },
    { label: 'Left', value: 'left' },
    { label: 'Right', value: 'right' },
    { label: 'Top Left', value: 'top left' },
    { label: 'Top Center', value: 'top center' },
    { label: 'Top Right', value: 'top right' },
    { label: 'Bottom Left', value: 'bottom left' },
    { label: 'Bottom Center', value: 'bottom center' },
    { label: 'Bottom Right', value: 'bottom right' },
  ];
  imagePreviewUrl: string | null = null;

  // Private state

  private readonly projectService = inject(ProjectService);
  private colorPickerDragTarget: ColorPickerDragTarget = null;
  private isColorGestureActive = false;
  private gradientDragStopIndex = -1;

  // Lifecycle

  constructor(private readonly hostRef: ElementRef<HTMLElement>) {
    effect(() => {
      const pickerColor = this.pickerColor();
      const colorValue = this.colorValue();
      const isTransparent = this.isTransparent();
      if (this.isColorKind() && !this.colorPickerDragTarget) {
        this.syncPickerFromColor(this.getInitialPickerColor());
        this.selectedColorFormat =
          inferCssColorFormat(
            this.kind() === 'fill' && isTransparent ? this.getInitialPickerColor() : colorValue,
          ) ??
          inferCssColorFormat(this.getInitialPickerColor()) ??
          this.selectedColorFormat;
      }
    });

    effect(() => {
      this.selectedStrokeStyleOption = this.strokeStyle();
    });

    effect(() => {
      const strokeSides = this.strokeSides();
      const strokeWidths = this.strokeWidths();
      this.borderSideMode = strokeSides || strokeWidths ? 'per-side' : 'all';
    });

    effect(() => {
      const shadowValue = this.shadowValue();
      if (this.kind() === 'shadow') {
        this.syncShadowEditorFromValue(shadowValue);
      }
    });

    effect(() => {
      const textShadowValue = this.textShadowValue();
      if (this.kind() === 'text-shadow') {
        this.syncTextShadowEditorFromValue(textShadowValue);
      }
    });

    effect(() => {
      if (this.kind() === 'text-decoration') {
        this.selectedDecorationLine = this.textDecorationLine() ?? 'underline';
        this.selectedDecorationStyle = this.textDecorationStyle() ?? 'solid';
        this.decorationThicknessValue = this.textDecorationThickness();
        const color = this.textDecorationColor();
        if (color) {
          this.syncPickerFromColor(color);
          const fmt = inferCssColorFormat(color);
          if (fmt) this.selectedColorFormat = fmt;
        }
      }
    });

    effect(() => {
      this.imagePreviewUrl = this.backgroundImage();
      this.imageUploadError = '';
    });

    effect(() => {
      const initialColorMode = this.initialColorMode();
      if (this.kind() === 'fill') {
        this.selectedColorMode = initialColorMode;
      }
    });

    effect(() => {
      const gradient = this.gradient();
      if (
        this.kind() === 'fill' &&
        gradient &&
        this.gradientDragStopIndex < 0 &&
        !this.colorPickerDragTarget
      ) {
        this.gradientStops = gradient.stops.slice();
        this.gradientAngle = 'angle' in gradient ? (gradient as { angle: number }).angle : 0;
        const stop = this.gradientStops[this.selectedStopIndex] ?? this.gradientStops[0];
        if (stop) {
          this.syncPickerFromColor(stop.color);
        }
      }
    });
  }

  ngOnDestroy(): void {
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    if (this.isColorGestureActive) {
      this.isColorGestureActive = false;
      this.numberGestureCommitted.emit();
    }
  }

  // Event handlers

  @HostListener('document:pointermove', ['$event'])
  onDocumentPointerMove(event: PointerEvent): void {
    if (this.gradientDragStopIndex >= 0) {
      event.preventDefault();
      this.updateGradientStopFromBarCoordinates(event.clientX);
      return;
    }

    if (!this.colorPickerDragTarget) {
      return;
    }

    event.preventDefault();
    if (this.colorPickerDragTarget === 'surface') {
      this.updateColorFromSurfaceCoordinates(event.clientX, event.clientY);
      return;
    }

    if (this.colorPickerDragTarget === 'alpha') {
      this.updateColorFromAlphaCoordinates(event.clientX);
      return;
    }

    this.updateColorFromHueCoordinates(event.clientX);
  }

  @HostListener('document:pointerup')
  onDocumentPointerUp(): void {
    if (this.gradientDragStopIndex >= 0) {
      this.gradientDragStopIndex = -1;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      if (this.isColorGestureActive) {
        this.isColorGestureActive = false;
        this.numberGestureCommitted.emit();
      }
      return;
    }

    const hadActiveColorGesture = !!this.colorPickerDragTarget;
    this.colorPickerDragTarget = null;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';

    if (hadActiveColorGesture && this.isColorGestureActive) {
      this.isColorGestureActive = false;
      this.numberGestureCommitted.emit();
    }
  }

  finalizeGesture(): void {
    if (this.isColorGestureActive) {
      this.isColorGestureActive = false;
      this.numberGestureCommitted.emit();
    }
    this.colorPickerDragTarget = null;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }

  onColorTextChange(event: Event): void {
    if (!this.isColorKind()) {
      return;
    }

    const input = event.target as HTMLInputElement;
    const normalized = input.value.trim();
    const parsed = parseCssColor(normalized);

    if (!parsed) {
      input.value = this.pickerColorValue();
      return;
    }

    this.syncPickerFromColor(normalized);
    this.commitPickerColor();
  }

  onColorFormatValueChange(value: string | number | boolean | null): void {
    if (!this.isColorKind() || typeof value !== 'string' || !isColorPickerFormat(value)) {
      return;
    }

    this.selectedColorFormat = value;
    if (this.kind() === 'fill' && this.isTransparent()) {
      return;
    }

    this.commitPickerColor();
  }

  onColorModeValueChange(value: ToggleGroupValue): void {
    if (typeof value !== 'string' || !isColorPickerMode(value)) {
      return;
    }

    this.selectedColorMode = value;

    if (this.kind() === 'fill') {
      if (value === 'image') {
        this.patchRequested.emit({
          fillMode: 'image',
          objectFit: 'cover',
          backgroundSize: 'cover',
          backgroundRepeat: 'no-repeat',
        });
      } else if (isGradientMode(value)) {
        const prevMode = this.selectedColorMode;
        const existingStops = isGradientMode(prevMode) ? this.gradientStops : null;
        const baseColor = this.pickerColorValue();
        let gradient: GradientFill;
        switch (value) {
          case 'linear':
            gradient = defaultLinearGradient(baseColor);
            break;
          case 'radial':
            gradient = defaultRadialGradient(baseColor);
            break;
          case 'conic':
            gradient = defaultConicGradient(baseColor);
            break;
        }
        if (existingStops && existingStops.length >= 2) {
          gradient = { ...gradient, stops: existingStops } as GradientFill;
        }
        this.gradientStops = gradient.stops.slice();
        this.gradientAngle = 'angle' in gradient ? (gradient as { angle: number }).angle : 0;
        this.selectedStopIndex = Math.min(this.selectedStopIndex, this.gradientStops.length - 1);
        this.patchRequested.emit({ fillMode: 'gradient', gradient, fill: undefined });
      } else {
        const solidColor = this.gradientStops[0]?.color ?? this.pickerColorValue();
        this.patchRequested.emit({ fillMode: 'color', fill: solidColor, gradient: undefined });
      }
    }
  }

  onImageFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const projectId = this.projectId();
    if (!file) {
      return;
    }

    input.value = '';
    this.imageUploadError = '';

    if (projectId === null || !Number.isInteger(projectId)) {
      this.imageUploadError = 'Image upload is available only after the project is saved.';
      return;
    }

    this.isUploadingImage = true;
    this.projectService.uploadImageAsset(projectId, file).subscribe({
      next: ({ assetUrl }) => {
        this.isUploadingImage = false;
        this.imagePreviewUrl = assetUrl;
        this.patchRequested.emit({
          backgroundImage: assetUrl,
          fillMode: 'image',
          objectFit: 'cover',
          backgroundSize: 'cover',
          backgroundRepeat: 'no-repeat',
        });
      },
      error: () => {
        this.isUploadingImage = false;
        this.imageUploadError = 'Image upload failed. Try again.';
      },
    });
  }

  onRemoveImage(): void {
    this.imagePreviewUrl = null;
    this.imageUploadError = '';
    this.patchRequested.emit({
      backgroundImage: undefined,
      fillMode: 'color',
    });
    this.selectedColorMode = 'solid';
  }

  imageTypeValue(): string {
    if (this.objectFit() === 'contain') return 'fit';
    if (this.objectFit() === 'fill' || this.backgroundSize() === '100% 100%') return 'stretch';
    return 'fill';
  }

  onImageTypeChange(value: string | number | boolean | null): void {
    if (typeof value !== 'string') {
      return;
    }

    switch (value) {
      case 'fill':
        this.patchRequested.emit({
          objectFit: 'cover',
          backgroundSize: 'cover',
          backgroundRepeat: 'no-repeat',
        });
        break;
      case 'fit':
        this.patchRequested.emit({
          objectFit: 'contain',
          backgroundSize: 'contain',
          backgroundRepeat: 'no-repeat',
        });
        break;
      case 'stretch':
        this.patchRequested.emit({
          objectFit: 'fill',
          backgroundSize: '100% 100%',
          backgroundRepeat: 'no-repeat',
        });
        break;
    }
  }

  onBackgroundPositionChange(value: string | number | boolean | null): void {
    if (typeof value !== 'string') {
      return;
    }

    this.patchRequested.emit({ backgroundPosition: value });
  }

  onImageAltTextChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.patchRequested.emit({ imageAltText: value, ariaLabel: value });
  }

  async onScreenPickerClick(): Promise<void> {
    if (!this.isColorKind() || this.isScreenPickerActive) {
      return;
    }

    const EyeDropperApi = getEyeDropperConstructor();
    if (!EyeDropperApi) {
      return;
    }

    this.isScreenPickerActive = true;

    try {
      const result = await new EyeDropperApi().open();
      if (!result.sRGBHex) {
        return;
      }

      this.syncPickerFromColor(result.sRGBHex);
      this.commitPickerColor();
    } catch (error) {
      if (!isEyeDropperAbortError(error)) {
        return;
      }
    } finally {
      this.isScreenPickerActive = false;
    }
  }

  onColorSurfacePointerDown(event: PointerEvent): void {
    if (!this.isColorKind()) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.beginColorGesture();
    this.colorPickerDragTarget = 'surface';
    document.body.style.userSelect = 'none';
    this.updateColorFromSurfaceCoordinates(event.clientX, event.clientY);
  }

  onHueSliderPointerDown(event: PointerEvent): void {
    if (!this.isColorKind()) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.beginColorGesture();
    this.colorPickerDragTarget = 'hue';
    document.body.style.userSelect = 'none';
    this.updateColorFromHueCoordinates(event.clientX);
  }

  onAlphaSliderPointerDown(event: PointerEvent): void {
    if (!this.isColorKind()) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.beginColorGesture();
    this.colorPickerDragTarget = 'alpha';
    document.body.style.userSelect = 'none';
    this.updateColorFromAlphaCoordinates(event.clientX);
  }

  onStrokeWidthChange(value: number): void {
    if (!Number.isFinite(value)) {
      return;
    }

    const normalized = Math.max(0, roundToTwoDecimals(value));
    this.borderSideMode = 'all';
    this.patchRequested.emit({
      strokeWidth: normalized,
      strokeSides: undefined,
      strokeWidths: undefined,
    });
  }

  onStrokeStyleValueChange(value: string | number | boolean | null): void {
    if (typeof value !== 'string') {
      return;
    }

    this.selectedStrokeStyleOption = value;
    this.patchRequested.emit({ strokeStyle: value });
  }

  onBorderSideModeChange(value: string | number | boolean | null): void {
    if (value !== 'all' && value !== 'per-side') {
      return;
    }

    this.borderSideMode = value;
    if (value === 'all') {
      this.patchRequested.emit({
        strokeWidth: this.linkedStrokeWidthValue(),
        strokeSides: undefined,
        strokeWidths: undefined,
      });
      return;
    }

    const widths = this.resolveStrokeWidths();
    this.patchRequested.emit({
      strokeSides: this.toStrokeSides(widths),
      strokeWidths: widths,
    });
  }

  fullStrokeWidthValue(): number | null {
    return this.borderSideMode === 'per-side' ? null : this.strokeWidth();
  }

  borderSideWidthValue(side: BorderNumericField): number {
    return this.resolveStrokeWidths()[side];
  }

  onBorderSideWidthChange(side: BorderNumericField, value: number): void {
    if (!Number.isFinite(value)) {
      return;
    }

    const widths = {
      ...this.resolveStrokeWidths(),
      [side]: Math.max(0, roundToTwoDecimals(value)),
    } satisfies CanvasBorderWidths;

    this.patchRequested.emit({
      strokeSides: this.toStrokeSides(widths),
      strokeWidths: widths,
    });
  }

  onShadowPositionChange(value: string | number | boolean | null): void {
    if (value !== 'outside' && value !== 'inside') {
      return;
    }

    this.shadowPosition = value;
    this.emitShadowPatch();
  }

  onShadowNumberChange(field: ShadowNumericField, value: number): void {
    if (!Number.isFinite(value)) {
      return;
    }

    const normalized =
      field === 'blur' ? Math.max(0, roundToTwoDecimals(value)) : roundToTwoDecimals(value);

    switch (field) {
      case 'x':
        this.shadowX = normalized;
        break;
      case 'y':
        this.shadowY = normalized;
        break;
      case 'blur':
        this.shadowBlur = normalized;
        break;
      case 'spread':
        this.shadowSpread = normalized;
        break;
    }

    this.emitShadowPatch();
  }

  onNumberGestureStarted(): void {
    this.numberGestureStarted.emit();
  }

  onNumberGestureCommitted(): void {
    this.numberGestureCommitted.emit();
  }

  // Gradient editor

  isGradientMode(): boolean {
    return isGradientMode(this.selectedColorMode);
  }

  gradientBarBackground(): string {
    const stops = this.gradientStops
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((s) => `${s.color} ${s.position}%`)
      .join(', ');
    return [
      `linear-gradient(90deg, ${stops})`,
      'linear-gradient(45deg, #4d4d4d 25%, transparent 25%) 0 0 / 8px 8px',
      'linear-gradient(-45deg, #4d4d4d 25%, transparent 25%) 0 4px / 8px 8px',
      'linear-gradient(45deg, transparent 75%, #4d4d4d 75%) 4px -4px / 8px 8px',
      'linear-gradient(-45deg, transparent 75%, #4d4d4d 75%) -4px 0 / 8px 8px',
      '#2a2a2a',
    ].join(', ');
  }

  onGradientBarClick(event: MouseEvent): void {
    const bar = event.currentTarget as HTMLElement;
    const rect = bar.getBoundingClientRect();
    const position = clampPosition(((event.clientX - rect.left) / Math.max(rect.width, 1)) * 100);
    const color = interpolateGradientColor(
      buildGradient(
        this.selectedColorMode as GradientFill['type'],
        this.gradientStops,
        this.gradientAngle,
      ),
      position,
    );
    const newStop: GradientStop = { color, position };
    this.gradientStops = [...this.gradientStops, newStop].sort((a, b) => a.position - b.position);
    this.selectedStopIndex = this.gradientStops.findIndex((s) => s === newStop);
    this.syncPickerFromColor(color);
    this.emitGradientPatch();
  }

  onGradientStopMarkerDown(event: PointerEvent, index: number): void {
    event.stopPropagation();
    event.preventDefault();
    this.selectedStopIndex = index;
    this.gradientDragStopIndex = index;
    this.beginColorGesture();
    document.body.style.userSelect = 'none';
    const stop = this.gradientStops[index];
    if (stop) {
      this.syncPickerFromColor(stop.color);
    }
  }

  onGradientStopSelect(index: number): void {
    this.selectedStopIndex = index;
    const stop = this.gradientStops[index];
    if (stop) {
      this.syncPickerFromColor(stop.color);
    }
  }

  onGradientStopPositionChange(value: number, index: number): void {
    const position = clampPosition(value);
    this.gradientStops = this.gradientStops.map((s, i) => (i === index ? { ...s, position } : s));
    this.emitGradientPatch();
  }

  onGradientStopDelete(index: number): void {
    if (this.gradientStops.length <= 2) return;
    this.gradientStops = this.gradientStops.filter((_, i) => i !== index);
    this.selectedStopIndex = Math.min(this.selectedStopIndex, this.gradientStops.length - 1);
    const stop = this.gradientStops[this.selectedStopIndex];
    if (stop) this.syncPickerFromColor(stop.color);
    this.emitGradientPatch();
  }

  onGradientAngleChange(value: number): void {
    this.gradientAngle = ((value % 360) + 360) % 360;
    this.emitGradientPatch();
  }

  private updateGradientStopFromBarCoordinates(clientX: number): void {
    const bar = this.hostRef.nativeElement.querySelector(
      '.field-input__gradient-bar',
    ) as HTMLElement | null;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const position = clampPosition(((clientX - rect.left) / Math.max(rect.width, 1)) * 100);
    const idx = this.gradientDragStopIndex;
    if (idx < 0 || idx >= this.gradientStops.length) return;
    this.gradientStops = this.gradientStops.map((s, i) => (i === idx ? { ...s, position } : s));
    this.emitGradientPatch();
  }

  private emitGradientPatch(): void {
    const gradient = buildGradient(
      this.selectedColorMode as GradientFill['type'],
      this.gradientStops,
      this.gradientAngle,
    );
    this.patchRequested.emit({ fillMode: 'gradient', gradient });
  }

  // Color picker computed

  pickerHueColor(): string {
    const { r, g, b } = hsvToRgb(this.pickerHue, 1, 1);
    return rgbToHex(r, g, b);
  }

  pickerColorValue(): string {
    const { r, g, b } = hsvToRgb(this.pickerHue, this.pickerSaturation, this.pickerValue);
    switch (this.selectedColorFormat) {
      case 'rgb':
        return toRgbString(r, g, b, this.pickerAlpha);
      case 'hsl': {
        const { h, s, l } = rgbToHsl(r, g, b);
        return toHslString(h, s, l, this.pickerAlpha);
      }
      case 'hex':
      default:
        return rgbToHex(r, g, b, this.pickerAlpha).toUpperCase();
    }
  }

  pickerSaturationPercent(): number {
    return this.pickerSaturation * 100;
  }

  pickerValuePercent(): number {
    return (1 - this.pickerValue) * 100;
  }

  pickerHuePercent(): number {
    return (this.pickerHue / 360) * 100;
  }

  pickerAlphaPercent(): number {
    return this.pickerAlpha * 100;
  }

  alphaTrackBackground(): string {
    const { r, g, b } = hsvToRgb(this.pickerHue, this.pickerSaturation, this.pickerValue);
    return `linear-gradient(90deg, rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, 0) 0%, rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, 1) 100%)`;
  }

  // Getters

  get strokeStyleDropdownOptions(): DropdownSelectOption[] {
    return this.borderStyleOptions().map((option) => ({ label: option, value: option }));
  }

  get isScreenPickerSupported(): boolean {
    return getEyeDropperConstructor() !== null;
  }

  get screenPickerButtonLabel(): string {
    if (this.isScreenPickerActive) {
      return 'Picking...';
    }

    return this.isScreenPickerSupported ? 'Pick From Screen' : 'Screen Picker Unavailable';
  }

  // Private helpers

  private isColorKind(): boolean {
    return (
      this.kind() === 'fill' ||
      this.kind() === 'stroke' ||
      this.kind() === 'shadow' ||
      this.kind() === 'text-shadow' ||
      this.kind() === 'text-decoration'
    );
  }

  private beginColorGesture(): void {
    if (this.isColorGestureActive) {
      return;
    }

    this.isColorGestureActive = true;
    this.numberGestureStarted.emit();
  }

  private getInitialPickerColor(): string {
    if (this.kind() === 'shadow') {
      return resolveEditableCanvasShadow(this.shadowValue()).color;
    }

    if (this.kind() === 'text-shadow') {
      return resolveEditableTextShadow(this.textShadowValue()).color;
    }

    if (this.kind() === 'text-decoration') {
      return this.textDecorationColor() ?? '#000000';
    }

    if (this.pickerColor()) {
      return this.pickerColor();
    }

    if (this.kind() === 'fill' && this.isTransparent()) {
      return '#E0E0E0';
    }

    return this.colorValue();
  }

  private resolveStrokeWidths(): CanvasBorderWidths {
    if (this.strokeWidths()) {
      return {
        top: Math.max(0, roundToTwoDecimals(this.strokeWidths()!.top)),
        right: Math.max(0, roundToTwoDecimals(this.strokeWidths()!.right)),
        bottom: Math.max(0, roundToTwoDecimals(this.strokeWidths()!.bottom)),
        left: Math.max(0, roundToTwoDecimals(this.strokeWidths()!.left)),
      };
    }

    const baseWidth = Math.max(0, roundToTwoDecimals(this.strokeWidth()));
    const sides = this.strokeSides() ?? { top: true, right: true, bottom: true, left: true };

    return {
      top: sides.top ? baseWidth : 0,
      right: sides.right ? baseWidth : 0,
      bottom: sides.bottom ? baseWidth : 0,
      left: sides.left ? baseWidth : 0,
    };
  }

  private linkedStrokeWidthValue(): number {
    const widths = this.resolveStrokeWidths();
    const values = [widths.top, widths.right, widths.bottom, widths.left].filter(
      (value) => value > 0,
    );

    if (values.length === 0) {
      return 0;
    }

    return values[0];
  }

  private toStrokeSides(widths: CanvasBorderWidths): CanvasBorderSides {
    return {
      top: widths.top > 0,
      right: widths.right > 0,
      bottom: widths.bottom > 0,
      left: widths.left > 0,
    };
  }

  private updateColorFromSurfaceCoordinates(clientX: number, clientY: number): void {
    const target = this.hostRef.nativeElement.querySelector(
      '.field-input__color-picker-surface',
    ) as HTMLElement | null;
    if (!target) {
      return;
    }

    const rect = target.getBoundingClientRect();
    this.pickerSaturation = clamp01((clientX - rect.left) / Math.max(rect.width, 1));
    this.pickerValue = 1 - clamp01((clientY - rect.top) / Math.max(rect.height, 1));
    this.commitPickerColor();
  }

  private updateColorFromHueCoordinates(clientX: number): void {
    const target = this.hostRef.nativeElement.querySelector(
      '.field-input__color-picker-hue-track',
    ) as HTMLElement | null;
    if (!target) {
      return;
    }

    const rect = target.getBoundingClientRect();
    const ratio = clamp01((clientX - rect.left) / Math.max(rect.width, 1));
    this.pickerHue = roundToTwoDecimals(ratio * 360);
    this.commitPickerColor();
  }

  private updateColorFromAlphaCoordinates(clientX: number): void {
    const target = this.hostRef.nativeElement.querySelector(
      '.field-input__color-picker-alpha-track',
    ) as HTMLElement | null;
    if (!target) {
      return;
    }

    const rect = target.getBoundingClientRect();
    const ratio = clamp01((clientX - rect.left) / Math.max(rect.width, 1));
    this.pickerAlpha = roundToTwoDecimals(ratio);
    this.commitPickerColor();
  }

  private commitPickerColor(): void {
    const colorValue = this.pickerColorValue();
    if (this.kind() === 'fill') {
      if (isGradientMode(this.selectedColorMode)) {
        this.gradientStops = this.gradientStops.slice();
        const idx = Math.min(this.selectedStopIndex, this.gradientStops.length - 1);
        this.gradientStops[idx] = { ...this.gradientStops[idx], color: colorValue };
        this.emitGradientPatch();
      } else {
        this.patchRequested.emit({ fill: colorValue });
      }
      return;
    }

    if (this.kind() === 'stroke') {
      this.patchRequested.emit({ stroke: colorValue });
      return;
    }

    if (this.kind() === 'text-shadow') {
      this.emitTextShadowPatch(colorValue);
      return;
    }

    if (this.kind() === 'text-decoration') {
      this.emitDecorationPatch({ color: colorValue });
      return;
    }

    this.emitShadowPatch(colorValue);
  }

  private syncPickerFromColor(color: string): void {
    const parsed = parseCssColor(color) ?? { r: 224, g: 224, b: 224, a: 1 };
    const { r, g, b } = parsed;
    const { h, s, v } = rgbToHsv(r, g, b);
    this.pickerHue = h;
    this.pickerSaturation = s;
    this.pickerValue = v;
    this.pickerAlpha = parsed.a;
  }

  private syncShadowEditorFromValue(value: string | null): void {
    const shadow = resolveEditableCanvasShadow(value);
    this.shadowPosition = shadow.position;
    this.shadowX = shadow.x;
    this.shadowY = shadow.y;
    this.shadowBlur = shadow.blur;
    this.shadowSpread = shadow.spread;
    this.syncPickerFromColor(shadow.color);

    const nextFormat = inferCssColorFormat(shadow.color);
    if (nextFormat) {
      this.selectedColorFormat = nextFormat;
    }
  }

  private emitShadowPatch(colorOverride?: string): void {
    this.patchRequested.emit({
      shadow: buildCanvasShadowCss({
        position: this.shadowPosition,
        x: this.shadowX,
        y: this.shadowY,
        blur: this.shadowBlur,
        spread: this.shadowSpread,
        color: colorOverride ?? this.pickerColorValue(),
      }),
    });
  }

  // Text shadow handlers

  onTextShadowNumberChange(field: 'x' | 'y' | 'blur', value: number): void {
    if (!Number.isFinite(value)) return;
    const normalized =
      field === 'blur' ? Math.max(0, roundToTwoDecimals(value)) : roundToTwoDecimals(value);
    switch (field) {
      case 'x':
        this.textShadowX = normalized;
        break;
      case 'y':
        this.textShadowY = normalized;
        break;
      case 'blur':
        this.textShadowBlur = normalized;
        break;
    }
    this.emitTextShadowPatch();
  }

  private syncTextShadowEditorFromValue(value: string | null): void {
    const shadow = resolveEditableTextShadow(value);
    this.textShadowX = shadow.x;
    this.textShadowY = shadow.y;
    this.textShadowBlur = shadow.blur;
    this.syncPickerFromColor(shadow.color);
    const fmt = inferCssColorFormat(shadow.color);
    if (fmt) this.selectedColorFormat = fmt;
  }

  private emitTextShadowPatch(colorOverride?: string): void {
    this.patchRequested.emit({
      textShadow: buildTextShadowCss({
        x: this.textShadowX,
        y: this.textShadowY,
        blur: this.textShadowBlur,
        color: colorOverride ?? this.pickerColorValue(),
      }),
    });
  }

  // Text decoration handlers

  onDecorationLineChange(value: string | number | boolean | null): void {
    if (typeof value !== 'string') return;
    this.selectedDecorationLine = value as CanvasTextDecorationLine;
    this.emitDecorationPatch({ line: this.selectedDecorationLine });
  }

  onDecorationStyleChange(value: string | number | boolean | null): void {
    if (typeof value !== 'string') return;
    this.selectedDecorationStyle = value as CanvasTextDecorationStyle;
    this.emitDecorationPatch({ style: this.selectedDecorationStyle });
  }

  onDecorationThicknessChange(value: number): void {
    if (!Number.isFinite(value)) return;
    this.decorationThicknessValue = Math.max(0, roundToTwoDecimals(value));
    this.emitDecorationPatch({ thickness: this.decorationThicknessValue });
  }

  private emitDecorationPatch(
    override: {
      line?: CanvasTextDecorationLine;
      color?: string;
      style?: CanvasTextDecorationStyle;
      thickness?: number;
    } = {},
  ): void {
    this.patchRequested.emit({
      textDecorationLine: override.line ?? this.selectedDecorationLine,
      textDecorationColor: override.color ?? this.pickerColorValue(),
      textDecorationStyle: override.style ?? this.selectedDecorationStyle,
      textDecorationThickness: override.thickness ?? this.decorationThicknessValue ?? undefined,
      textDecorationThicknessUnit: 'px',
    });
  }
}

// Color math utilities

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function isGradientMode(mode: string): mode is 'linear' | 'radial' | 'conic' {
  return mode === 'linear' || mode === 'radial' || mode === 'conic';
}

export function parseCssColor(
  color: string,
): { r: number; g: number; b: number; a: number } | null {
  const normalized = color.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.toLowerCase() === 'transparent') {
    return { r: 224, g: 224, b: 224, a: 0 };
  }

  const hexMatch = normalized.match(/^#([A-Fa-f0-9]{3,4}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/);
  if (hexMatch) {
    const expanded = expandHex(hexMatch[1]);
    const parsed = Number.parseInt(expanded, 16);
    if (expanded.length === 6) {
      return {
        r: (parsed >> 16) & 255,
        g: (parsed >> 8) & 255,
        b: parsed & 255,
        a: 1,
      };
    }

    return {
      r: (parsed >> 24) & 255,
      g: (parsed >> 16) & 255,
      b: (parsed >> 8) & 255,
      a: roundToTwoDecimals((parsed & 255) / 255),
    };
  }

  const rgbMatch = normalized.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(\d*\.?\d+))?\s*\)$/i,
  );
  if (rgbMatch) {
    const red = Number(rgbMatch[1]);
    const green = Number(rgbMatch[2]);
    const blue = Number(rgbMatch[3]);
    const alpha = rgbMatch[4] === undefined ? 1 : Number(rgbMatch[4]);
    if (
      [red, green, blue].some((channel) => Number.isNaN(channel) || channel < 0 || channel > 255)
    ) {
      return null;
    }

    if (Number.isNaN(alpha) || alpha < 0 || alpha > 1) {
      return null;
    }

    return {
      r: red,
      g: green,
      b: blue,
      a: roundToTwoDecimals(alpha),
    };
  }

  const hslMatch = normalized.match(
    /^hsla?\(\s*([+-]?\d*\.?\d+)\s*(?:deg)?\s*,\s*(\d*\.?\d+)%\s*,\s*(\d*\.?\d+)%(?:\s*,\s*(\d*\.?\d+))?\s*\)$/i,
  );
  if (!hslMatch) {
    return null;
  }

  const hue = Number(hslMatch[1]);
  const saturation = Number(hslMatch[2]);
  const lightness = Number(hslMatch[3]);
  const alpha = hslMatch[4] === undefined ? 1 : Number(hslMatch[4]);
  if (
    [hue, saturation, lightness].some((channel) => Number.isNaN(channel)) ||
    saturation < 0 ||
    saturation > 100 ||
    lightness < 0 ||
    lightness > 100
  ) {
    return null;
  }

  if (Number.isNaN(alpha) || alpha < 0 || alpha > 1) {
    return null;
  }

  const { r, g, b } = hslToRgb(hue, saturation / 100, lightness / 100);

  return {
    r,
    g,
    b,
    a: roundToTwoDecimals(alpha),
  };
}

function expandHex(hex: string): string {
  if (hex.length === 3 || hex.length === 4) {
    return hex
      .split('')
      .map((char) => `${char}${char}`)
      .join('');
  }

  return hex;
}

function rgbToHex(r: number, g: number, b: number, a = 1): string {
  const channels = [r, g, b];
  if (a < 0.999) {
    channels.push(a * 255);
  }

  return `#${channels
    .map((channel) => Math.round(channel).toString(16).padStart(2, '0'))
    .join('')}`;
}

function toRgbString(r: number, g: number, b: number, a: number): string {
  const red = Math.round(r);
  const green = Math.round(g);
  const blue = Math.round(b);
  if (a >= 0.999) {
    return `rgb(${red}, ${green}, ${blue})`;
  }

  return `rgba(${red}, ${green}, ${blue}, ${formatCssNumber(a)})`;
}

function toHslString(h: number, s: number, l: number, a: number): string {
  const hue = formatCssNumber(normalizeHue(h));
  const saturation = formatCssNumber(s * 100);
  const lightness = formatCssNumber(l * 100);
  if (a >= 0.999) {
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  }

  return `hsla(${hue}, ${saturation}%, ${lightness}%, ${formatCssNumber(a)})`;
}

function formatCssNumber(value: number): string {
  return roundToTwoDecimals(value).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === red) {
      h = 60 * (((green - blue) / delta) % 6);
    } else if (max === green) {
      h = 60 * ((blue - red) / delta + 2);
    } else {
      h = 60 * ((red - green) / delta + 4);
    }
  }

  if (h < 0) {
    h += 360;
  }

  return {
    h,
    s: max === 0 ? 0 : delta / max,
    v: max,
  };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const lightness = (max + min) / 2;

  if (delta === 0) {
    return { h: 0, s: 0, l: lightness };
  }

  let hue = 0;
  if (max === red) {
    hue = ((green - blue) / delta) % 6;
  } else if (max === green) {
    hue = (blue - red) / delta + 2;
  } else {
    hue = (red - green) / delta + 4;
  }

  hue *= 60;
  if (hue < 0) {
    hue += 360;
  }

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  return { h: hue, s: saturation, l: lightness };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hue = normalizeHue(h);
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const intermediate = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = l - chroma / 2;

  let red = 0;
  let green = 0;
  let blue = 0;

  if (hue < 60) {
    red = chroma;
    green = intermediate;
  } else if (hue < 120) {
    red = intermediate;
    green = chroma;
  } else if (hue < 180) {
    green = chroma;
    blue = intermediate;
  } else if (hue < 240) {
    green = intermediate;
    blue = chroma;
  } else if (hue < 300) {
    red = intermediate;
    blue = chroma;
  } else {
    red = chroma;
    blue = intermediate;
  }

  return {
    r: (red + match) * 255,
    g: (green + match) * 255,
    b: (blue + match) * 255,
  };
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;

  let red = 0;
  let green = 0;
  let blue = 0;

  if (h < 60) {
    red = c;
    green = x;
  } else if (h < 120) {
    red = x;
    green = c;
  } else if (h < 180) {
    green = c;
    blue = x;
  } else if (h < 240) {
    green = x;
    blue = c;
  } else if (h < 300) {
    red = x;
    blue = c;
  } else {
    red = c;
    blue = x;
  }

  return {
    r: (red + m) * 255,
    g: (green + m) * 255,
    b: (blue + m) * 255,
  };
}

function normalizeHue(value: number): number {
  const hue = value % 360;
  return hue < 0 ? hue + 360 : hue;
}

function inferCssColorFormat(value: string | null | undefined): ColorPickerFormat | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith('#')) {
    return 'hex';
  }

  if (/^rgba?\(/i.test(normalized)) {
    return 'rgb';
  }

  if (/^hsla?\(/i.test(normalized)) {
    return 'hsl';
  }

  return null;
}

function isColorPickerFormat(value: string): value is ColorPickerFormat {
  return value === 'hex' || value === 'rgb' || value === 'hsl';
}

function isColorPickerMode(value: string): value is ColorPickerMode {
  return (
    value === 'solid' ||
    value === 'linear' ||
    value === 'radial' ||
    value === 'conic' ||
    value === 'image'
  );
}

function getEyeDropperConstructor(): EyeDropperConstructor | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const eyeDropperApi = (window as Window & { EyeDropper?: EyeDropperConstructor }).EyeDropper;
  return eyeDropperApi ?? null;
}

function isEyeDropperAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
