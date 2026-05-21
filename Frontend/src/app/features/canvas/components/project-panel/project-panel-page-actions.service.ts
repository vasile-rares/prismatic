import { Injectable, signal } from '@angular/core';
import { CanvasPageModel } from '@app/core';
import type { ContextMenuItem } from '@app/shared';

export type PageRenameSource = 'pages' | 'layers';
type PageMenuContext = 'pages' | 'layers';

interface ProjectPanelPageActionsContext {
  getPages: () => CanvasPageModel[];
  canPastePage: () => boolean;
  canDeletePage: () => boolean;
  emitPageSelected: (pageId: string) => void;
  emitPageLayerSelected: (pageId: string) => void;
  emitPageCreateRequested: () => void;
  emitPageCopyRequested: (pageId: string) => void;
  emitPagePasteRequested: (pageId: string) => void;
  emitPageDuplicateRequested: (pageId: string) => void;
  emitPageDeleteRequested: (pageId: string) => void;
  emitPageNameChanged: (change: { id: string; name: string }) => void;
}

@Injectable()
export class ProjectPanelPageActionsService {
  private context: ProjectPanelPageActionsContext | null = null;

  readonly editingPageId = signal<string | null>(null);
  readonly editingPageName = signal('');
  readonly pageMenuPageId = signal<string | null>(null);
  readonly pageMenuItems = signal<ContextMenuItem[]>([]);
  readonly pageMenuX = signal(0);
  readonly pageMenuY = signal(0);

  private readonly pageMenuContext = signal<PageMenuContext | null>(null);
  private readonly editingPageSource = signal<PageRenameSource | null>(null);

  connect(context: ProjectPanelPageActionsContext): void {
    this.context = context;
  }

  onPageSelect(pageId: string): void {
    this.closePageMenu();
    this.context?.emitPageSelected(pageId);
  }

  onLayerPageSelect(pageId: string): void {
    this.closePageMenu();
    this.context?.emitPageLayerSelected(pageId);
  }

  startPageRename(
    pageId: string,
    event?: MouseEvent,
    source: PageRenameSource = 'pages',
  ): void {
    event?.stopPropagation();
    this.closePageMenu();

    const page = this.context?.getPages().find((candidate) => candidate.id === pageId);
    this.editingPageName.set(page?.name ?? '');
    this.editingPageId.set(pageId);
    this.editingPageSource.set(source);

    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>(
        `[data-page-name-id="${source}-${pageId}"]`,
      );
      input?.select();
    });
  }

  isPageRenameActive(pageId: string, source: PageRenameSource): boolean {
    return this.editingPageId() === pageId && this.editingPageSource() === source;
  }

  stopPageRename(pageId: string): void {
    if (this.editingPageId() !== pageId) {
      return;
    }

    const trimmed = this.editingPageName().trim();
    if (trimmed) {
      this.context?.emitPageNameChanged({ id: pageId, name: trimmed });
    }

    this.clearPageRename();
  }

  onPageNameInput(event: Event): void {
    this.editingPageName.set((event.target as HTMLInputElement).value);
  }

  onPageNameKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      (event.target as HTMLInputElement).blur();
      return;
    }

    if (event.key === 'Escape') {
      this.clearPageRename();
    }
  }

  onPageCreate(): void {
    this.closePageMenu();
    this.context?.emitPageCreateRequested();
  }

  togglePageMenu(pageId: string, event: MouseEvent): void {
    event.stopPropagation();

    if (this.pageMenuPageId() === pageId && this.pageMenuContext() === 'pages') {
      this.closePageMenu();
      return;
    }

    const trigger = event.currentTarget as HTMLElement;
    const rect = trigger.getBoundingClientRect();
    this.openPageMenu(pageId, rect.right, rect.bottom + 6, 'pages');
  }

  onLayerPageContextMenu(pageId: string, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.onLayerPageSelect(pageId);
    this.openPageMenu(pageId, event.clientX, event.clientY, 'layers');
  }

  closePageMenu(): void {
    this.pageMenuPageId.set(null);
    this.pageMenuContext.set(null);
    this.pageMenuItems.set([]);
  }

  isPageMenuOpenFor(pageId: string): boolean {
    return this.pageMenuContext() === 'pages' && this.pageMenuPageId() === pageId;
  }

  onPageCopy(pageId: string): void {
    this.closePageMenu();
    this.context?.emitPageCopyRequested(pageId);
  }

  onPagePaste(pageId: string): void {
    this.closePageMenu();
    this.context?.emitPagePasteRequested(pageId);
  }

  onPageDuplicate(pageId: string): void {
    this.closePageMenu();
    this.context?.emitPageDuplicateRequested(pageId);
  }

  onPageDelete(pageId: string, event?: MouseEvent): void {
    event?.stopPropagation();
    this.closePageMenu();

    if (!this.context?.canDeletePage()) {
      return;
    }

    this.context.emitPageDeleteRequested(pageId);
  }

  private openPageMenu(pageId: string, x: number, y: number, context: PageMenuContext): void {
    const renameSource: PageRenameSource = context === 'layers' ? 'layers' : 'pages';

    this.pageMenuPageId.set(pageId);
    this.pageMenuContext.set(context);
    this.pageMenuX.set(x);
    this.pageMenuY.set(y);
    this.pageMenuItems.set(
      context === 'layers'
        ? [
            {
              id: 'copy',
              label: 'Copy',
              shortcut: 'Ctrl+C',
              action: () => this.onPageCopy(pageId),
            },
            {
              id: 'paste',
              label: 'Paste',
              shortcut: 'Ctrl+V',
              disabled: !this.context?.canPastePage(),
              action: () => this.onPagePaste(pageId),
            },
            {
              id: 'rename',
              label: 'Rename',
              separator: true,
              action: () => this.startPageRename(pageId, undefined, renameSource),
            },
            {
              id: 'delete',
              label: 'Delete',
              variant: 'danger',
              disabled: !this.context?.canDeletePage(),
              action: () => this.onPageDelete(pageId),
            },
          ]
        : [
            {
              id: 'rename',
              label: 'Rename',
              action: () => this.startPageRename(pageId, undefined, renameSource),
            },
            {
              id: 'duplicate',
              label: 'Duplicate',
              action: () => this.onPageDuplicate(pageId),
            },
            {
              id: 'delete',
              label: 'Delete',
              variant: 'danger',
              separator: true,
              disabled: !this.context?.canDeletePage(),
              action: () => this.onPageDelete(pageId),
            },
          ],
    );
  }

  private clearPageRename(): void {
    this.editingPageId.set(null);
    this.editingPageName.set('');
    this.editingPageSource.set(null);
  }
}
