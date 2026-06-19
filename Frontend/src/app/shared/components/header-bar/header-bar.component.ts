import {
  afterNextRender,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  Injector,
  NgZone,
  OnInit,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { gsap } from 'gsap';
import { ActivatedRoute, NavigationEnd, Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  AuthService,
  ProjectService,
  UserService,
  extractApiErrorMessage,
  FALLBACK_AVATAR_URL,
} from '@app/core';
import { UserMenuDropdownComponent } from './user-menu-dropdown/user-menu-dropdown.component';
import { filter, map, distinctUntilChanged } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { ProjectSearchComponent } from './project-search/project-search.component';
import { ProjectMenuComponent } from './project-menu/project-menu.component';
import { CreateProjectDialogComponent } from '../create-project-dialog/create-project-dialog.component';

interface HeaderUserProfile {
  displayName: string;
  username: string;
  email: string;
  profilePictureUrl: string | null;
}

@Component({
  selector: 'app-header-bar',
  standalone: true,
  imports: [
    RouterLink,
    UserMenuDropdownComponent,
    ProjectSearchComponent,
    ProjectMenuComponent,
    CreateProjectDialogComponent,
  ],
  templateUrl: './header-bar.component.html',
  styleUrl: './header-bar.component.css',
})
export class HeaderBarComponent implements OnInit {
  readonly appearance = input<'default' | 'canvas' | 'preview'>('default');
  readonly runPreviewClicked = output<void>();

  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly projectService = inject(ProjectService);
  private readonly currentUser = inject(UserService);
  private readonly injector = inject(Injector);
  private readonly zone = inject(NgZone);
  private readonly fallbackAvatarUrl = FALLBACK_AVATAR_URL;
  private readonly mobileBreakpoint = 720;

  profilePictureUrl: string | null = null;
  displayName = '';
  username = '';
  email = '';
  currentProjectId: number | null = null;
  currentProjectSlug: string | null = null;
  currentProjectName: string | null = null;
  currentProjectIsPublic: boolean | null = null;
  isProjectContext = false;
  isUserMenuOpen = false;
  isMobileMenuOpen = false;
  showMobileMenuPanel = false;
  isMobileAccountMenuOpen = false;
  showMobileAccountMenu = false;

  isCreateDialogOpen = signal(false);

  readonly userMenuContainer = viewChild<ElementRef<HTMLElement>>('userMenuContainer');

  readonly userMenuIconEl = viewChild<ElementRef<HTMLElement>>('userMenuIconEl');

  readonly userMenuDropdownEl = viewChild('userMenuDropdownEl', { read: ElementRef });

  readonly mobileMenuTriggerContainer = viewChild<ElementRef<HTMLElement>>(
    'mobileMenuTriggerContainer',
  );

  readonly mobileMenuPanelEl = viewChild<ElementRef<HTMLElement>>('mobileMenuPanelEl');

  readonly mobileAccountMenuEl = viewChild<ElementRef<HTMLElement>>('mobileAccountMenuEl');

  readonly mobileAccountChevronEl = viewChild<ElementRef<HTMLElement>>('mobileAccountChevronEl');

  readonly mobileMenuLineTopEl = viewChild<ElementRef<HTMLElement>>('mobileMenuLineTopEl');

  readonly mobileMenuLineMiddleEl = viewChild<ElementRef<HTMLElement>>('mobileMenuLineMiddleEl');

  readonly mobileMenuLineBottomEl = viewChild<ElementRef<HTMLElement>>('mobileMenuLineBottomEl');

  readonly projectSearch = viewChild<ProjectSearchComponent>('projectSearch');

  readonly projectMenu = viewChild<ProjectMenuComponent>('projectMenu');

  readonly projectMenuContainer = viewChild<ElementRef<HTMLElement>>('projectMenuContainer');

  private readonly syncCurrentUserState = effect(() => {
    const user = this.currentUser.currentUser();

    if (user === undefined) {
      return;
    }

    if (user) {
      this.applyProfile({
        displayName: user.displayName,
        username: user.username,
        email: user.email,
        profilePictureUrl: user.profilePictureUrl,
      });
      return;
    }

    this.resetIdentity();
  });

  get avatarUrl(): string {
    return this.profilePictureUrl?.trim() || this.fallbackAvatarUrl;
  }

  onAvatarError(event: Event): void {
    (event.target as HTMLImageElement).src = this.fallbackAvatarUrl;
  }

  ngOnInit(): void {
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .pipe(
        map(() => this.getProjectSlugFromRoute()),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((slug) => {
        this.closeUserMenu();
        this.closeMobileMenu(true);
        this.syncRouteContext(slug);
      });

    this.syncRouteContext(this.getProjectSlugFromRoute());

    afterNextRender(() => this.setMobileMenuTriggerClosedState(), { injector: this.injector });

    this.currentUser
      .loadCurrentUser()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: () => this.resetIdentity(),
      });
  }

  // Project menu delegates

  toggleProjectMenu(): void {
    this.projectMenu()?.toggle();
  }

  onProjectRenamed(name: string): void {
    this.currentProjectName = name;
  }

  onProjectVisibilityChanged(isPublic: boolean): void {
    this.currentProjectIsPublic = isPublic;
  }

  // Create project dialog

  navigateToNewProject(): void {
    this.openCreateProjectDialog();
  }

  openCreateProjectDialog(): void {
    this.isCreateDialogOpen.set(true);
  }

  // User menu

  onLogout() {
    this.isUserMenuOpen = false;
    this.closeMobileMenu(true);
    this.currentUser.invalidateCurrentUser();
    this.authService.logout().subscribe();
    void this.router.navigate(['/login'], { replaceUrl: true });
  }

  toggleUserMenu(): void {
    this.closeMobileMenu(true);
    this.isUserMenuOpen = !this.isUserMenuOpen;
    const icon = this.userMenuIconEl()?.nativeElement;
    if (icon) {
      this.zone.runOutsideAngular(() => {
        gsap.killTweensOf(icon);
        gsap.to(icon, {
          rotate: this.isUserMenuOpen ? 180 : 0,
          duration: 0.22,
          ease: 'power2.out',
        });
      });
    }
  }

  closeUserMenu(): void {
    this.isUserMenuOpen = false;
    const icon = this.userMenuIconEl()?.nativeElement;
    if (icon) {
      this.zone.runOutsideAngular(() => {
        gsap.killTweensOf(icon);
        gsap.to(icon, { rotate: 0, duration: 0.18, ease: 'power2.out' });
      });
    }
  }

  toggleMobileMenu(): void {
    if (!this.isMobileViewport()) return;

    if (this.isMobileMenuOpen) {
      this.closeMobileMenu();
      return;
    }

    this.closeUserMenu();
    this.isMobileMenuOpen = true;
    this.showMobileMenuPanel = true;
    this.animateMobileTriggerToOpen();
    afterNextRender(() => this.animateMobileMenuOpen(), { injector: this.injector });
  }

  closeMobileMenu(immediate = false): void {
    if (!this.showMobileMenuPanel) {
      this.isMobileMenuOpen = false;
      this.setMobileMenuTriggerClosedState();
      this.resetMobileAccountMenuState();
      return;
    }

    this.isMobileMenuOpen = false;

    const panel = this.mobileMenuPanelEl()?.nativeElement;
    if (immediate || !panel) {
      this.setMobileMenuTriggerClosedState();
      this.showMobileMenuPanel = false;
      this.resetMobileAccountMenuState();
      return;
    }

    this.animateMobileTriggerToClosed();

    this.zone.runOutsideAngular(() => {
      gsap.killTweensOf(panel);
      gsap.to(panel, {
        opacity: 0,
        y: -14,
        scale: 0.98,
        duration: 0.18,
        ease: 'power2.in',
        transformOrigin: 'top center',
        onComplete: () => {
          this.zone.run(() => {
            this.showMobileMenuPanel = false;
            this.resetMobileAccountMenuState();
          });
        },
      });
    });
  }

  toggleMobileAccountMenu(): void {
    if (this.isMobileAccountMenuOpen) {
      this.closeMobileAccountMenu();
      return;
    }

    this.isMobileAccountMenuOpen = true;
    this.showMobileAccountMenu = true;
    afterNextRender(() => this.animateMobileAccountMenuOpen(), { injector: this.injector });
  }

  closeMobileMenuAndNavigate(): void {
    this.closeMobileMenu();
  }

  private animateMobileTriggerToOpen(): void {
    const lines = this.getMobileMenuTriggerLines();
    if (!lines) return;

    const [top, middle, bottom] = lines;

    this.zone.runOutsideAngular(() => {
      gsap.killTweensOf([top, middle, bottom]);
      gsap.to(top, { y: 6, rotate: 45, duration: 0.22, ease: 'power2.out' });
      gsap.to(middle, { opacity: 0, scaleX: 0.45, duration: 0.18, ease: 'power2.out' });
      gsap.to(bottom, { y: -6, rotate: -45, duration: 0.22, ease: 'power2.out' });
    });
  }

  private animateMobileTriggerToClosed(): void {
    const lines = this.getMobileMenuTriggerLines();
    if (!lines) return;

    const [top, middle, bottom] = lines;

    this.zone.runOutsideAngular(() => {
      gsap.killTweensOf([top, middle, bottom]);
      gsap.to(top, { y: 0, rotate: 0, duration: 0.18, ease: 'power2.out' });
      gsap.to(middle, { opacity: 1, scaleX: 1, duration: 0.18, ease: 'power2.out' });
      gsap.to(bottom, { y: 0, rotate: 0, duration: 0.18, ease: 'power2.out' });
    });
  }

  private setMobileMenuTriggerClosedState(): void {
    const lines = this.getMobileMenuTriggerLines();
    if (!lines) return;

    const [top, middle, bottom] = lines;

    this.zone.runOutsideAngular(() => {
      gsap.killTweensOf([top, middle, bottom]);
      gsap.set(top, { y: 0, rotate: 0 });
      gsap.set(middle, { opacity: 1, scaleX: 1 });
      gsap.set(bottom, { y: 0, rotate: 0 });
    });
  }

  private animateMobileMenuOpen(): void {
    const panel = this.mobileMenuPanelEl()?.nativeElement;
    if (!panel) return;

    const items = panel.querySelectorAll<HTMLElement>('.header-mobile-menu__anim-item');

    this.zone.runOutsideAngular(() => {
      gsap.killTweensOf(panel);
      gsap.killTweensOf(items);
      gsap.set(items, { opacity: 0, y: 10 });
      gsap.fromTo(
        panel,
        { opacity: 0, y: -14, scale: 0.98, transformOrigin: 'top center' },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.24,
          ease: 'back.out(1.55)',
          clearProps: 'transform',
        },
      );
      gsap.to(items, {
        opacity: 1,
        y: 0,
        duration: 0.22,
        stagger: 0.04,
        ease: 'power2.out',
        delay: 0.04,
      });
    });
  }

  private animateMobileAccountMenuOpen(): void {
    const menu = this.mobileAccountMenuEl()?.nativeElement;
    const chevron = this.mobileAccountChevronEl()?.nativeElement;
    if (!menu) return;

    this.zone.runOutsideAngular(() => {
      gsap.killTweensOf(menu);
      if (chevron) {
        gsap.killTweensOf(chevron);
        gsap.to(chevron, { rotate: 180, duration: 0.22, ease: 'power2.out' });
      }

      gsap.fromTo(
        menu,
        { height: 0, opacity: 0, y: -8, overflow: 'hidden' },
        {
          height: 'auto',
          opacity: 1,
          y: 0,
          duration: 0.22,
          ease: 'power2.out',
          onComplete: () => {
            gsap.set(menu, { clearProps: 'height,overflow' });
          },
        },
      );
    });
  }

  private closeMobileAccountMenu(immediate = false): void {
    this.isMobileAccountMenuOpen = false;

    const menu = this.mobileAccountMenuEl()?.nativeElement;
    const chevron = this.mobileAccountChevronEl()?.nativeElement;

    if (immediate || !menu) {
      this.showMobileAccountMenu = false;
      if (chevron) {
        gsap.set(chevron, { clearProps: 'transform' });
      }
      return;
    }

    this.zone.runOutsideAngular(() => {
      gsap.killTweensOf(menu);
      if (chevron) {
        gsap.killTweensOf(chevron);
        gsap.to(chevron, { rotate: 0, duration: 0.18, ease: 'power2.out' });
      }

      gsap.to(menu, {
        height: 0,
        opacity: 0,
        y: -8,
        duration: 0.18,
        ease: 'power2.in',
        overflow: 'hidden',
        onComplete: () => {
          this.zone.run(() => {
            this.showMobileAccountMenu = false;
          });
        },
      });
    });
  }

  private resetMobileAccountMenuState(): void {
    this.isMobileAccountMenuOpen = false;
    this.showMobileAccountMenu = false;
  }

  private getMobileMenuTriggerLines(): [HTMLElement, HTMLElement, HTMLElement] | null {
    const top = this.mobileMenuLineTopEl()?.nativeElement;
    const middle = this.mobileMenuLineMiddleEl()?.nativeElement;
    const bottom = this.mobileMenuLineBottomEl()?.nativeElement;

    if (!top || !middle || !bottom) {
      return null;
    }

    return [top, middle, bottom];
  }

  private isMobileViewport(): boolean {
    return typeof window !== 'undefined' && window.innerWidth <= this.mobileBreakpoint;
  }

  // Private

  private applyProfile(profile: HeaderUserProfile): void {
    this.displayName = profile.displayName;
    this.username = profile.username;
    this.email = profile.email;
    this.profilePictureUrl = profile.profilePictureUrl;
  }

  private resetIdentity(): void {
    this.displayName = '';
    this.username = '';
    this.email = '';
    this.profilePictureUrl = null;
  }

  private syncRouteContext(slug: string | null) {
    if (slug === null) {
      this.currentProjectId = null;
      this.currentProjectSlug = null;
      this.isProjectContext = false;
      this.currentProjectName = null;
      this.currentProjectIsPublic = null;
      return;
    }

    this.currentProjectSlug = slug;
    this.isProjectContext = true;
    this.currentProjectName = null;
    this.currentProjectIsPublic = null;

    this.projectService
      .getBySlug(slug)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (project) => {
          this.currentProjectId = project.projectId;
          this.currentProjectName = project.name;
          this.currentProjectIsPublic = project.isPublic;
        },
        error: () => {
          this.currentProjectId = null;
          this.currentProjectName = 'Unknown project';
          this.currentProjectIsPublic = null;
        },
      });
  }

  private getProjectSlugFromRoute(): string | null {
    let route: ActivatedRoute | null = this.activatedRoute;
    while (route?.firstChild) {
      route = route.firstChild;
    }

    return route?.snapshot.paramMap.get('slug') ?? null;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as Node | null;
    if (!target) return;

    this.projectMenu()?.closeIfClickedOutside(target, this.projectMenuContainer()?.nativeElement);

    if (this.isUserMenuOpen) {
      const triggerEl = this.userMenuContainer()?.nativeElement;
      const panelEl = this.userMenuDropdownEl()?.nativeElement;
      if (!(triggerEl && triggerEl.contains(target)) && !(panelEl && panelEl.contains(target))) {
        this.closeUserMenu();
      }
    }

    if (this.isMobileMenuOpen) {
      const triggerEl = this.mobileMenuTriggerContainer()?.nativeElement;
      const panelEl = this.mobileMenuPanelEl()?.nativeElement;
      if (!(triggerEl && triggerEl.contains(target)) && !(panelEl && panelEl.contains(target))) {
        this.closeMobileMenu();
      }
    }

    this.projectSearch()?.closeIfClickedOutside(target);
  }

  @HostListener('window:resize')
  onResize(): void {
    if (this.isMobileViewport()) {
      this.closeUserMenu();
      return;
    }

    this.closeMobileMenu(true);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.projectMenu()?.close();
    this.closeUserMenu();
    this.closeMobileMenu();
    this.projectSearch()?.closeDropdown();
  }
}
