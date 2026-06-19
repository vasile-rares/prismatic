import { Injectable, inject, signal } from '@angular/core';
import { CanvasElement, CanvasPageModel } from '@app/core';
import type { ContextMenuItem } from '@app/shared';
import { CanvasEditorStateService } from '../canvas-editor-state.service';

export interface ContextMenuActionCallbacks {
  copy: () => void;
  paste: () => void;
  delete: (elementId: string) => void;
  bringToFront: (elementId: string) => void;
  sendToBack: (elementId: string) => void;
  moveToPage: (elementId: string, targetPageId: string) => void;
  rename: (elementId: string) => void;
  toggleVisibility: (elementId: string) => void;
  setAsPrimary: (elementId: string) => void;
}

@Injectable()
export class CanvasContextMenuService {
  private readonly editorState = inject(CanvasEditorStateService);

  readonly isOpen = signal(false);
  readonly positionX = signal(0);
  readonly positionY = signal(0);
  readonly items = signal<ContextMenuItem[]>([]);

  open(x: number, y: number, callbacks: ContextMenuActionCallbacks): void {
    this.items.set(this.buildItems(callbacks));
    this.positionX.set(x);
    this.positionY.set(y);
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
    this.items.set([]);
  }

  // Private item building

  private buildItems(callbacks: ContextMenuActionCallbacks): ContextMenuItem[] {
    const element = this.editorState.selectedElement();
    const hasElement = this.editorState.selectedElementIds().length > 0;
    const isVisible = element?.visible !== false;
    const isRootFrame = element?.type === 'frame' && !element.parentId;
    const otherPages = this.editorState
      .pages()
      .filter((page) => page.id !== this.editorState.currentPageId());

    const guardAction = (action: (id: string) => void): (() => void) => {
      return () => {
        const id = this.editorState.selectedElementId();
        if (id) {
          action(id);
        }
      };
    };

    return [
      {
        id: 'copy',
        label: 'Copy',
        shortcut: 'Ctrl+C',
        disabled: !hasElement,
        action: () => callbacks.copy(),
      },
      {
        id: 'paste',
        label: 'Paste',
        shortcut: 'Ctrl+V',
        action: () => callbacks.paste(),
      },
      {
        id: 'delete',
        label: 'Delete',
        shortcut: 'Del',
        variant: 'danger' as const,
        disabled: !hasElement,
        action: guardAction((id) => callbacks.delete(id)),
      },

      {
        id: 'bring-front',
        label: 'Bring to Front',
        shortcut: 'Ctrl+]',
        disabled: !hasElement,
        separator: true,
        action: guardAction((id) => callbacks.bringToFront(id)),
      },
      {
        id: 'send-back',
        label: 'Send to Back',
        shortcut: 'Ctrl+[',
        disabled: !hasElement,
        action: guardAction((id) => callbacks.sendToBack(id)),
      },
      {
        id: 'move-to-page',
        label: 'Move to Page',
        disabled: !hasElement || otherPages.length === 0,
        children: otherPages.map((page) => ({
          id: `move-page-${page.id}`,
          label: page.name,
          action: guardAction((id) => callbacks.moveToPage(id, page.id)),
        })),
      },

      {
        id: 'rename',
        label: 'Rename',
        shortcut: 'F2',
        disabled: !hasElement,
        separator: true,
        action: guardAction((id) => callbacks.rename(id)),
      },
      {
        id: 'visibility',
        label: isVisible ? 'Hide' : 'Show',
        shortcut: 'Ctrl+Shift+H',
        disabled: !hasElement,
        action: guardAction((id) => callbacks.toggleVisibility(id)),
      },

      {
        id: 'set-primary',
        label: element?.isPrimary ? 'Primary Frame ✓' : 'Set as Primary Frame',
        disabled: !isRootFrame || !!element?.isPrimary,
        separator: true,
        action: guardAction((id) => callbacks.setAsPrimary(id)),
      },
    ];
  }
}
