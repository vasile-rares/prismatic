import {
  Component,
  DestroyRef,
  ElementRef,
  NgZone,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ProjectService } from '@app/core';
import { extractApiErrorMessage } from '@app/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import gsap from 'gsap';

@Component({
  selector: 'app-project-menu',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './project-menu.component.html',
  styleUrl: './project-menu.component.css',
})
export class ProjectMenuComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly projectService = inject(ProjectService);
  private readonly zone = inject(NgZone);

  readonly projectId = input.required<number>();
  readonly projectSlug = input.required<string>();
  readonly projectName = input.required<string>();
  readonly projectIsPublic = input.required<boolean>();

  readonly projectRenamed = output<string>();
  readonly visibilityChanged = output<boolean>();
  readonly previewRequested = output<void>();
  readonly closed = output<void>();

  readonly showMenu = signal(false);
  readonly isUpdating = signal(false);
  readonly nameDraft = signal('');
  readonly visibilityDraft = signal(false);
  readonly updateError = signal<string | null>(null);

  isOpen(): boolean {
    return this.showMenu();
  }

  readonly projectMenuEl = viewChild<ElementRef<HTMLElement>>('projectMenuEl');
  readonly projectNameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  toggle(): void {
    if (this.showMenu()) {
      this.close();
    } else {
      this.open();
    }
  }

  open(): void {
    if (this.isUpdating()) return;

    this.nameDraft.set(this.projectName());
    this.visibilityDraft.set(this.projectIsPublic());
    this.updateError.set(null);
    this.showMenu.set(true);

    setTimeout(() => {
      const el = this.projectMenuEl()?.nativeElement;
      if (el) {
        this.zone.runOutsideAngular(() => {
          gsap.fromTo(
            el,
            { opacity: 0, scale: 0.92, y: 12, transformOrigin: 'top center' },
            {
              opacity: 1,
              scale: 1,
              y: 0,
              duration: 0.25,
              ease: 'back.out(1.7)',
              clearProps: 'transform',
            },
          );
        });
      }
      this.projectNameInput()?.nativeElement.focus();
      this.projectNameInput()?.nativeElement.select();
    });
  }

  close(): void {
    if (this.isUpdating()) return;

    this.nameDraft.set(this.projectName());
    this.visibilityDraft.set(this.projectIsPublic());
    this.updateError.set(null);

    this.animateClose(() => {
      this.showMenu.set(false);
      this.closed.emit();
    });
  }

  private animateClose(onDone: () => void): void {
    const el = this.projectMenuEl()?.nativeElement;
    if (!el) {
      onDone();
      return;
    }
    this.zone.runOutsideAngular(() => {
      gsap.to(el, {
        opacity: 0,
        scale: 0.92,
        y: 12,
        duration: 0.17,
        ease: 'power2.in',
        transformOrigin: 'top center',
        onComplete: () => this.zone.run(onDone),
      });
    });
  }

  save(): void {
    if (!this.showMenu() || this.isUpdating()) return;

    const nextName = this.nameDraft().trim();
    const currentName = this.projectName().trim();
    const nextVisibility = this.visibilityDraft();
    const currentVisibility = this.projectIsPublic();

    if (!nextName) {
      this.updateError.set('Project name is required.');
      setTimeout(() => this.projectNameInput()?.nativeElement.focus());
      return;
    }

    if (nextName === currentName && nextVisibility === currentVisibility) {
      this.close();
      return;
    }

    this.isUpdating.set(true);
    this.updateError.set(null);

    this.projectService
      .update(this.projectId(), { name: nextName, isPublic: nextVisibility })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (project) => {
          this.nameDraft.set(project.name);
          this.visibilityDraft.set(project.isPublic);
          this.updateError.set(null);
          this.isUpdating.set(false);
          this.projectRenamed.emit(project.name);
          this.visibilityChanged.emit(project.isPublic);
          this.close();
        },
        error: (error: unknown) => {
          this.updateError.set(extractApiErrorMessage(error, 'Failed to update project.'));
          this.isUpdating.set(false);
          setTimeout(() => this.projectNameInput()?.nativeElement.focus());
        },
      });
  }

  openPreview(): void {
    void this.router.navigate(['project', this.projectSlug(), 'preview']);
    this.previewRequested.emit();
  }

  closeIfClickedOutside(target: Node, triggerEl?: HTMLElement): void {
    const menuEl = this.projectMenuEl()?.nativeElement;
    if (
      target &&
      !(triggerEl && triggerEl.contains(target)) &&
      !(menuEl && menuEl.contains(target))
    ) {
      this.close();
    }
  }
}
