import { Injectable, computed, inject } from '@angular/core';
import { CanvasElement, CanvasPageModel } from '@app/core';
import { roundToTwoDecimals } from '../utils/canvas-math.util';
import type { CanvasPageLayout } from '../canvas.types';
import { CanvasEditorStateService } from './canvas-editor-state.service';
import { CanvasElementService } from './canvas-element.service';
import { CanvasViewportService } from './canvas-viewport.service';

const PAGE_SHELL_SIDE_PADDING = 28;
const PAGE_SHELL_BOTTOM_PADDING = 28;
const PAGE_SHELL_HEADER_HEIGHT = 44;
const PAGE_SHELL_HEADER_INSET = 25;
const PAGE_FRAME_TITLE_OFFSET = 24;
export const FRAME_TITLE_ZOOM_THRESHOLD = 0.3;

@Injectable()
export class CanvasPageRenderContextService {
  private readonly editorState = inject(CanvasEditorStateService);
  private readonly el = inject(CanvasElementService);
  private readonly viewport = inject(CanvasViewportService);

  // Page shell geometry

  getPageShellLeft(pageId: string, layouts: CanvasPageLayout[]): number {
    const layout = layouts.find((l) => l.pageId === pageId) ?? null;
    if (!layout) {
      return 0;
    }

    const bounds = this.getPageContentBounds(pageId, layout.width, layout.height);
    return roundToTwoDecimals(layout.x + bounds.minX - PAGE_SHELL_SIDE_PADDING);
  }

  getPageShellTop(pageId: string, layouts: CanvasPageLayout[]): number {
    const layout = layouts.find((l) => l.pageId === pageId) ?? null;
    if (!layout) {
      return 0;
    }

    const bounds = this.getPageContentBounds(pageId, layout.width, layout.height);
    return roundToTwoDecimals(layout.y + bounds.minY - this.getPageShellTopPadding());
  }

  getPageShellWidth(pageId: string, layouts: CanvasPageLayout[]): number {
    const layout = layouts.find((l) => l.pageId === pageId) ?? null;
    if (!layout) {
      return 0;
    }

    const bounds = this.getPageContentBounds(pageId, layout.width, layout.height);
    return roundToTwoDecimals(bounds.maxX - bounds.minX + PAGE_SHELL_SIDE_PADDING * 2);
  }

  getPageShellRight(pageId: string, layouts: CanvasPageLayout[]): number {
    return roundToTwoDecimals(
      this.getPageShellLeft(pageId, layouts) + this.getPageShellWidth(pageId, layouts),
    );
  }

  getPageShellHeight(pageId: string, layouts: CanvasPageLayout[]): number {
    const layout = layouts.find((l) => l.pageId === pageId) ?? null;
    if (!layout) {
      return 0;
    }

    const bounds = this.getPageContentBounds(pageId, layout.width, layout.height);
    return roundToTwoDecimals(
      bounds.maxY - bounds.minY + this.getPageShellTopPadding() + PAGE_SHELL_BOTTOM_PADDING,
    );
  }

  getPageShellHeaderScreenLeft(pageId: string, layouts: CanvasPageLayout[]): number {
    const inset = PAGE_SHELL_HEADER_INSET * this.viewport.zoomLevel();
    return roundToTwoDecimals(
      this.getPageShellLeft(pageId, layouts) * this.viewport.zoomLevel() + inset,
    );
  }

  getPageShellHeaderScreenTop(pageId: string, layouts: CanvasPageLayout[]): number {
    const shellScreenTop = this.getPageShellTop(pageId, layouts) * this.viewport.zoomLevel();
    const gap = this.viewport.zoomLevel() >= FRAME_TITLE_ZOOM_THRESHOLD ? -10 : -25;
    return roundToTwoDecimals(shellScreenTop - PAGE_SHELL_HEADER_HEIGHT - gap);
  }

  getPageShellHeaderScreenWidth(pageId: string, layouts: CanvasPageLayout[]): number {
    const inset = PAGE_SHELL_HEADER_INSET * this.viewport.zoomLevel();
    return roundToTwoDecimals(
      this.getPageShellWidth(pageId, layouts) * this.viewport.zoomLevel() - inset * 2,
    );
  }

