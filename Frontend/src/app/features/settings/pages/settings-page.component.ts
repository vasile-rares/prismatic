import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  Injector,
  NgZone,
  afterNextRender,
  effect,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';

import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import gsap from 'gsap';
import { AuthService, UserService, extractApiErrorMessage, FALLBACK_AVATAR_URL } from '@app/core';
import { gsapFadeIn, gsapFadeOut } from '@app/shared/utils/gsap-animations.util';
import type { UserMe } from '@app/core';
import { environment } from '../../../../environments/environment';

const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const MAX_PROFILE_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_PROFILE_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
] as const;
const PROFILE_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/avif';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './settings-page.component.html',
  styleUrl: './settings-page.component.css',
})
export class SettingsPage implements OnInit, AfterViewInit {
  private readonly authService = inject(AuthService);
  private readonly userService = inject(UserService);
  private readonly router = inject(Router);
  private readonly el = inject(ElementRef);
  private readonly zone = inject(NgZone);
  private readonly injector = inject(Injector);
  private readonly fallbackAvatarUrl = FALLBACK_AVATAR_URL;

  private readonly tabContentRef = viewChild<ElementRef<HTMLElement>>('tabContent');

  activeTab: 'account' | 'password' | 'linked-accounts' = 'account';

  showDeleteDialog = signal(false);
  showPasswordDialog = signal(false);
  showTwoFactorDialog = signal(false);

  displayName = '';
  username = '';
  bio = '';
  email = '';
  currentPassword = '';
  newPassword = '';
  confirmPassword = '';
  passwordDialogMode: 'set' | 'change' = 'change';
  twoFactorCode = '';
  twoFactorDialogMode: 'enable' | 'disable' = 'enable';
  showCurrentPassword = false;
  showNewPassword = false;
  showConfirmPassword = false;

  readonly isLoading = signal(false);
  readonly isSaving = signal(false);
  readonly isUploadingProfileImage = signal(false);
  readonly isDeleting = signal(false);
  readonly isDeleteDialogOpen = signal(false);
  readonly isPasswordDialogOpen = signal(false);
  readonly isChangingPassword = signal(false);
  readonly isPasswordDialogSuccess = signal(false);
  readonly isTwoFactorDialogOpen = signal(false);
  readonly isTwoFactorDialogSubmitting = signal(false);
  readonly isTwoFactorDialogSuccess = signal(false);
  readonly isTwoFactorDialogAwaitingCode = signal(false);
  readonly savingProvider = signal<string | null>(null);
  readonly statusMessage = signal<{ type: 'error' | 'success'; text: string } | null>(null);
  readonly passwordDialogMessage = signal<{ type: 'error' | 'success'; text: string } | null>(null);
  readonly twoFactorStatusMessage = signal<{ type: 'error' | 'success'; text: string } | null>(
    null,
  );
  readonly twoFactorDialogMessage = signal<{ type: 'error' | 'success'; text: string } | null>(
    null,
  );
  readonly profileImageAccept = PROFILE_IMAGE_ACCEPT;

  private userMe: UserMe | null = null;

  constructor() {
    effect(
      () => {
        if (!this.isLoading()) {
          afterNextRender(() => this.animatePageEnter(), { injector: this.injector });
        }
      },
      { injector: this.injector },
    );

    effect(() => {
      if (this.isDeleteDialogOpen()) {
        this.showDeleteDialog.set(true);
        afterNextRender(() => this.animateModalOpen('delete'), { injector: this.injector });
      } else if (this.showDeleteDialog()) {
        this.animateModalClose('delete', () => {
          this.showDeleteDialog.set(false);
        });
      }
    });

    effect(() => {
      if (this.isPasswordDialogOpen()) {
        this.showPasswordDialog.set(true);
        afterNextRender(() => this.animateModalOpen('password'), { injector: this.injector });
      } else if (this.showPasswordDialog()) {
        this.animateModalClose('password', () => {
          this.showPasswordDialog.set(false);
        });
      }
    });

    effect(() => {
      if (this.isTwoFactorDialogOpen()) {
        this.showTwoFactorDialog.set(true);
        afterNextRender(() => this.animateModalOpen('twofactor'), { injector: this.injector });
      } else if (this.showTwoFactorDialog()) {
        this.animateModalClose('twofactor', () => {
          this.showTwoFactorDialog.set(false);
        });
      }
    });
  }

