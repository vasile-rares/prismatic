import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import {
  CanvasPageModel,
  ConverterService,
  UserService,
  ProjectService,
  extractApiErrorMessage,
} from '@app/core';
import { HeaderBarComponent } from '@app/shared';
import { CanvasPersistenceService } from '../../services/canvas-persistence.service';
import { buildCanvasIRPages } from '../../mappers/canvas-to-ir.mapper';
import { VIEWPORT_PRESET_OPTIONS } from '../../canvas.types';

interface FrameSizeOption {
  label: string;
  width: number;
  height: number;
}

const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=Montserrat:wght@300;400;500;600;700&family=Space+Grotesk:wght@300;400;500;600;700&display=swap';

@Component({
  selector: 'app-canvas-preview-page',
  standalone: true,
  imports: [HeaderBarComponent],
  providers: [CanvasPersistenceService],
  templateUrl: './canvas-preview-page.component.html',
  styleUrl: './canvas-preview-page.component.css',
})
export class CanvasPreviewPage {
  private readonly stageRef = viewChild<ElementRef<HTMLElement>>('stage');

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly sanitizer = inject(DomSanitizer);

  private readonly destroyRef = inject(DestroyRef);

  private readonly canvasPersistenceService = inject(CanvasPersistenceService);
  private readonly converterService = inject(ConverterService);
  private readonly projectApiService = inject(ProjectService);
  private readonly currentUserService = inject(UserService);

  private projectIdAsNumber = NaN;

  readonly pages = signal<CanvasPageModel[]>([]);
  readonly currentPageId = signal<string | null>(null);
  readonly selectedFrameIndex = signal(0);
  readonly isLoading = signal(false);
  readonly isGenerating = signal(false);
  readonly error = signal<string | null>(null);
  readonly pageSearchQuery = signal('');
  readonly isPageDropdownOpen = signal(false);

  readonly isOwner = signal(false);
  readonly isStarred = signal(false);
  readonly isLiked = signal(false);
  readonly starCount = signal(0);
  readonly likeCount = signal(0);
  readonly isStarring = signal(false);
  readonly isLiking = signal(false);
  readonly isForking = signal(false);

  private projectIdForFork = NaN;

  readonly generatedHtml = signal('');
  readonly generatedCss = signal('');

  readonly resizeWidth = signal<number | null>(null);
  readonly resizeHeight = signal<number | null>(null);
  readonly isResizing = signal(false);

  private resizeDragAxis: 'right' | 'bottom' | 'corner' | null = null;
  private resizeDragStartX = 0;
  private resizeDragStartY = 0;
  private resizeDragStartW = 0;
  private resizeDragStartH = 0;
  private resizeMaxWidth = Infinity;
  private resizeMaxHeight = Infinity;

  private readonly onResizePointerMove = (e: PointerEvent): void => {
    const dx = e.clientX - this.resizeDragStartX;
    const dy = e.clientY - this.resizeDragStartY;

    if (this.resizeDragAxis === 'right' || this.resizeDragAxis === 'corner') {
      this.resizeWidth.set(
        Math.max(120, Math.min(this.resizeMaxWidth, Math.round(this.resizeDragStartW + 2 * dx))),
      );
    }
    if (this.resizeDragAxis === 'bottom' || this.resizeDragAxis === 'corner') {
      this.resizeHeight.set(
        Math.max(120, Math.min(this.resizeMaxHeight, Math.round(this.resizeDragStartH + 2 * dy))),
      );
    }
  };

  private readonly onResizePointerUp = (): void => {
    this.isResizing.set(false);
    this.resizeDragAxis = null;
    document.body.style.cursor = '';
    document.removeEventListener('pointermove', this.onResizePointerMove);
    document.removeEventListener('pointerup', this.onResizePointerUp);
  };

  readonly projectSlug = this.route.snapshot.paramMap.get('slug') ?? '';

  readonly currentPage = computed<CanvasPageModel | null>(() => {
    const activePageId = this.currentPageId();
    if (!activePageId) {
      return this.pages()[0] ?? null;
    }

    return this.pages().find((page) => page.id === activePageId) ?? this.pages()[0] ?? null;
  });

