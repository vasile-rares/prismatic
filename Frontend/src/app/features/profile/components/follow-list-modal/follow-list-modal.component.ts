import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  NgZone,
  OnDestroy,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { UserService, FALLBACK_AVATAR_URL } from '@app/core';
import type { UserFollowItem } from '@app/core';
import gsap from 'gsap';
import { gsapFadeIn } from '@app/shared/utils/gsap-animations.util';

export type FollowListType = 'followers' | 'following';

@Component({
  selector: 'app-follow-list-modal',
  standalone: true,
  imports: [],
  templateUrl: './follow-list-modal.component.html',
  styleUrl: './follow-list-modal.component.css',
})
export class FollowListModalComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly userService = inject(UserService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly zone = inject(NgZone);

  private readonly backdropRef = viewChild<ElementRef<HTMLElement>>('backdrop');
  private readonly modalRef = viewChild<ElementRef<HTMLElement>>('modal');

  readonly username = input.required<string>();
  readonly listType = input.required<FollowListType>();
  readonly closed = output<void>();

  readonly users = signal<UserFollowItem[]>([]);
  readonly isLoading = signal(true);
  readonly isClosing = signal(false);

  readonly title = computed(() => (this.listType() === 'followers' ? 'Followers' : 'Following'));

  readonly fallbackAvatar = FALLBACK_AVATAR_URL;

  ngOnInit(): void {
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    document.body.style.paddingRight = `${scrollbarWidth}px`;
    const request$ =
      this.listType() === 'followers'
        ? this.userService.getFollowers(this.username())
        : this.userService.getFollowing(this.username());

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (list) => {
        this.users.set(list);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  ngAfterViewInit(): void {
    const modal = this.modalRef()?.nativeElement;
    if (!modal) return;
    gsapFadeIn(this.zone, modal);
  }

  ngOnDestroy(): void {
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
  }

  private animateClose(onDone: () => void): void {
    const modal = this.modalRef()?.nativeElement;
    const backdrop = this.backdropRef()?.nativeElement;
    if (!modal && !backdrop) {
      onDone();
      return;
    }
    this.zone.runOutsideAngular(() => {
      const tl = gsap.timeline({ onComplete: () => this.zone.run(onDone) });
      if (modal) {
        tl.to(
          modal,
          {
            opacity: 0,
            scale: 0.92,
            y: 12,
            duration: 0.17,
            ease: 'power2.in',
            transformOrigin: 'center center',
          },
          0,
        );
      }
      if (backdrop) {
        tl.to(backdrop, { opacity: 0, duration: 0.17, ease: 'power2.in' }, 0);
      }
    });
  }

  close(): void {
    if (this.isClosing()) return;
    this.isClosing.set(true);
    this.animateClose(() => this.closed.emit());
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  navigateToProfile(username: string): void {
    void this.router.navigate(['/', username]);
    this.closed.emit();
  }

  getAvatarUrl(user: UserFollowItem): string {
    return user.profilePictureUrl ?? this.fallbackAvatar;
  }
}
