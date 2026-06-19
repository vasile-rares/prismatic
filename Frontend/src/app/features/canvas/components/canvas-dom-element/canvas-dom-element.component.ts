import { Component, ChangeDetectionStrategy, inject, computed, input, output } from '@angular/core';
import { NgStyle } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { CanvasElement, CanvasPageModel } from '@app/core';
import { FlowDragRenderState } from '../../canvas.types';
import { CanvasDomStyleService } from '../../services/canvas-dom-style.service';
import { CanvasElementService } from '../../services/canvas-element.service';

type ChildItem = { kind: 'element'; child: CanvasElement } | { kind: 'placeholder' };

@Component({
  selector: 'app-canvas-dom-element',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgStyle],
  templateUrl: './canvas-dom-element.component.html',
  styleUrl: './canvas-dom-element.component.css',
})
export class CanvasDomElementComponent {
  private readonly styleService = inject(CanvasDomStyleService);
  private readonly elementService = inject(CanvasElementService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly element = input.required<CanvasElement>();
  readonly allElements = input.required<CanvasElement[]>();
  readonly childrenMap = input.required<Map<string | null, CanvasElement[]>>();
  readonly elementMap = input.required<Map<string, CanvasElement>>();
  readonly page = input<CanvasPageModel | null>(null);
  readonly editingTextId = input<string | null>(null);
  readonly draggingElementId = input<string | null>(null);
  readonly flowDragState = input<FlowDragRenderState | null>(null);

  readonly elementPointerDown = output<{ event: MouseEvent; id: string }>();
  readonly elementDblClick = output<{ event: MouseEvent; id: string }>();
  readonly elementContextMenu = output<{ event: MouseEvent; id: string }>();

  readonly style = computed<Record<string, string | null | undefined>>(() =>
    this.styleService.buildStyle(this.element(), this.allElements(), this.page()),
  );

  readonly sanitizedSvgContent = computed<SafeHtml | null>(() => {
    const el = this.element();
    if (el.type !== 'svg' || !el.svgContent) return null;
    return this.sanitizer.bypassSecurityTrustHtml(el.svgContent);
  });

  readonly strokeOverlayStyle = computed<Record<string, string | null | undefined>>(() =>
    this.styleService.buildStrokeOverlayStyle(this.element()),
  );

  readonly textWrapperStyle = computed(() =>
    this.styleService.buildTextVerticalAlignStyle(this.element()),
  );

  readonly textContentStyle = computed(() =>
    this.styleService.buildTextContentStyle(this.element()),
  );

  readonly isFlowChildInLayout = computed(() => {
    const el = this.element();
    if (!el.parentId) return false;
    const parent = this.elementMap().get(el.parentId) ?? null;
    if (!parent?.display) return false;
    const pos = el.position;
    return !pos || pos === 'static' || pos === 'relative' || pos === 'sticky';
  });

  readonly childrenWithPlaceholder = computed<ChildItem[]>(() => {
    const el = this.element();
    const dragState = this.flowDragState();
    const draggingId = dragState?.draggingElementId ?? null;

    const allChildren = this.childrenMap().get(el.id) ?? [];
    const children = allChildren.filter((e) => e.visible !== false && e.id !== draggingId);

    const ph = dragState?.placeholder;
    if (!ph || ph.containerId !== el.id) {
      return children.map((child) => ({ kind: 'element' as const, child }));
    }

    const dropIdx = ph.dropIndex;
    const result: ChildItem[] = [];
    for (let i = 0; i < children.length; i++) {
      if (i === dropIdx) result.push({ kind: 'placeholder' });
      result.push({ kind: 'element', child: children[i] });
    }
    if (dropIdx >= children.length) result.push({ kind: 'placeholder' });
    return result;
  });

  readonly placeholderStyle = computed<Record<string, string>>(() => {
    const bounds = this.flowDragState()?.floatingBounds;
    if (!bounds) return {} as Record<string, string>;
    return {
      width: `${bounds.width}px`,
      height: `${bounds.height}px`,
      'pointer-events': 'none',
      'flex-shrink': '0',
    };
  });

  trackChildItem(_index: number, item: ChildItem): string {
    return item.kind === 'element' ? item.child.id : `__ph__${this.element().id}`;
  }

  onPointerDown(event: MouseEvent): void {
    event.stopPropagation();
    this.elementPointerDown.emit({ event, id: this.element().id });
  }

  onDblClick(event: MouseEvent): void {
    event.stopPropagation();
    this.elementDblClick.emit({ event, id: this.element().id });
  }

  onContextMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.elementContextMenu.emit({ event, id: this.element().id });
  }
}