  readonly frameSizeOptions = computed<FrameSizeOption[]>(() => {
    const page = this.currentPage();
    const options: FrameSizeOption[] = [];

    const elements = page?.elements ?? [];
    const rootFrames = elements.filter((el) => el.type === 'frame' && !el.parentId);
    for (const frame of rootFrames) {
      const w = Math.round(frame.width);
      const h = frame.heightMode === 'fit-content' ? 720 : Math.round(frame.height);
      options.push({ label: frame.name || `Frame ${w}×${h}`, width: w, height: h });
    }

    if (options.length === 0) {
      for (const preset of VIEWPORT_PRESET_OPTIONS) {
        options.push({
          label: `${preset.label} (${preset.width}×${preset.height})`,
          width: preset.width,
          height: preset.height,
        });
      }
    }

    return options;
  });

  readonly selectedFrameSize = computed<FrameSizeOption | null>(() => {
    const options = this.frameSizeOptions();
    const idx = this.selectedFrameIndex();
    return options[idx] ?? options[0] ?? null;
  });

  readonly viewportWidth = computed<number>(() => {
    const override = this.resizeWidth();
    if (override !== null) return override;
    const frame = this.selectedFrameSize();
    return frame ? frame.width : 1280;
  });

  readonly viewportHeight = computed<number>(() => {
    const override = this.resizeHeight();
    if (override !== null) return override;
    const frame = this.selectedFrameSize();
    return frame ? frame.height : 720;
  });

