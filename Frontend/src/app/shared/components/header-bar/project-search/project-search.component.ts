import { Component, ElementRef, effect, inject, signal, viewChild } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { UserService } from '@app/core';
import type { UserSearchResult } from '@app/core';
import { gsap } from 'gsap';
import { Subject, of, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-project-search',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './project-search.component.html',
  styleUrl: './project-search.component.css',
})
export class ProjectSearchComponent {
  private readonly router = inject(Router);
  private readonly userService = inject(UserService);
  private readonly searchSubject = new Subject<string>();

  readonly searchQuery = signal('');
  readonly searchResults = signal<UserSearchResult[]>([]);
  readonly isSearchOpen = signal(false);
  readonly isSearchLoading = signal(false);
  readonly isDropdownMounted = signal(false);
  readonly isExpanded = signal(false);
  readonly isExpandWrapMounted = signal(false);

  readonly searchContainer = viewChild<ElementRef<HTMLElement>>('searchContainer');
  readonly dropdownEl = viewChild<ElementRef<HTMLElement>>('dropdownEl');
  readonly pillEl = viewChild<ElementRef<HTMLElement>>('pillEl');
  readonly inputEl = viewChild<ElementRef<HTMLInputElement>>('inputEl');

  constructor() {
    effect(() => {
      const expanded = this.isExpanded();
      if (expanded) {
        this.isExpandWrapMounted.set(true);
        queueMicrotask(() => {
          const pill = this.pillEl()?.nativeElement;
          if (!pill) return;
          gsap.fromTo(
            pill,
            { width: 36 },
            {
              width: this.getExpandedWidth(),
              duration: 0.35,
              ease: 'power3.out',
              onComplete: () => this.inputEl()?.nativeElement.focus(),
            },
          );
        });
      } else {
        const pill = this.pillEl()?.nativeElement;
        if (!pill) {
          this.isExpandWrapMounted.set(false);
          return;
        }
        gsap.to(pill, {
          width: 36,
          duration: 0.22,
          ease: 'power2.in',
          onComplete: () => this.isExpandWrapMounted.set(false),
        });
      }
    });

    effect(() => {
      const open = this.isSearchOpen();
      if (open) {
        this.isDropdownMounted.set(true);
        queueMicrotask(() => {
          const el = this.dropdownEl()?.nativeElement;
          if (!el) return;
          gsap.fromTo(
            el,
            { opacity: 0, y: -8, scale: 0.97 },
            { opacity: 1, y: 0, scale: 1, duration: 0.22, ease: 'power3.out' },
          );
        });
      } else {
        const el = this.dropdownEl()?.nativeElement;
        if (!el) return;
        gsap.to(el, {
          opacity: 0,
          y: -6,
          scale: 0.97,
          duration: 0.15,
          ease: 'power2.in',
          onComplete: () => this.isDropdownMounted.set(false),
        });
      }
    });

    this.searchSubject
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((query) => {
          if (query.trim().length < 2) {
            this.searchResults.set([]);
            this.isSearchLoading.set(false);
            return of([] as UserSearchResult[]);
          }
          this.isSearchLoading.set(true);
          return this.userService.search(query);
        }),
        takeUntilDestroyed(),
      )
      .subscribe({
        next: (results) => {
          this.searchResults.set(results);
          this.isSearchLoading.set(false);
        },
        error: () => {
          this.searchResults.set([]);
          this.isSearchLoading.set(false);
        },
      });
  }

  toggleSearch(): void {
    if (this.isExpanded()) {
      this.collapse();
    } else {
      this.isExpanded.set(true);
    }
  }

  private collapse(): void {
    this.isSearchOpen.set(false);
    this.searchQuery.set('');
    this.searchResults.set([]);
    this.searchSubject.next('');
    this.isExpanded.set(false);
  }

  onSearchInput(query: string): void {
    this.searchQuery.set(query);
    this.searchSubject.next(query);
    if (query.trim().length > 0) {
      this.isSearchOpen.set(true);
    } else {
      this.isSearchOpen.set(false);
      this.searchResults.set([]);
    }
  }

  onSearchFocus(): void {
    if (this.searchQuery().trim().length >= 2) {
      this.isSearchOpen.set(true);
    }
  }

  clearSearch(): void {
    this.searchQuery.set('');
    this.searchResults.set([]);
    this.isSearchOpen.set(false);
    this.searchSubject.next('');
  }

  selectSearchResult(result: UserSearchResult): void {
    this.searchQuery.set('');
    this.searchResults.set([]);
    this.isSearchOpen.set(false);
    void this.router.navigate(['/', result.username]);
  }

  closeIfClickedOutside(target: Node): void {
    const searchEl = this.searchContainer()?.nativeElement;
    if (target && searchEl && !searchEl.contains(target)) {
      this.collapse();
    }
  }

  closeDropdown(): void {
    this.isSearchOpen.set(false);
  }

  private getExpandedWidth(): number {
    if (typeof window === 'undefined') {
      return 240;
    }

    if (window.innerWidth > 720) {
      return 240;
    }

    return Math.max(120, Math.min(160, window.innerWidth - 208));
  }
}
