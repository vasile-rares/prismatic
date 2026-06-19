import { Injectable, inject } from '@angular/core';
import { CanvasElementType } from '@app/core';
import { CanvasEditorStateService } from '../canvas-editor-state.service';

export interface KeyboardActionCallbacks {
  copy: () => void;
  paste: () => void;
  undo: () => void;
  redo: () => void;
  delete: () => void;
  selectTool: (tool: CanvasElementType | 'select') => void;
  spaceDown: () => void;
  spaceUp: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

const TOOL_HOTKEYS: Record<string, CanvasElementType | 'select'> = {
  v: 'select',
  f: 'frame',
  r: 'rectangle',
  t: 'text',
  i: 'image',
};

@Injectable()
export class CanvasKeyboardService {
  private readonly editorState = inject(CanvasEditorStateService);

  handleKeyDown(event: KeyboardEvent, callbacks: KeyboardActionCallbacks): void {
    if (event.defaultPrevented) {
      return;
    }

    const isTypingContext = this.isTypingContext(event);

    if (event.ctrlKey || event.metaKey) {
      const key = event.key;
      if (key === '+' || key === '=') {
        event.preventDefault();
        callbacks.zoomIn();
        return;
      }
      if (key === '-') {
        event.preventDefault();
        callbacks.zoomOut();
        return;
      }
    }

    if (!isTypingContext && (event.ctrlKey || event.metaKey)) {
      const key = event.key.toLowerCase();

      if (key === 'c') {
        event.preventDefault();
        callbacks.copy();
        return;
      }

      if (key === 'v') {
        event.preventDefault();
        callbacks.paste();
        return;
      }

      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        callbacks.undo();
        return;
      }

      if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault();
        callbacks.redo();
        return;
      }
    }

    if (this.editorState.editingTextElementId()) {
      return;
    }

    if (event.code === 'Space' && !isTypingContext) {
      callbacks.spaceDown();
      event.preventDefault();
      return;
    }

    if (isTypingContext) {
      return;
    }

    const toolKey = event.key.toLowerCase();
    const tool = TOOL_HOTKEYS[toolKey];
    if (tool) {
      callbacks.selectTool(tool);
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (this.editorState.selectedElementIds().length === 0) {
        return;
      }
      callbacks.delete();
    }
  }

  handleKeyUp(event: KeyboardEvent, onSpaceUp: () => void): void {
    if (event.code === 'Space') {
      onSpaceUp();
    }
  }

  // Private helpers

  private isTypingContext(event: KeyboardEvent): boolean {
    return this.isTypingTarget(event.target);
  }

  private isTypingTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    if (!element) {
      return false;
    }

    if (element.isContentEditable) {
      return true;
    }

    const tagName = element.tagName;
    return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
  }
}