  readonly iframeSrcdoc = computed<SafeHtml>(() => {
    const html = this.generatedHtml();
    const css = this.generatedCss();

    if (!html && !css) {
      return this.sanitizer.bypassSecurityTrustHtml('');
    }

    return this.sanitizer.bypassSecurityTrustHtml(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${GOOGLE_FONTS_URL}" rel="stylesheet">
<style>
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
body { overflow-x: hidden; overflow-y: auto; }
a { text-decoration: none; color: inherit; }
${css}
</style>
</head>
<body>
${html}
<script>
document.addEventListener('click', function(e) {
  var a = e.target.closest('a[href]');
  if (!a) return;
  var href = a.getAttribute('href');
  if (href && href.startsWith('#')) {
    e.preventDefault();
    window.parent.postMessage({ type: 'favigon-page-navigate', pageId: href.slice(1) }, '*');
  }
});
</script>
</body>
</html>`);
  });

  readonly filteredPages = computed<CanvasPageModel[]>(() => {
    const query = this.pageSearchQuery().toLowerCase().trim();
    const allPages = this.pages();
    if (!query) {
      return allPages;
    }

    return allPages.filter((page) => page.name.toLowerCase().includes(query));
  });

  constructor() {
    this.loadPreview(this.route.snapshot.queryParamMap.get('pageId'));

    effect(() => {
      const page = this.currentPage();
      if (page && !this.isLoading()) {
        this.generateForCurrentPage();
      }
    });

    const onMessage = (event: MessageEvent): void => {
      if (
        event.data &&
        typeof event.data === 'object' &&
        event.data['type'] === 'favigon-page-navigate'
      ) {
        const pageId = event.data['pageId'] as string;
        if (pageId && this.pages().some((p) => p.id === pageId)) {
          this.selectPage(pageId);
        }
      }
    };
    window.addEventListener('message', onMessage);
    this.destroyRef.onDestroy(() => window.removeEventListener('message', onMessage));
  }

  goBack(): void {
    const nav = this.router.getCurrentNavigation();
    const fromExplore =
      (this.location.getState() as Record<string, unknown>)?.['fromExplore'] === true;
    if (fromExplore) {
      void this.router.navigate(['/explore']);
    } else if (this.isOwner()) {
      void this.router.navigate(['/project', this.projectSlug], { state: { fromPreview: true } });
    } else if (window.history.length > 1) {
      this.location.back();
    } else {
      void this.router.navigate(['/explore']);
    }
  }

  forkProject(): void {
    if (this.isForking() || Number.isNaN(this.projectIdForFork)) return;
    this.isForking.set(true);
    this.projectApiService.forkProject(this.projectIdForFork).subscribe({
      next: (forked) => {
        void this.router.navigate(['/project', forked.slug]);
      },
      error: () => {
        this.isForking.set(false);
      },
    });
  }

  onFrameSizeChange(index: number | string | boolean | null): void {
    const nextIndex = typeof index === 'number' ? index : Number(index);
    if (!Number.isFinite(nextIndex)) {
      return;
    }

    this.selectedFrameIndex.set(nextIndex);
    this.resizeWidth.set(null);
    this.resizeHeight.set(null);
  }

  onWidthInputChange(value: number): void {
    this.resizeWidth.set(
      Math.max(120, Math.min(this.getStageMaxViewportWidth(), Math.round(value))),
    );
  }

  onHeightInputChange(value: number): void {
    this.resizeHeight.set(
      Math.max(120, Math.min(this.getStageMaxViewportHeight(), Math.round(value))),
    );
  }

  onNativeFrameSizeChange(event: Event): void {
    this.onFrameSizeChange(Number((event.target as HTMLSelectElement).value));
  }

  onNativeWidthChange(event: Event): void {
    const v = (event.target as HTMLInputElement).valueAsNumber;
    if (Number.isFinite(v)) this.onWidthInputChange(v);
  }

  onNativeHeightChange(event: Event): void {
    const v = (event.target as HTMLInputElement).valueAsNumber;
    if (Number.isFinite(v)) this.onHeightInputChange(v);
  }

  onResizeHandlePointerDown(event: PointerEvent, axis: 'right' | 'bottom' | 'corner'): void {
    event.preventDefault();
    this.resizeDragAxis = axis;
    this.resizeDragStartX = event.clientX;
    this.resizeDragStartY = event.clientY;
    this.resizeDragStartW = this.viewportWidth();
    this.resizeDragStartH = this.viewportHeight();
    this.isResizing.set(true);

    document.body.style.cursor = axis === 'bottom' ? 'ns-resize' : 'ew-resize';

    if (axis === 'right' || axis === 'corner') {
      this.resizeMaxWidth = this.getStageMaxViewportWidth();
    }

    if (axis === 'bottom' || axis === 'corner') {
      const stageEl = this.stageRef()?.nativeElement;
      if (stageEl) {
        const stageRect = stageEl.getBoundingClientRect();
        const stagePadding = 24;
        this.resizeMaxHeight = Math.max(120, stageRect.height - stagePadding * 2);
      } else {
        this.resizeMaxHeight = Infinity;
      }
    }

    document.addEventListener('pointermove', this.onResizePointerMove);
    document.addEventListener('pointerup', this.onResizePointerUp);
  }

  selectPage(pageId: string): void {
    this.currentPageId.set(pageId);
    this.selectedFrameIndex.set(0);
    this.isPageDropdownOpen.set(false);
    this.pageSearchQuery.set('');
    this.syncQueryPage(pageId);
  }

  onSearchInput(value: string): void {
    this.pageSearchQuery.set(value);
    this.isPageDropdownOpen.set(true);
  }

  onSearchFocus(): void {
    this.isPageDropdownOpen.set(true);
  }

  onSearchBlur(): void {
    setTimeout(() => this.isPageDropdownOpen.set(false), 180);
  }

  refreshPreview(): void {
    this.loadPreview(this.currentPageId());
  }

  toggleStar(): void {
    if (this.isStarring()) return;
    this.isStarring.set(true);
    const wasStarred = this.isStarred();
    const api = wasStarred
      ? this.projectApiService.unstarProject(this.projectIdAsNumber)
      : this.projectApiService.starProject(this.projectIdAsNumber);
    api.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.isStarred.set(!wasStarred);
        this.starCount.update((c) => (wasStarred ? c - 1 : c + 1));
        this.isStarring.set(false);
      },
      error: () => this.isStarring.set(false),
    });
  }

  toggleLike(): void {
    if (this.isLiking()) return;
    this.isLiking.set(true);
    const wasLiked = this.isLiked();
    const api = wasLiked
      ? this.projectApiService.unlikeProject(this.projectIdAsNumber)
      : this.projectApiService.likeProject(this.projectIdAsNumber);
    api.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.isLiked.set(!wasLiked);
        this.likeCount.update((c) => (wasLiked ? c - 1 : c + 1));
        this.isLiking.set(false);
      },
      error: () => this.isLiking.set(false),
    });
  }

  getStageMaxViewportHeight(): number {
    const stageEl = this.stageRef()?.nativeElement;
    if (!stageEl) {
      return Number.POSITIVE_INFINITY;
    }

    const stagePadding = 24;
    return Math.max(120, stageEl.getBoundingClientRect().height - stagePadding * 2);
  }

  getStageMaxViewportWidth(): number {
    const stageEl = this.stageRef()?.nativeElement;
    if (!stageEl) {
      return Number.POSITIVE_INFINITY;
    }

    const stagePadding = 24;
    return Math.max(120, stageEl.getBoundingClientRect().width - stagePadding * 2);
  }

  private generateForCurrentPage(): void {
    const page = this.currentPage();
    if (!page || page.elements.length === 0) {
      this.generatedHtml.set('');
      this.generatedCss.set('');
      return;
    }

    const irPages = buildCanvasIRPages([page], this.projectSlug);
    if (irPages.length === 0) {
      this.generatedHtml.set('');
      this.generatedCss.set('');
      return;
    }

    this.isGenerating.set(true);
    this.error.set(null);

    const request = {
      framework: 'html',
      pages: irPages,
    };

    if (irPages.length > 1) {
      this.converterService
        .generate(request)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (response) => {
            this.generatedHtml.set(response.html);
            this.generatedCss.set(response.css);
            this.isGenerating.set(false);
          },
          error: (err: unknown) => {
            this.error.set(extractApiErrorMessage(err, 'Failed to generate preview.'));
            this.isGenerating.set(false);
          },
        });
    } else {
      this.converterService
        .generate({ framework: 'html', ir: irPages[0].ir })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (response) => {
            this.generatedHtml.set(response.html);
            this.generatedCss.set(response.css);
            this.isGenerating.set(false);
          },
          error: (err: unknown) => {
            this.error.set(extractApiErrorMessage(err, 'Failed to generate preview.'));
            this.isGenerating.set(false);
          },
        });
    }
  }

  private loadPreview(requestedPageId: string | null): void {
    if (!this.projectSlug) {
      this.error.set('Invalid project.');
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);

    this.projectApiService
      .getBySlug(this.projectSlug)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (project) => {
          this.projectIdAsNumber = project.projectId;
          this.projectIdForFork = project.projectId;
          const currentUserId = this.currentUserService.currentUser()?.userId;
          this.isOwner.set(currentUserId !== undefined && project.userId === currentUserId);
          this.isStarred.set(project.isStarredByCurrentUser);
          this.isLiked.set(project.isLikedByCurrentUser ?? false);
          this.starCount.set(project.starCount);
          this.likeCount.set(project.likeCount ?? 0);
          this.canvasPersistenceService
            .loadProjectDesign(this.projectIdAsNumber)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: (design) => {
                this.pages.set(design.pages);

                const preferredPageId =
                  requestedPageId && design.pages.some((page) => page.id === requestedPageId)
                    ? requestedPageId
                    : design.activePageId;

                this.currentPageId.set(preferredPageId ?? design.pages[0]?.id ?? null);
                this.selectedFrameIndex.set(0);
                this.isLoading.set(false);
              },
              error: (error: unknown) => {
                this.error.set(extractApiErrorMessage(error, 'Failed to load preview.'));
                this.isLoading.set(false);
              },
            });
        },
        error: (error: unknown) => {
          this.error.set(extractApiErrorMessage(error, 'Project not found.'));
          this.isLoading.set(false);
        },
      });
  }

  private syncQueryPage(pageId: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { pageId },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
