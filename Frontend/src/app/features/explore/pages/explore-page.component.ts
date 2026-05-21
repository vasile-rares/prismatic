import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  NgZone,
  OnInit,
  WritableSignal,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);
import { ExploreService, ProjectService, UserService, extractApiErrorMessage } from '@app/core';
import type { ExploreProjectItem, ExploreUserItem } from '@app/core';

@Component({
  selector: 'app-explore-page',
  standalone: true,
  imports: [],
  templateUrl: './explore-page.component.html',
  styleUrl: './explore-page.component.css',
})
export class ExplorePage implements OnInit {
  private readonly exploreService = inject(ExploreService);
  private readonly projectService = inject(ProjectService);
  private readonly userService = inject(UserService);
  private readonly currentUserService = inject(UserService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly el = inject(ElementRef);
  private readonly zone = inject(NgZone);
  private lenis: Lenis | null = null;

  private readonly lenisTickFn = (time: number) => this.lenis?.raf(time * 1000);

  readonly trendingProjects = signal<ExploreProjectItem[]>([]);
  readonly recommendedProjects = signal<ExploreProjectItem[]>([]);
  readonly isRecommendedPersonalized = signal(false);
  readonly suggestedPeople = signal<ExploreUserItem[]>([]);

  readonly isLoading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly isAuthenticated = computed(() => this.currentUserService.currentUser() != null);

  readonly strip1CanPrev = signal(false);
  readonly strip1CanNext = signal(false);
  readonly strip2CanPrev = signal(false);
  readonly strip2CanNext = signal(false);
  readonly strip3CanPrev = signal(false);
  readonly strip3CanNext = signal(false);

  ngOnInit(): void {
    this.initSmoothScroll();
    forkJoin({
      trending: this.exploreService.getTrending(),
      recommended: this.exploreService.getRecommended(),
      people: this.exploreService.getSuggestedPeople(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ trending, recommended, people }) => {
          this.trendingProjects.set(trending);
          this.recommendedProjects.set(recommended.projects);
          this.isRecommendedPersonalized.set(recommended.isPersonalized);
          this.suggestedPeople.set(people);
          this.isLoading.set(false);
          // afterNextRender garanteaza ca Angular a terminat de randat cardurile in DOM
          // inainte de a atasa animatiile — fix pentru race condition cu setTimeout(0)
          afterNextRender(
            () => {
              this.initScrollAnimations();
              this.initCardHoverEffects();
              const strips = (this.el.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
                '.xpl-scroll',
              );
              if (strips[0])
                this.initStripScrollState(strips[0], this.strip1CanPrev, this.strip1CanNext);
              if (strips[1])
                this.initStripScrollState(strips[1], this.strip2CanPrev, this.strip2CanNext);
              if (strips[2])
                this.initStripScrollState(strips[2], this.strip3CanPrev, this.strip3CanNext);
            },
            { injector: this.injector },
          );
        },
        error: (err: unknown) => {
          this.errorMessage.set(extractApiErrorMessage(err, 'Failed to load explore content.'));
          this.isLoading.set(false);
        },
      });
  }

