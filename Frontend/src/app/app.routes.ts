import { inject } from '@angular/core';
import { CanDeactivateFn, Routes } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { authGuard, loginEntryGuard, UserService } from '@app/core';

const canvasPageCanDeactivateGuard: CanDeactivateFn<{
  flushPendingPersistence?: () => Promise<boolean> | boolean;
}> = async (component) => {
  if (typeof component.flushPendingPersistence !== 'function') {
    return true;
  }

  return component.flushPendingPersistence();
};

export const routes: Routes = [
  {
    path: '',
    redirectTo: async () => {
      const currentUser = inject(UserService);
      const user = await firstValueFrom(currentUser.loadCurrentUser());
      return user !== null ? `/${user.username}` : '/login';
    },
    pathMatch: 'full',
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/pages/auth-page/auth-page.component').then((m) => m.AuthPage),
    canActivate: [loginEntryGuard],
  },
  {
    path: 'reset-password',
    loadComponent: () =>
      import('./features/auth/pages/reset-password-page/reset-password-page.component').then(
        (m) => m.ResetPasswordPage,
      ),
  },
  {
    path: 'project/:slug/preview',
    loadComponent: () =>
      import('./features/canvas/pages/canvas-preview-page/canvas-preview-page.component').then(
        (m) => m.CanvasPreviewPage,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'project/:slug',
    loadComponent: () =>
      import('./features/canvas/pages/canvas-page/canvas-page.component').then((m) => m.CanvasPage),
    canActivate: [authGuard],
    canDeactivate: [canvasPageCanDeactivateGuard],
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./features/settings/pages/settings-page.component').then((m) => m.SettingsPage),
    canActivate: [authGuard],
  },
  {
    path: 'stars',
    loadComponent: () =>
      import('./features/stars/pages/starred-projects-page.component').then(
        (m) => m.StarredProjectsPage,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'explore',
    loadComponent: () =>
      import('./features/explore/pages/explore-page.component').then((m) => m.ExplorePage),
  },
  {
    path: ':username',
    loadComponent: () =>
      import('./features/profile/pages/profile-page.component').then((m) => m.ProfilePage),
    canActivate: [authGuard],
  },
  { path: '**', redirectTo: '/login' },
];
