import { Injectable, inject, signal } from '@angular/core';
import { CanvasElement, CanvasElementType, CanvasPageModel } from '@app/core';
import {
  HandlePosition,
  CornerHandle,
  Point,
  Bounds,
  ResizeState,
  RotateState,
  CornerRadiusState,
  SnapLine,
  CanvasPageLayout,
  CanvasPageDragState,
} from '../../canvas.types';
import { CanvasViewportService } from '../canvas-viewport.service';
import { CanvasHistoryService } from './canvas-history.service';
import { CanvasElementService } from '../canvas-element.service';
import { CanvasEditorStateService } from '../canvas-editor-state.service';
import { CanvasPageManagerService } from '../canvas-page-manager.service';

import { mutateNormalizeElement } from '../../utils/element/canvas-element-normalization.util';
import { clamp, roundToTwoDecimals } from '../../utils/canvas-math.util';
import { collectSubtreeIds, removeWithChildren } from '../../utils/canvas-tree.util';
import {
  detachCanvasElementFromPrimarySync,
  isDetachedCanvasBreakpointOverride,
} from '../../utils/canvas-breakpoint-link.util';
import {
  buildSnapCandidates,
  calculateResizedBounds,
  computeSnappedPosition,
  SNAP_THRESHOLD,
} from '../../utils/canvas-interaction.util';
import { getCanvasSizeMode } from '../../utils/element/canvas-sizing.util';
import {
  getTextFontFamily,
  getTextFontWeight,
  getTextFontStyle,
  getTextFontSize,
  getTextFontSizeInPx,
  getTextLineHeight,
  getTextLetterSpacing,
} from '../../utils/element/canvas-text.util';

const ROOT_FRAME_INSERT_GAP = 48;
const ELEMENT_DRAG_START_THRESHOLD = 3;
const CONTAINER_DROP_TOLERANCE = 4;
const ROOT_FRAME_BREAKPOINT_LOCAL_PATCH_KEYS = new Set<keyof CanvasElement>([
  'id',
  'name',
  'x',
  'y',
  'width',
  'widthMode',
  'widthSizingValue',
  'minWidth',
  'minWidthMode',
  'minWidthSizingValue',
  'maxWidth',
  'maxWidthMode',
  'maxWidthSizingValue',
  'height',
  'heightMode',
  'heightSizingValue',
  'minHeight',
  'minHeightMode',
  'minHeightSizingValue',
  'maxHeight',
  'maxHeightMode',
  'maxHeightSizingValue',
  'visible',
  'parentId',
  'isPrimary',
  'primarySyncId',
  'detachedPrimarySyncId',
]);

type RectangleDrawTool = 'rectangle' | 'image';

interface RectangleDrawState {
  tool: RectangleDrawTool;
  startPoint: Point;
  currentPoint: Point;
  containerId: string | null;
}

@Injectable()
export class CanvasGestureService {
  private readonly viewport = inject(CanvasViewportService);
  private readonly history = inject(CanvasHistoryService);
  private readonly element = inject(CanvasElementService);
  private readonly editorState = inject(CanvasEditorStateService);
  private readonly page = inject(CanvasPageManagerService);
  // ── Canvas element access (set by component) ────────────

  private canvasElementGetter: (() => HTMLElement | null) | null = null;

  setCanvasElementGetter(getter: () => HTMLElement | null): void {
    this.canvasElementGetter = getter;
  }

  private getCanvasElement(): HTMLElement | null {
    return this.canvasElementGetter?.() ?? null;
  }

  // ── Public signals (used in template via gesture.*) ───────

  readonly isDraggingEl = signal(false);
  readonly hoveredElementId = signal<string | null>(null);
  readonly snapLines = signal<SnapLine[]>([]);
  readonly rectangleDrawPreview = signal<Bounds | null>(null);
  readonly editingTextDraft = signal('');
  readonly flowDragPlaceholder = signal<{ elementId: string; bounds: Bounds } | null>(null);
  readonly draggingFlowChildId = signal<string | null>(null);
  readonly layoutDropTarget = signal<{ containerId: string; index: number } | null>(null);
  readonly autoOpenFillPopupElementId = signal<string | null>(null);

  readonly stableSelectionBounds = signal<{ elementId: string; bounds: Bounds } | null>(null);

  private readonly _flowCacheVersion = signal(0);
  get flowCacheVersion() {
    return this._flowCacheVersion.asReadonly();
  }

  private textEditorCapturedBounds: Bounds | null = null;

  // ── Private gesture state ─────────────────────────────────

  private flowBoundsCache = new Map<string, Bounds>();
  private flowBoundsDirty = true;
  private _flowBoundsRafId: number | null = null;

  private _lastKnownSceneBounds = new Map<string, Bounds>();

  private dragOffset: Point = { x: 0, y: 0 };
  private dragStartAbsolute: Point = { x: 0, y: 0 };
  private dragSelectionIds: string[] = [];
  private dragSelectionStartBounds = new Map<string, Bounds>();
  private dragSelectionStartParentIds = new Map<string, string | null>();
  private isElementDragPrimed = false;

  private _isDragging = false;
  private get isDragging(): boolean {
    return this._isDragging;
  }
  private set isDragging(value: boolean) {
    this._isDragging = value;
    this.isDraggingEl.set(value);
  }

  private hasMovedElementDuringDrag = false;
  private rectangleDrawState: RectangleDrawState | null = null;
  private isFlowDragInsideContainer = false;
  readonly isResizing = signal(false);
  readonly isFontSizeResizing = signal(false);
  readonly isRotating = signal(false);
  private isAdjustingCornerRadius = false;
  private isDraggingPage = false;
  private hasMovedPageDuringDrag = false;

  private suppressNextPageShellClick = false;
  private suppressNextCanvasClick = false;

  private pageDragState: CanvasPageDragState = {
    pageId: '',
    pointerX: 0,
    pointerY: 0,
    startX: 0,
    startY: 0,
  };

  private resizeSubtreeSnapshot = new Map<string, CanvasElement>();

  private resizeStart: ResizeState = {
    pointerX: 0,
    pointerY: 0,
    width: 0,
    height: 0,
    absoluteX: 0,
    absoluteY: 0,
    centerX: 0,
    centerY: 0,
    aspectRatio: 1,
    elementId: '',
    handle: 'se',
    parentAbsoluteBounds: null,
    rotation: 0,
  };

  private rotateStart: RotateState = {
    startAngle: 0,
    initialRotation: 0,
    centerX: 0,
    centerY: 0,
    elementId: '',
  };

  private cornerRadiusStart: CornerRadiusState = {
    absoluteX: 0,
    absoluteY: 0,
    width: 0,
    height: 0,
    elementId: '',
  };

  private isPropertyNumberGestureActive = false;

  // ── Suppress-flag public API ──────────────────────────────

  consumeCanvasClickSuppression(): boolean {
    if (this.suppressNextCanvasClick) {
      this.suppressNextCanvasClick = false;
      return true;
    }
    return false;
  }

  consumePageShellClickSuppression(): boolean {
    if (this.suppressNextPageShellClick) {
      this.suppressNextPageShellClick = false;
      return true;
    }
    return false;
  }

  setSuppressNextCanvasClick(value: boolean): void {
    this.suppressNextCanvasClick = value;
  }

  setSuppressNextPageShellClick(value: boolean): void {
    this.suppressNextPageShellClick = value;
  }

  cancelDragState(): void {
    this.isDragging = false;
    this.isResizing.set(false);
  }

  // ── Gesture starters ──────────────────────────────────────

  beginResize(event: MouseEvent, id: string, handle: HandlePosition): void {
    event.stopPropagation();
    event.preventDefault();
    this.suppressNextCanvasClick = true;

    const el = this.element.findElementById(id, this.editorState.elements());
    if (!el) return;

    const pointer = this.getActivePageCanvasPoint(event);
    if (!pointer) return;

    // getLiveElementCanvasBounds gives AABB for rotated elements; use model-based bounds for resize.
    const rotation = el.rotation ?? 0;
    const bounds =
      rotation !== 0
        ? this.element.getAbsoluteBounds(
            el,
            this.editorState.elements(),
            this.editorState.currentPage(),
          )
        : (this.getLiveElementCanvasBounds(el) ??
          this.element.getAbsoluteBounds(
            el,
            this.editorState.elements(),
            this.editorState.currentPage(),
          ));
    const parentEl = this.element.findElementById(el.parentId ?? null, this.editorState.elements());
    const rawParentBounds = parentEl
      ? (this.getLiveElementCanvasBounds(parentEl) ??
        this.element.getAbsoluteBounds(
          parentEl,
          this.editorState.elements(),
          this.editorState.currentPage(),
        ))
      : null;
    // Fit-content parent expands to fit children; clamping to its old size is wrong.
    const parentAbsoluteBounds: typeof rawParentBounds =
      rawParentBounds && parentEl
        ? {
            x: rawParentBounds.x,
            y: rawParentBounds.y,
            width:
              getCanvasSizeMode(parentEl, 'width') === 'fit-content'
                ? Number.POSITIVE_INFINITY
                : rawParentBounds.width,
            height:
              getCanvasSizeMode(parentEl, 'height') === 'fit-content'
                ? Number.POSITIVE_INFINITY
                : rawParentBounds.height,
          }
        : rawParentBounds;
    this.captureResizeSubtreeSnapshot(id, this.editorState.elements());
    this.editorState.selectOnlyElement(id);
    this.beginGestureHistory();
    this.isDragging = false;
    this.isResizing.set(true);
    // Seed stable bounds immediately so outline is correct on the first CD cycle.
    const resizeSnapshot = this.snapshotOverlaySceneBounds(el);
    this.stableSelectionBounds.set(
      resizeSnapshot ? { elementId: id, bounds: resizeSnapshot } : null,
    );
    this.resizeStart = {
      pointerX: pointer.x,
      pointerY: pointer.y,
      width: bounds.width,
      height: bounds.height,
      absoluteX: bounds.x,
      absoluteY: bounds.y,
      centerX: bounds.x + bounds.width / 2,
      centerY: bounds.y + bounds.height / 2,
      aspectRatio: bounds.width / Math.max(bounds.height, 1),
      elementId: id,
      handle,
      parentAbsoluteBounds,
      rotation,
    };
  }

  beginFontSizeResize(event: MouseEvent, id: string): void {
    event.stopPropagation();
    event.preventDefault();
    this.suppressNextCanvasClick = true;

    const el = this.element.findElementById(id, this.editorState.elements());
    if (!el) return;

    const pointer = this.getActivePageCanvasPoint(event);
    if (!pointer) return;

    this.editorState.selectOnlyElement(id);
    this.beginGestureHistory();
    this.isDragging = false;
    this.isResizing.set(true);
    // Do not freeze stable bounds — the element's rendered size changes as font size updates.
    this.stableSelectionBounds.set(null);

    this.resizeStart = {
      pointerX: pointer.x,
      pointerY: pointer.y,
      width: 0,
      height: 0,
      absoluteX: 0,
      absoluteY: 0,
      centerX: 0,
      centerY: 0,
      aspectRatio: 1,
      elementId: id,
      handle: 's',
      parentAbsoluteBounds: null,
      rotation: 0,
      isFontSizeResize: true,
      startFontSizePx: getTextFontSizeInPx(el),
    };
    this.isFontSizeResizing.set(true);
  }

  beginRotate(event: MouseEvent, id: string, _corner: CornerHandle): void {
    event.stopPropagation();
    event.preventDefault();

    const el = this.element.findElementById(id, this.editorState.elements());
    if (!el) return;

    const pointer = this.getActivePageCanvasPoint(event);
    if (!pointer) return;

    const bounds =
      this.getLiveElementCanvasBounds(el) ??
      this.element.getAbsoluteBounds(
        el,
        this.editorState.elements(),
        this.editorState.currentPage(),
      );
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const startAngle = Math.atan2(pointer.y - centerY, pointer.x - centerX) * (180 / Math.PI);

    this.editorState.selectOnlyElement(id);
    this.beginGestureHistory();
    this.isDragging = false;
    this.isResizing.set(false);
    this.isRotating.set(true);
    // Seed stable bounds immediately so selectionOverlayBounds is correct on the very first
    // CD cycle of the gesture (before markFlowBoundsCacheClean fires after ngAfterViewChecked).
    const rotateSnapshot = this.snapshotOverlaySceneBounds(el);
    this.stableSelectionBounds.set(
      rotateSnapshot ? { elementId: id, bounds: rotateSnapshot } : null,
    );
    this.rotateStart = {
      startAngle,
      initialRotation: el.rotation ?? 0,
      centerX,
      centerY,
      elementId: id,
    };
  }

  beginCornerRadius(event: MouseEvent, id: string): void {
    event.stopPropagation();
    event.preventDefault();
    this.suppressNextCanvasClick = true;

    const el = this.element.findElementById(id, this.editorState.elements());
    if (!el || !this.element.supportsCornerRadius(el)) return;

    const pointer = this.getActivePageCanvasPoint(event);
    if (!pointer) return;

    const bounds =
      this.getLiveElementCanvasBounds(el) ??
      this.element.getAbsoluteBounds(
        el,
        this.editorState.elements(),
        this.editorState.currentPage(),
      );
    this.editorState.selectOnlyElement(id);
    this.beginGestureHistory();
    this.isDragging = false;
    this.isResizing.set(false);
    this.isRotating.set(false);
    this.isAdjustingCornerRadius = true;
    this.cornerRadiusStart = {
      absoluteX: bounds.x,
      absoluteY: bounds.y,
      width: bounds.width,
      height: bounds.height,
      elementId: id,
    };
  }

  beginPageDrag(event: MouseEvent, pageId: string, layout: CanvasPageLayout): void {
    const pointer = this.viewport.getCanvasPoint(event, this.getCanvasElement());
    if (!pointer) return;

    this.isDraggingPage = true;
    this.hasMovedPageDuringDrag = false;
    this.beginGestureHistory();
    this.pageDragState = {
      pageId,
      pointerX: pointer.x,
      pointerY: pointer.y,
      startX: layout.x,
      startY: layout.y,
    };
  }

  primeElementDrag(pointer: Point, bounds: Bounds, elementId: string): void {
    this.hasMovedElementDuringDrag = false;
    this.isElementDragPrimed = true;
    this.dragOffset = {
      x: pointer.x - bounds.x,
      y: pointer.y - bounds.y,
    };
    this.dragStartAbsolute = { x: bounds.x, y: bounds.y };
  }

