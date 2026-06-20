import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
  UserMe,
  UserProfile,
  UserProfileUpdateRequest,
  UserSearchResult,
  UserFollowItem,
} from '../models/user.models';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  // Current user cache

  private readonly _currentUser = signal<UserMe | null | undefined>(undefined);
  readonly currentUser = this._currentUser.asReadonly();

  private readonly _loggedOut = signal(false);
  readonly loggedOut = this._loggedOut.asReadonly();

  loadCurrentUser(): Observable<UserMe | null> {
    const cached = this._currentUser();
    if (cached !== undefined) return of(cached);

    return this.getMe().pipe(
      tap((user) => this._currentUser.set(user)),
      catchError(() => {
        this._currentUser.set(null);
        return of(null);
      }),
    );
  }

  setCurrentUser(user: UserMe): void {
    this._currentUser.set(user);
    this._loggedOut.set(false);
  }

  invalidateCurrentUser(): void {
    this._currentUser.set(undefined);
  }

  markLoggedOut(): void {
    this._currentUser.set(null);
    this._loggedOut.set(true);
  }

  // HTTP

  getMe(): Observable<UserMe> {
    return this.http.get<UserMe>(`${this.baseUrl}/users/me`);
  }

  updateMe(request: UserProfileUpdateRequest): Observable<UserMe> {
    return this.http.put<UserMe>(`${this.baseUrl}/users/me`, request);
  }

  uploadMyProfileImage(file: File): Observable<UserMe> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<UserMe>(`${this.baseUrl}/users/me/profile-image`, formData);
  }

  deleteMe(): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/users/me`);
  }

  unlinkProvider(provider: string): Observable<void> {
    return this.http.delete<void>(
      `${this.baseUrl}/users/me/linked-accounts/${encodeURIComponent(provider)}`,
    );
  }

  getByUsername(username: string): Observable<UserProfile> {
    return this.http.get<UserProfile>(`${this.baseUrl}/users/${encodeURIComponent(username)}`);
  }

  followUser(username: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/users/${encodeURIComponent(username)}/follow`, {});
  }

  unfollowUser(username: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/users/${encodeURIComponent(username)}/follow`);
  }

  getFollowers(username: string): Observable<UserFollowItem[]> {
    return this.http.get<UserFollowItem[]>(
      `${this.baseUrl}/users/${encodeURIComponent(username)}/followers`,
    );
  }

  getFollowing(username: string): Observable<UserFollowItem[]> {
    return this.http.get<UserFollowItem[]>(
      `${this.baseUrl}/users/${encodeURIComponent(username)}/following`,
    );
  }

  search(query: string): Observable<UserSearchResult[]> {
    return this.http.get<UserSearchResult[]>(`${this.baseUrl}/users/search`, {
      params: { q: query },
    });
  }
}
