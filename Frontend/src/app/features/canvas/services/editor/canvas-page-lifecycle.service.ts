import { Injectable, inject } from '@angular/core';
import { HistorySnapshot } from '../../canvas.types';
import { CanvasEditorStateService } from '../canvas-editor-state.service';
import { CanvasPersistenceService } from '../canvas-persistence.service';
import { CanvasViewportService } from '../canvas-viewport.service';
import { CanvasGestureService } from './canvas-gesture.service';
import { CanvasHistoryService } from './canvas-history.service';

@Injectable()
export class CanvasPageLifecycleService {
  private readonly viewport = inject(CanvasViewportService);
  private readonly gesture = inject(CanvasGestureService);
  private readonly history = inject(CanvasHistoryService);
  private readonly editorState = inject(CanvasEditorStateService);
  private readonly persistence = inject(CanvasPersistenceService);

  handleWindowBlur(createHistorySnapshot: () => HistorySnapshot): void {
    this.viewport.isSpacePressed.set(false);
    this.viewport.endPan();
    this.gesture.cancelDragState();
    this.history.commitGestureHistory(createHistorySnapshot);
    this.gesture.finalizeTextEditing(this.editorState.editingTextElementId());
  }

  handleBeforeUnload(): void {
    this.persistence.dispatchBrowserExitFlush();
  }

  handlePageHide(event: PageTransitionEvent): void {
    if (!event.persisted) {
      this.persistence.dispatchBrowserExitFlush();
    }
  }
}