  captureDragSelection(anchorId: string): void {
    const elements = this.editorState.elements();
    const candidateIds = this.editorState.selectedElementIds().includes(anchorId)
      ? this.getSelectionRootIds()
      : [anchorId];
    const dragIds = this.canUseGroupDrag(candidateIds, elements) ? candidateIds : [anchorId];

    this.dragSelectionIds = dragIds;
    this.dragSelectionStartParentIds = new Map(
      dragIds.map((id) => [id, this.element.findElementById(id, elements)?.parentId ?? null]),
    );
    this.dragSelectionStartBounds = new Map(
      dragIds
        .map((id) => {
          const el = this.element.findElementById(id, elements);
          if (!el) return [id, null] as [string, Bounds | null];
          // Prefer live DOM bounds for flow children whose stored x/y may differ from rendered position.
          const bounds =
            this.getLiveElementCanvasBounds(el) ??
            this.element.getAbsoluteBounds(el, elements, this.editorState.currentPage());
          return [id, bounds] as [string, Bounds | null];
        })
        .filter((entry): entry is [string, Bounds] => entry[1] !== null),
    );
  }

  beginFlowChildDrag(el: CanvasElement, parent: CanvasElement, elements: CanvasElement[]): Bounds {
    this.draggingFlowChildId.set(el.id);
    const liveSceneBounds = this.getLiveOverlaySceneBounds(el);
    const liveCanvasBounds = this.getLiveElementCanvasBounds(el);
    const cached = this.flowBoundsCache.get(el.id);
    this.setFlowDragPlaceholder(el, liveSceneBounds ?? cached ?? null);
    this.layoutDropTarget.set({
      containerId: parent.id,
      index: this.getFlowChildIndex(parent.id, el.id, elements),
    });
    this.isFlowDragInsideContainer = true;

    const absoluteBounds = this.element.getAbsoluteBounds(
      el,
      elements,
      this.editorState.currentPage(),
    );
    return liveCanvasBounds ?? absoluteBounds;
  }

  // ── Main pointer event handlers ───────────────────────────

  handlePointerMove(event: MouseEvent): void {
    const hasActivePointerGesture =
      this.isDraggingPage ||
      !!this.rectangleDrawState ||
      this.viewport.isPanning() ||
      this.isRotating() ||
      this.isResizing() ||
      this.isAdjustingCornerRadius ||
      this.isElementDragPrimed ||
      this.isDragging;

    if (hasActivePointerGesture && event.buttons === 0) {
      this.handlePointerUp(event);
      return;
    }

    if (this.isDraggingPage) {
      const pointer = this.viewport.getCanvasPoint(event, this.getCanvasElement());
      if (!pointer) return;

      const deltaX = pointer.x - this.pageDragState.pointerX;
      const deltaY = pointer.y - this.pageDragState.pointerY;
      if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
        this.hasMovedPageDuringDrag = true;
      }
      this.editorState.pages.update((pages) =>
        pages.map((p) =>
          p.id === this.pageDragState.pageId
            ? {
                ...p,
                canvasX: roundToTwoDecimals(this.pageDragState.startX + deltaX),
                canvasY: roundToTwoDecimals(this.pageDragState.startY + deltaY),
              }
            : p,
        ),
      );
      return;
    }

    if (this.rectangleDrawState) {
      this.updateRectangleDrawPreviewFromEvent(event);
      return;
    }

    if (this.viewport.isPanning()) {
      this.viewport.updatePan(event);
      return;
    }

    if (this.isRotating()) {
      this.handleRotatePointerMove(event);
      return;
    }

    if (this.isResizing()) {
      this.handleResizePointerMove(event);
      return;
    }

    if (this.isAdjustingCornerRadius) {
      this.handleCornerRadiusPointerMove(event);
      return;
    }

    if (this.isElementDragPrimed && !this.isDragging) {
      const selectedId = this.editorState.selectedElementId();
      if (!selectedId) {
        this.isElementDragPrimed = false;
        return;
      }

      const pointer = this.getActivePageCanvasPoint(event);
      if (!pointer) return;

      const absoluteX = pointer.x - this.dragOffset.x;
      const absoluteY = pointer.y - this.dragOffset.y;
      const dragDistance = Math.hypot(
        absoluteX - this.dragStartAbsolute.x,
        absoluteY - this.dragStartAbsolute.y,
      );

      if (dragDistance < ELEMENT_DRAG_START_THRESHOLD) return;

      this.beginGestureHistory();
      this.hasMovedElementDuringDrag = true;
      this.isDragging = true;
      this.isElementDragPrimed = false;
    }

    if (!this.isDragging) return;

    const selectedId = this.editorState.selectedElementId();
    if (!selectedId) return;

    const pointer = this.getActivePageCanvasPoint(event);
    if (!pointer) return;

    const elements = this.editorState.elements();
    const dragged = this.element.findElementById(selectedId, elements);
    if (!dragged) return;

    const isGroupDrag = this.dragSelectionIds.length > 1;

    let absoluteX = pointer.x - this.dragOffset.x;
    let absoluteY = pointer.y - this.dragOffset.y;
    const dragDistance = Math.hypot(
      absoluteX - this.dragStartAbsolute.x,
      absoluteY - this.dragStartAbsolute.y,
    );

    if (!this.hasMovedElementDuringDrag) {
      if (dragDistance < ELEMENT_DRAG_START_THRESHOLD) return;
      this.hasMovedElementDuringDrag = true;
    }

    if (event.shiftKey) {
      const dx = Math.abs(absoluteX - this.dragStartAbsolute.x);
      const dy = Math.abs(absoluteY - this.dragStartAbsolute.y);
      if (dx >= dy) {
        absoluteY = this.dragStartAbsolute.y;
      } else {
        absoluteX = this.dragStartAbsolute.x;
      }
    }

    if (isGroupDrag) {
      this.snapLines.set([]);

      const deltaX = absoluteX - this.dragStartAbsolute.x;
      const deltaY = absoluteY - this.dragStartAbsolute.y;

      this.editorState.updateCurrentPageElements((els) =>
        els.map((el) => {
          if (!this.dragSelectionIds.includes(el.id)) return el;

          const startBounds = this.dragSelectionStartBounds.get(el.id);
          if (!startBounds) return el;

          const nextAbsoluteX = startBounds.x + deltaX;
          const nextAbsoluteY = startBounds.y + deltaY;
          return {
            ...el,
            ...this.resolveDraggedElementPatch(el, els, nextAbsoluteX, nextAbsoluteY),
          };
        }),
      );
      return;
    }

    // ── Flow child drag (reorder within layout container) ──
    if (this.draggingFlowChildId()) {
      this.handleFlowChildDragMove(dragged, absoluteX, absoluteY, elements);
      return;
    }

    // Snap from cached bounds (O(1) per element) instead of live DOM reads (O(n) per pointer-move);
    // fall back to getAbsoluteBounds for uncached elements (e.g. off-screen).
    const snapLayout = this.page.activePageLayout();
    const snapLayoutX = snapLayout?.x ?? 0;
    const snapLayoutY = snapLayout?.y ?? 0;
    const { xCandidates, yCandidates } = buildSnapCandidates(selectedId, elements, (el, els) => {
      const cached = this.flowBoundsCache.get(el.id);
      if (cached) {
        return {
          x: cached.x - snapLayoutX,
          y: cached.y - snapLayoutY,
          width: cached.width,
          height: cached.height,
        };
      }
      return this.element.getAbsoluteBounds(el, els, this.editorState.currentPage());
    });
    const pageWidth = this.page.currentViewportWidth();
    const pageHeight = this.page.currentViewportHeight();
    xCandidates.push(0, pageWidth / 2, pageWidth);
    yCandidates.push(0, pageHeight / 2, pageHeight);
    const draggedCached = this.flowBoundsCache.get(dragged.id);
    const draggedBounds: Bounds = draggedCached
      ? {
          x: draggedCached.x - snapLayoutX,
          y: draggedCached.y - snapLayoutY,
          width: draggedCached.width,
          height: draggedCached.height,
        }
      : (this.getLiveElementCanvasBounds(dragged) ??
        this.element.getAbsoluteBounds(dragged, elements, this.editorState.currentPage()));
    const snap = computeSnappedPosition(
      absoluteX,
      absoluteY,
      draggedBounds.width,
      draggedBounds.height,
      xCandidates,
      yCandidates,
      SNAP_THRESHOLD / this.viewport.zoomLevel(),
    );
    absoluteX = snap.x;
    absoluteY = snap.y;
    const isRootFrameDrag = dragged.type === 'frame' && !dragged.parentId;
    if (isRootFrameDrag) {
      absoluteY = this.dragStartAbsolute.y;
      this.snapLines.set(snap.lines.filter((line) => line.type === 'vertical'));

      this.editorState.updateCurrentPageElements((els) => {
        if (this.getRootFrameCount(els) <= 1) return els;
        return this.reflowRootFrames(els, selectedId, absoluteX);
      });
      return;
    } else {
      this.snapLines.set(snap.lines);
    }