  toggleStar(project: ExploreProjectItem): void {
    if (!this.isAuthenticated()) {
      this.router.navigate(['/login']);
      return;
    }

    const wasStarred = project.isStarredByCurrentUser;
    const updatedProject: ExploreProjectItem = {
      ...project,
      isStarredByCurrentUser: !wasStarred,
      starCount: wasStarred ? project.starCount - 1 : project.starCount + 1,
    };

    this.trendingProjects.update((list) =>
      list.map((p) => (p.projectId === project.projectId ? updatedProject : p)),
    );
    this.recommendedProjects.update((list) =>
      list.map((p) => (p.projectId === project.projectId ? updatedProject : p)),
    );

    const request$ = wasStarred
      ? this.projectService.unstarProject(project.projectId)
      : this.projectService.starProject(project.projectId);

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      error: () => {
        // Rollback
        this.trendingProjects.update((list) =>
          list.map((p) => (p.projectId === project.projectId ? project : p)),
        );
        this.recommendedProjects.update((list) =>
          list.map((p) => (p.projectId === project.projectId ? project : p)),
        );
      },
    });
  }

  toggleFollow(person: ExploreUserItem): void {
    if (!this.isAuthenticated()) {
      this.router.navigate(['/login']);
      return;
    }

    const wasFollowing = person.isFollowedByCurrentUser;
    const updated: ExploreUserItem = {
      ...person,
      isFollowedByCurrentUser: !wasFollowing,
      followerCount: wasFollowing ? person.followerCount - 1 : person.followerCount + 1,
    };

    this.suggestedPeople.update((list) =>
      list.map((u) => (u.userId === person.userId ? updated : u)),
    );

    const request$ = wasFollowing
      ? this.userService.unfollowUser(person.username)
      : this.userService.followUser(person.username);

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      error: () => {
        this.suggestedPeople.update((list) =>
          list.map((u) => (u.userId === person.userId ? person : u)),
        );
      },
    });
  }

  navigateToProject(project: ExploreProjectItem, event: MouseEvent): void {
    event.preventDefault();
    this.exploreService.recordView(project.projectId);
    this.router.navigate(['/project', project.slug, 'preview'], { state: { fromExplore: true } });
  }

  navigateToProfile(username: string): void {
    this.router.navigate(['/', username]);
  }

  scrollStrip(el: HTMLElement, dir: 1 | -1): void {
    el.scrollBy({ left: dir * 340, behavior: 'smooth' });
  }

  private initStripScrollState(
    el: HTMLElement,
    canPrev: WritableSignal<boolean>,
    canNext: WritableSignal<boolean>,
  ): void {
    const update = () => {
      canPrev.set(el.scrollLeft > 2);
      canNext.set(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
  }

  private initSmoothScroll(): void {
    if (typeof window === 'undefined') return;
    this.zone.runOutsideAngular(() => {
      // Zone.js patches EventTarget.prototype.addEventListener, making wheel listeners
      // passive so Lenis can't call preventDefault(). Fix: temporarily shadow
      // window.addEventListener on the window object itself with the pre-patch native
      // function. Lenis registers all its listeners synchronously in the constructor,
      // so they get { passive: false }. After construction we delete the own property
      // and zone.js's prototype patch takes over again for everything else.
      const nativeAdd = (window as any)['__zone_symbol__addEventListener'] as
        | typeof window.addEventListener
        | undefined;
      const nativeRemove = (window as any)['__zone_symbol__removeEventListener'] as
        | typeof window.removeEventListener
        | undefined;

      if (nativeAdd && nativeRemove) {
        Object.defineProperty(window, 'addEventListener', {
          value: nativeAdd,
          configurable: true,
          writable: true,
        });
        Object.defineProperty(window, 'removeEventListener', {
          value: nativeRemove,
          configurable: true,
          writable: true,
        });
      }

      this.lenis = new Lenis({ lerp: 0.07, smoothWheel: true, syncTouch: false });

      if (nativeAdd) {
        delete (window as any).addEventListener;
        delete (window as any).removeEventListener;
      }

      gsap.ticker.add(this.lenisTickFn);
      gsap.ticker.lagSmoothing(0);

      // Keep ScrollTrigger in sync with Lenis's scroll position
      this.lenis.on('scroll', () => ScrollTrigger.update());

      this.destroyRef.onDestroy(() => {
        gsap.ticker.remove(this.lenisTickFn);
        this.lenis?.destroy();
        ScrollTrigger.getAll().forEach((t) => t.kill());
      });
    });
  }

  private initCardHoverEffects(): void {
    this.zone.runOutsideAngular(() => {
      const host = this.el.nativeElement as HTMLElement;
      const cards = host.querySelectorAll<HTMLElement>('.pcard, .ucard');

      // shadowRest  = default: gri vizibil, roz invizibil pe aceeasi pozitie
      // shadowMid   = crossfade: gri disparut, roz vizibil pe aceeasi pozitie
      // shadowDrain = roz coboara spre card si dispare (se scurge in border) — mouseenter faza 2
      // shadowSmoke = roz se extinde in exterior (blur+spread mari, alpha→0) ca un fum — mouseleave faza 2
      const shadowRest =
        'rgba(152,152,152,0.14) 0px -13.49px 19.83px -4.05px, rgba(255,133,208,0.01) 0px -13.49px 19.83px -4.05px';
      const shadowMid =
        'rgba(152,152,152,0.0)  0px -13.49px 19.83px -4.05px, rgba(255,133,208,0.45) 0px -15.49px 19.83px -4.05px';
      const shadowDrain =
        'rgba(152,152,152,0.0)  0px -13.49px 19.83px -4.05px, rgba(255,133,208,0.01) 0px 0px 8px 0px';
      const shadowSmoke =
        'rgba(152,152,152,0.14) 0px -13.49px 19.83px -4.05px, rgba(255,133,208,0.0) 0px -13.49px 20px 8px';

      const inset = 'inset 0px 4.7px 7.3px -1.3px #fdc8e98e';

      cards.forEach((card) => {
        const isUcard = card.classList.contains('ucard');
        const rest = isUcard ? `${shadowRest}, ${inset}` : shadowRest;
        const mid = isUcard ? `${shadowMid}, ${inset}` : shadowMid;
        const drain = isUcard ? `${shadowDrain}, ${inset}` : shadowDrain;
        const smoke = isUcard ? `${shadowSmoke}, ${inset}` : shadowSmoke;

        let tl: gsap.core.Timeline | null = null;

        const stats = card.querySelector<HTMLElement>('.pcard-stats');

        // Masoara inaltimea naturala a stats o singura data, fara snap la final de animatie
        let statsH = 0;
        if (stats) {
          gsap.set(stats, {
            height: 'auto',
            paddingTop: '0.25rem',
            paddingBottom: '0.25rem',
            visibility: 'hidden',
            opacity: 0,
          });
          statsH = stats.offsetHeight;
          gsap.set(stats, {
            height: 0,
            paddingTop: 0,
            paddingBottom: 0,
            visibility: 'visible',
            opacity: 0,
          });
        }

        card.addEventListener('mouseenter', () => {
          tl?.kill();
          tl = gsap.timeline();

          tl.to(card, { scale: 1.03, y: -5, duration: 1, ease: 'power2.out' }, 0)
            // Faza 1: crossfade gri→roz (0 → 0.22s)
            .fromTo(
              card,
              { boxShadow: rest },
              { boxShadow: mid, duration: 0.22, ease: 'power2.in' },
              0,
            )
            // Faza 2: roz coboara spre card si se scurge in border (0.22 → 0.38s)
            .to(card, { boxShadow: drain, duration: 0.16, ease: 'power2.out' }, 0.22)
            .to(card, { '--pink-reveal': '0%', duration: 0.16, ease: 'power2.out' }, 0.22);

          if (stats && statsH) {
            tl.to(
              stats,
              {
                height: statsH,
                paddingTop: '0.25rem',
                paddingBottom: '0.25rem',
                opacity: 1,
                duration: 0.22,
                ease: 'power2.out',
              },
              0.1,
            );
          }
        });

        card.addEventListener('mouseleave', () => {
          tl?.kill();
          tl = gsap.timeline();

          // Faza 1: borderul dispare bottom→top + umbra roza reapare la card (0 → 0.16s)
          tl.to(card, { '--pink-reveal': '100%', duration: 0.16, ease: 'power2.in' }, 0)
            .to(card, { boxShadow: mid, duration: 0.16, ease: 'power2.out' }, 0)
            // Faza 2: roz se extinde ca fum si dispare, gri revine simultan, card coboara (0.16 → 0.44s)
            .to(card, { scale: 1, boxShadow: smoke, duration: 0.16, ease: 'power2.out' }, 0.16);

          if (stats && statsH) {
            tl.to(
              stats,
              {
                height: 0,
                paddingTop: 0,
                paddingBottom: 0,
                opacity: 0,
                duration: 0.14,
                ease: 'power2.in',
              },
              0,
            );
          }
        });
      });
    });
  }

  private initScrollAnimations(): void {
    this.zone.runOutsideAngular(() => {
      const host = this.el.nativeElement as HTMLElement;
      const headers = host.querySelectorAll<HTMLElement>('.xpl-section-head');
      const strips = host.querySelectorAll<HTMLElement>('.xpl-strip');

      if (!headers.length && !strips.length) return;

      // Hide ALL elements synchronously before any stagger delay fires.
      // fromTo applies the `from` state only when each element's delay expires,
      // leaving staggered elements briefly at opacity:1 — hence the semi-transparent flash.
      gsap.set(headers, { y: 20, opacity: 0, filter: 'blur(10px)' });
      strips.forEach((strip) =>
        gsap.set(strip.querySelectorAll('.pcard, .ucard'), {
          y: 20,
          opacity: 0,
          filter: 'blur(10px)',
        }),
      );

      const stConfig = {
        scroller: window,
        start: 'top 92%',
        end: 'bottom 8%',
        toggleActions: 'play reverse play reverse' as const,
        fastScrollEnd: true,
        preventOverlaps: true,
      };

      headers.forEach((el) => {
        gsap.to(el, {
          y: 0,
          opacity: 1,
          filter: 'blur(0px)',
          duration: 1,
          ease: 'power2.out',
          scrollTrigger: { trigger: el, ...stConfig },
        });
      });

      strips.forEach((strip) => {
        const cards = strip.querySelectorAll<HTMLElement>('.pcard, .ucard');
        if (!cards.length) return;
        gsap.to(cards, {
          y: 0,
          opacity: 1,
          filter: 'blur(0px)',
          duration: 0.75,
          ease: 'power2.out',
          stagger: 0.1,
          scrollTrigger: { trigger: strip, ...stConfig },
        });
      });

      // Do NOT call ScrollTrigger.refresh() here — it re-evaluates all triggers
      // mid-animation causing the freeze. setTimeout(0) in ngOnInit already
      // guarantees the DOM is fully rendered before this runs.
      // Instead, defer refresh to the next animation frame so GSAP finishes
      // its internal setup first — this fires triggers for elements already in view.
      requestAnimationFrame(() => ScrollTrigger.refresh());
    });
  }
}
