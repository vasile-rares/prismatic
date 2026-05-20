import { Injectable, inject, effect, signal } from '@angular/core';
import { Router } from '@angular/router';
import { map, Observable } from 'rxjs';
import {
  buildCanvasProjectDocumentFromUnknown,
  buildPersistedCanvasDesign,
  buildCanvasProjectDocument,
} from '../mappers/canvas-persistence.mapper';
import {
  CanvasPageModel,
  CanvasProjectDocument,
  ProjectDesignResponse,
  ProjectService,
  UserService,
  dataUrlToBlob,
  extractApiErrorMessage,
} from '@app/core';
import { withRoundedPrecision } from '../utils/element/canvas-element-normalization.util';
import { generateThumbnail, generateThumbnailHtml2Canvas } from '../utils/canvas-thumbnail.util';
import { CanvasEditorStateService } from './canvas-editor-state.service';
import { CanvasGestureService } from './editor/canvas-gesture.service';
import { CanvasAiChatPersistenceService } from './editor/canvas-ai-chat-persistence.service';
import { CanvasHistoryService } from './editor/canvas-history.service';
import { CanvasPageManagerService } from './canvas-page-manager.service';

const PERSIST_FLUSH_POLL_MS = 50;
const PERSIST_FLUSH_MAX_WAIT_MS = 4000;

@Injectable()
export class CanvasPersistenceService {
  private readonly projectService = inject(ProjectService);
  private readonly userService = inject(UserService);
  private readonly router = inject(Router);
  private readonly editorState = inject(CanvasEditorStateService, { optional: true });
  private readonly gesture = inject(CanvasGestureService, { optional: true });
  private readonly history = inject(CanvasHistoryService, { optional: true });
  private readonly aiChatPersistence = inject(CanvasAiChatPersistenceService, { optional: true });
  private readonly page = inject(CanvasPageManagerService, { optional: true });

  // ── Public signals ────────────────────────────────────────
  readonly isLoadingDesign = signal(true);
  readonly loadingMessage = signal('Preparing the editor...');
  readonly loadingPercent = signal(5);
  readonly loadingFadingOut = signal(false);
  readonly isSavingDesign = signal(false);
  readonly lastSavedAt = signal<string | null>(null);

  // ── Public state ──────────────────────────────────────────
  projectIdAsNumber = NaN;
  isPointerDown = false;