    this.editorState.updateCurrentPageElements((els) => {
      const mapped = els.map((el) => {
        if (el.id !== selectedId) return el;

        if (el.type === 'frame') {
          if (isRootFrameDrag && !el.parentId) {
            return {
              ...el,
              x: roundToTwoDecimals(absoluteX),
              y: roundToTwoDecimals(this.dragStartAbsolute.y),
            };
          }
          return {
            ...el,
            x: roundToTwoDecimals(absoluteX),
            y: roundToTwoDecimals(absoluteY),
          };
        }

        return {
          ...el,
          ...this.resolveDraggedElementPatch(el, els, absoluteX, absoluteY, true),
        };
      });
      const movedEl = mapped.find((e) => e.id === selectedId) ?? null;
      if (movedEl?.primarySyncId) return mapped;
      return this.syncElementMoveToPrimary(movedEl, mapped);
    });
  }

  handlePointerUp(event: MouseEvent): void {
    if (this.rectangleDrawState) {
      this.updateRectangleDrawPreviewFromEvent(event);
      this.commitRectangleDraw();
      this.clearRectangleDraw();
      this.deferRectangleDrawClickSuppressionReset();
      return;
    }

    const selectedOnDrop = this.editorState.selectedElement();
    const prevParentId = selectedOnDrop
      ? (this.dragSelectionStartParentIds.get(selectedOnDrop.id) ?? selectedOnDrop.parentId ?? null)
      : null;
    const isGroupDrag = this.dragSelectionIds.length > 1;
    const shouldCommitGestureHistory =
      this.isDragging ||
      this.isResizing() ||
      this.isRotating() ||
      this.isAdjustingCornerRadius ||
      this.isDraggingPage;

    if (this.isDragging && this.hasMovedElementDuringDrag) {
      if (this.draggingFlowChildId()) {
        this.commitFlowChildDrop();
      } else if (!isGroupDrag) {
        this.autoGroupOnDrop();
        if (selectedOnDrop?.type === 'frame' && !selectedOnDrop.parentId) {
          this.alignRootFramesOnDrop();
        }
        if (selectedOnDrop) {
          this.editorState.updateCurrentPageElements((els) =>
            this.breakSyncOnParentChange(selectedOnDrop.id, prevParentId, els),
          );
        }
      }
    }

    if (
      (this.isResizing() || (this.isDragging && this.hasMovedElementDuringDrag)) &&
      selectedOnDrop &&
      !isGroupDrag
    ) {
      this.editorState.updateCurrentPageElements((els) => {
        const freshEl = els.find((e) => e.id === selectedOnDrop.id) ?? null;
        if (freshEl?.primarySyncId) {
          return els.map((e) => (e.id === freshEl.id ? detachCanvasElementFromPrimarySync(e) : e));
        }
        if (this.isResizing() && freshEl?.type === 'frame' && !freshEl.parentId) {
          return this.syncPrimaryFrameResize(freshEl, els);
        }
        return this.syncElementMoveToPrimary(freshEl, els);
      });
    }

    if (this.isDraggingPage && this.hasMovedPageDuringDrag) {
      this.suppressNextPageShellClick = true;
    }

    if (this.viewport.isPanning() && this.viewport.panMoved) {
      this.suppressNextCanvasClick = true;
    }

    this.viewport.endPan();
    this.isElementDragPrimed = false;
    this.isDragging = false;
    this.isResizing.set(false);
    this.isFontSizeResizing.set(false);
    this.isRotating.set(false);
    this.isAdjustingCornerRadius = false;
    this.isDraggingPage = false;
    this.hasMovedElementDuringDrag = false;
    this.hasMovedPageDuringDrag = false;
    this.isFlowDragInsideContainer = false;
    this.resizeSubtreeSnapshot = new Map();
    this.snapLines.set([]);
    this.flowDragPlaceholder.set(null);
    this.draggingFlowChildId.set(null);
    this.layoutDropTarget.set(null);
    this.dragSelectionIds = [];
    this.dragSelectionStartBounds = new Map();
    this.dragSelectionStartParentIds = new Map();

    if (shouldCommitGestureHistory) {
      this.history.commitGestureHistory(() => this.editorState.createHistorySnapshot());
    }
  }

  // ── Rectangle draw ────────────────────────────────────────

  beginRectangleDraw(event: MouseEvent, suppressPageShellClick = false): boolean {
    const tool = this.editorState.currentTool();
    if (tool !== 'rectangle' && tool !== 'image') return false;

    const pointer = this.getActivePageCanvasPoint(event);
    if (!pointer) return false;

    event.preventDefault();
    event.stopPropagation();

    if (suppressPageShellClick) {
      this.suppressNextPageShellClick = true;
    }

    const elements = this.editorState.elements();
    const targetContainer = this.resolveInsertionContainer(pointer);
    const containerId = targetContainer?.id ?? null;
    const containerBounds = targetContainer
      ? this.element.getAbsoluteBounds(targetContainer, elements, this.editorState.currentPage())
      : null;

    this.rectangleDrawState = {
      tool: tool as RectangleDrawTool,
      startPoint: pointer,
      currentPoint: pointer,
      containerId,
    };

    this.rectangleDrawPreview.set({
      x: pointer.x + (containerBounds?.x ?? 0) - (containerBounds?.x ?? 0),
      y: pointer.y + (containerBounds?.y ?? 0) - (containerBounds?.y ?? 0),
      width: 0,
      height: 0,
    });

    return true;
  }

  private updateRectangleDrawPreviewFromEvent(event: MouseEvent): void {
    const pointer = this.getActivePageCanvasPoint(event);
    if (!pointer || !this.rectangleDrawState) return;

    this.rectangleDrawState.currentPoint = pointer;
    const start = this.rectangleDrawState.startPoint;
    this.rectangleDrawPreview.set({
      x: Math.min(start.x, pointer.x),
      y: Math.min(start.y, pointer.y),
      width: Math.abs(pointer.x - start.x),
      height: Math.abs(pointer.y - start.y),
    });
  }

  private commitRectangleDraw(): void {
    const state = this.rectangleDrawState;
    if (!state) return;

    const preview = this.rectangleDrawPreview();
    if (!preview || preview.width < 2 || preview.height < 2) return;

    const { x, y, width, height } = preview;

    const elements = this.editorState.elements();
    const targetContainer = state.containerId
      ? this.element.findElementById(state.containerId, elements)
      : null;
    const containerBounds = targetContainer
      ? (this.getLiveElementCanvasBounds(targetContainer) ??
        this.element.getAbsoluteBounds(targetContainer, elements, this.editorState.currentPage()))
      : null;

    this.runWithHistory(() => {
      const result = this.element.createRectangleFromBounds(
        state.tool,
        { x, y, width, height },
        this.editorState.elements(),
        targetContainer,
        containerBounds,
      );
      const newElement = this.commitElementCreationResult(result);
      this.autoOpenFillPopupElementId.set(
        state.tool === 'image' && newElement ? newElement.id : null,
      );
    });
  }

  private clearRectangleDraw(): void {
    this.rectangleDrawState = null;
    this.rectangleDrawPreview.set(null);
  }

  private deferRectangleDrawClickSuppressionReset(): void {
    setTimeout(() => {
      this.suppressNextCanvasClick = false;
      this.suppressNextPageShellClick = false;
    }, 0);
  }

  // ── Private gesture handlers ──────────────────────────────

  private handleRotatePointerMove(event: MouseEvent): void {
    const start = this.rotateStart;
    if (!start.elementId) return;

    const pointer = this.getActivePageCanvasPoint(event);
    if (!pointer) return;

    const currentAngle =
      Math.atan2(pointer.y - start.centerY, pointer.x - start.centerX) * (180 / Math.PI);
    const angleDelta = currentAngle - start.startAngle;
    let newRotation = start.initialRotation + angleDelta;

    if (event.shiftKey) {
      newRotation = Math.round(newRotation / 15) * 15;
    }

    newRotation = ((newRotation % 360) + 360) % 360;
    newRotation = roundToTwoDecimals(newRotation);

    this.editorState.updateCurrentPageElements((els) =>
      els.map((el) => {
        if (el.id !== start.elementId) return el;
        return { ...el, rotation: newRotation };
      }),
    );
  }

  private handleFontSizeResizePointerMove(pointer: { x: number; y: number }): void {
    const start = this.resizeStart;
    const deltaY = pointer.y - start.pointerY;
    const newFontSizePx = Math.max(1, Math.round((start.startFontSizePx ?? 16) + deltaY));

    this.editorState.updateCurrentPageElements((els) =>
      els.map((el) => {
        if (el.id !== start.elementId) return el;
        const unit = el.fontSizeUnit ?? 'px';
        const newFontSizeValue =
          unit === 'rem'
            ? Math.max(0.0625, Math.round((newFontSizePx / 16) * 1000) / 1000)
            : newFontSizePx;
        return { ...el, fontSize: newFontSizeValue, fontSizeUnit: unit };
      }),
    );
  }

  private handleResizePointerMove(event: MouseEvent): void {
    const start = this.resizeStart;
    if (!start.elementId) return;

    const pointer = this.getActivePageCanvasPoint(event);
    if (!pointer) return;

    if (start.isFontSizeResize) {
      this.handleFontSizeResizePointerMove(pointer);
      return;
    }

    this.editorState.updateCurrentPageElements((els) => {
      const resizedElements = els.map((el) => {
        if (el.id !== start.elementId) return el;

        // Use gesture-start parent bounds: flow children have x/y=0, so getAbsoluteBounds gives wrong origin.
        const parentBounds = start.parentAbsoluteBounds;

        // Read live DOM bounds each frame: flex reflow shifts the element's position during resize.
        let effectiveStart = this.resizeStart;
        if (!start.rotation && parentBounds !== null) {
          const parentEl = els.find((e) => e.id === el.parentId);
          if (parentEl && this.isLayoutContainer(parentEl) && this.isChildInFlow(el)) {
            const liveBounds = this.getLiveElementCanvasBounds(el);
            if (liveBounds) {
              const handle = start.handle;
              effectiveStart = {
                ...this.resizeStart,
                absoluteX: liveBounds.x,
                absoluteY: liveBounds.y,
                width: liveBounds.width,
                height: liveBounds.height,
                centerX: liveBounds.x + liveBounds.width / 2,
                centerY: liveBounds.y + liveBounds.height / 2,
                // Anchor pointerX/Y to the current handle edge so deltaX/Y reflects
                // the distance from the current rendered edge to the cursor each frame.
                pointerX:
                  liveBounds.x +
                  (handle.includes('e')
                    ? liveBounds.width
                    : handle.includes('w')
                      ? 0
                      : liveBounds.width / 2),
                pointerY:
                  liveBounds.y +
                  (handle.includes('s')
                    ? liveBounds.height
                    : handle.includes('n')
                      ? 0
                      : liveBounds.height / 2),
              };
            }
          }
        }

        const bounds = calculateResizedBounds(
          effectiveStart,
          parentBounds,
          pointer,
          event.shiftKey,
          event.altKey,
        );

        const storedWidth = this.getStoredAxisSizeFromRendered(el, 'width', bounds.width);
        const storedHeight = this.getStoredAxisSizeFromRendered(el, 'height', bounds.height);

        // Re-anchor position to the fixed edge after storing width/height.
        // getStoredAxisSizeFromRendered applies Math.round and Math.max(24,...), so the
        // stored size can differ from bounds.width/height. Without re-anchoring, the edge
        // that should stay fixed (right edge for 'w' handles, bottom for 'n' handles) drifts.
        const parentOriginX = parentBounds ? parentBounds.x : 0;
        const parentOriginY = parentBounds ? parentBounds.y : 0;

        let localX = bounds.x - parentOriginX;
        let localY = bounds.y - parentOriginY;

        if (!effectiveStart.rotation) {
          if (effectiveStart.handle.includes('w')) {
            // Right edge is fixed; re-derive x so that x + storedWidth = fixedRight.
            const fixedAbsRight = effectiveStart.absoluteX + effectiveStart.width;
            localX = fixedAbsRight - parentOriginX - storedWidth;
          }
          if (effectiveStart.handle.includes('n')) {
            // Bottom edge is fixed; re-derive y so that y + storedHeight = fixedBottom.
            const fixedAbsBottom = effectiveStart.absoluteY + effectiveStart.height;
            localY = fixedAbsBottom - parentOriginY - storedHeight;
          }
        }

        const nextElement: CanvasElement = {
          ...el,
          x: localX,
          y: localY,
          width: storedWidth,
          height: storedHeight,
        };

        mutateNormalizeElement(nextElement, els);
        return nextElement;
      });

      let resizedTarget = resizedElements.find((el) => el.id === start.elementId) ?? null;

      let snappedElements = resizedElements;
      if (resizedTarget && this.isRootFrame(resizedTarget) && start.handle.includes('s')) {
        const candidates: number[] = this.element
          .getRootFrames(els)
          .filter((el) => el.id !== start.elementId)
          .flatMap((el) => [
            el.y + this.element.getRenderedHeight(el, els, this.editorState.currentPage()),
            el.y,
          ]);
        const currentBottom =
          resizedTarget.y +
          this.element.getRenderedHeight(
            resizedTarget,
            resizedElements,
            this.editorState.currentPage(),
          );
        let bestDelta = SNAP_THRESHOLD / this.viewport.zoomLevel();
        let snappedBottom: number | null = null;
        for (const c of candidates) {
          const delta = Math.abs(c - currentBottom);
          if (delta < bestDelta) {
            bestDelta = delta;
            snappedBottom = c;
          }
        }
        if (snappedBottom !== null) {
          const snappedHeight = this.getStoredAxisSizeFromRendered(
            resizedTarget,
            'height',
            snappedBottom - resizedTarget.y,
          );
          snappedElements = resizedElements.map((e) =>
            e.id === start.elementId ? { ...e, height: snappedHeight } : e,
          );
          this.snapLines.set([{ type: 'horizontal', position: snappedBottom }]);
        } else {
          this.snapLines.set([]);
        }
        resizedTarget = snappedElements.find((e) => e.id === start.elementId) ?? null;
      }

      let result: CanvasElement[];
      if (
        !resizedTarget ||
        !this.isRootFrame(resizedTarget) ||
        this.getRootFrameCount(snappedElements) <= 1
      ) {
        result = snappedElements;
      } else {
        result = this.reflowRootFrames(snappedElements, resizedTarget.id, resizedTarget.x);
      }

      if (resizedTarget) {
        result = this.applyResponsiveResizeToDescendants(result, resizedTarget.id);
      }

      const freshResized = result.find((e) => e.id === start.elementId) ?? null;
      if (freshResized?.primarySyncId) return result;
      if (freshResized?.type === 'frame' && !freshResized.parentId) {
        return this.syncPrimaryFrameResize(freshResized, result);
      }
      return this.syncElementMoveToPrimary(freshResized, result);
    });
  }

  private handleCornerRadiusPointerMove(event: MouseEvent): void {
    const start = this.cornerRadiusStart;
    if (!start.elementId) return;

    const pointer = this.getActivePageCanvasPoint(event);
    if (!pointer) return;

    const cornerX = start.absoluteX;
    const cornerY = start.absoluteY;
    const xRadius = pointer.x - cornerX;
    const yRadius = pointer.y - cornerY;
    const rawRadius = Math.min(xRadius, yRadius);
    const maxRadius = Math.max(0, Math.min(start.width, start.height) / 2);
    const nextRadius = clamp(rawRadius, 0, maxRadius);

    this.editorState.updateCurrentPageElements((els) => {
      const withRadius = els.map((el) => {
        if (el.id !== start.elementId || !this.element.supportsCornerRadius(el)) return el;
        return { ...el, cornerRadius: roundToTwoDecimals(nextRadius) };
      });
      return this.syncElementPatchToPrimary(
        start.elementId,
        { cornerRadius: roundToTwoDecimals(nextRadius) },
        withRadius,
      );
    });
  }

  private captureResizeSubtreeSnapshot(elementId: string, elements: CanvasElement[]): void {
    const subtreeIds = new Set(collectSubtreeIds(elements, elementId));
    this.resizeSubtreeSnapshot = new Map(
      elements.filter((el) => subtreeIds.has(el.id)).map((el) => [el.id, structuredClone(el)]),
    );
  }

  private applyResponsiveResizeToDescendants(
    elements: CanvasElement[],
    resizedElementId: string,
  ): CanvasElement[] {
    const sourceRoot = this.resizeSubtreeSnapshot.get(resizedElementId);
    const resizedRoot = this.element.findElementById(resizedElementId, elements);
    if (
      !sourceRoot ||
      !resizedRoot ||
      !this.element.isContainerElement(resizedRoot) ||
      this.isLayoutContainer(resizedRoot) ||
      this.resizeSubtreeSnapshot.size <= 1
    ) {
      return elements;
    }

    const sourceElements = Array.from(this.resizeSubtreeSnapshot.values());
    const subtreeIds = new Set(this.resizeSubtreeSnapshot.keys());
    const nextElements = elements.map((el) => (subtreeIds.has(el.id) ? { ...el } : el));
    const nextById = new Map(nextElements.map((el) => [el.id, el]));

    const descendants = sourceElements
      .filter((el) => el.id !== resizedElementId)
      .sort(
        (l, r) =>
          this.getElementNestingDepth(l, sourceElements) -
          this.getElementNestingDepth(r, sourceElements),
      );

    for (const sourceEl of descendants) {
      const nextEl = nextById.get(sourceEl.id);
      const sourceParent = this.resizeSubtreeSnapshot.get(sourceEl.parentId ?? '');
      const nextParent = nextById.get(sourceEl.parentId ?? '');
      if (!nextEl || !sourceParent || !nextParent) continue;

      const sourceParentWidth = this.element.getRenderedWidth(
        sourceParent,
        sourceElements,
        this.editorState.currentPage(),
      );
      const sourceParentHeight = this.element.getRenderedHeight(
        sourceParent,
        sourceElements,
        this.editorState.currentPage(),
      );
      const nextParentWidth = this.element.getRenderedWidth(
        nextParent,
        nextElements,
        this.editorState.currentPage(),
      );
      const nextParentHeight = this.element.getRenderedHeight(
        nextParent,
        nextElements,
        this.editorState.currentPage(),
      );
      const scaleX = sourceParentWidth > 0 ? nextParentWidth / sourceParentWidth : 1;
      const scaleY = sourceParentHeight > 0 ? nextParentHeight / sourceParentHeight : 1;
      const shouldScalePosition =
        !this.isLayoutContainer(nextParent) || !this.isChildInFlow(sourceEl);
      const textScale = Math.min(Math.abs(scaleX), Math.abs(scaleY));

      const updatedElement: CanvasElement = {
        ...nextEl,
        x: shouldScalePosition ? roundToTwoDecimals(sourceEl.x * scaleX) : nextEl.x,
        y: shouldScalePosition ? roundToTwoDecimals(sourceEl.y * scaleY) : nextEl.y,
        width: Math.round(sourceEl.width * scaleX),
        height: Math.round(sourceEl.height * scaleY),
      };

      if (updatedElement.type === 'text' && typeof sourceEl.fontSize === 'number') {
        updatedElement.fontSize = roundToTwoDecimals(sourceEl.fontSize * textScale);

        if (typeof sourceEl.letterSpacing === 'number' && sourceEl.letterSpacingUnit !== 'em') {
          updatedElement.letterSpacing = roundToTwoDecimals(sourceEl.letterSpacing * textScale);
        }

        if (typeof sourceEl.lineHeight === 'number' && sourceEl.lineHeightUnit === 'px') {
          updatedElement.lineHeight = roundToTwoDecimals(sourceEl.lineHeight * textScale);
        }
      }

      mutateNormalizeElement(updatedElement, nextElements);
      nextById.set(updatedElement.id, updatedElement);

      const index = nextElements.findIndex((el) => el.id === updatedElement.id);
      if (index >= 0) nextElements[index] = updatedElement;
    }

    return nextElements;
  }

  // ── Flow child drag ───────────────────────────────────────

  private updateFlowBoundsCache(): void {
    const sceneEl = this.getCanvasElement()?.querySelector<HTMLElement>('.canvas-scene') ?? null;
    if (!sceneEl) return;
    const zoom = this.viewport.zoomLevel();
    const sceneRect = sceneEl.getBoundingClientRect();
    const flowEls = sceneEl.querySelectorAll<HTMLElement>('[data-flow-child="true"]');
    const newCache = new Map<string, Bounds>();
    for (const domEl of flowEls) {
      const id = domEl.getAttribute('data-element-id');
      if (!id) continue;
      const rect = domEl.getBoundingClientRect();
      newCache.set(id, {
        x: roundToTwoDecimals((rect.left - sceneRect.left) / zoom),
        y: roundToTwoDecimals((rect.top - sceneRect.top) / zoom),
        width: roundToTwoDecimals(rect.width / zoom),
        height: roundToTwoDecimals(rect.height / zoom),
      });
    }
    this.flowBoundsCache = newCache;
  }

  invalidateFlowBoundsCache(): void {
    this.flowBoundsDirty = true;
    // Keep the version bump immediate so computed signals (selectionOverlayBounds etc.)
    // switch to dirty-phase logic in the same CD cycle.
    this._flowCacheVersion.update((v) => v + 1);
    // Throttle the expensive DOM work (querySelectorAll + N×getBoundingClientRect) to at
    // most once per animation frame — regardless of how many pointermove events arrive.
    if (this._flowBoundsRafId !== null) return;
    this._flowBoundsRafId = requestAnimationFrame(() => {
      this._flowBoundsRafId = null;
      this.updateFlowBoundsCache();
      this.markFlowBoundsCacheClean();
    });
  }

  isFlowBoundsDirty(): boolean {
    return this.flowBoundsDirty;
  }

  private markFlowBoundsCacheClean(): void {
    this.flowBoundsDirty = false;
    // Skip stableSelectionBounds update while a gesture is active. Each gesture seeds the
    // stable snapshot at gesture-start (beginResize / beginRotate) and owns it for the
    // gesture lifetime. Overwriting it here with a RAF snapshot taken between a model write
    // and Angular's next paint causes a 1-frame teleport: the outline jumps to an intermediate
    // DOM state → the "ghost" flicker the user reported.
    if (!this.isResizing() && !this.isRotating()) {
      const selectedId = this.editorState.selectedElementId();
      if (selectedId) {
        const el = this.element.findElementById(selectedId, this.editorState.elements());
        const snapshot = el ? this.snapshotOverlaySceneBounds(el) : null;
        this.stableSelectionBounds.set(
          snapshot ? { elementId: selectedId, bounds: snapshot } : null,
        );
      } else {
        this.stableSelectionBounds.set(null);
      }
    }
    // Bump the version so overlay computeds re-evaluate after DOM has settled.
    this._flowCacheVersion.update((v) => v + 1);
  }

  private handleFlowChildDragMove(
    dragged: CanvasElement,
    absoluteX: number,
    absoluteY: number,
    elements: CanvasElement[],
  ): void {
    const parent = this.element.findElementById(dragged.parentId ?? null, elements);
    if (!parent) return;

    const parentBounds =
      this.getLiveElementCanvasBounds(parent) ??
      this.element.getAbsoluteBounds(parent, elements, this.editorState.currentPage());
    const currentPreview = this.flowDragPlaceholder();
    const previewWidth =
      currentPreview?.elementId === dragged.id
        ? currentPreview.bounds.width
        : this.element.getRenderedWidth(dragged, elements, this.editorState.currentPage());
    const previewHeight =
      currentPreview?.elementId === dragged.id
        ? currentPreview.bounds.height
        : this.element.getRenderedHeight(dragged, elements, this.editorState.currentPage());
    this.flowDragPlaceholder.set({
      elementId: dragged.id,
      bounds: {
        x: roundToTwoDecimals(absoluteX),
        y: roundToTwoDecimals(absoluteY),
        width: roundToTwoDecimals(previewWidth),
        height: roundToTwoDecimals(previewHeight),
      },
    });

    const centerX = absoluteX + previewWidth / 2;
    const centerY = absoluteY + previewHeight / 2;
    const insideParent =
      centerX >= parentBounds.x &&
      centerX <= parentBounds.x + parentBounds.width &&
      centerY >= parentBounds.y &&
      centerY <= parentBounds.y + parentBounds.height;

    this.isFlowDragInsideContainer = insideParent;

    if (insideParent) {
      const dropIndex = this.computeLayoutDropIndex(parent, centerX, centerY, elements);
      this.layoutDropTarget.set({ containerId: parent.id, index: dropIndex });
    }

    this.snapLines.set([]);
  }

  private computeLayoutDropIndex(
    container: CanvasElement,
    absoluteX: number,
    absoluteY: number,
    elements: CanvasElement[],
  ): number {
    const isRow =
      container.display === 'flex' &&
      (!container.flexDirection ||
        container.flexDirection === 'row' ||
        container.flexDirection === 'row-reverse');

    const draggedId = this.draggingFlowChildId();
    const siblings = elements.filter(
      (el) => el.parentId === container.id && el.id !== draggedId && this.isChildInFlow(el),
    );

    for (let i = 0; i < siblings.length; i++) {
      const siblingBounds =
        this.getLiveElementCanvasBounds(siblings[i]) ??
        this.getFlowAwareBounds(siblings[i], elements);
      if (isRow) {
        if (absoluteX < siblingBounds.x + siblingBounds.width / 2) return i;
      } else {
        if (absoluteY < siblingBounds.y + siblingBounds.height / 2) return i;
      }
    }

    return siblings.length;
  }

  getFlowChildIndex(containerId: string, childId: string, elements: CanvasElement[]): number {
    const flowChildren = elements.filter(
      (el) => el.parentId === containerId && this.isChildInFlow(el),
    );
    const index = flowChildren.findIndex((el) => el.id === childId);
    return index < 0 ? flowChildren.length : index;
  }

  private commitFlowChildDrop(): void {
    const draggedId = this.draggingFlowChildId();
    if (!draggedId) return;

    const target = this.layoutDropTarget();
    if (target && this.isFlowDragInsideContainer) {
      this.commitFlowChildReorder(draggedId, target.containerId, target.index);
    } else {
      const dragged = this.element.findElementById(draggedId, this.editorState.elements());
      const parent = dragged
        ? this.element.findElementById(dragged.parentId ?? null, this.editorState.elements())
        : null;

      if (parent?.type === 'frame') {
        this.detachFlowChild(draggedId);
      } else {
        this.restoreFlowChildToContainer(draggedId);
      }
    }
  }

  private commitFlowChildReorder(draggedId: string, containerId: string, dropIndex: number): void {
    this.editorState.updateCurrentPageElements((els) => {
      const dragged = els.find((el) => el.id === draggedId);
      if (!dragged) return els;

      const container = this.element.findElementById(containerId, els);
      if (!container) return els;

      const flowSiblings = els.filter(
        (el) => el.parentId === containerId && el.id !== draggedId && this.isChildInFlow(el),
      );

      const rest = els.filter((el) => el.id !== draggedId);
      const updatedDragged = {
        ...dragged,
        parentId: container.id,
        x: 0,
        y: 0,
        position: this.element.getDefaultPositionForPlacement(dragged.type, container),
      };

      const insertBeforeId = dropIndex < flowSiblings.length ? flowSiblings[dropIndex].id : null;

      if (insertBeforeId) {
        const idx = rest.findIndex((el) => el.id === insertBeforeId);
        return [...rest.slice(0, idx), updatedDragged, ...rest.slice(idx)];
      }

      let lastChildIdx = -1;
      for (let i = rest.length - 1; i >= 0; i--) {
        if (rest[i].parentId === containerId) {
          lastChildIdx = i;
          break;
        }
      }
      if (lastChildIdx === -1) {
        const containerIdx = rest.findIndex((el) => el.id === containerId);
        return [
          ...rest.slice(0, containerIdx + 1),
          updatedDragged,
          ...rest.slice(containerIdx + 1),
        ];
      }
      return [...rest.slice(0, lastChildIdx + 1), updatedDragged, ...rest.slice(lastChildIdx + 1)];
    });
  }

  private detachFlowChild(draggedId: string): void {
    this.editorState.updateCurrentPageElements((els) => {
      const dragged = els.find((el) => el.id === draggedId);
      if (!dragged) return els;

      const preview = this.flowDragPlaceholder();
      const layout = this.page.activePageLayout();
      const absBounds =
        preview && preview.elementId === draggedId
          ? {
              x: roundToTwoDecimals(preview.bounds.x - (layout?.x ?? 0)),
              y: roundToTwoDecimals(preview.bounds.y - (layout?.y ?? 0)),
              width: preview.bounds.width,
              height: preview.bounds.height,
            }
          : this.element.getAbsoluteBounds(dragged, els, this.editorState.currentPage());
      return els.map((el) =>
        el.id === draggedId
          ? {
              ...el,
              parentId: null,
              x: roundToTwoDecimals(absBounds.x),
              y: roundToTwoDecimals(absBounds.y),
              width: roundToTwoDecimals(absBounds.width),
              height: roundToTwoDecimals(absBounds.height),
              position: this.element.getDefaultPositionForPlacement(el.type, null),
            }
          : el,
      );
    });
  }

  private restoreFlowChildToContainer(draggedId: string): void {
    this.editorState.updateCurrentPageElements((els) => {
      const dragged = els.find((el) => el.id === draggedId);
      if (!dragged) return els;

      const parent = this.element.findElementById(dragged.parentId ?? null, els);
      return els.map((el) =>
        el.id === draggedId
          ? {
              ...el,
              x: 0,
              y: 0,
              position: this.element.getDefaultPositionForPlacement(el.type, parent),
            }
          : el,
      );
    });
  }

  private alignRootFramesOnDrop(): void {
    this.editorState.updateCurrentPageElements((els) => this.reflowRootFrames(els));
  }

  // ── Live bounds ───────────────────────────────────────────

  private snapshotOverlaySceneBounds(el: CanvasElement): Bounds | null {
    const sceneEl = this.getCanvasElement()?.querySelector<HTMLElement>('.canvas-scene') ?? null;
    if (!sceneEl) return null;
    const domEl = sceneEl.querySelector<HTMLElement>(`[data-element-id="${el.id}"]`);
    if (!domEl) return null;
    const zoom = this.viewport.zoomLevel();
    const sceneRect = sceneEl.getBoundingClientRect();
    const rect = domEl.getBoundingClientRect();
    return {
      x: roundToTwoDecimals((rect.left - sceneRect.left) / zoom),
      y: roundToTwoDecimals((rect.top - sceneRect.top) / zoom),
      width: roundToTwoDecimals(rect.width / zoom),
      height: roundToTwoDecimals(rect.height / zoom),
    };
  }

  snapshotAllElementSceneBounds(): Map<string, Bounds> {
    const result = new Map<string, Bounds>();
    const sceneEl = this.getCanvasElement()?.querySelector<HTMLElement>('.canvas-scene') ?? null;
    if (!sceneEl) return result;

    const zoom = this.viewport.zoomLevel();
    if (zoom <= 0) return result;

    const sceneRect = sceneEl.getBoundingClientRect();
    const domEls = sceneEl.querySelectorAll<HTMLElement>('[data-element-id]');
    for (const domEl of domEls) {
      const id = domEl.getAttribute('data-element-id');
      if (!id) continue;
      const rect = domEl.getBoundingClientRect();
      result.set(id, {
        x: roundToTwoDecimals((rect.left - sceneRect.left) / zoom),
        y: roundToTwoDecimals((rect.top - sceneRect.top) / zoom),
        width: roundToTwoDecimals(rect.width / zoom),
        height: roundToTwoDecimals(rect.height / zoom),
      });
    }
    if (result.size > 0) {
      this._lastKnownSceneBounds = result;
    }
    return result;
  }

  getLastKnownSceneBounds(): Map<string, Bounds> {
    return this._lastKnownSceneBounds;
  }

  getLiveOverlaySceneBounds(el: CanvasElement): Bounds | null {
    void this._flowCacheVersion(); // track for overlay reactivity

    const sceneEl = this.getCanvasElement()?.querySelector<HTMLElement>('.canvas-scene') ?? null;
    if (sceneEl) {
      const domEl = sceneEl.querySelector<HTMLElement>(`[data-element-id="${el.id}"]`);
      if (domEl) {
        const zoom = this.viewport.zoomLevel();
        const sceneRect = sceneEl.getBoundingClientRect();
        const rect = domEl.getBoundingClientRect();
        return {
          x: roundToTwoDecimals((rect.left - sceneRect.left) / zoom),
          y: roundToTwoDecimals((rect.top - sceneRect.top) / zoom),
          width: roundToTwoDecimals(rect.width / zoom),
          height: roundToTwoDecimals(rect.height / zoom),
        };
      }
    }

    return null;
  }

  getCachedOverlaySceneBounds(el: CanvasElement): Bounds {
    void this._flowCacheVersion(); // track for overlay reactivity

    // Prefer stale DOM cache over model-based getAbsoluteBounds fallback — stale real DOM
    // coordinates are far more accurate than the model for flow/flex children (which store
    // x=0, y=0 and are actually positioned by CSS). This is safe because the cache is seeded
    // from real DOM on load and after every RAF update.
    const cached = this.flowBoundsCache.get(el.id);
    if (cached) return cached;

    return this.getModelBasedOverlaySceneBounds(el);
  }

  /**
   * Computes scene-space overlay bounds purely from the element model (no DOM, no cache).
   *
   * Use this for elements with CSS transforms (rotate / skew / scale / 3D) during resize:
   * the DOM AABB cache lags 1 RAF behind each model update, so using it causes the outline
   * to teleport once per frame. Model bounds are always synchronised with the model write.
   *
   * For pure rotation the element center equals the CSS transform-origin center (50%/50%),
   * so positioning the outline with these bounds + `transform: rotate(Ndeg)` is exact.
   */
  getModelBasedOverlaySceneBounds(el: CanvasElement): Bounds {
    const layout = this.page.activePageLayout();
    const absolute = this.element.getAbsoluteBounds(
      el,
      this.editorState.elements(),
      this.editorState.currentPage(),
    );
    return {
      x: roundToTwoDecimals(absolute.x + (layout?.x ?? 0)),
      y: roundToTwoDecimals(absolute.y + (layout?.y ?? 0)),
      width: absolute.width,
      height: absolute.height,
    };
  }

  getLiveElementCanvasBounds(el: CanvasElement): Bounds | null {
    const sceneBounds = this.getLiveOverlaySceneBounds(el);
    if (!sceneBounds) return null;

    const layout = this.page.activePageLayout();
    return {
      x: roundToTwoDecimals(sceneBounds.x - (layout?.x ?? 0)),
      y: roundToTwoDecimals(sceneBounds.y - (layout?.y ?? 0)),
      width: sceneBounds.width,
      height: sceneBounds.height,
    };
  }

  // ── Text editor screen coordinates ───────────────────────

  getTextEditorElement(): CanvasElement | null {
    const id = this.editorState.editingTextElementId();
    if (!id) return null;
    return this.element.findElementById(id, this.editorState.elements()) ?? null;
  }

  getTextEditorDisplayBounds(): Bounds | null {
    const el = this.getTextEditorElement();
    if (!el) return null;

    // Use bounds captured at beginTextEdit() time. The live DOM is not reliable here
    // because fit-content elements collapse to 0×0 once Angular removes their
    // .canvas-text-wrapper in the first editing-mode CD cycle.
    const bounds =
      this.textEditorCapturedBounds ??
      this.element.getAbsoluteBounds(el, this.editorState.elements());
    const draft = this.editingTextDraft();
    if (!draft || draft === (el.text ?? '')) {
      // For a brand-new empty fit-content element the DOM was collapsed when bounds were
      // captured (no text → near-zero size). Measure with a space to get at least one
      // line-height worth of dimensions so the editor overlay doesn't appear as a tiny box.
      if (!draft && this.canAutoSizeTextAxis(el, 'width')) {
        const widthConstraint = this.canAutoSizeTextAxis(el, 'width') ? undefined : bounds.width;
        const size = this.measureTextSize({ ...el, text: ' ' }, widthConstraint);
        const nextBounds: Bounds = { ...bounds };
        const centerX = bounds.x + bounds.width / 2;
        nextBounds.x = roundToTwoDecimals(centerX - size.width / 2);
        nextBounds.width = size.width;
        nextBounds.height = size.height;
        return nextBounds;
      }
      return bounds;
    }

    const widthConstraint = this.canAutoSizeTextAxis(el, 'width') ? undefined : bounds.width;
    const size = this.measureTextSize({ ...el, text: draft }, widthConstraint);
    const nextBounds: Bounds = { ...bounds };

    if (this.canAutoSizeTextAxis(el, 'width')) {
      const centerX = bounds.x + bounds.width / 2;
      nextBounds.x = roundToTwoDecimals(centerX - size.width / 2);
      nextBounds.width = size.width;
    }

    if (this.canAutoSizeTextAxis(el, 'height')) {
      nextBounds.height = size.height;
    }

    return nextBounds;
  }

  getTextEditorScreenLeft(): number {
    const bounds = this.getTextEditorDisplayBounds();
    if (!bounds) return 0;
    const layout = this.page.activePageLayout();
    const offset = this.viewport.viewportOffset();
    return (layout!.x + bounds.x) * this.viewport.zoomLevel() + offset.x;
  }

  getTextEditorScreenTop(): number {
    const bounds = this.getTextEditorDisplayBounds();
    if (!bounds) return 0;
    const layout = this.page.activePageLayout();
    const offset = this.viewport.viewportOffset();
    return (layout!.y + bounds.y) * this.viewport.zoomLevel() + offset.y;
  }

  getTextEditorScreenWidth(): number {
    return this.getTextEditorDisplayBounds()?.width ?? 0;
  }

  getTextEditorScreenHeight(): number {
    return this.getTextEditorDisplayBounds()?.height ?? 0;
  }

  // ── Text editing ──────────────────────────────────────────

  beginTextEdit(elementId: string): void {
    const el = this.element.findElementById(elementId, this.editorState.elements());
    if (el?.type !== 'text') return;

    // Capture live bounds NOW — before editingTextElementId is set and Angular's CD
    // removes .canvas-text-wrapper, which causes fit-content elements to collapse to 0.
    // getLiveElementCanvasBounds reads getBoundingClientRect() while the element still
    // has its content; fall back to model-based getAbsoluteBounds for off-screen elements.
    this.textEditorCapturedBounds =
      this.getLiveElementCanvasBounds(el) ??
      this.element.getAbsoluteBounds(el, this.editorState.elements());

    this.editingTextDraft.set(el.text ?? '');
    this.editorState.editingTextElementId.set(elementId);
    this.focusInlineTextEditor(elementId);
  }

  private stopTextEditing(): void {
    this.editorState.editingTextElementId.set(null);
    this.editingTextDraft.set('');
    this.textEditorCapturedBounds = null;
  }

  commitActiveTextEdit(): void {
    const editingId = this.editorState.editingTextElementId();
    if (!editingId) return;
    this.finalizeTextEditing(editingId);
  }

  finalizeTextEditing(id: string | null): boolean {
    if (!id || this.editorState.editingTextElementId() !== id) return false;

    this.applyTextEditorDraft(id);
    this.history.commitTextEditHistory(() => this.editorState.createHistorySnapshot());
    const removed = this.discardEmptyTextElement(id);
    this.stopTextEditing();
    return removed;
  }

  applyTextEditorDraftFromInput(id: string, rawValue: string): void {
    this.history.beginTextEditHistory(() => this.editorState.createHistorySnapshot());
    this.editingTextDraft.set(this.normalizeInlineEditorValue(rawValue));
  }

  private normalizeInlineEditorValue(raw: string): string {
    const value = raw.replace(/\r\n/g, '\n');
    return value === '\n' ? '' : value;
  }

  private applyTextEditorDraft(id: string): void {
    const el = this.element.findElementById(id, this.editorState.elements());
    if (el?.type !== 'text') return;

    const value = this.editingTextDraft();
    if (value === (el.text ?? '')) return;

    this.editorState.updateCurrentPageElements((els) => {
      let effectivePatch: Partial<CanvasElement> = { text: value };
      const withText = els.map((currentEl) => {
        if (currentEl.id !== id) return currentEl;
        const updated = { ...currentEl, text: value };
        if (value) {
          const textLayoutPatch = this.buildAutoSizedTextPatch(currentEl, updated);
          if (textLayoutPatch) {
            effectivePatch = { text: value, ...textLayoutPatch };
            return { ...updated, ...textLayoutPatch };
          }
        }
        return updated;
      });
      const editedEl = withText.find((e) => e.id === id);
      if (editedEl?.primarySyncId) {
        return withText.map((e) => (e.id === id ? detachCanvasElementFromPrimarySync(e) : e));
      }
      return this.syncElementPatchToPrimary(id, effectivePatch, withText);
    });
  }

  private focusInlineTextEditor(_elementId: string): void {
    // Initialization (textContent + focus + caret) is handled by the component's
    // ngAfterViewChecked once Angular has rendered the @if block. Nothing to do here.
  }

  placeTextEditorCaretAtEnd(editor: HTMLElement): void {
    const selection = window.getSelection();
    if (!selection) return;

    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  readInlineTextEditorValue(editor: HTMLElement | null): string {
    if (!editor) return '';
    const value = (editor.innerText || editor.textContent || '').replace(/\r\n/g, '\n');
    return value === '\n' ? '' : value;
  }

  private discardEmptyTextElement(id: string | null): boolean {
    if (!id) return false;

    const el = this.element.findElementById(id, this.editorState.elements());
    if (el?.type !== 'text' || el.text?.trim()) return false;

    this.editorState.updateCurrentPageElements((els) => {
      const withoutEl = removeWithChildren(els, id);
      return this.removeSyncedCopiesForSourceSubtree(id, withoutEl, els);
    });

    if (this.editorState.selectedElementId() === id) {
      this.editorState.selectedElementId.set(null);
    }

    return true;
  }

  private canAutoSizeTextAxis(el: CanvasElement, axis: 'width' | 'height'): boolean {
    if (el.type !== 'text') return false;
    const mode = axis === 'width' ? (el.widthMode ?? 'fixed') : (el.heightMode ?? 'fixed');
    return mode === 'fit-content';
  }

  buildAutoSizedTextPatch(
    previousElement: CanvasElement,
    nextElement: CanvasElement,
  ): Partial<CanvasElement> | null {
    const previousRenderedWidth = this.element.getRenderedWidth(
      previousElement,
      this.editorState.elements(),
      this.editorState.currentPage(),
    );
    const paddingW = this.getElementPaddingAxis(previousElement, 'width');
    const paddingH = this.getElementPaddingAxis(previousElement, 'height');
    // Text measurement uses content-box; subtract padding from border-box for constraint.
    const widthConstraint = this.canAutoSizeTextAxis(previousElement, 'width')
      ? undefined
      : previousRenderedWidth - paddingW;
    const size = this.measureTextSize(nextElement, widthConstraint);
    const patch: Partial<CanvasElement> = {};

    if (this.canAutoSizeTextAxis(previousElement, 'width')) {
      const borderBoxWidth = size.width + paddingW;
      const centerX = previousElement.x + previousRenderedWidth / 2;
      patch.x = roundToTwoDecimals(centerX - borderBoxWidth / 2);
      patch.width = borderBoxWidth;
    }

    if (this.canAutoSizeTextAxis(previousElement, 'height')) {
      patch.height = size.height + paddingH;
    }

    return Object.keys(patch).length > 0 ? patch : null;
  }

  measureTextSize(el: CanvasElement, widthConstraint?: number): { width: number; height: number } {
    const mirror = document.createElement('div');
    mirror.style.cssText = [
      'position:fixed',
      'top:-9999px',
      'left:-9999px',
      'visibility:hidden',
      'box-sizing:content-box',
      'padding:0',
      'margin:0',
      widthConstraint == null ? 'white-space:pre' : 'white-space:pre-wrap',
      widthConstraint == null ? 'display:inline-block' : 'display:block',
      'overflow-wrap:break-word',
      `font-size:${getTextFontSize(el)}`,
      `font-family:${getTextFontFamily(el)}`,
      `font-weight:${getTextFontWeight(el)}`,
      `font-style:${getTextFontStyle(el)}`,
      `line-height:${getTextLineHeight(el)}`,
      `letter-spacing:${getTextLetterSpacing(el)}`,
    ].join(';');
    if (widthConstraint != null) {
      mirror.style.width = `${widthConstraint}px`;
    }
    const textForMeasure = (el.text || ' ').replace(/\n+$/, (m) => m + '\u200b');
    mirror.textContent = textForMeasure;
    document.body.appendChild(mirror);
    // Use getBoundingClientRect().width for subpixel-accurate measurement, then
    // Math.ceil so the stored pixel value is never smaller than the actual text width.
    // offsetWidth is an integer (rounded) which can be smaller than the true width,
    // causing the last character to wrap when the element is rendered at that size.
    const rawW = widthConstraint ?? Math.ceil(mirror.getBoundingClientRect().width);
    const rawH = Math.ceil(mirror.getBoundingClientRect().height);
    document.body.removeChild(mirror);
    return { width: Math.max(rawW, 24), height: Math.max(rawH, 4) };
  }

  getAutoSizedTextLayoutPatch(
    previousElement: CanvasElement,
    nextElement: CanvasElement,
    patch: Partial<CanvasElement>,
  ): Partial<CanvasElement> | null {
    if (!this.shouldAutoSizeTextFromPatch(previousElement, patch) || !nextElement.text) return null;
    return this.buildAutoSizedTextPatch(previousElement, nextElement);
  }

  shouldAutoSizeTextFromPatch(el: CanvasElement, patch: Partial<CanvasElement>): boolean {
    if (el.type !== 'text') return false;

    return (
      patch.text !== undefined ||
      patch.fontFamily !== undefined ||
      patch.fontWeight !== undefined ||
      patch.fontStyle !== undefined ||
      patch.widthMode !== undefined ||
      patch.heightMode !== undefined ||
      patch.fontSize !== undefined ||
      patch.fontSizeUnit !== undefined ||
      patch.lineHeight !== undefined ||
      patch.lineHeightUnit !== undefined ||
      patch.letterSpacing !== undefined ||
      patch.letterSpacingUnit !== undefined
    );
  }

  // ── Element creation & drop ───────────────────────────────

  createElementAtCanvasPoint(
    tool: CanvasElementType,
    pointer: Point,
    targetContainer?: CanvasElement | null,
    containerBounds?: Bounds | null,
  ): CanvasElement | null {
    const requiredSize = this.element.getDefaultElementDimensions(
      tool,
      this.viewport.frameTemplate(),
    );
    const preferredContainer =
      tool === 'frame' ||
      !targetContainer ||
      !this.canContainerFitSize(targetContainer, requiredSize)
        ? null
        : targetContainer;
    const resolvedContainer =
      tool === 'frame'
        ? null
        : (preferredContainer ?? this.resolveInsertionContainer(pointer, requiredSize));
    const resolvedContainerBounds = resolvedContainer
      ? (this.getLiveElementCanvasBounds(resolvedContainer) ??
        this.element.getAbsoluteBounds(
          resolvedContainer,
          this.editorState.elements(),
          this.editorState.currentPage(),
        ))
      : null;

    const result = this.element.createElementAtPoint(
      tool,
      pointer,
      this.editorState.elements(),
      resolvedContainer,
      resolvedContainerBounds,
      this.viewport.frameTemplate(),
    );

    const newElement = this.commitElementCreationResult(result);
    this.autoOpenFillPopupElementId.set(tool === 'image' && newElement ? newElement.id : null);
    return newElement;
  }

  commitElementCreationResult(result: {
    element: CanvasElement | null;
    error: string | null;
  }): CanvasElement | null {
    if (result.error) {
      this.page.apiError.set(result.error);
      return null;
    }

    if (!result.element) return null;

    const newElement = result.element;
    this.runWithHistory(() => {
      this.editorState.updateCurrentPageElements((els) => {
        const withNewElement = [...els, newElement];
        return this.syncPrimarySubtreeAcrossFrames(newElement.id, withNewElement);
      });
      this.editorState.selectedElementId.set(newElement.id);
      this.editorState.currentTool.set('select');
    });

    if (newElement.type === 'text') {
      // Flow-child text elements (position: 'relative' inside a layout container) are
      // positioned by the parent flex/grid — their stored x/y is irrelevant for rendering.
      // Defer beginTextEdit with setTimeout(0) so Angular completes its CD pass and updates
      // the DOM first; getLiveElementCanvasBounds can then read the actual flex position and
      // the inline editor overlay appears at the right place instead of the cursor position.
      const isFlowChild = newElement.position === 'relative' && !!newElement.parentId;
      if (isFlowChild) {
        setTimeout(() => {
          this.beginTextEdit(newElement.id);
        }, 0);
      } else {
        this.beginTextEdit(newElement.id);
      }
    }

    return newElement;
  }

  importSvgContent(svgContent: string, naturalWidth: number, naturalHeight: number): void {
    const elements = this.editorState.elements();
    const center = this.viewport.getViewportCenterCanvasPoint(this.getCanvasElement());
    const x = Math.round(center.x - naturalWidth / 2);
    const y = Math.round(center.y - naturalHeight / 2);
    const newElement: CanvasElement = {
      id: crypto.randomUUID(),
      type: 'svg',
      name: this.element.getNextElementName('svg', elements),
      x,
      y,
      width: naturalWidth,
      height: naturalHeight,
      visible: true,
      opacity: 1,
      svgContent,
      position: 'absolute',
      parentId: null,
    };
    this.commitElementCreationResult({ element: newElement, error: null });
  }

  importImageAsset(assetUrl: string, naturalWidth: number, naturalHeight: number): void {
    const elements = this.editorState.elements();
    const center = this.viewport.getViewportCenterCanvasPoint(this.getCanvasElement());
    const maxDim = 400;
    const scale = Math.min(1, maxDim / Math.max(naturalWidth, naturalHeight, 1));
    const width = Math.round(naturalWidth * scale);
    const height = Math.round(naturalHeight * scale);
    const x = Math.round(center.x - width / 2);
    const y = Math.round(center.y - height / 2);
    const newElement: CanvasElement = {
      id: crypto.randomUUID(),
      type: 'rectangle',
      name: this.element.getNextElementName('image', elements),
      x,
      y,
      width,
      height,
      visible: true,
      opacity: 1,
      fill: '#e0e0e0',
      fillMode: 'image',
      backgroundImage: assetUrl,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      objectFit: 'cover',
      strokeWidth: 1,
      strokeStyle: 'Solid',
      cornerRadius: 6,
      position: 'absolute',
      parentId: null,
    };
    this.commitElementCreationResult({ element: newElement, error: null });
  }

  private autoGroupOnDrop(): void {
    const id = this.editorState.selectedElementId();
    if (!id) return;

    const elements = this.editorState.elements();
    const el = this.element.findElementById(id, elements);
    if (!el || el.type === 'frame') return;

    const elementBounds = this.element.getAbsoluteBounds(
      el,
      elements,
      this.editorState.currentPage(),
    );
    const currentParent = el.parentId ? this.element.findElementById(el.parentId, elements) : null;

    if (currentParent) {
      const currentParentBounds = this.element.getAbsoluteBounds(
        currentParent,
        elements,
        this.editorState.currentPage(),
      );
      const isStillInsideCurrentParent = this.isBoundsInsideBoundsWithTolerance(
        elementBounds,
        currentParentBounds,
        CONTAINER_DROP_TOLERANCE,
      );

      if (isStillInsideCurrentParent) {
        this.editorState.updateCurrentPageElements((els) =>
          els.map((e) =>
            e.id === id
              ? {
                  ...e,
                  x: roundToTwoDecimals(
                    clamp(
                      elementBounds.x - currentParentBounds.x,
                      0,
                      this.element.getRenderedWidth(
                        currentParent,
                        els,
                        this.editorState.currentPage(),
                      ) - this.element.getRenderedWidth(e, els, this.editorState.currentPage()),
                    ),
                  ),
                  y: roundToTwoDecimals(
                    clamp(
                      elementBounds.y - currentParentBounds.y,
                      0,
                      this.element.getRenderedHeight(
                        currentParent,
                        els,
                        this.editorState.currentPage(),
                      ) - this.element.getRenderedHeight(e, els, this.editorState.currentPage()),
                    ),
                  ),
                }
              : e,
          ),
        );
        return;
      }
    }

    const target = this.resolveInsertionContainerForBounds(elementBounds, id);

    if (!target) {
      if (currentParent) {
        this.editorState.updateCurrentPageElements((els) =>
          els.map((e) =>
            e.id === id
              ? {
                  ...e,
                  parentId: null,
                  position: this.element.getDefaultPositionForPlacement(e.type, null),
                  x: roundToTwoDecimals(elementBounds.x),
                  y: roundToTwoDecimals(elementBounds.y),
                }
              : e,
          ),
        );
      }
      return;
    }

    if (target.id === el.parentId) return;

    const fb = this.element.getAbsoluteBounds(target, elements, this.editorState.currentPage());
    const isTargetLayout = this.isLayoutContainer(target);
    this.editorState.updateCurrentPageElements((els) =>
      els.map((e) =>
        e.id === id
          ? {
              ...e,
              parentId: target.id,
              position: this.element.getDefaultPositionForPlacement(e.type, target),
              x: isTargetLayout
                ? 0
                : clamp(
                    elementBounds.x - fb.x,
                    0,
                    this.element.getRenderedWidth(target, els, this.editorState.currentPage()) -
                      this.element.getRenderedWidth(e, els, this.editorState.currentPage()),
                  ),
              y: isTargetLayout
                ? 0
                : clamp(
                    elementBounds.y - fb.y,
                    0,
                    this.element.getRenderedHeight(target, els, this.editorState.currentPage()) -
                      this.element.getRenderedHeight(e, els, this.editorState.currentPage()),
                  ),
            }
          : e,
      ),
    );
  }

  // ── Helpers needed by component panel handlers (public) ───

  syncElementPatchToPrimary(
    elementId: string,
    patch: Partial<CanvasElement>,
    elements: CanvasElement[],
  ): CanvasElement[] {
    const primaryFrame = this.getPrimaryFrame(elements);
    if (primaryFrame?.id === elementId) {
      const withSyncedRootPatch = this.syncRootFramePatchFromPrimary(primaryFrame, patch, elements);
      return this.syncPrimarySubtreeAcrossFrames(elementId, withSyncedRootPatch);
    }

    return this.syncPrimarySubtreeAcrossFrames(elementId, elements);
  }

  applyLayoutTransitionsForContainers(
    previousElements: CanvasElement[],
    nextElements: CanvasElement[],
    containerIds: readonly string[],
  ): CanvasElement[] {
    let updatedElements = nextElements;
    const seenContainerIds = new Set<string>();

    for (const containerId of containerIds) {
      if (!containerId || seenContainerIds.has(containerId)) continue;
      seenContainerIds.add(containerId);
      updatedElements = this.applyLayoutTransitionForContainer(
        previousElements,
        updatedElements,
        containerId,
      );
    }

    return updatedElements;
  }

  private applyLayoutTransitionForContainer(
    previousElements: CanvasElement[],
    nextElements: CanvasElement[],
    containerId: string,
  ): CanvasElement[] {
    const previousContainer = previousElements.find((el) => el.id === containerId);
    const nextContainer = nextElements.find((el) => el.id === containerId);
    if (!previousContainer || !nextContainer) return nextElements;

    const hadLayout = this.isLayoutContainer(previousContainer);
    const hasLayout = this.isLayoutContainer(nextContainer);
    if (hadLayout === hasLayout) return nextElements;

    const previousContainerBounds = this.getFlowAwareBounds(previousContainer, previousElements);

    return nextElements.map((el) => {
      if (el.parentId !== containerId) return el;

      if (hasLayout) {
        return {
          ...el,
          x: 0,
          y: 0,
          position: this.element.getDefaultPositionForPlacement(el.type, nextContainer),
        };
      }

      const previousChild = previousElements.find((c) => c.id === el.id) ?? el;
      const childBounds = this.getFlowAwareBounds(previousChild, previousElements);
      const nextContainerWidth = this.element.getRenderedWidth(
        nextContainer,
        nextElements,
        this.editorState.currentPage(),
      );
      const nextContainerHeight = this.element.getRenderedHeight(
        nextContainer,
        nextElements,
        this.editorState.currentPage(),
      );
      const childWidth = this.element.getRenderedWidth(
        el,
        nextElements,
        this.editorState.currentPage(),
      );
      const childHeight = this.element.getRenderedHeight(
        el,
        nextElements,
        this.editorState.currentPage(),
      );

      return {
        ...el,
        x: roundToTwoDecimals(
          clamp(childBounds.x - previousContainerBounds.x, 0, nextContainerWidth - childWidth),
        ),
        y: roundToTwoDecimals(
          clamp(childBounds.y - previousContainerBounds.y, 0, nextContainerHeight - childHeight),
        ),
        position: this.element.getDefaultPositionForPlacement(el.type, nextContainer),
      };
    });
  }

  didContainerLayoutStateChange(
    previousElement: CanvasElement,
    nextElement: CanvasElement,
  ): boolean {
    return this.isLayoutContainer(previousElement) !== this.isLayoutContainer(nextElement);
  }

  normalizeDraggedElementAfterLayerMove(
    previousElements: CanvasElement[],
    nextElements: CanvasElement[],
    draggedId: string,
    previousBounds: Bounds,
  ): CanvasElement[] {
    const dragged = this.element.findElementById(draggedId, nextElements);
    if (!dragged) return nextElements;

    const nextParent = this.element.findElementById(dragged.parentId ?? null, nextElements);
    const nextPosition = this.element.getDefaultPositionForPlacement(dragged.type, nextParent);

    if (!nextParent) {
      return nextElements.map((el) =>
        el.id === draggedId
          ? {
              ...el,
              x: roundToTwoDecimals(previousBounds.x),
              y: roundToTwoDecimals(previousBounds.y),
              position: nextPosition,
            }
          : el,
      );
    }

    if (this.isLayoutContainer(nextParent)) {
      return nextElements.map((el) =>
        el.id === draggedId ? { ...el, x: 0, y: 0, position: nextPosition } : el,
      );
    }

    const previousParent =
      this.element.findElementById(nextParent.id, previousElements) ?? nextParent;
    const parentBounds =
      this.getLiveElementCanvasBounds(previousParent) ??
      this.getFlowAwareBounds(previousParent, previousElements);
    const nextParentWidth = this.element.getRenderedWidth(
      nextParent,
      nextElements,
      this.editorState.currentPage(),
    );
    const nextParentHeight = this.element.getRenderedHeight(
      nextParent,
      nextElements,
      this.editorState.currentPage(),
    );
    const draggedWidth = this.element.getRenderedWidth(
      dragged,
      nextElements,
      this.editorState.currentPage(),
    );
    const draggedHeight = this.element.getRenderedHeight(
      dragged,
      nextElements,
      this.editorState.currentPage(),
    );
    const maxX = Math.max(0, nextParentWidth - draggedWidth);
    const maxY = Math.max(0, nextParentHeight - draggedHeight);

    return nextElements.map((el) =>
      el.id === draggedId
        ? {
            ...el,
            x: roundToTwoDecimals(clamp(previousBounds.x - parentBounds.x, 0, maxX)),
            y: roundToTwoDecimals(clamp(previousBounds.y - parentBounds.y, 0, maxY)),
            position: nextPosition,
          }
        : el,
    );
  }

  // ── Layout predicates (public, used by component handlers) ──

  isRootFrame(el: CanvasElement | null | undefined): boolean {
    return !!el && el.type === 'frame' && !el.parentId;
  }

  isLayoutContainer(el: CanvasElement | null | undefined): boolean {
    return this.element.isLayoutContainerElement(el);
  }

  isChildInFlow(el: CanvasElement): boolean {
    const pos = el.position;
    return !pos || pos === 'static' || pos === 'relative' || pos === 'sticky';
  }

  // ── Selection helpers (public, used by clipboard/context menu) ──

  getSelectionRootIds(
    ids: string[] = this.editorState.selectedElementIds(),
    elements: CanvasElement[] = this.editorState.elements(),
  ): string[] {
    const selectedIdSet = new Set(ids);

    return ids.filter((id) => {
      let parentId = elements.find((el) => el.id === id)?.parentId ?? null;
      while (parentId) {
        if (selectedIdSet.has(parentId)) return false;
        parentId = elements.find((el) => el.id === parentId)?.parentId ?? null;
      }
      return true;
    });
  }

  // ── Property number gesture (panel interaction) ───────────

  beginPropertyNumberGesture(): void {
    if (this.isPropertyNumberGestureActive) return;
    this.isPropertyNumberGestureActive = true;
    this.beginGestureHistory();
  }

  commitPropertyNumberGesture(): void {
    if (!this.isPropertyNumberGestureActive) return;
    this.isPropertyNumberGestureActive = false;
    this.history.commitGestureHistory(() => this.editorState.createHistorySnapshot());
  }

  isInPropertyNumberGesture(): boolean {
    return this.isPropertyNumberGestureActive;
  }

  // ── History helpers ───────────────────────────────────────

  runWithHistory(action: () => void): void {
    this.history.runWithHistory(() => this.editorState.createHistorySnapshot(), action);
  }

  beginGestureHistory(): void {
    this.history.beginGestureHistory(() => this.editorState.createHistorySnapshot());
  }

  commitGestureHistory(): void {
    this.history.commitGestureHistory(() => this.editorState.createHistorySnapshot());
  }

  // ── Primary frame sync ────────────────────────────────────

  getPrimaryFrameFromElements(elements: CanvasElement[]): CanvasElement | null {
    return this.getPrimaryFrame(elements);
  }

  private getPrimaryFrame(elements: CanvasElement[]): CanvasElement | null {
    const rootFrames = this.element.getRootFrames(elements);
    return (
      rootFrames.find((el) => el.isPrimary) ??
      rootFrames.find((el) => el.name?.toLowerCase() === 'desktop') ??
      rootFrames[0] ??
      null
    );
  }

  setPrimaryFrame(elementId: string): void {
    this.runWithHistory(() => {
      this.editorState.updateCurrentPageElements((els) =>
        els.map((el) =>
          el.type === 'frame' && !el.parentId ? { ...el, isPrimary: el.id === elementId } : el,
        ),
      );
    });
  }

  private syncElementMoveToPrimary(
    movedElement: CanvasElement | null,
    elements: CanvasElement[],
  ): CanvasElement[] {
    if (!movedElement) return elements;
    return this.syncPrimarySubtreeAcrossFrames(movedElement.id, elements);
  }

  private syncPrimaryFrameResize(
    resizedFrame: CanvasElement,
    elements: CanvasElement[],
  ): CanvasElement[] {
    const primaryFrame = this.getPrimaryFrame(elements);
    if (!primaryFrame || resizedFrame.id !== primaryFrame.id) return elements;
    return this.syncPrimarySubtreeAcrossFrames(primaryFrame.id, elements);
  }

  syncPrimarySubtreeAcrossFrames(sourceRootId: string, elements: CanvasElement[]): CanvasElement[] {
    const primaryFrame = this.getPrimaryFrame(elements);
    if (!primaryFrame) return elements;

    if (sourceRootId !== primaryFrame.id) {
      const sourceRoot = elements.find((el) => el.id === sourceRootId);
      if (
        !sourceRoot ||
        sourceRoot.primarySyncId ||
        !this.isElementWithinPrimaryFrame(sourceRoot, elements, primaryFrame.id)
      ) {
        return elements;
      }
    }

    const otherRootFrames = this.element
      .getRootFrames(elements)
      .filter((el) => el.id !== primaryFrame.id);
    if (otherRootFrames.length === 0) return elements;

    // Root frames are breakpoint-specific containers. Syncing the primary frame's
    // own layout/style onto other root frames would wipe local breakpoint overrides
    // such as mobile flex-direction, gap, alignment, etc.
    let nextElements = elements;
    for (const frame of otherRootFrames) {
      const targetFrame = nextElements.find((el) => el.id === frame.id) ?? frame;
      nextElements = this.syncPrimarySubtreeToFrame(
        sourceRootId,
        primaryFrame,
        targetFrame,
        nextElements,
      );
    }

    return nextElements;
  }

  private syncRootFramePatchFromPrimary(
    primaryFrame: CanvasElement,
    patch: Partial<CanvasElement>,
    elements: CanvasElement[],
  ): CanvasElement[] {
    const syncedPatch = this.filterRootFramePatchForBreakpoints(patch);
    if (Object.keys(syncedPatch).length === 0) {
      return elements;
    }

    return elements.map((element) => {
      if (!this.isRootFrame(element) || element.id === primaryFrame.id) {
        return element;
      }

      const nextElement: CanvasElement = {
        ...element,
        ...syncedPatch,
        parentId: null,
        isPrimary: false,
        primarySyncId: undefined,
        detachedPrimarySyncId: undefined,
      };

      mutateNormalizeElement(nextElement, elements);
      return nextElement;
    });
  }

  private filterRootFramePatchForBreakpoints(
    patch: Partial<CanvasElement>,
  ): Partial<CanvasElement> {
    const entries = Object.entries(patch).filter(
      ([key]) => !ROOT_FRAME_BREAKPOINT_LOCAL_PATCH_KEYS.has(key as keyof CanvasElement),
    );

    return Object.fromEntries(entries) as Partial<CanvasElement>;
  }

  private syncPrimarySubtreeToFrame(
    sourceRootId: string,
    primaryFrame: CanvasElement,
    targetFrame: CanvasElement,
    elements: CanvasElement[],
  ): CanvasElement[] {
    const sourceRoot =
      sourceRootId === primaryFrame.id
        ? primaryFrame
        : (elements.find((el) => el.id === sourceRootId) ?? null);
    if (!sourceRoot) return elements;

    const sourceNodes = [
      ...this.getPrimarySourceAncestors(sourceRoot, elements, primaryFrame.id),
      ...this.getPrimarySourceSubtree(sourceRootId, primaryFrame, elements),
    ];
    if (sourceNodes.length === 0) return elements;

    let nextElements = [...elements];
    const syncedBySourceId = new Map<string, CanvasElement>();
    const syncedParentIds = new Map<string, string>();

    for (const sourceElement of sourceNodes) {
      if (!sourceElement.parentId) continue;

      const sourceParent = elements.find((el) => el.id === sourceElement.parentId) ?? null;
      if (!sourceParent) continue;

      const targetParent =
        sourceElement.parentId === primaryFrame.id
          ? targetFrame
          : (syncedBySourceId.get(sourceElement.parentId) ??
            this.findLinkedElementInRootFrame(
              sourceElement.parentId,
              targetFrame.id,
              nextElements,
            ));
      if (!targetParent) continue;

      syncedParentIds.set(sourceParent.id, targetParent.id);

      const directSyncedCopy = this.findDirectSyncedElementInRootFrame(
        sourceElement.id,
        targetFrame.id,
        nextElements,
      );
      const detachedOverride = this.findDetachedElementInFrameForSource(
        sourceElement,
        sourceParent,
        targetParent,
        targetFrame.id,
        nextElements,
      );

      if (detachedOverride && detachedOverride.id !== directSyncedCopy?.id) {
        nextElements = this.removeSyncedCopiesForSourceInRootFrame(
          sourceElement.id,
          targetFrame.id,
          nextElements,
        );
        syncedBySourceId.set(sourceElement.id, detachedOverride);
        continue;
      }

      nextElements = this.removeSyncedCopiesForSourceInRootFrame(
        sourceElement.id,
        targetFrame.id,
        nextElements,
        directSyncedCopy ? new Set([directSyncedCopy.id]) : undefined,
      );
      const existingCopy = directSyncedCopy
        ? (nextElements.find((el) => el.id === directSyncedCopy.id) ?? directSyncedCopy)
        : null;
      const syncedElement = this.buildSyncedElementFromSource(
        sourceElement,
        sourceParent,
        targetParent,
        nextElements,
        existingCopy,
      );

      nextElements = this.upsertElement(nextElements, syncedElement);
      syncedBySourceId.set(sourceElement.id, syncedElement);
    }

    for (const [sourceParentId, targetParentId] of syncedParentIds) {
      nextElements = this.syncFlowChildOrderAcrossFrames(
        sourceParentId,
        targetParentId,
        elements,
        nextElements,
      );
    }

    return nextElements;
  }

  private buildSyncedElementFromSource(
    sourceElement: CanvasElement,
    sourceParent: CanvasElement,
    targetParent: CanvasElement,
    elements: CanvasElement[],
    existingCopy: CanvasElement | null,
  ): CanvasElement {
    const sourceParentWidth = this.element.getRenderedWidth(
      sourceParent,
      elements,
      this.editorState.currentPage(),
    );
    const sourceParentHeight = this.element.getRenderedHeight(
      sourceParent,
      elements,
      this.editorState.currentPage(),
    );
    const targetParentWidth = this.element.getRenderedWidth(
      targetParent,
      elements,
      this.editorState.currentPage(),
    );
    const targetParentHeight = this.element.getRenderedHeight(
      targetParent,
      elements,
      this.editorState.currentPage(),
    );
    const scaleX = sourceParentWidth > 0 ? targetParentWidth / sourceParentWidth : 1;
    const scaleY = sourceParentHeight > 0 ? targetParentHeight / sourceParentHeight : 1;
    const shouldScalePosition =
      !this.isLayoutContainer(targetParent) || !this.isChildInFlow(sourceElement);
    const syncedSize = this.getSyncedElementSize(sourceElement, scaleX, scaleY);
    const syncedElement: CanvasElement = {
      ...sourceElement,
      id: existingCopy?.id ?? crypto.randomUUID(),
      parentId: targetParent.id,
      primarySyncId: sourceElement.id,
      detachedPrimarySyncId: undefined,
      isPrimary: false,
      x: shouldScalePosition ? roundToTwoDecimals(sourceElement.x * scaleX) : 0,
      y: shouldScalePosition ? roundToTwoDecimals(sourceElement.y * scaleY) : 0,
      width: syncedSize.width,
      height: syncedSize.height,
    };

    mutateNormalizeElement(syncedElement, elements);
    return syncedElement;
  }

  private getSyncedElementSize(
    sourceElement: CanvasElement,
    scaleX: number,
    scaleY: number,
  ): { width: number; height: number } {
    let width = this.getSyncedAxisSize(sourceElement.width, sourceElement.widthMode, scaleX);
    let height = this.getSyncedAxisSize(sourceElement.height, sourceElement.heightMode, scaleY);
    const sourceAspectRatio =
      sourceElement.width > 0 && sourceElement.height > 0
        ? sourceElement.width / sourceElement.height
        : null;

    if (sourceAspectRatio && sourceAspectRatio > 0) {
      if (sourceElement.widthMode === 'fit-image') {
        width = roundToTwoDecimals(height * sourceAspectRatio);
      }

      if (sourceElement.heightMode === 'fit-image') {
        height = roundToTwoDecimals(width / sourceAspectRatio);
      }
    }

    return { width: Math.max(1, width), height: Math.max(1, height) };
  }

  private getSyncedAxisSize(
    value: number,
    mode: CanvasElement['widthMode'] | CanvasElement['heightMode'] | undefined,
    scale: number,
  ): number {
    if ((mode ?? 'fixed') === 'fixed') return roundToTwoDecimals(value);
    return roundToTwoDecimals(value * scale);
  }

  private getPrimarySourceSubtree(
    sourceRootId: string,
    primaryFrame: CanvasElement,
    elements: CanvasElement[],
  ): CanvasElement[] {
    const subtreeIds =
      sourceRootId === primaryFrame.id ? null : new Set(collectSubtreeIds(elements, sourceRootId));
    const sourceElements =
      sourceRootId === primaryFrame.id
        ? elements.filter(
            (el) =>
              !el.primarySyncId && this.isElementWithinPrimaryFrame(el, elements, primaryFrame.id),
          )
        : elements.filter((el) => !el.primarySyncId && !!subtreeIds?.has(el.id));

    return sourceElements.sort(
      (l, r) => this.getElementNestingDepth(l, elements) - this.getElementNestingDepth(r, elements),
    );
  }

  private getPrimarySourceAncestors(
    sourceElement: CanvasElement,
    elements: CanvasElement[],
    primaryFrameId: string,
  ): CanvasElement[] {
    const ancestors: CanvasElement[] = [];
    let parentId = sourceElement.parentId ?? null;

    while (parentId && parentId !== primaryFrameId) {
      const parent = elements.find((el) => el.id === parentId && !el.primarySyncId);
      if (!parent) break;

      ancestors.push(parent);
      parentId = parent.parentId ?? null;
    }

    return ancestors.reverse();
  }

  removeSyncedCopiesForSourceSubtree(
    sourceRootId: string,
    elements: CanvasElement[],
    sourceElements: CanvasElement[] = elements,
  ): CanvasElement[] {
    const sourceRoot = sourceElements.find((el) => el.id === sourceRootId);
    if (!sourceRoot || sourceRoot.primarySyncId) return elements;

    const sourceSubtreeIds = new Set(collectSubtreeIds(sourceElements, sourceRootId));
    return elements.filter(
      (el) =>
        (!el.primarySyncId || !sourceSubtreeIds.has(el.primarySyncId)) &&
        (!el.detachedPrimarySyncId || !sourceSubtreeIds.has(el.detachedPrimarySyncId)),
    );
  }

  breakSyncOnParentChange(
    elementId: string,
    prevParentId: string | null,
    elements: CanvasElement[],
  ): CanvasElement[] {
    if (!elementId) return elements;

    const current = elements.find((e) => e.id === elementId);
    if (!current) return elements;

    const currentParentId = current.parentId ?? null;
    if (currentParentId === prevParentId) return elements;

    const primaryFrame = this.getPrimaryFrame(elements);
    const currentSubtreeIds = new Set(collectSubtreeIds(elements, elementId));

    if (current.primarySyncId) {
      return elements.map((el) =>
        currentSubtreeIds.has(el.id) ? detachCanvasElementFromPrimarySync(el) : el,
      );
    }

    const wasInPrimaryScope =
      !!primaryFrame && this.isParentWithinPrimaryScope(prevParentId, elements, primaryFrame.id);
    const isInPrimaryScope =
      !!primaryFrame && this.isParentWithinPrimaryScope(currentParentId, elements, primaryFrame.id);

    if (wasInPrimaryScope && !isInPrimaryScope) {
      return elements.map((el) =>
        el.primarySyncId && currentSubtreeIds.has(el.primarySyncId)
          ? detachCanvasElementFromPrimarySync(el)
          : el,
      );
    }

    return elements;
  }

  private isParentWithinPrimaryScope(
    parentId: string | null,
    elements: CanvasElement[],
    primaryFrameId: string,
  ): boolean {
    if (!parentId) return false;
    if (parentId === primaryFrameId) return true;

    const parent = this.element.findElementById(parentId, elements);
    return !!parent && this.isElementWithinPrimaryFrame(parent, elements, primaryFrameId);
  }

  private isElementWithinPrimaryFrame(
    el: CanvasElement,
    elements: CanvasElement[],
    primaryFrameId: string,
  ): boolean {
    let parentId = el.parentId ?? null;

    while (parentId) {
      if (parentId === primaryFrameId) return true;
      parentId = this.element.findElementById(parentId, elements)?.parentId ?? null;
    }

    return false;
  }

  private findDirectSyncedElementInRootFrame(
    sourceId: string,
    rootFrameId: string,
    elements: CanvasElement[],
  ): CanvasElement | null {
    return (
      elements.find(
        (el) => el.primarySyncId === sourceId && this.findRootFrameId(el, elements) === rootFrameId,
      ) ?? null
    );
  }

  private findLinkedElementInRootFrame(
    sourceId: string,
    rootFrameId: string,
    elements: CanvasElement[],
  ): CanvasElement | null {
    return (
      this.findDirectSyncedElementInRootFrame(sourceId, rootFrameId, elements) ??
      this.findDetachedLinkedElementInRootFrame(sourceId, rootFrameId, elements)
    );
  }

  private findDetachedLinkedElementInRootFrame(
    sourceId: string,
    rootFrameId: string,
    elements: CanvasElement[],
  ): CanvasElement | null {
    return (
      elements.find(
        (el) =>
          el.detachedPrimarySyncId === sourceId && this.findRootFrameId(el, elements) === rootFrameId,
      ) ?? null
    );
  }

  private findDetachedElementInFrameForSource(
    sourceElement: CanvasElement,
    sourceParent: CanvasElement,
    targetParent: CanvasElement,
    rootFrameId: string,
    elements: CanvasElement[],
  ): CanvasElement | null {
    const linked = this.findDetachedLinkedElementInRootFrame(sourceElement.id, rootFrameId, elements);
    if (linked) {
      return linked;
    }

    const sourceSiblings = elements.filter((el) => el.parentId === sourceParent.id && !el.primarySyncId);
    const siblingIndex = sourceSiblings.findIndex((el) => el.id === sourceElement.id);
    if (siblingIndex < 0) {
      return null;
    }

    const targetSiblings = elements.filter((el) => el.parentId === targetParent.id);
    const candidate = targetSiblings[siblingIndex] ?? null;
    if (!candidate || candidate.type !== sourceElement.type || candidate.primarySyncId) {
      return null;
    }

    return isDetachedCanvasBreakpointOverride(candidate) || !candidate.detachedPrimarySyncId
      ? candidate
      : null;
  }

  private removeSyncedCopiesForSourceInRootFrame(
    sourceId: string,
    rootFrameId: string,
    elements: CanvasElement[],
    keepIds: ReadonlySet<string> = new Set<string>(),
  ): CanvasElement[] {
    const duplicateRootIds = elements
      .filter(
        (el) =>
          el.primarySyncId === sourceId &&
          !keepIds.has(el.id) &&
          this.findRootFrameId(el, elements) === rootFrameId,
      )
      .map((el) => el.id);

    if (duplicateRootIds.length === 0) {
      return elements;
    }

    const idsToRemove = new Set<string>();
    for (const duplicateRootId of duplicateRootIds) {
      for (const subtreeId of collectSubtreeIds(elements, duplicateRootId)) {
        idsToRemove.add(subtreeId);
      }
    }

    return elements.filter((el) => !idsToRemove.has(el.id));
  }

  private findRootFrameId(el: CanvasElement, elements: CanvasElement[]): string | null {
    let current: CanvasElement | null = el;

    while (current) {
      if (this.isRootFrame(current)) return current.id;
      current = current.parentId ? this.element.findElementById(current.parentId, elements) : null;
    }

    return null;
  }

  private upsertElement(elements: CanvasElement[], nextElement: CanvasElement): CanvasElement[] {
    const index = elements.findIndex((el) => el.id === nextElement.id);
    if (index === -1) return [...elements, nextElement];

    const nextElements = [...elements];
    nextElements[index] = nextElement;
    return nextElements;
  }

  private syncFlowChildOrderAcrossFrames(
    sourceParentId: string,
    targetParentId: string,
    sourceElements: CanvasElement[],
    targetElements: CanvasElement[],
  ): CanvasElement[] {
    const sourceParent = this.element.findElementById(sourceParentId, sourceElements);
    const targetParent = this.element.findElementById(targetParentId, targetElements);
    if (!sourceParent || !targetParent || !this.isLayoutContainer(sourceParent)) {
      return targetElements;
    }

    const sourceFlowChildren = sourceElements.filter(
      (el) => el.parentId === sourceParentId && !el.primarySyncId && this.isChildInFlow(el),
    );
    if (sourceFlowChildren.length <= 1) return targetElements;

    const sourceOrder = new Map(sourceFlowChildren.map((el, index) => [el.id, index] as const));
    const targetIndices: number[] = [];
    const targetFlowChildren: CanvasElement[] = [];

    targetElements.forEach((el, index) => {
      if (
        el.parentId === targetParentId &&
        !!el.primarySyncId &&
        sourceOrder.has(el.primarySyncId) &&
        this.isChildInFlow(el)
      ) {
        targetIndices.push(index);
        targetFlowChildren.push(el);
      }
    });

    if (targetFlowChildren.length <= 1) return targetElements;

    const sortedChildren = [...targetFlowChildren].sort(
      (l, r) =>
        (sourceOrder.get(l.primarySyncId ?? '') ?? Number.MAX_SAFE_INTEGER) -
        (sourceOrder.get(r.primarySyncId ?? '') ?? Number.MAX_SAFE_INTEGER),
    );

    const changed = sortedChildren.some((el, index) => el.id !== targetFlowChildren[index].id);
    if (!changed) return targetElements;

    const nextElements = [...targetElements];
    targetIndices.forEach((elementIndex, index) => {
      nextElements[elementIndex] = sortedChildren[index];
    });

    return nextElements;
  }

  // ── Private helpers ───────────────────────────────────────

  getActivePageCanvasPoint(event: MouseEvent): Point | null {
    const canvas = this.getCanvasElement();
    const offset = this.page.activePageLayout();
    if (!offset) return null;

    const point = this.viewport.getCanvasPoint(event, canvas);
    if (!point) return null;

    return {
      x: point.x - offset.x,
      y: point.y - offset.y,
    };
  }

  private resolveDraggedElementPatch(
    el: CanvasElement,
    elements: CanvasElement[],
    nextAbsoluteX: number,
    nextAbsoluteY: number,
    preserveParentDuringDrag = false,
  ): Partial<CanvasElement> {
    const parent = this.element.findElementById(el.parentId ?? null, elements);
    if (!parent) {
      return {
        x: roundToTwoDecimals(nextAbsoluteX),
        y: roundToTwoDecimals(nextAbsoluteY),
      };
    }

    // Prefer live DOM bounds for parent — model getAbsoluteBounds is wrong when any ancestor
    // is a flow child (model x=0,y=0, CSS-positioned). Live bounds are always accurate.
    const parentBounds =
      this.getLiveElementCanvasBounds(parent) ??
      this.element.getAbsoluteBounds(parent, elements, this.editorState.currentPage());
    const elementRenderedWidth = this.element.getRenderedWidth(
      el,
      elements,
      this.editorState.currentPage(),
    );
    const elementRenderedHeight = this.element.getRenderedHeight(
      el,
      elements,
      this.editorState.currentPage(),
    );
    const parentRenderedWidth = this.element.getRenderedWidth(
      parent,
      elements,
      this.editorState.currentPage(),
    );
    const parentRenderedHeight = this.element.getRenderedHeight(
      parent,
      elements,
      this.editorState.currentPage(),
    );
    const nextBounds: Bounds = {
      x: nextAbsoluteX,
      y: nextAbsoluteY,
      width: elementRenderedWidth,
      height: elementRenderedHeight,
    };

    if (
      preserveParentDuringDrag &&
      this.element.isContainerElement(parent) &&
      !this.isLayoutContainer(parent) &&
      el.position === 'absolute'
    ) {
      return {
        x: roundToTwoDecimals(nextAbsoluteX - parentBounds.x),
        y: roundToTwoDecimals(nextAbsoluteY - parentBounds.y),
      };
    }

    if (
      this.element.isContainerElement(parent) &&
      !this.isLayoutContainer(parent) &&
      !this.isBoundsFullyInsideBounds(nextBounds, parentBounds)
    ) {
      return {
        parentId: null,
        position: this.element.getDefaultPositionForPlacement(el.type, null),
        x: roundToTwoDecimals(nextAbsoluteX),
        y: roundToTwoDecimals(nextAbsoluteY),
      };
    }

    return {
      x: clamp(nextAbsoluteX - parentBounds.x, 0, parentRenderedWidth - elementRenderedWidth),
      y: clamp(nextAbsoluteY - parentBounds.y, 0, parentRenderedHeight - elementRenderedHeight),
    };
  }

  private setFlowDragPlaceholder(el: CanvasElement, cachedBounds: Bounds | null): void {
    const layout = this.page.activePageLayout();
    if (cachedBounds) {
      // cachedBounds / liveSceneBounds are scene-relative (include layout.x/y);
      // floatingBounds must be page-relative so the template can add pgLayout.x/y correctly.
      this.flowDragPlaceholder.set({
        elementId: el.id,
        bounds: {
          x: cachedBounds.x - (layout?.x ?? 0),
          y: cachedBounds.y - (layout?.y ?? 0),
          width: cachedBounds.width,
          height: cachedBounds.height,
        },
      });
      return;
    }

    const absoluteBounds = this.element.getAbsoluteBounds(
      el,
      this.editorState.elements(),
      this.editorState.currentPage(),
    );
    this.flowDragPlaceholder.set({
      elementId: el.id,
      bounds: {
        x: absoluteBounds.x,
        y: absoluteBounds.y,
        width: absoluteBounds.width,
        height: absoluteBounds.height,
      },
    });
  }

  private resolveInsertionContainer(
    pointer: Point,
    requiredSize?: { width: number; height: number },
  ): CanvasElement | null {
    const elements = this.editorState.elements();
    const hoveredContainers = elements.filter((el) => {
      if (
        !this.element.isContainerElement(el) ||
        !this.element.isElementEffectivelyVisible(el.id, elements)
      ) {
        return false;
      }

      // Use live (Yoga-computed) bounds so that flow children of layout containers
      // are hit-tested at their actual rendered position, not their stale stored x/y.
      const bounds =
        this.getLiveElementCanvasBounds(el) ??
        this.element.getAbsoluteBounds(el, elements, this.editorState.currentPage());
      return (
        pointer.x >= bounds.x &&
        pointer.x <= bounds.x + bounds.width &&
        pointer.y >= bounds.y &&
        pointer.y <= bounds.y + bounds.height &&
        this.canContainerFitSize(el, requiredSize)
      );
    });

    if (hoveredContainers.length > 0) {
      // Prefer the deepest container in the tree (most specific descendant).
      // This handles fill-sized children where area == parent area.
      return this.getDeepestSmallestContainer(hoveredContainers, elements);
    }

    const selectedContainer = this.element.getSelectedContainer(this.editorState.selectedElement());
    return selectedContainer && this.canContainerFitSize(selectedContainer, requiredSize)
      ? selectedContainer
      : null;
  }

  private getContainerDepth(el: CanvasElement, elements: CanvasElement[]): number {
    let depth = 0;
    let parentId = el.parentId;
    while (parentId) {
      depth++;
      parentId = elements.find((e) => e.id === parentId)?.parentId ?? null;
    }
    return depth;
  }

  private getDeepestSmallestContainer(
    containers: CanvasElement[],
    elements: CanvasElement[],
  ): CanvasElement | null {
    if (containers.length === 0) return null;
    return containers.reduce((best, candidate) => {
      const bestDepth = this.getContainerDepth(best, elements);
      const candidateDepth = this.getContainerDepth(candidate, elements);
      if (candidateDepth !== bestDepth) {
        return candidateDepth > bestDepth ? candidate : best;
      }
      const bestArea =
        this.element.getRenderedWidth(best, elements, this.editorState.currentPage()) *
        this.element.getRenderedHeight(best, elements, this.editorState.currentPage());
      const candidateArea =
        this.element.getRenderedWidth(candidate, elements, this.editorState.currentPage()) *
        this.element.getRenderedHeight(candidate, elements, this.editorState.currentPage());
      return candidateArea < bestArea ? candidate : best;
    });
  }

  resolveInsertionContainerForBounds(
    bounds: Bounds,
    excludedRootId?: string | null,
  ): CanvasElement | null {
    const elements = this.editorState.elements();
    const excludedIds = excludedRootId
      ? new Set(collectSubtreeIds(elements, excludedRootId))
      : null;
    const hoveredContainers = elements.filter((el) => {
      if (
        !this.element.isContainerElement(el) ||
        !this.element.isElementEffectivelyVisible(el.id, elements) ||
        excludedIds?.has(el.id)
      ) {
        return false;
      }

      const containerBounds = this.element.getAbsoluteBounds(
        el,
        elements,
        this.editorState.currentPage(),
      );
      return this.isBoundsFullyInsideBounds(bounds, containerBounds);
    });

    return this.getSmallestContainer(hoveredContainers);
  }

  resolveInsertionContext(
    pointer: Point,
    requiredSize?: { width: number; height: number },
  ): { container: CanvasElement | null; containerBounds: Bounds | null } {
    const container = this.resolveInsertionContainer(pointer, requiredSize);
    return {
      container,
      containerBounds: container
        ? this.element.getAbsoluteBounds(
            container,
            this.editorState.elements(),
            this.editorState.currentPage(),
          )
        : null,
    };
  }

  private getSmallestContainer(containers: CanvasElement[]): CanvasElement | null {
    if (containers.length === 0) return null;

    return containers.reduce((best, candidate) => {
      const bestArea =
        this.element.getRenderedWidth(
          best,
          this.editorState.elements(),
          this.editorState.currentPage(),
        ) *
        this.element.getRenderedHeight(
          best,
          this.editorState.elements(),
          this.editorState.currentPage(),
        );
      const candidateArea =
        this.element.getRenderedWidth(
          candidate,
          this.editorState.elements(),
          this.editorState.currentPage(),
        ) *
        this.element.getRenderedHeight(
          candidate,
          this.editorState.elements(),
          this.editorState.currentPage(),
        );
      return candidateArea < bestArea ? candidate : best;
    });
  }

  private canContainerFitSize(
    container: CanvasElement,
    requiredSize?: { width: number; height: number },
  ): boolean {
    if (!requiredSize) return true;

    return (
      this.element.getRenderedWidth(
        container,
        this.editorState.elements(),
        this.editorState.currentPage(),
      ) >= requiredSize.width &&
      this.element.getRenderedHeight(
        container,
        this.editorState.elements(),
        this.editorState.currentPage(),
      ) >= requiredSize.height
    );
  }

  private canUseGroupDrag(ids: string[], elements: CanvasElement[]): boolean {
    if (ids.length <= 1) return false;

    return ids.every((id) => {
      const el = this.element.findElementById(id, elements);
      if (!el) return false;

      const parent = this.element.findElementById(el.parentId ?? null, elements);
      return !(parent && this.isLayoutContainer(parent) && this.isChildInFlow(el));
    });
  }

  private getFlowAwareBounds(el: CanvasElement, elements: CanvasElement[]): Bounds {
    const cached = this.flowBoundsDirty ? undefined : this.flowBoundsCache.get(el.id);
    if (cached) {
      const layout = this.page.activePageLayout();
      return {
        x: roundToTwoDecimals(cached.x - (layout?.x ?? 0)),
        y: roundToTwoDecimals(cached.y - (layout?.y ?? 0)),
        width: cached.width,
        height: cached.height,
      };
    }

    return this.element.getAbsoluteBounds(el, elements, this.editorState.currentPage());
  }

  getDragSelectionCount(): number {
    return this.dragSelectionIds.length;
  }

  getRootFrameCount(elements: CanvasElement[]): number {
    return this.element.getRootFrames(elements).length;
  }

  compactRootFrames(elements: CanvasElement[]): CanvasElement[] {
    return this.reflowRootFrames(elements);
  }

  private reflowRootFrames(
    elements: CanvasElement[],
    draggedId?: string,
    draggedX?: number,
  ): CanvasElement[] {
    const rootFrames = this.element.getRootFrames(elements);
    if (rootFrames.length <= 1) return elements;

    const ordered = [...rootFrames].sort((a, b) => {
      const ax = a.id === draggedId && typeof draggedX === 'number' ? draggedX : a.x;
      const bx = b.id === draggedId && typeof draggedX === 'number' ? draggedX : b.x;
      return ax - bx;
    });

    const startX = Math.min(...rootFrames.map((f) => f.x));
    const baselineY = rootFrames[0]?.y ?? 0;
    let cursorX = startX;
    const nextById = new Map<string, { x: number; y: number }>();

    for (const frame of ordered) {
      nextById.set(frame.id, {
        x: roundToTwoDecimals(cursorX),
        y: roundToTwoDecimals(baselineY),
      });
      cursorX +=
        this.element.getRenderedWidth(frame, elements, this.editorState.currentPage()) +
        ROOT_FRAME_INSERT_GAP;
    }

    return elements.map((el) => {
      const next = nextById.get(el.id);
      if (!next) return el;
      return { ...el, x: next.x, y: next.y };
    });
  }

  private getElementNestingDepth(el: CanvasElement, elements: CanvasElement[]): number {
    let depth = 0;
    let currentParentId = el.parentId ?? null;

    while (currentParentId) {
      const parent = this.element.findElementById(currentParentId, elements);
      if (!parent) break;
      depth += 1;
      currentParentId = parent.parentId ?? null;
    }

    return depth;
  }

  private getStoredAxisSizeFromRendered(
    el: CanvasElement,
    axis: 'width' | 'height',
    renderedSize: number,
  ): number {
    // element.width stores border-box (same as rendered size); no padding subtraction needed.
    // Round to integer — sub-pixel width/height has no practical value in a design tool.
    return Math.max(24, Math.round(renderedSize));
  }

  private getElementPaddingAxis(el: CanvasElement, axis: 'width' | 'height'): number {
    const p = el.padding;
    if (!p) return 0;
    return axis === 'width' ? (p.left ?? 0) + (p.right ?? 0) : (p.top ?? 0) + (p.bottom ?? 0);
  }

  private isBoundsFullyInsideBounds(inner: Bounds, outer: Bounds): boolean {
    return (
      inner.x >= outer.x &&
      inner.y >= outer.y &&
      inner.x + inner.width <= outer.x + outer.width &&
      inner.y + inner.height <= outer.y + outer.height
    );
  }

  private isBoundsInsideBoundsWithTolerance(
    inner: Bounds,
    outer: Bounds,
    tolerance: number,
  ): boolean {
    return (
      inner.x >= outer.x - tolerance &&
      inner.y >= outer.y - tolerance &&
      inner.x + inner.width <= outer.x + outer.width + tolerance &&
      inner.y + inner.height <= outer.y + outer.height + tolerance
    );
  }
}