  private getModalEl(key: 'delete' | 'password' | 'twofactor'): HTMLElement | null {
    const map = {
      delete: 'stg-delete-modal',
      password: 'stg-password-modal',
      twofactor: 'stg-twofactor-modal',
    };
    return (this.el.nativeElement as HTMLElement).querySelector<HTMLElement>(`.${map[key]}`);
  }

  private animateModalOpen(key: 'delete' | 'password' | 'twofactor'): void {
    const modal = this.getModalEl(key);
    if (!modal) return;
    gsapFadeIn(this.zone, modal);
  }

  private animateModalClose(key: 'delete' | 'password' | 'twofactor', onDone: () => void): void {
    const modal = this.getModalEl(key);
    if (!modal) {
      onDone();
      return;
    }
    gsapFadeOut(this.zone, modal, onDone);
  }

  async ngOnInit() {
    this.isLoading.set(true);
    try {
      const me = await firstValueFrom(this.userService.loadCurrentUser());
      if (me) this.populateForm(me);
    } catch {
      // auth guard should handle unauthenticated state
    } finally {
      this.isLoading.set(false);
    }
  }

  setActiveTab(tab: 'account' | 'password' | 'linked-accounts') {
    this.activeTab = tab;
    this.statusMessage.set(null);
    requestAnimationFrame(() => {
      const el = this.tabContentRef()?.nativeElement;
      if (el)
        gsap.fromTo(
          el,
          { opacity: 0, y: 8 },
          { opacity: 1, y: 0, duration: 0.25, ease: 'power3.out' },
        );
    });
  }

  ngAfterViewInit(): void {}