  getPageShellSelectionLeft(pageId: string, layouts: CanvasPageLayout[]): number {
    return roundToTwoDecimals(this.getPageShellLeft(pageId, layouts) * this.viewport.zoomLevel());
  }

  getPageShellSelectionTop(pageId: string, layouts: CanvasPageLayout[]): number {
    return roundToTwoDecimals(this.getPageShellTop(pageId, layouts) * this.viewport.zoomLevel());
  }

  getPageShellSelectionWidth(pageId: string, layouts: CanvasPageLayout[]): number {
    return roundToTwoDecimals(this.getPageShellWidth(pageId, layouts) * this.viewport.zoomLevel());
  }

  getDefaultPageCanvasXAfterShellRight(shellRight: number, gap: number): number {
    return roundToTwoDecimals(shellRight + gap - PAGE_SHELL_SIDE_PADDING);
  }

  getPageShellSelectionHeight(pageId: string, layouts: CanvasPageLayout[]): number {
    return roundToTwoDecimals(this.getPageShellHeight(pageId, layouts) * this.viewport.zoomLevel());
  }


  getRenderedXForPage(element: CanvasElement, pageId: string, layouts: CanvasPageLayout[]): number {
    const page = this.getPageById(pageId);
    const layout = layouts.find((l) => l.pageId === pageId) ?? null;
    if (!page || !layout) {
      return 0;
    }

    return layout.x + this.el.getAbsoluteBounds(element, page.elements, page).x;
  }

  getRenderedYForPage(element: CanvasElement, pageId: string, layouts: CanvasPageLayout[]): number {
    const page = this.getPageById(pageId);
    const layout = layouts.find((l) => l.pageId === pageId) ?? null;
    if (!page || !layout) {
      return 0;
    }

    return layout.y + this.el.getAbsoluteBounds(element, page.elements, page).y;
  }

  getRenderedWidthForPage(element: CanvasElement, pageId: string): number {
    const page = this.getPageById(pageId);
    if (!page) {
      return element.width;
    }

    return this.el.getRenderedWidth(element, page.elements, page);
  }

  getRenderedHeightForPage(element: CanvasElement, pageId: string): number {
    const page = this.getPageById(pageId);
    if (!page) {
      return element.height;
    }

    return this.el.getRenderedHeight(element, page.elements, page);
  }

  getRenderedMinWidthStyleForPage(element: CanvasElement, pageId: string): string | null {
    const page = this.getPageById(pageId);
    if (!page) {
      return null;
    }

    return this.el.getRenderedMinWidthStyle(element, page.elements, page);
  }

  getRenderedMaxWidthStyleForPage(element: CanvasElement, pageId: string): string | null {
    const page = this.getPageById(pageId);
    if (!page) {
      return null;
    }

    return this.el.getRenderedMaxWidthStyle(element, page.elements, page);
  }

  getRenderedMinHeightStyleForPage(element: CanvasElement, pageId: string): string | null {
    const page = this.getPageById(pageId);
    if (!page) {
      return null;
    }

    return this.el.getRenderedMinHeightStyle(element, page.elements, page);
  }

  getRenderedMaxHeightStyleForPage(element: CanvasElement, pageId: string): string | null {
    const page = this.getPageById(pageId);
    if (!page) {
      return null;
    }

    return this.el.getRenderedMaxHeightStyle(element, page.elements, page);
  }

  getRenderedWidthStyleForPage(element: CanvasElement, pageId: string): string {
    const page = this.getPageById(pageId);
    if (!page) {
      return `${element.width}px`;
    }

    return this.el.getRenderedWidthStyle(element, page.elements, page);
  }

  getRenderedHeightStyleForPage(element: CanvasElement, pageId: string): string {
    const page = this.getPageById(pageId);
    if (!page) {
      return `${element.height}px`;
    }

    return this.el.getRenderedHeightStyle(element, page.elements, page);
  }

