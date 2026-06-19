import {
  Component,
  ElementRef,
  Injector,
  NgZone,
  OnInit,
  afterNextRender,
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
import { AuthService, UserService, extractApiErrorMessage } from '@app/core';
import { gsapFadeIn, gsapFadeOut } from '@app/shared/utils/gsap-animations.util';
import { environment } from '../../../../../environments/environment';

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
  selector: 'app-auth-page',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './auth-page.component.html',
  styleUrl: './auth-page.component.css',
})
export class AuthPage implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly userService = inject(UserService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly zone = inject(NgZone);
  private readonly injector = inject(Injector);

  readonly forgotPasswordCardRef = viewChild<ElementRef<HTMLElement>>('forgotPasswordCard');
  readonly twoFactorCardRef = viewChild<ElementRef<HTMLElement>>('twoFactorCard');
  private readonly authCardRef = viewChild<ElementRef<HTMLElement>>('authCard');

  private static readonly REMEMBER_EMAIL_KEY = 'favigon.rememberedEmail';

  readonly mode = signal<'login' | 'register'>('login');
  readonly isSubmitting = signal(false);
  readonly showLoginPassword = signal(false);
  readonly showRegPassword = signal(false);
  readonly showConfirmPassword = signal(false);
  readonly isForgotPasswordSubmitting = signal(false);
  readonly isForgotPasswordDialogOpen = signal(false);
  readonly isTwoFactorSubmitting = signal(false);
  readonly isTwoFactorDialogOpen = signal(false);
  readonly forgotPasswordEmailSent = signal(false);
  readonly forgotPasswordStatusMessage = signal<{ type: 'error' | 'success'; text: string } | null>(
    null,
  );
  readonly twoFactorStatusMessage = signal<{ type: 'error' | 'success'; text: string } | null>(
    null,
  );
  readonly twoFactorEmailHint = signal<string | null>(null);
  readonly statusMessage = signal<{ type: 'error' | 'success'; text: string } | null>(null);

  private twoFactorToken: string | null = null;

  // Forms
  readonly loginForm = this.fb.nonNullable.group({
    email: [
      '',
      [Validators.required, Validators.email, Validators.maxLength(CREDENTIAL_MAX_LENGTH)],
    ],
    password: ['', [Validators.required, Validators.maxLength(CREDENTIAL_MAX_LENGTH)]],
    rememberMe: [false],
  });

  readonly forgotPasswordForm = this.fb.nonNullable.group({
    email: [
      '',
      [Validators.required, Validators.email, Validators.maxLength(CREDENTIAL_MAX_LENGTH)],
    ],
  });

  readonly twoFactorForm = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/), Validators.maxLength(6)]],
  });

  readonly registerForm = this.fb.nonNullable.group(
    {
      displayName: ['', [Validators.required, Validators.maxLength(50)]],
      username: [
        '',
        [Validators.required, Validators.maxLength(30), Validators.pattern(/^[a-z0-9_]+$/)],
      ],
      email: [
        '',
        [Validators.required, Validators.email, Validators.maxLength(CREDENTIAL_MAX_LENGTH)],
      ],
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

  ngOnInit() {
    this.checkRememberedEmail();
    void this.tryOAuthCallbackLogin();
    afterNextRender(
      () => {
        const card = this.authCardRef()?.nativeElement;
        if (!card) return;
        gsapFadeIn(this.zone, card);
      },
      { injector: this.injector },
    );
  }

  // Actions

  switchMode(nextMode: 'login' | 'register') {
    this.mode.set(nextMode);

    this.statusMessage.set(null);

    this.loginForm.reset();
    this.forgotPasswordForm.reset();
    this.registerForm.reset();

    if (nextMode === 'login') {
      this.checkRememberedEmail();
    }
  }

  openForgotPasswordDialog() {
    this.forgotPasswordStatusMessage.set(null);
    this.forgotPasswordEmailSent.set(false);
    this.forgotPasswordForm.reset({
      email: this.loginForm.controls.email.value?.trim() ?? '',
    });
    this.isForgotPasswordDialogOpen.set(true);
    afterNextRender(
      () => {
        const card = this.forgotPasswordCardRef()?.nativeElement;
        if (!card) return;
        gsapFadeIn(this.zone, card);
      },
      { injector: this.injector },
    );
  }

  closeForgotPasswordDialog() {
    if (this.isForgotPasswordSubmitting()) {
      return;
    }

    const card = this.forgotPasswordCardRef()?.nativeElement;
    if (!card) {
      this.isForgotPasswordDialogOpen.set(false);
      return;
    }

    gsapFadeOut(this.zone, card, () => this.isForgotPasswordDialogOpen.set(false));
  }

  closeTwoFactorDialog() {
    if (this.isTwoFactorSubmitting()) {
      return;
    }

    const card = this.twoFactorCardRef()?.nativeElement;
    if (!card) {
      this.resetTwoFactorChallenge();
      return;
    }

    gsapFadeOut(this.zone, card, () => this.resetTwoFactorChallenge());
  }

  async submitForgotPassword() {
    if (this.forgotPasswordForm.invalid) {
      this.forgotPasswordForm.markAllAsTouched();
      return;
    }

    this.isForgotPasswordSubmitting.set(true);
    this.forgotPasswordStatusMessage.set(null);

    try {
      const { email } = this.forgotPasswordForm.getRawValue();
      const response = await firstValueFrom(
        this.authService.forgotPassword({
          email: email.trim(),
        }),
      );

      this.forgotPasswordEmailSent.set(true);
      this.forgotPasswordStatusMessage.set({
        type: 'success',
        text:
          response.message ||
          'If an account exists for this email, a password reset email has been sent. Please check your inbox.',
      });
    } catch (error: unknown) {
      this.forgotPasswordStatusMessage.set({
        type: 'error',
        text: extractApiErrorMessage(error, 'Could not send password reset email.'),
      });
    } finally {
      this.isForgotPasswordSubmitting.set(false);
    }
  }

  async submitTwoFactorLogin() {
    if (!this.twoFactorToken) {
      this.twoFactorStatusMessage.set({
        type: 'error',
        text: 'This verification session has expired. Please sign in again.',
      });
      return;
    }

    if (this.twoFactorForm.invalid) {
      this.twoFactorForm.markAllAsTouched();
      return;
    }

    this.isTwoFactorSubmitting.set(true);
    this.twoFactorStatusMessage.set(null);

    try {
      const { code } = this.twoFactorForm.getRawValue();
      const response = await firstValueFrom(
        this.authService.verifyTwoFactorLogin({
          token: this.twoFactorToken,
          code: code.trim(),
        }),
      );

      this.resetTwoFactorChallenge();

      const user = await firstValueFrom(this.userService.getMe());
      this.userService.setCurrentUser(user);
      await this.navigateAfterLogin(user.username);
    } catch (error: unknown) {
      this.twoFactorStatusMessage.set({
        type: 'error',
        text: extractApiErrorMessage(error, 'Could not verify code.'),
      });
    } finally {
      this.isTwoFactorSubmitting.set(false);
    }
  }

  async submitLogin() {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.startLoading();
    const { email, password, rememberMe } = this.loginForm.getRawValue();

    try {
      const response = await firstValueFrom(
        this.authService.login({
          email: email.trim(),
          password,
        }),
      );

      this.handleRememberMe(email.trim(), rememberMe);
      await this.handleLoginResponse(response, 'Login successful.');
    } catch (error: unknown) {
      this.handleError(error, 'Could not log in.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async submitRegister() {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.startLoading();
    const { displayName, username, email, password } = this.registerForm.getRawValue();

    try {
      const response = await firstValueFrom(
        this.authService.register({
          displayName: displayName.trim(),
          username: username.trim(),
          email: email.trim(),
          password,
        }),
      );

      this.switchMode('login');
      this.loginForm.patchValue({ email: email.trim() });
    } catch (error: unknown) {
      this.handleError(error, 'Could not create account.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  startGithubLogin() {
    const clientId = environment.githubClientId?.trim();
    if (!clientId) {
      this.statusMessage.set({
        type: 'error',
        text: 'GitHub login is not configured in frontend environment.',
      });
      return;
    }

    const redirectUri = `${window.location.origin}/login`;
    const githubAuthorizeUrl =
      `https://github.com/login/oauth/authorize` +
      `?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent('read:user user:email')}` +
      `&state=${encodeURIComponent('github')}` +
      `&prompt=select_account`;

    window.location.href = githubAuthorizeUrl;
  }

  startGoogleLogin() {
    const clientId = environment.googleClientId?.trim();
    if (!clientId) {
      this.statusMessage.set({
        type: 'error',
        text: 'Google login is not configured in frontend environment.',
      });
      return;
    }

    const redirectUri = `${window.location.origin}/login`;
    const googleAuthorizeUrl =
      `https://accounts.google.com/o/oauth2/v2/auth` +
      `?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=${encodeURIComponent('code')}` +
      `&scope=${encodeURIComponent('openid email profile')}` +
      `&prompt=${encodeURIComponent('select_account')}` +
      `&state=${encodeURIComponent('google')}`;

    window.location.href = googleAuthorizeUrl;
  }


  private passwordMatchValidator(group: AbstractControl): ValidationErrors | null {
    const password = group.get('password')?.value;
    const confirmControl = group.get('confirmPassword');

    if (!confirmControl) return null;

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

  private checkRememberedEmail() {
    const savedEmail = localStorage.getItem(AuthPage.REMEMBER_EMAIL_KEY);
    if (savedEmail) {
      this.loginForm.patchValue({ email: savedEmail, rememberMe: true });
    }
  }

  private handleRememberMe(email: string, shouldRemember: boolean) {
    if (shouldRemember) {
      localStorage.setItem(AuthPage.REMEMBER_EMAIL_KEY, email);
    } else {
      localStorage.removeItem(AuthPage.REMEMBER_EMAIL_KEY);
    }
  }

  private startLoading() {
    this.isSubmitting.set(true);
    this.statusMessage.set(null);
  }

  private async tryOAuthCallbackLogin() {
    const code = this.route.snapshot.queryParamMap.get('code');
    if (!code) {
      return;
    }

    const state = this.route.snapshot.queryParamMap.get('state')?.trim().toLowerCase();

    if (state === 'github-link' || state === 'google-link') {
      this.startLoading();
      try {
        if (state === 'google-link') {
          await firstValueFrom(this.authService.linkWithGoogle({ code }));
        } else {
          await firstValueFrom(this.authService.linkWithGithub({ code }));
        }
        const user = await firstValueFrom(this.userService.getMe());
        this.userService.setCurrentUser(user);
        await this.router.navigate(['/settings']);
      } catch (error: unknown) {
        this.handleError(
          error,
          state === 'google-link'
            ? 'Could not link Google account.'
            : 'Could not link GitHub account.',
        );
        await this.router.navigate(['/settings'], { replaceUrl: true });
      } finally {
        this.isSubmitting.set(false);
      }
      return;
    }

    this.startLoading();

    try {
      const response =
        state == 'google'
          ? await firstValueFrom(this.authService.loginWithGoogle({ code }))
          : await firstValueFrom(this.authService.loginWithGithub({ code }));

      await this.handleLoginResponse(
        response,
        state === 'google'
          ? 'Google authentication successful.'
          : 'GitHub authentication successful.',
      );
    } catch (error: unknown) {
      this.handleError(
        error,
        state === 'google'
          ? 'Could not authenticate with Google.'
          : 'Could not authenticate with GitHub.',
      );
      await this.router.navigate(['/login'], { replaceUrl: true });
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private handleError(error: unknown, defaultMsg: string) {
    this.statusMessage.set({ type: 'error', text: extractApiErrorMessage(error, defaultMsg) });
  }

  private async handleLoginResponse(
    response: {
      message: string;
      requiresTwoFactor?: boolean;
      twoFactorToken?: string | null;
      twoFactorEmailHint?: string | null;
    },
    successMessage: string,
  ) {
    if (response.requiresTwoFactor) {
      this.openTwoFactorDialog(response);
      return;
    }

    const user = await firstValueFrom(this.userService.getMe());
    this.userService.setCurrentUser(user);
    await this.navigateAfterLogin(user.username);
  }

  private openTwoFactorDialog(response: {
    message: string;
    twoFactorToken?: string | null;
    twoFactorEmailHint?: string | null;
  }) {
    if (!response.twoFactorToken) {
      this.handleError(
        { error: { message: 'Verification session could not be started.' } },
        'Could not start verification.',
      );
      return;
    }

    this.statusMessage.set(null);
    this.twoFactorToken = response.twoFactorToken;
    this.twoFactorEmailHint.set(response.twoFactorEmailHint ?? null);
    this.twoFactorForm.reset();
    this.twoFactorStatusMessage.set({
      type: 'success',
      text: response.message || 'We sent a verification code to your email.',
    });
    this.isTwoFactorDialogOpen.set(true);
    afterNextRender(
      () => {
        const card = this.twoFactorCardRef()?.nativeElement;
        if (!card) return;
        gsapFadeIn(this.zone, card);
      },
      { injector: this.injector },
    );
  }

  private resetTwoFactorChallenge() {
    this.twoFactorToken = null;
    this.twoFactorEmailHint.set(null);
    this.twoFactorForm.reset();
    this.twoFactorStatusMessage.set(null);
    this.isTwoFactorDialogOpen.set(false);
  }

  get twoFactorDialogDescription(): string {
    const emailHint = this.twoFactorEmailHint();
    return emailHint
      ? `Enter the 6-digit code we sent to ${emailHint}.`
      : 'Enter the 6-digit code we sent to your email.';
  }

  private navigateAfterLogin(username: string): Promise<boolean> {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl')?.trim() ?? '';

    if (returnUrl.startsWith('/') && returnUrl !== '/login') {
      return this.router.navigateByUrl(returnUrl, { replaceUrl: true });
    }

    return this.router.navigate(['/', username], { replaceUrl: true });
  }
}