  private animatePageEnter(): void {
    this.zone.runOutsideAngular(() => {
      const host = this.el.nativeElement as HTMLElement;
      const topbar = host.querySelector<HTMLElement>('.stg-topbar');
      const tabs = host.querySelector<HTMLElement>('.stg-tabs');
      const body = host.querySelector<HTMLElement>('.stg-body');

      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

      if (topbar) {
        gsap.set(topbar, { opacity: 0, y: 18, filter: 'blur(8px)' });
        tl.to(topbar, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.6 }, 0);
      }

      if (tabs) {
        gsap.set(tabs, { opacity: 0, y: 12, filter: 'blur(6px)' });
        tl.to(tabs, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.55 }, 0.15);
      }

      if (body) {
        gsap.set(body, { opacity: 0, y: 16, filter: 'blur(8px)' });
        tl.to(body, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.6 }, 0.28);
      }
    });
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.isChangingPassword() || this.isDeleting() || this.isTwoFactorDialogSubmitting()) {
      return;
    }

    if (this.isPasswordDialogOpen()) {
      this.closeChangePasswordDialog();
      return;
    }

    if (this.isTwoFactorDialogOpen()) {
      this.closeTwoFactorDialog();
      return;
    }

    if (this.isDeleteDialogOpen()) {
      this.closeDeleteDialog();
    }
  }

  get accountAvatarUrl(): string {
    return this.userMe?.profilePictureUrl?.trim() || this.fallbackAvatarUrl;
  }

  get hasProfileImage(): boolean {
    return !!this.userMe?.profilePictureUrl?.trim();
  }

  get fallbackUrl(): string {
    return this.fallbackAvatarUrl;
  }

  get accountInitial(): string {
    const source = this.displayName.trim() || this.username.trim() || 'S';
    return source.charAt(0).toUpperCase();
  }

  get linkedAccountsCount(): number {
    return this.userMe?.linkedAccounts.length ?? 0;
  }

  get isAnyDialogOpen(): boolean {
    return this.isDeleteDialogOpen() || this.isPasswordDialogOpen() || this.isTwoFactorDialogOpen();
  }

  async saveAccountChanges() {
    this.isSaving.set(true);
    this.statusMessage.set(null);
    try {
      const updated = await firstValueFrom(
        this.userService.updateMe({
          displayName: this.displayName.trim(),
          username: this.username.trim(),
          bio: this.bio.trim() || null,
        }),
      );
      this.userService.setCurrentUser(updated);
      this.populateForm(updated);
      this.statusMessage.set({ type: 'success', text: 'Profile updated successfully.' });
    } catch (error: unknown) {
      this.statusMessage.set({
        type: 'error',
        text: extractApiErrorMessage(error, 'Could not save changes.'),
      });
    } finally {
      this.isSaving.set(false);
    }
  }

  async onProfileImageSelected(event: Event) {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.item(0);
    if (!file) {
      return;
    }

    this.statusMessage.set(null);

    const validationError = this.validateProfileImageFile(file);
    if (validationError) {
      this.statusMessage.set({ type: 'error', text: validationError });
      if (input) {
        input.value = '';
      }
      return;
    }

    this.isUploadingProfileImage.set(true);

    try {
      const updated = await firstValueFrom(this.userService.uploadMyProfileImage(file));
      this.userService.setCurrentUser(updated);
      this.populateForm(updated);
      this.statusMessage.set({ type: 'success', text: 'Profile image updated successfully.' });
    } catch (error: unknown) {
      this.statusMessage.set({
        type: 'error',
        text: extractApiErrorMessage(error, 'Could not update profile image.'),
      });
    } finally {
      this.isUploadingProfileImage.set(false);
      if (input) {
        input.value = '';
      }
    }
  }

  openDeleteDialog() {
    this.isDeleteDialogOpen.set(true);
  }

  closeDeleteDialog() {
    if (!this.isDeleting()) {
      this.isDeleteDialogOpen.set(false);
    }
  }

  async confirmDeleteAccount() {
    this.isDeleting.set(true);
    try {
      await firstValueFrom(this.userService.deleteMe());
      await this.router.navigate(['/login']);
    } catch (error: unknown) {
      this.statusMessage.set({
        type: 'error',
        text: extractApiErrorMessage(error, 'Could not delete account.'),
      });
      this.isDeleteDialogOpen.set(false);
    } finally {
      this.isDeleting.set(false);
    }
  }

  openChangePasswordDialog() {
    this.passwordDialogMode = this.userMe?.hasPassword ? 'change' : 'set';
    this.currentPassword = '';
    this.newPassword = '';
    this.confirmPassword = '';
    this.showCurrentPassword = false;
    this.showNewPassword = false;
    this.showConfirmPassword = false;
    this.statusMessage.set(null);
    this.passwordDialogMessage.set(null);
    this.isPasswordDialogSuccess.set(false);
    this.isPasswordDialogOpen.set(true);
  }

  closeChangePasswordDialog() {
    if (!this.isChangingPassword()) {
      this.isPasswordDialogOpen.set(false);
      this.passwordDialogMessage.set(null);
      this.isPasswordDialogSuccess.set(false);
      this.showCurrentPassword = false;
      this.showNewPassword = false;
      this.showConfirmPassword = false;
    }
  }

  togglePasswordVisibility(field: 'current' | 'new' | 'confirm'): void {
    if (field === 'current') {
      this.showCurrentPassword = !this.showCurrentPassword;
      return;
    }

    if (field === 'new') {
      this.showNewPassword = !this.showNewPassword;
      return;
    }

    this.showConfirmPassword = !this.showConfirmPassword;
  }

  openTwoFactorDialog() {
    this.twoFactorDialogMode = this.userMe?.isTwoFactorEnabled ? 'disable' : 'enable';
    this.twoFactorCode = '';
    this.twoFactorStatusMessage.set(null);
    this.twoFactorDialogMessage.set(null);
    this.isTwoFactorDialogSuccess.set(false);
    this.isTwoFactorDialogAwaitingCode.set(false);
    this.isTwoFactorDialogOpen.set(true);
  }

  closeTwoFactorDialog() {
    if (!this.isTwoFactorDialogSubmitting()) {
      this.isTwoFactorDialogOpen.set(false);
      this.twoFactorDialogMessage.set(null);
      this.isTwoFactorDialogSuccess.set(false);
      this.isTwoFactorDialogAwaitingCode.set(false);
    }
  }

  async submitPasswordDialog() {
    if (!this.passwordDialogCanSubmit) {
      return;
    }

    this.isChangingPassword.set(true);
    this.passwordDialogMessage.set(null);

    try {
      const response = this.isSetPasswordMode
        ? await firstValueFrom(
            this.authService.setPassword({
              password: this.newPassword,
            }),
          )
        : await firstValueFrom(
            this.authService.changePassword({
              currentPassword: this.currentPassword,
              newPassword: this.newPassword,
            }),
          );

      if (this.userMe && !this.userMe.hasPassword) {
        const updatedUser: UserMe = {
          ...this.userMe,
          hasPassword: true,
        };
        this.userService.setCurrentUser(updatedUser);
        this.userMe = updatedUser;
      }

      const successMessage = {
        type: 'success' as const,
        text:
          response.message ||
          (this.isSetPasswordMode
            ? "You're all set. We've sent a confirmation email to your inbox."
            : 'Password changed successfully.'),
      };

      this.passwordDialogMessage.set(successMessage);
      this.statusMessage.set(successMessage);
      this.isPasswordDialogSuccess.set(true);
    } catch (error: unknown) {
      this.passwordDialogMessage.set({
        type: 'error',
        text: extractApiErrorMessage(
          error,
          this.isSetPasswordMode ? 'Could not set password.' : 'Could not change password.',
        ),
      });
    } finally {
      this.isChangingPassword.set(false);
    }
  }

  async submitTwoFactorDialog() {
    if (!this.twoFactorDialogCanSubmit) {
      return;
    }

    this.isTwoFactorDialogSubmitting.set(true);
    this.twoFactorDialogMessage.set(null);

    try {
      if (!this.isTwoFactorDialogAwaitingCode()) {
        const response = this.isEnableTwoFactorMode
          ? await firstValueFrom(this.authService.requestEnableTwoFactor())
          : await firstValueFrom(this.authService.requestDisableTwoFactor());

        this.twoFactorDialogMessage.set({
          type: 'success',
          text: response.message || 'We sent a verification code to your email.',
        });
        this.isTwoFactorDialogAwaitingCode.set(true);
        this.twoFactorCode = '';
        return;
      }

      const response = this.isEnableTwoFactorMode
        ? await firstValueFrom(
            this.authService.confirmEnableTwoFactor({
              code: this.twoFactorCode.trim(),
            }),
          )
        : await firstValueFrom(
            this.authService.confirmDisableTwoFactor({
              code: this.twoFactorCode.trim(),
            }),
          );

      const isNowEnabled = this.isEnableTwoFactorMode;
      if (this.userMe) {
        const updatedUser: UserMe = {
          ...this.userMe,
          isTwoFactorEnabled: isNowEnabled,
        };
        this.userService.setCurrentUser(updatedUser);
        this.userMe = updatedUser;
      }

      const successMessage = {
        type: 'success' as const,
        text:
          response.message ||
          (isNowEnabled
            ? 'Two-factor authentication is now on.'
            : 'Two-factor authentication is now off.'),
      };

      this.twoFactorDialogMessage.set(successMessage);
      this.twoFactorStatusMessage.set(successMessage);
      this.isTwoFactorDialogSuccess.set(true);
    } catch (error: unknown) {
      this.twoFactorDialogMessage.set({
        type: 'error',
        text: extractApiErrorMessage(
          error,
          this.isTwoFactorDialogAwaitingCode()
            ? 'Could not verify code.'
            : 'Could not send verification code.',
        ),
      });
    } finally {
      this.isTwoFactorDialogSubmitting.set(false);
    }
  }

  get isSetPasswordMode(): boolean {
    return this.passwordDialogMode === 'set';
  }

  get hasLocalPassword(): boolean {
    return this.userMe?.hasPassword ?? true;
  }

  get isEnableTwoFactorMode(): boolean {
    return this.twoFactorDialogMode === 'enable';
  }

  get hasTwoFactorEnabled(): boolean {
    return this.userMe?.isTwoFactorEnabled ?? false;
  }

  get passwordDialogTitle(): string {
    if (this.isPasswordDialogSuccess()) {
      return this.isSetPasswordMode ? "You're all set" : 'Password changed';
    }

    return this.isSetPasswordMode ? 'Set password' : 'Change password';
  }

  get passwordDialogDescription(): string {
    if (this.isPasswordDialogSuccess()) {
      return this.isSetPasswordMode
        ? "Your sign-in details have been updated. You can now sign in with your email and password, and we've sent a confirmation email to your inbox."
        : 'Your password has been updated successfully.';
    }

    return this.isSetPasswordMode
      ? "Choose a password for your account. We'll send a confirmation email once it's saved."
      : 'Enter your current password and choose a new secure password.';
  }

  get passwordDialogPrimaryLabel(): string {
    if (this.isChangingPassword()) {
      return 'Saving...';
    }

    return this.isSetPasswordMode ? 'Set password' : 'Change password';
  }

  get passwordDialogCanSubmit(): boolean {
    if (this.isPasswordDialogSuccess()) {
      return false;
    }

    if (!this.newPassword || !PASSWORD_PATTERN.test(this.newPassword)) {
      return false;
    }

    if (!this.confirmPassword || this.newPassword !== this.confirmPassword) {
      return false;
    }

    if (!this.isSetPasswordMode && !this.currentPassword) {
      return false;
    }

    return true;
  }

  get twoFactorDialogTitle(): string {
    if (this.isTwoFactorDialogSuccess()) {
      return this.isEnableTwoFactorMode
        ? 'Two-factor authentication enabled'
        : 'Two-factor authentication disabled';
    }

    if (this.isTwoFactorDialogAwaitingCode()) {
      return this.isEnableTwoFactorMode ? 'Enter verification code' : 'Confirm turn off';
    }

    return this.isEnableTwoFactorMode
      ? 'Turn on two-factor authentication'
      : 'Turn off two-factor authentication';
  }

  get twoFactorDialogDescription(): string {
    if (this.isTwoFactorDialogSuccess()) {
      return this.isEnableTwoFactorMode
        ? 'Your account will now require a verification code from your email each time you sign in.'
        : 'Your account will no longer ask for an email verification code when you sign in.';
    }

    if (this.isTwoFactorDialogAwaitingCode()) {
      return `Enter the 6-digit code we sent to ${this.email}.`;
    }

    return this.isEnableTwoFactorMode
      ? 'Add an extra verification step to your sign-in. We will send a code to your email to confirm this change.'
      : 'We will send a verification code to your email before turning off two-factor authentication.';
  }

  get twoFactorDialogPrimaryLabel(): string {
    if (this.isTwoFactorDialogSubmitting()) {
      return this.isTwoFactorDialogAwaitingCode() ? 'Verifying...' : 'Sending...';
    }

    if (this.isTwoFactorDialogAwaitingCode()) {
      return this.isEnableTwoFactorMode ? 'Turn on 2FA' : 'Turn off 2FA';
    }

    return 'Send code';
  }

  get twoFactorDialogCanSubmit(): boolean {
    if (this.isTwoFactorDialogSuccess()) {
      return false;
    }

    if (!this.isTwoFactorDialogAwaitingCode()) {
      return true;
    }

    return /^\d{6}$/.test(this.twoFactorCode.trim());
  }

  get twoFactorDialogValidationMessage(): string | null {
    if (!this.isTwoFactorDialogAwaitingCode()) {
      return null;
    }

    if (this.twoFactorCode && !/^\d{6}$/.test(this.twoFactorCode.trim())) {
      return 'Enter the 6-digit code from your email.';
    }

    return null;
  }

  getLinkedAccount(provider: string) {
    return this.userMe?.linkedAccounts.find((la) => la.provider === provider) ?? null;
  }

  connectGithub() {
    const clientId = environment.githubClientId?.trim();
    if (!clientId) return;
    const redirectUri = `${window.location.origin}/login`;
    window.location.href =
      `https://github.com/login/oauth/authorize` +
      `?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent('read:user user:email')}` +
      `&state=${encodeURIComponent('github-link')}` +
      `&prompt=select_account`;
  }

  connectGoogle() {
    const clientId = environment.googleClientId?.trim();
    if (!clientId) return;
    const redirectUri = `${window.location.origin}/login`;
    window.location.href =
      `https://accounts.google.com/o/oauth2/v2/auth` +
      `?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=${encodeURIComponent('code')}` +
      `&scope=${encodeURIComponent('openid email profile')}` +
      `&prompt=${encodeURIComponent('select_account')}` +
      `&state=${encodeURIComponent('google-link')}`;
  }

  async disconnectProvider(provider: string) {
    this.savingProvider.set(provider);
    this.statusMessage.set(null);
    try {
      await firstValueFrom(this.userService.unlinkProvider(provider));
      if (this.userMe) {
        this.userMe = {
          ...this.userMe,
          linkedAccounts: this.userMe.linkedAccounts.filter((la) => la.provider !== provider),
        };
      }
    } catch (error: unknown) {
      this.statusMessage.set({
        type: 'error',
        text: extractApiErrorMessage(error, `Could not disconnect ${provider} account.`),
      });
    } finally {
      this.savingProvider.set(null);
    }
  }

  private populateForm(me: UserMe) {
    this.userMe = me;
    this.displayName = me.displayName;
    this.username = me.username;
    this.bio = me.bio ?? '';
    this.email = me.email;
  }

  private validateProfileImageFile(file: File): string | null {
    if (file.size <= 0) {
      return 'Image file is empty.';
    }

    if (file.size > MAX_PROFILE_IMAGE_SIZE_BYTES) {
      return 'Image file exceeds the 10 MB limit.';
    }

    if (
      !ALLOWED_PROFILE_IMAGE_TYPES.includes(
        file.type as (typeof ALLOWED_PROFILE_IMAGE_TYPES)[number],
      )
    ) {
      return 'Only PNG, JPEG, WebP, GIF, and AVIF images are supported.';
    }

    return null;
  }
}
