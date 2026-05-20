import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { UserService } from '../services/user.service';

export const loginEntryGuard: CanActivateFn = (route) => {
  if (route.queryParamMap.has('code')) {
    return true;
  }

  const currentUser = inject(UserService);
  const router = inject(Router);

  return currentUser
    .loadCurrentUser()
    .pipe(map((user) => (user !== null ? router.createUrlTree(['/', user.username]) : true)));
};