  // ── Private state ─────────────────────────────────────────
  private projectSlug = '';
  private canPersistDesign = false;
  private saveTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private hasQueuedDesignPersist = false;
  private saveRetryCount = 0;
  private readonly SAVE_MAX_RETRIES = 4;
  private readonly SAVE_RETRY_BASE_MS = 2000;
  private saveRetryTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private hasTriggeredBrowserExitFlush = false;
  private lastPersistedThumbnailDataUrl: string | null = null;
  private pendingThumbnailDataUrl: string | null = null;
  private pendingInitialPageFocusId: string | null = null;
  private _idleThumbnailTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (this.editorState) {
      const editorState = this.editorState;
      effect(() => {
        editorState.pages();
        editorState.currentPageId();
        if (!this.canPersistDesign) return;
        this.scheduleDesignSave();
      });
    }
  }

  // ── Public orchestration ──────────────────────────────────

  initialize(projectSlug: string): void {
    this.projectSlug = projectSlug;
    this.loadProject();
  }

  scheduleDesignSave(): void {
    if (!Number.isInteger(this.projectIdAsNumber)) {
      return;
    }

    // A user-driven change resets any retry backoff and cancels any pending retry.
    this.saveRetryCount = 0;
    if (this.saveRetryTimeoutId) {
      clearTimeout(this.saveRetryTimeoutId);
      this.saveRetryTimeoutId = null;
    }

    if (this.saveTimeoutId) {
      clearTimeout(this.saveTimeoutId);
    }

    this.saveTimeoutId = setTimeout(() => {
      this.saveTimeoutId = null;
      this.persistDesign();
    }, 500);
  }

  restorePendingInitialPageFocus(): void {
    const pageId = this.pendingInitialPageFocusId;
    if (!pageId) return;

    const canvasElement = document.querySelector('.canvas-container') as HTMLElement | null;
    if (!canvasElement) return;

    if (!this.editorState?.pages().some((page) => page.id === pageId)) {
      this.pendingInitialPageFocusId = null;
      return;
    }

    this.page?.focusPageInstant(pageId, canvasElement);
    this.pendingInitialPageFocusId = null;
  }

  cancelIdleThumbnail(): void {
    if (this._idleThumbnailTimeoutId === null) return;
    clearTimeout(this._idleThumbnailTimeoutId);
    this._idleThumbnailTimeoutId = null;
  }

  dispatchBrowserExitFlush(): void {
    if (this.hasTriggeredBrowserExitFlush || !Number.isInteger(this.projectIdAsNumber)) {
      return;
    }

    this.projectService.queueAndDispatchFlush(
      this.projectIdAsNumber,
      this.buildCurrentPersistedDesignJson(),
      this.generateThumbnailWithDomBounds(),
    );
    this.hasTriggeredBrowserExitFlush = true;
  }

  buildCurrentPersistedDesignJson(): string {
    return JSON.stringify(buildPersistedCanvasDesign(this.buildCurrentProjectDocument()));
  }

  async flushPendingPersistence(): Promise<boolean> {
    if (!Number.isInteger(this.projectIdAsNumber)) {
      return true;
    }

    if (this.saveTimeoutId) {
      clearTimeout(this.saveTimeoutId);
      this.saveTimeoutId = null;
      this.persistDesign();
    }

    const deadline = Date.now() + PERSIST_FLUSH_MAX_WAIT_MS;
    while (Date.now() < deadline) {
      if (this.saveTimeoutId) {
        clearTimeout(this.saveTimeoutId);
        this.saveTimeoutId = null;
        this.persistDesign();
      }

      if (!this.isSavingDesign() && !this.hasQueuedDesignPersist) {
        break;
      }

      await new Promise<void>((resolve) => {
        setTimeout(resolve, PERSIST_FLUSH_POLL_MS);
      });
    }

    // Cancel any pending entry thumbnail — it already saved on entry or hasn't run yet.
    this.cancelIdleThumbnail();

    return true;
  }

  // ── Public API (used by canvas-preview-page too) ──────────

  loadProjectDesign(projectId: number): Observable<{
    pages: CanvasPageModel[];
    activePageId: string | null;
    updatedAt: string | null;
  }> {
    return this.projectService.getDesign(projectId).pipe(
      map((response) => {
        const parsedDesign = this.parseDesign(response.designJson);
        const projectDocument = buildCanvasProjectDocumentFromUnknown(
          parsedDesign,
          projectId.toString(),
        );

        return {
          pages: projectDocument.pages.map((page) => ({
            ...page,
            elements: page.elements.map((element) => withRoundedPrecision(element)),
          })),
          activePageId: projectDocument.activePageId,
          updatedAt: response.updatedAt ?? null,
        };
      }),
    );
  }

  saveProjectDesign(
    projectId: number,
    document: CanvasProjectDocument,
  ): Observable<ProjectDesignResponse> {
    const designJson = JSON.stringify(buildPersistedCanvasDesign(document));
    return this.projectService.saveDesign(projectId, { designJson });
  }

  saveProjectThumbnail(projectId: number, thumbnailFile: Blob): Observable<void> {
    return this.projectService.saveThumbnail(projectId, thumbnailFile);
  }

  // ── Private persistence ───────────────────────────────────

  private loadProject(): void {
    if (!this.projectSlug || this.projectSlug === 'new-project') {
      this.page?.apiError.set('Invalid project.');
      return;
    }

    const navState = this.router.getCurrentNavigation()?.extras.state ?? history.state;
    const fromPreview = navState?.['fromPreview'] === true;

    if (fromPreview) {
      this.isLoadingDesign.set(false);
    } else {
      this.isLoadingDesign.set(true);
      this.loadingMessage.set('Fetching project details...');
      this.loadingPercent.set(20);
    }
    this.page?.apiError.set(null);
    this.canPersistDesign = false;

    const loadingStartedAt = Date.now();
    const hideOverlay = () => {
      if (fromPreview) {
        return;
      }
      const elapsed = Date.now() - loadingStartedAt;
      const remaining = Math.max(0, 1000 - elapsed);
      // Wait for minimum display time, capture thumbnail while overlay is visible, then fade.
      setTimeout(() => {
        requestAnimationFrame(() => {
          this.captureAndPersistThumbnailThenHide();
        });
      }, remaining);
    };

    this.projectService.getBySlug(this.projectSlug).subscribe({
      next: (project) => {
        const currentUserId = this.userService.currentUser()?.userId;
        if (currentUserId !== undefined && project.userId !== currentUserId) {
          void this.router.navigate(['/project', this.projectSlug, 'preview'], {
            replaceUrl: true,
          });
          return;
        }

        this.projectIdAsNumber = project.projectId;
        this.loadingMessage.set('Loading design...');
        this.loadingPercent.set(55);

        this.loadProjectDesign(this.projectIdAsNumber).subscribe({
          next: async (response) => {
            const pages = response.pages;
            const activePageId =
              response.activePageId && pages.some((page) => page.id === response.activePageId)
                ? response.activePageId
                : (pages[0]?.id ?? null);

            this.editorState?.pages.set(pages);
            this.editorState?.currentPageId.set(activePageId);
            this.editorState?.selectedElementId.set(null);
            this.page?.clearSelectedPageLayer();
            this.page?.layersFocusedPageId.set(activePageId);
            this.pendingInitialPageFocusId = activePageId;
            this.lastSavedAt.set(response.updatedAt ?? null);
            this.history?.resetHistory();
            this.history?.setProjectId(this.projectIdAsNumber);
            this.aiChatPersistence?.setProjectId(this.projectIdAsNumber);
            await Promise.all([
              this.history?.restoreFromDb(this.projectIdAsNumber) ?? Promise.resolve(),
              this.aiChatPersistence?.restore(this.projectIdAsNumber) ?? Promise.resolve(),
            ]);
            this.loadingMessage.set('Finishing up...');
            this.loadingPercent.set(100);
            this.canPersistDesign = true;
            hideOverlay();
          },
          error: (error: { error?: { message?: string; title?: string; detail?: string } }) => {
            this.page?.apiError.set(
              extractApiErrorMessage(error, 'Failed to load project design.'),
            );
            this.isLoadingDesign.set(false);
            this.canPersistDesign = true;
          },
        });
      },
      error: (error: { error?: { message?: string; title?: string; detail?: string } }) => {
        this.page?.apiError.set(extractApiErrorMessage(error, 'Project not found.'));
        this.isLoadingDesign.set(false);
        this.canPersistDesign = true;
      },
    });
  }

  private persistDesign(): void {
    if (!Number.isInteger(this.projectIdAsNumber)) {
      return;
    }

    if (this.isSavingDesign()) {
      this.hasQueuedDesignPersist = true;
      return;
    }

    if (this.saveTimeoutId) {
      clearTimeout(this.saveTimeoutId);
      this.saveTimeoutId = null;
    }

    const document = this.buildCurrentProjectDocument();
    this.hasQueuedDesignPersist = false;
    this.isSavingDesign.set(true);

    this.saveProjectDesign(this.projectIdAsNumber, document).subscribe({
      next: (response) => {
        this.saveRetryCount = 0;
        this.lastSavedAt.set(response.updatedAt ?? null);
        this.finishPersistDesign();
      },
      error: (error: { error?: { message?: string; title?: string; detail?: string } }) => {
        this.page?.apiError.set(extractApiErrorMessage(error, 'Failed to save project design.'));
        this.isSavingDesign.set(false);

        if (this.saveRetryCount < this.SAVE_MAX_RETRIES) {
          const delay = Math.pow(2, this.saveRetryCount) * this.SAVE_RETRY_BASE_MS;
          this.saveRetryCount++;
          this.hasQueuedDesignPersist = true;
          this.saveRetryTimeoutId = setTimeout(() => {
            this.saveRetryTimeoutId = null;
            this.persistDesign();
          }, delay);
        } else {
          this.saveRetryCount = 0;
          this.hasQueuedDesignPersist = false;
        }
      },
    });
  }

  private finishPersistDesign(): void {
    this.isSavingDesign.set(false);

    if (!this.hasQueuedDesignPersist) {
      return;
    }

    this.hasQueuedDesignPersist = false;
    this.persistDesign();
  }

  /**
   * Capture thumbnail while overlay is fully opaque, then start fade.
   */
  private captureAndPersistThumbnailThenHide(): void {
    const startFade = () => {
      this.loadingFadingOut.set(true);
      setTimeout(() => {
        this.isLoadingDesign.set(false);
        this.loadingFadingOut.set(false);
      }, 380);
    };

    const page = this.editorState?.currentPage();
    if (!page || !Number.isInteger(this.projectIdAsNumber)) {
      startFade();
      return;
    }

    generateThumbnailHtml2Canvas(page)
      .then((thumbnail) => {
        if (thumbnail) this.persistThumbnailIfDue(thumbnail);
      })
      .catch(() => {})
      .finally(() => startFade());
  }

  private scheduleIdleThumbnail(): void {
    if (!Number.isInteger(this.projectIdAsNumber)) return;
    this.cancelIdleThumbnail();
    const tryCapture = () => {
      this._idleThumbnailTimeoutId = null;
      if (this.isPointerDown) {
        this._idleThumbnailTimeoutId = setTimeout(tryCapture, 500);
        return;
      }
      const page = this.editorState?.currentPage();
      if (!page) return;
      generateThumbnailHtml2Canvas(page)
        .then((thumbnail) => {
          if (thumbnail) this.persistThumbnailIfDue(thumbnail);
        })
        .catch(() => {});
    };
    this._idleThumbnailTimeoutId = setTimeout(() => requestAnimationFrame(tryCapture), 50);
  }

  private generateThumbnailWithDomBounds(): string | null {
    if (!this.gesture) return null;
    const domBounds = this.gesture.snapshotAllElementSceneBounds();
    const bounds = domBounds.size > 0 ? domBounds : this.gesture.getLastKnownSceneBounds();
    return generateThumbnail(
      this.editorState?.currentPage() ?? null,
      bounds.size > 0 ? bounds : null,
    );
  }

  /** On exit: no thumbnail operation — thumbnail is saved on entry. */
  private persistThumbnailAsync(): void {}

  private persistThumbnailIfDue(precomputedThumbnail?: string | null): void {
    if (!Number.isInteger(this.projectIdAsNumber)) {
      return;
    }

    const thumbnail =
      precomputedThumbnail !== undefined
        ? precomputedThumbnail
        : this.generateThumbnailWithDomBounds();
    if (!thumbnail) {
      return;
    }

    if (
      thumbnail === this.lastPersistedThumbnailDataUrl ||
      thumbnail === this.pendingThumbnailDataUrl
    ) {
      return;
    }

    const thumbnailFile = dataUrlToBlob(thumbnail);
    if (!thumbnailFile) {
      return;
    }

    this.pendingThumbnailDataUrl = thumbnail;

    this.saveProjectThumbnail(this.projectIdAsNumber, thumbnailFile).subscribe({
      next: () => {
        if (this.pendingThumbnailDataUrl === thumbnail) {
          this.pendingThumbnailDataUrl = null;
        }
        this.lastPersistedThumbnailDataUrl = thumbnail;
      },
      error: (error: { error?: { message?: string; title?: string; detail?: string } }) => {
        if (this.pendingThumbnailDataUrl === thumbnail) {
          this.pendingThumbnailDataUrl = null;
        }
        this.page?.apiError.set(extractApiErrorMessage(error, 'Failed to save project thumbnail.'));
      },
    });
  }

  private buildCurrentProjectDocument(): CanvasProjectDocument {
    return buildCanvasProjectDocument(
      this.editorState?.pages() ?? [],
      this.projectSlug,
      this.editorState?.currentPageId() ?? null,
    );
  }

  private parseDesign(rawJson: string): unknown {
    if (!rawJson?.trim()) {
      return null;
    }

    try {
      return JSON.parse(rawJson) as unknown;
    } catch {
      return null;
    }
  }
}