  getElementClipPathForPage(element: CanvasElement, pageId: string): string {
    const page = this.getPageById(pageId);
    if (!page) {
      return 'none';
    }

    return this.el.getElementClipPath(element, page.elements);
  }

  isElementClippedOutForPage(element: CanvasElement, pageId: string): boolean {
    const page = this.getPageById(pageId);
    if (!page) {
      return false;
    }

    return this.el.isElementClippedOut(element, page.elements);
  }

  // Preview nested helpers

  getPreviewNestedX(element: CanvasElement): number | null {
    return this.isChildInFlow(element) ? null : element.x;
  }

  getPreviewNestedY(element: CanvasElement): number | null {
    return this.isChildInFlow(element) ? null : element.y;
  }

  getPreviewNestedPositionStyle(element: CanvasElement): string | null {
    if (this.isChildInFlow(element)) {
      return this.el.isContainerElement(element) ? 'relative' : null;
    }
    return element.position ?? 'absolute';
  }

  // Page queries

  getVisibleElementsForPage(pageId: string): CanvasElement[] {
    const page = this.getPageById(pageId);
    if (!page) {
      return [];
    }

    return page.elements.filter((element) =>
      this.el.isElementEffectivelyVisible(element.id, page.elements),
    );
  }

  getTopLevelVisibleElementsForPage(pageId: string): CanvasElement[] {
    const all = this.getVisibleElementsForPage(pageId);
    return all.filter((el) => !this.hasContainerAncestor(el, all));
  }

  getLayoutChildrenForPage(element: CanvasElement, pageId: string): CanvasElement[] {
    return this.getVisibleElementsForPage(pageId).filter((el) => el.parentId === element.id);
  }

  // Snap line helpers

  getSnapLineX(position: number, activeLayout: CanvasPageLayout | null): number {
    return position + (activeLayout?.x ?? 0);
  }

  getSnapLineY(position: number, activeLayout: CanvasPageLayout | null): number {
    return position + (activeLayout?.y ?? 0);
  }

  // Private helpers

  private getPageById(pageId: string): CanvasPageModel | null {
    return this.editorState.pages().find((page) => page.id === pageId) ?? null;
  }

  private getPageShellTopPadding(): number {
    const minForTitle = (PAGE_FRAME_TITLE_OFFSET + 10) / this.viewport.zoomLevel();
    return Math.max(PAGE_SHELL_SIDE_PADDING, minForTitle);
  }

  private getPageContentBounds(
    pageId: string,
    fallbackWidth: number,
    fallbackHeight: number,
  ): { minX: number; minY: number; maxX: number; maxY: number } {
    const page = this.getPageById(pageId);
    if (!page) {
      return { minX: 0, minY: 0, maxX: fallbackWidth, maxY: fallbackHeight };
    }

    const rootFrames = page.elements.filter(
      (element) => element.type === 'frame' && !element.parentId,
    );
    if (rootFrames.length === 0) {
      return { minX: 0, minY: 0, maxX: fallbackWidth, maxY: fallbackHeight };
    }

    const firstBounds = this.el.getAbsoluteBounds(rootFrames[0], page.elements, page);
    let minX = firstBounds.x;
    let minY = firstBounds.y;
    let maxX = firstBounds.x + firstBounds.width;
    let maxY = firstBounds.y + firstBounds.height;

    for (const frame of rootFrames) {
      const bounds = this.el.getAbsoluteBounds(frame, page.elements, page);
      minX = Math.min(minX, bounds.x);
      minY = Math.min(minY, bounds.y);
      maxX = Math.max(maxX, bounds.x + bounds.width);
      maxY = Math.max(maxY, bounds.y + bounds.height);
    }

    return { minX, minY, maxX, maxY };
  }

  private isChildInFlow(element: CanvasElement): boolean {
    const pos = element.position;
    return !pos || pos === 'static' || pos === 'relative' || pos === 'sticky';
  }

  private hasContainerAncestor(element: CanvasElement, elements: CanvasElement[]): boolean {
    const parent = elements.find((el) => el.id === element.parentId);
    if (!parent) return false;
    if (this.el.isContainerElement(parent)) return true;
    return this.hasContainerAncestor(parent, elements);
  }
}
