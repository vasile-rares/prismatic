import {
  Component,
  ElementRef,
  Injector,
  NgZone,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AuthService, extractApiErrorMessage } from '@app/core';
import { gsapFadeIn } from '@app/shared/utils/gsap-animations.util';

const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const CREDENTIAL_MAX_LENGTH = 100;

function passwordStrengthValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (!control.value) {
      return null;
    }

    return PASSWORD_PATTERN.test(String(control.value)) ? null : { weakPassword: true };
  };
}

@Component({
  selector: 'app-reset-password-page',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './reset-password-page.component.html',
  styleUrl: './reset-password-page.component.css',
})
export class ResetPasswordPage {
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);
  private readonly injector = inject(Injector);

  readonly cardRef = viewChild<ElementRef<HTMLElement>>('card');

  readonly showPassword = signal(false);
  readonly showConfirmPassword = signal(false);

  readonly token = this.route.snapshot.queryParamMap.get('token')?.trim() ?? '';
  readonly isSubmitting = signal(false);
  readonly statusMessage = signal<{ type: 'error' | 'success'; text: string } | null>(null);
  readonly hasValidToken = computed(() => this.token.length > 0);

  readonly form = this.fb.nonNullable.group(
    {
      password: [
        '',
        [
          Validators.required,
          Validators.minLength(8),
          Validators.maxLength(CREDENTIAL_MAX_LENGTH),
          passwordStrengthValidator(),
        ],
      ],
      confirmPassword: ['', [Validators.required, Validators.maxLength(CREDENTIAL_MAX_LENGTH)]],
    },
    { validators: [this.passwordMatchValidator] },
  );

  constructor() {
    afterNextRender(
      () => {
        const card = this.cardRef()?.nativeElement;
        if (!card) return;
        gsapFadeIn(this.zone, card);
      },
      { injector: this.injector },
    );
  }

  async submit(): Promise<void> {
    if (!this.hasValidToken()) {
      this.statusMessage.set({
        type: 'error',
        text: 'Password reset link is invalid or missing.',
      });
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.statusMessage.set(null);

    try {
      const { password } = this.form.getRawValue();
      const response = await firstValueFrom(
        this.authService.resetPassword({
          token: this.token,
          password,
        }),
      );

      this.statusMessage.set({
        type: 'success',
        text: response.message || 'Password reset successful.',
      });
      this.form.reset();
    } catch (error: unknown) {
      this.statusMessage.set({
        type: 'error',
        text: extractApiErrorMessage(error, 'Could not reset password.'),
      });
    } finally {
      this.isSubmitting.set(false);
    }
  }

  goToLogin(): Promise<boolean> {
    return this.router.navigate(['/login']);
  }

  private passwordMatchValidator(group: AbstractControl): ValidationErrors | null {
    const password = group.get('password')?.value;
    const confirmControl = group.get('confirmPassword');

    if (!confirmControl) {
      return null;
    }

    const confirmValue = confirmControl.value;
    if (confirmValue && password !== confirmValue) {
      confirmControl.setErrors({ ...confirmControl.errors, passwordMismatch: true });
      return { passwordMismatch: true };
    }

    if (confirmControl.hasError('passwordMismatch')) {
      const { passwordMismatch, ...otherErrors } = confirmControl.errors || {};
      confirmControl.setErrors(Object.keys(otherErrors).length ? otherErrors : null);
    }

    return null;
  }
}
