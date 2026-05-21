import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  NgZone,
  OnInit,
  afterNextRender,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
gsap.registerPlugin(ScrollTrigger);
import { ProjectService, extractApiErrorMessage } from '@app/core';
import type { ProjectResponse } from '@app/core';
import type { ProjectCardViewModel } from '@app/features/profile/components/project-card/project-card.component';

@Component({
  selector: 'app-starred-projects-page',
  standalone: true,
  imports: [],
  templateUrl: './starred-projects-page.component.html',
  styleUrl: './starred-projects-page.component.css',
})
export class StarredProjectsPage implements OnInit {
  private readonly projectService = inject(ProjectService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly zone = inject(NgZone);
  private readonly el = inject(ElementRef);

  private readonly projectsGridRef = viewChild<ElementRef<HTMLElement>>('projectsGrid');
  private projectsAnimated = false;
  private countTagAnimated = false;
  private readonly _animateCards = effect(() => {
    if (this.projects().length > 0 && !this.projectsAnimated) {
      this.projectsAnimated = true;
      afterNextRender(
        () => {
          this.animateProjectCards();
        },
        { injector: this.injector },
      );
    }
  });
  private readonly _animateCountTag = effect(() => {
    const loading = this.isLoading();
    const error = this.errorMessage();
    if (!loading && error === null && !this.countTagAnimated) {
      this.countTagAnimated = true;
      afterNextRender(
        () => {
          this.zone.runOutsideAngular(() => {
            const host = this.el.nativeElement as HTMLElement;
            const countTag = host.querySelector<HTMLElement>('.strs-count-tag');
            if (!countTag) return;
            gsap.fromTo(
              countTag,
              { opacity: 0, y: 20, filter: 'blur(10px)' },
              { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.7, ease: 'power3.out' },
            );
          });
        },
        { injector: this.injector },
      );
    }
  });

  readonly projects = signal<ProjectCardViewModel[]>([]);
  readonly isLoading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => {
      ScrollTrigger.getAll().forEach((t) => t.kill());
    });

    afterNextRender(
      () => {
        this.animateHero();
      },
      { injector: this.injector },
    );

    this.projectService
      .getMyStars()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          this.projects.set(list.map((p) => this.mapToCard(p)));
          this.isLoading.set(false);
        },
        error: (err: unknown) => {
          this.errorMessage.set(extractApiErrorMessage(err, 'Failed to load starred projects.'));
          this.isLoading.set(false);
        },
      });
  }

  navigateToProject(project: ProjectCardViewModel): void {
    void this.router.navigate(['/project', project.slug, 'preview']);
  }

  toggleStar(project: ProjectCardViewModel, event: MouseEvent): void {
    event.stopPropagation();
    const wasStarred = project.isStarredByCurrentUser;

    this.projects.update((list) =>
      list.map((p) =>
        p.id === project.id
          ? {
              ...p,
              isStarredByCurrentUser: !wasStarred,
              starCount: wasStarred ? p.starCount - 1 : p.starCount + 1,
            }
          : p,
      ),
    );

    const request$ = wasStarred
      ? this.projectService.unstarProject(project.id)
      : this.projectService.starProject(project.id);

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        if (wasStarred) {
          this.projects.update((list) => list.filter((p) => p.id !== project.id));
        }
      },
      error: () => {
        this.projects.update((list) =>
          list.map((p) =>
            p.id === project.id
              ? {
                  ...p,
                  isStarredByCurrentUser: wasStarred,
                  starCount: wasStarred ? p.starCount + 1 : p.starCount - 1,
                }
              : p,
          ),
        );
      },
    });
  }

  toggleLike(project: ProjectCardViewModel, event: MouseEvent): void {
    event.stopPropagation();
    const wasLiked = project.isLikedByCurrentUser;

    this.projects.update((list) =>
      list.map((p) =>
        p.id === project.id
          ? {
              ...p,
              isLikedByCurrentUser: !wasLiked,
              likeCount: wasLiked ? p.likeCount - 1 : p.likeCount + 1,
            }
          : p,
      ),
    );

    const request$ = wasLiked
      ? this.projectService.unlikeProject(project.id)
      : this.projectService.likeProject(project.id);

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      error: () => {
        this.projects.update((list) =>
          list.map((p) =>
            p.id === project.id
              ? {
                  ...p,
                  isLikedByCurrentUser: wasLiked,
                  likeCount: wasLiked ? p.likeCount + 1 : p.likeCount - 1,
                }
              : p,
          ),
        );
      },
    });
  }

  private mapToCard(project: ProjectResponse): ProjectCardViewModel {
    return {
      id: project.projectId,
      slug: project.slug,
      name: project.name,
      isPublic: project.isPublic,
      createdAt: new Date(project.createdAt),
      lastEdited: new Date(project.updatedAt),
      thumbnailDataUrl: project.thumbnailDataUrl ?? null,
      starCount: project.starCount ?? 0,
      viewCount: project.viewCount ?? 0,
      isStarredByCurrentUser: project.isStarredByCurrentUser ?? true,
      likeCount: project.likeCount ?? 0,
      isLikedByCurrentUser: project.isLikedByCurrentUser ?? false,
      forkedFromProjectId: project.forkedFromProjectId ?? null,
      forkedFromOwnerUsername: project.forkedFromOwnerUsername ?? null,
    };
  }

  private animateHero(): void {
    this.zone.runOutsideAngular(() => {
      const host = this.el.nativeElement as HTMLElement;
      const title = host.querySelector<HTMLElement>('.strs-title');
      const subtitle = host.querySelector<HTMLElement>('.strs-subtitle');

      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

      if (title) {
        gsap.set(title, { opacity: 0, y: 20, filter: 'blur(10px)' });
        tl.to(title, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.7 }, 0);
      }
      if (subtitle) {
        gsap.set(subtitle, { opacity: 0, y: 12, filter: 'blur(6px)' });
        tl.to(subtitle, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.6 }, 0.2);
      }
    });
  }

  private animateProjectCards(): void {
    this.zone.runOutsideAngular(() => {
      const grid = this.projectsGridRef()?.nativeElement;
      if (!grid) return;
      const cards = grid.querySelectorAll<HTMLElement>('.prj-card');
      if (!cards.length) return;

      gsap.set(cards, { opacity: 0, y: 22, filter: 'blur(8px)' });
      gsap.to(cards, {
        opacity: 1,
        y: 0,
        filter: 'blur(0px)',
        duration: 0.6,
        stagger: 0.07,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: grid,
          start: 'top 92%',
          toggleActions: 'play none none none',
        },
      });
      requestAnimationFrame(() => ScrollTrigger.refresh());
    });
  }
}
