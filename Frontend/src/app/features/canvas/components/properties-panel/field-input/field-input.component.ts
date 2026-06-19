import { FormsModule } from '@angular/forms';
import {
  AfterViewInit,
  Component,
  ElementRef,
  HostBinding,
  HostListener,
  OnDestroy,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';
import { CanvasElement } from '@app/core';
import { CanvasBorderWidths } from '@app/core';
import { CanvasBorderSides } from '@app/core';
import type {
  CanvasObjectFit,
  GradientFill,
  CanvasTextDecorationLine,
  CanvasTextDecorationStyle,
} from '@app/core';
import { resolveEditableCanvasShadow } from '../../../utils/element/canvas-shadow.util';
import { DropdownMenuComponent } from '../dropdown-menu/dropdown-menu.component';

type StylePopupFieldKind =
  | 'fill'
  | 'stroke'
  | 'shadow'
  | 'effect'
  | 'text-shadow'
  | 'text-decoration';
type PopoverElement = HTMLElement & {
  showPopover?: () => void;
  hidePopover?: () => void;
};

@Component({
  selector: 'app-field-input',
  standalone: true,
  imports: [FormsModule, DropdownMenuComponent],
  templateUrl: './field-input.component.html',
  styleUrl: './field-input.component.css',
})
export class FieldInputComponent implements AfterViewInit, OnDestroy {
  readonly kind = input<StylePopupFieldKind>('fill');
  readonly projectId = input<number | null>(null);
  readonly autoOpenKey = input<string | null>(null);
  readonly hasValue = input(true);
  readonly triggerText = input('');
  readonly swatchColor = input<string | null>(null);
  readonly isTransparent = input(false);
  readonly shadowValue = input<string | null>(null);
  readonly colorValue = input('#000000');
  readonly pickerColor = input('#000000');
  readonly strokeWidth = input(1);
  readonly strokeStyle = input('Solid');
  readonly borderStyleOptions = input<string[]>([]);
  readonly strokeSides = input<CanvasBorderSides | null>(null);
  readonly strokeWidths = input<CanvasBorderWidths | null>(null);
  readonly backgroundImage = input<string | null>(null);
  readonly backgroundSize = input('cover');
  readonly backgroundPosition = input('center');
  readonly backgroundRepeat = input('no-repeat');
  readonly objectFit = input<CanvasObjectFit>('cover');
  readonly imageAltText = input('');
  readonly initialColorMode = input<'solid' | 'linear' | 'radial' | 'conic' | 'image'>('solid');
  readonly gradient = input<GradientFill | null>(null);
  readonly popupTitleOverride = input('');
  readonly popupWidthOverride = input<number | null>(null);
  readonly inlineContentOnly = input(false);
  readonly activationPatch = input<Partial<CanvasElement> | null>(null);
  readonly clearPatch = input<Partial<CanvasElement> | null>(null);
  readonly solidColorOnly = input(false);
  readonly hideClearButton = input(false);
  readonly textShadowValue = input<string | null>(null);
  readonly textDecorationLine = input<CanvasTextDecorationLine | null>(null);
  readonly textDecorationColor = input<string | null>(null);
  readonly textDecorationStyle = input<CanvasTextDecorationStyle | null>(null);
  readonly textDecorationThickness = input<number | null>(null);
  readonly textDecorationThicknessUnit = input<'px' | 'em'>('px');

  readonly patchRequested = output<Partial<CanvasElement>>();
  readonly clearRequested = output<void>();
  readonly openChange = output<boolean>();
  readonly numberGestureStarted = output<void>();
  readonly numberGestureCommitted = output<void>();

  @HostBinding('style.display') readonly hostDisplay = 'block';
  @HostBinding('style.width') readonly hostWidth = '100%';
  @HostBinding('style.min-width') readonly hostMinWidth = '0';

  private readonly dropdownMenu = viewChild(DropdownMenuComponent);
  private readonly triggerButtonRef = viewChild<ElementRef<HTMLElement>>('triggerButton');
  private readonly popupPanelRef = viewChild<ElementRef<HTMLElement>>('popupPanel');

  isOpen = false;
  popupTop: number | null = 16;
  popupBottom: number | null = null;
  popupLeft = 16;
  popupWidth = 248;

  private activePopupAnchor: HTMLElement | null = null;
  private hasViewInitialized = false;
  private lastAutoOpenKey: string | null = null;
  private readonly onGlobalScroll = (): void => {
    if (!this.isOpen || !this.activePopupAnchor) {
      return;
    }

    this.updatePopupPlacement(this.activePopupAnchor);
  };

  constructor(private readonly hostRef: ElementRef<HTMLElement>) {
    window.addEventListener('scroll', this.onGlobalScroll, true);
    effect(() => {
      this.autoOpenKey();
      this.tryAutoOpen();
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('scroll', this.onGlobalScroll, true);
  }

  ngAfterViewInit(): void {
    this.hasViewInitialized = true;
    this.tryAutoOpen();
  }

  get popupTitle(): string {
    if (this.popupTitleOverride().trim().length > 0) {
      return this.popupTitleOverride();
    }

    switch (this.kind()) {
      case 'fill':
        return 'Fill';
      case 'stroke':
        return 'Border';
      case 'shadow':
        return 'Shadow';
      case 'effect':
        return 'Effect';
      case 'text-shadow':
        return 'Text Shadow';
      case 'text-decoration':
        return 'Decoration';
      default:
        return '';
    }
  }

  get showAddButton(): boolean {
    return this.kind() !== 'fill' && !this.hasValue();
  }

  get showClearButton(): boolean {
    return this.hasValue();
  }

  get clearButtonTitle(): string {
    switch (this.kind()) {
      case 'fill':
        return 'Clear fill';
      case 'stroke':
        return 'Remove stroke';
      case 'shadow':
        return 'Remove shadow';
      case 'effect':
        return 'Remove effect';
      case 'text-shadow':
        return 'Remove text shadow';
      case 'text-decoration':
        return 'Remove decoration';
      default:
        return 'Clear';
    }
  }

  @HostListener('document:pointerdown', ['$event'])
  onDocumentPointerDown(event: PointerEvent): void {
    if (!this.isOpen) {
      return;
    }

    if (!this.hostRef.nativeElement.contains(event.target as Node)) {
      this.closePopup();
    }
  }

  @HostListener('document:keydown.escape')
  onEscapePressed(): void {
    this.closePopup();
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    if (!this.isOpen || !this.activePopupAnchor) {
      return;
    }

    this.updatePopupPlacement(this.activePopupAnchor);
  }

  onTriggerClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    if (this.isOpen) {
      this.closePopup();
      return;
    }

    this.openPopup(event.currentTarget as HTMLElement);
  }

  private openPopup(anchor: HTMLElement | null): boolean {
    if (!anchor) {
      return false;
    }

    if (!this.hasValue() && this.activationPatch()) {
      this.patchRequested.emit(this.activationPatch()!);
    }

    this.activePopupAnchor = anchor;
    this.updatePopupPlacement(this.activePopupAnchor);
    this.isOpen = true;
    this.openChange.emit(true);
    this.showPopover();
    return true;
  }

  onClearClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    if (this.clearPatch()) {
      this.patchRequested.emit(this.clearPatch()!);
    } else {
      this.clearRequested.emit();
    }

    if (this.kind() !== 'fill') {
      this.closePopup();
    }
  }

  onPopupCloseClick(): void {
    this.closePopup();
  }

  get shadowSwatchColor(): string {
    return resolveEditableCanvasShadow(this.shadowValue()).color;
  }

  get isShadowSwatchTransparent(): boolean {
    return (parseCssColorAlpha(this.shadowSwatchColor) ?? 1) <= 0.001;
  }

  get textShadowSwatchColor(): string {
    const val = this.textShadowValue();
    if (!val) return 'rgba(0,0,0,0.4)';
    const parts = val.trim().split(/\s+/);
    return parts.slice(3).join(' ') || 'rgba(0,0,0,0.4)';
  }

  get textDecorationSwatchColor(): string {
    return this.textDecorationColor() ?? this.swatchColor() ?? '#000000';
  }

  private closePopup(): void {
    const wasOpen = this.isOpen;

    this.dropdownMenu()?.finalizeGesture();
    this.hidePopover();

    this.isOpen = false;
    this.activePopupAnchor = null;

    if (wasOpen) {
      this.openChange.emit(false);
    }
  }

  private showPopover(): void {
    const el = this.popupPanelRef()?.nativeElement as PopoverElement | undefined;
    if (el?.showPopover) {
      el.showPopover();
    }
  }

  private hidePopover(): void {
    const el = this.popupPanelRef()?.nativeElement as PopoverElement | undefined;
    if (el?.hidePopover) {
      el.hidePopover();
    }
  }

  private updatePopupPlacement(anchor: HTMLElement): void {
    const panelElement = this.hostRef.nativeElement.closest(
      '.properties-panel',
    ) as HTMLElement | null;
    const panelBounds = (panelElement ?? this.hostRef.nativeElement).getBoundingClientRect();
    this.popupTop = null;
    this.popupBottom = 12;

    const preferredWidth = this.popupWidthOverride() ?? 248;
    this.popupWidth = Math.min(preferredWidth, Math.max(220, window.innerWidth - 24));
    const desiredLeft = panelBounds.left - this.popupWidth - 12;
    const maxLeft = Math.max(12, window.innerWidth - this.popupWidth - 12);
    this.popupLeft = Math.min(maxLeft, Math.max(12, desiredLeft));
  }

  private tryAutoOpen(): void {
    const autoOpenKey = this.autoOpenKey();
    if (
      !this.hasViewInitialized ||
      this.inlineContentOnly() ||
      !autoOpenKey ||
      autoOpenKey === this.lastAutoOpenKey
    ) {
      return;
    }

    queueMicrotask(() => {
      if (
        !this.hasViewInitialized ||
        !this.autoOpenKey() ||
        this.autoOpenKey() !== autoOpenKey ||
        autoOpenKey === this.lastAutoOpenKey
      ) {
        return;
      }

      const anchor =
        this.triggerButtonRef()?.nativeElement ??
        (this.hostRef.nativeElement.querySelector(
          '.field-input__trigger-main',
        ) as HTMLElement | null);

      if (this.openPopup(anchor)) {
        this.lastAutoOpenKey = autoOpenKey;
      }
    });
  }
}

function parseCssColorAlpha(color: string): number | null {
  const normalized = color.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'transparent') return 0;

  const hexMatch = normalized.match(/^#([0-9a-f]{8})$/);
  if (hexMatch) {
    return parseInt(hexMatch[1].slice(6, 8), 16) / 255;
  }

  const rgbaMatch = normalized.match(/^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9.]+)\s*\)$/);
  if (rgbaMatch) {
    return parseFloat(rgbaMatch[1]);
  }

  return 1;
}
