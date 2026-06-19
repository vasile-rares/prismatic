import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { dataUrlToBlob } from '../utils/data-url.util';
import {
  ProjectCreateRequest,
  ProjectDesignResponse,
  ProjectDesignSaveRequest,
  ProjectImageUploadResponse,
  ProjectResponse,
  ProjectUpdateRequest,
} from '../models/project.models';

const PENDING_FLUSH_KEY_PREFIX = 'favigon.pending-project-flush.';

interface PendingFlushPayload {
  version: 1;
  projectId: number;
  designJson: string;
  thumbnailDataUrl: string | null;
  createdAt: number;
}

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  constructor() {
    queueMicrotask(() => this.replayPendingFlushes());
  }

  // Pending flush (crash recovery)

  queueAndDispatchFlush(
    projectId: number,
    designJson: string,
    thumbnailDataUrl: string | null,
  ): void {
    const payload: PendingFlushPayload = {
      version: 1,
      projectId,
      designJson,
      thumbnailDataUrl,
      createdAt: Date.now(),
    };
    this.writePendingPayload(payload);
    this.dispatchExitFlush(projectId, designJson, dataUrlToBlob(thumbnailDataUrl));
  }

  clearPendingFlush(projectId: number): void {
    if (!this.canUseLocalStorage()) return;
    try {
      window.localStorage.removeItem(this.getPendingFlushKey(projectId));
    } catch {
      // Ignore storage failures.
    }
  }

  private replayPendingFlushes(): void {
    const payloads = this.readPendingPayloads();
    if (payloads.length === 0) return;

    for (const payload of payloads.sort((a, b) => a.createdAt - b.createdAt)) {
      this.flushProjectOnExit(
        payload.projectId,
        payload.designJson,
        dataUrlToBlob(payload.thumbnailDataUrl),
      ).subscribe({
        next: () => this.clearPendingFlush(payload.projectId),
        error: (err: { status?: number }) => {
          if (err.status === 404) this.clearPendingFlush(payload.projectId);
        },
      });
    }
  }

  private readPendingPayloads(): PendingFlushPayload[] {
    if (!this.canUseLocalStorage()) return [];
    const payloads: PendingFlushPayload[] = [];
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (!key?.startsWith(PENDING_FLUSH_KEY_PREFIX)) continue;
        const raw = window.localStorage.getItem(key);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw) as PendingFlushPayload;
          if (
            parsed?.version === 1 &&
            Number.isInteger(parsed.projectId) &&
            typeof parsed.designJson === 'string'
          ) {
            payloads.push(parsed);
          }
        } catch {
          window.localStorage.removeItem(key);
        }
      }
    } catch {
      return [];
    }
    return payloads;
  }

  private writePendingPayload(payload: PendingFlushPayload): void {
    if (!this.canUseLocalStorage()) return;
    try {
      window.localStorage.setItem(
        this.getPendingFlushKey(payload.projectId),
        JSON.stringify(payload),
      );
    } catch {
      // Ignore storage failures.
    }
  }

  private canUseLocalStorage(): boolean {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  }

  private getPendingFlushKey(projectId: number): string {
    return `${PENDING_FLUSH_KEY_PREFIX}${projectId}`;
  }

  getProjects(): Observable<ProjectResponse[]> {
    return this.http
      .get<ProjectResponse[]>(`${this.baseUrl}/projects`)
      .pipe(map((projects) => projects.map((project) => this.normalizeProjectResponse(project))));
  }

  getById(projectId: number): Observable<ProjectResponse> {
    return this.http
      .get<ProjectResponse>(`${this.baseUrl}/projects/${projectId}`)
      .pipe(map((project) => this.normalizeProjectResponse(project)));
  }

  getBySlug(slug: string): Observable<ProjectResponse> {
    return this.http
      .get<ProjectResponse>(`${this.baseUrl}/projects/by-slug/${encodeURIComponent(slug)}`)
      .pipe(map((project) => this.normalizeProjectResponse(project)));
  }

  create(request: ProjectCreateRequest): Observable<ProjectResponse> {
    return this.http
      .post<ProjectResponse>(`${this.baseUrl}/projects`, request)
      .pipe(map((project) => this.normalizeProjectResponse(project)));
  }

  update(projectId: number, request: ProjectUpdateRequest): Observable<ProjectResponse> {
    return this.http
      .put<ProjectResponse>(`${this.baseUrl}/projects/${projectId}`, request)
      .pipe(map((project) => this.normalizeProjectResponse(project)));
  }

  delete(projectId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/projects/${projectId}`);
  }

  getByUserId(userId: number, isPublic?: boolean): Observable<ProjectResponse[]> {
    const params: Record<string, string> = {};
    if (isPublic !== undefined) {
      params['isPublic'] = String(isPublic);
    }
    return this.http
      .get<ProjectResponse[]>(`${this.baseUrl}/projects/user/${userId}`, { params })
      .pipe(map((projects) => projects.map((project) => this.normalizeProjectResponse(project))));
  }

  getMyStars(): Observable<ProjectResponse[]> {
    return this.http
      .get<ProjectResponse[]>(`${this.baseUrl}/users/me/stars`)
      .pipe(map((projects) => projects.map((p) => this.normalizeProjectResponse(p))));
  }

  starProject(projectId: number): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/projects/${projectId}/star`, {});
  }

  unstarProject(projectId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/projects/${projectId}/star`);
  }

  likeProject(projectId: number): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/projects/${projectId}/like`, {});
  }

  unlikeProject(projectId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/projects/${projectId}/like`);
  }

  forkProject(projectId: number): Observable<ProjectResponse> {
    return this.http
      .post<ProjectResponse>(`${this.baseUrl}/projects/${projectId}/fork`, {})
      .pipe(map((project) => this.normalizeProjectResponse(project)));
  }

  getDesign(projectId: number): Observable<ProjectDesignResponse> {
    return this.http.get<ProjectDesignResponse>(`${this.baseUrl}/projects/${projectId}/design`);
  }

  saveDesign(
    projectId: number,
    request: ProjectDesignSaveRequest,
  ): Observable<ProjectDesignResponse> {
    return this.http.put<ProjectDesignResponse>(
      `${this.baseUrl}/projects/${projectId}/design`,
      request,
    );
  }

  flushProjectOnExit(
    projectId: number,
    designJson: string,
    thumbnailFile: Blob | null,
  ): Observable<void> {
    return this.http.post<void>(
      `${this.baseUrl}/projects/${projectId}/flush`,
      this.createExitFlushFormData(designJson, thumbnailFile),
    );
  }

  saveThumbnail(projectId: number, thumbnailFile: Blob): Observable<void> {
    const formData = new FormData();
    formData.append('file', thumbnailFile, this.getThumbnailFileName(thumbnailFile.type));
    return this.http.put<void>(`${this.baseUrl}/projects/${projectId}/thumbnail`, formData);
  }

  uploadImageAsset(projectId: number, file: File): Observable<ProjectImageUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<ProjectImageUploadResponse>(
      `${this.baseUrl}/projects/${projectId}/assets/images`,
      formData,
    );
  }

  dispatchExitFlush(projectId: number, designJson: string, thumbnailFile: Blob | null): void {
    if (typeof fetch !== 'function') {
      return;
    }

    try {
      void fetch(`${this.baseUrl}/projects/${projectId}/flush`, {
        method: 'POST',
        body: this.createExitFlushFormData(designJson, thumbnailFile),
        credentials: 'include',
        keepalive: true,
      });
    } catch {
      // Best-effort only during browser unload.
    }
  }

  private getThumbnailFileName(contentType: string): string {
    switch (contentType) {
      case 'image/png':
        return 'thumbnail.png';
      case 'image/webp':
        return 'thumbnail.webp';
      default:
        return 'thumbnail.jpg';
    }
  }

  private createExitFlushFormData(designJson: string, thumbnailFile: Blob | null): FormData {
    const formData = new FormData();
    formData.append('designJson', designJson);
    if (thumbnailFile) {
      formData.append(
        'thumbnailFile',
        thumbnailFile,
        this.getThumbnailFileName(thumbnailFile.type),
      );
    }
    return formData;
  }

  private normalizeProjectResponse(project: ProjectResponse): ProjectResponse {
    return {
      ...project,
      thumbnailDataUrl: this.resolveProjectAssetUrl(project.thumbnailDataUrl),
    };
  }

  private resolveProjectAssetUrl(url: string | null | undefined): string | null {
    const normalized = url?.trim();
    if (!normalized) {
      return null;
    }

    if (/^(?:data:|https?:)/i.test(normalized)) {
      return normalized;
    }

    const apiOrigin = this.getApiOrigin();
    if (!apiOrigin) {
      return normalized;
    }

    try {
      return new URL(normalized, apiOrigin).toString();
    } catch {
      return normalized;
    }
  }

  private getApiOrigin(): string | null {
    try {
      const base =
        typeof window !== 'undefined'
          ? new URL(this.baseUrl, window.location.origin)
          : new URL(this.baseUrl);
      return base.origin;
    } catch {
      return typeof window !== 'undefined' ? window.location.origin : null;
    }
  }
}
