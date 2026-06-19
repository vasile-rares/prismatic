import { HttpInterceptorFn, HttpStatusCode } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { environment } from '../../../environments/environment';

const SKIP_REFRESH_PATHS = ['/account/refresh', '/account/login', '/account/oauth2'] as const;

export const authRefreshInterceptor: HttpInterceptorFn = (request, next) => {
  if (SKIP_REFRESH_PATHS.some((path) => request.url.includes(path))) {
    return next(request);
  }

  if (!request.url.startsWith(environment.apiBaseUrl)) {
    return next(request);
  }

  const authService = inject(AuthService);
  const router = inject(Router);

  return next(request).pipe(
    catchError((error) => {
      if (error.status !== HttpStatusCode.Unauthorized) {
        return throwError(() => error);
      }

      return authService.refresh().pipe(
        switchMap(() => next(request)),
        catchError((refreshError) => {
          const currentPath = router.url.split('?')[0];
          const isPublicAuthPath = currentPath === '/login' || currentPath === '/reset-password';

          if (!isPublicAuthPath) {
            router.navigate(['/login'], { replaceUrl: true });
          }

          return throwError(() => refreshError);
        }),
      );
    }),
  );
};
