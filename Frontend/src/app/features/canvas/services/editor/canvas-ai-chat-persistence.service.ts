import { Injectable, signal } from '@angular/core';
import type { AiChatMessage } from '@app/core';

const DB_NAME = 'favigon-canvas-ai-chat';
const DB_VERSION = 1;
const STORE_NAME = 'ai-chat-state';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const DEBOUNCE_MS = 300;
const MAX_MESSAGES = 40;
const MAX_MESSAGE_LENGTH = 8000;

export interface PersistedAiChatMessage {
  role: AiChatMessage['role'];
  content: string;
  timestamp: number;
  error?: boolean;
}

export interface PersistedAiChatState {
  projectId: number;
  messages: PersistedAiChatMessage[];
  draftInput: string;
  selectedModel: string;
  activeTab: 'navigator' | 'ai-chat';
  lastAiPrompt: string | null;
  savedAt: number;
}

@Injectable()
export class CanvasAiChatPersistenceService {
  private readonly dbReady: Promise<IDBDatabase | null>;
  private readonly debounceTimers = new Map<number, ReturnType<typeof setTimeout>>();

  readonly currentProjectId = signal<number | null>(null);
  readonly restoredProjectId = signal<number | null>(null);
  readonly restoredState = signal<PersistedAiChatState | null>(null);

  constructor() {
    this.dbReady = this.openDb();
  }

  setProjectId(projectId: number | null): void {
    this.currentProjectId.set(projectId);
    this.restoredProjectId.set(null);
    this.restoredState.set(null);
  }

  async restore(projectId: number): Promise<PersistedAiChatState | null> {
    const restored = await this.read(projectId);
    this.restoredState.set(restored);
    this.restoredProjectId.set(projectId);
    return restored;
  }

  persist(projectId: number, state: PersistedAiChatState): void {
    const existing = this.debounceTimers.get(projectId);
    if (existing) {
      clearTimeout(existing);
    }

    const normalized = this.normalizeState(state);
    const timer = setTimeout(() => {
      this.debounceTimers.delete(projectId);
      void this.write(projectId, normalized);
    }, DEBOUNCE_MS);

    this.debounceTimers.set(projectId, timer);
  }

  clear(projectId: number): void {
    const existing = this.debounceTimers.get(projectId);
    if (existing) {
      clearTimeout(existing);
      this.debounceTimers.delete(projectId);
    }

    void this.dbReady.then((db) => {
      if (!db) {
        return;
      }

      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(projectId);
      } catch {}
    });
  }

  private normalizeState(state: PersistedAiChatState): PersistedAiChatState {
    return {
      projectId: state.projectId,
      messages: state.messages
        .slice(-MAX_MESSAGES)
        .map((message) => ({
          role: message.role,
          content: this.normalizeText(message.content),
          timestamp: message.timestamp,
          error: message.error === true ? true : undefined,
        })),
      draftInput: this.normalizeText(state.draftInput),
      selectedModel: state.selectedModel,
      activeTab: state.activeTab === 'ai-chat' ? 'ai-chat' : 'navigator',
      lastAiPrompt: state.lastAiPrompt ? this.normalizeText(state.lastAiPrompt) : null,
      savedAt: Date.now(),
    };
  }

  private normalizeText(value: string): string {
    return value.length > MAX_MESSAGE_LENGTH ? value.slice(0, MAX_MESSAGE_LENGTH) : value;
  }

  private async read(projectId: number): Promise<PersistedAiChatState | null> {
    const db = await this.dbReady;
    if (!db) {
      return null;
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(projectId);
        req.onsuccess = () => {
          const record = req.result as PersistedAiChatState | undefined;
          if (!record) {
            resolve(null);
            return;
          }

          if (Date.now() - record.savedAt > MAX_AGE_MS) {
            resolve(null);
            return;
          }

          resolve(this.normalizeState(record));
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  private async write(projectId: number, state: PersistedAiChatState): Promise<void> {
    const db = await this.dbReady;
    if (!db) {
      return;
    }

    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({
        ...state,
        projectId,
      } satisfies PersistedAiChatState);
    } catch (error) {
      console.warn('[ai-chat-persist] Failed to write to IndexedDB:', error);
    }
  }

  private openDb(): Promise<IDBDatabase | null> {
    return new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }

      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'projectId' });
        }
      };

      req.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        this.pruneOldEntries(db);
        resolve(db);
      };

      req.onerror = () => {
        console.warn('[ai-chat-persist] Could not open IndexedDB for AI chat persistence.');
        resolve(null);
      };
    });
  }

  private pruneOldEntries(db: IDBDatabase): void {
    try {
      const cutoff = Date.now() - MAX_AGE_MS;
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const cursorReq = tx.objectStore(STORE_NAME).openCursor();
      cursorReq.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (!cursor) {
          return;
        }

        const record = cursor.value as PersistedAiChatState;
        if (record.savedAt < cutoff) {
          cursor.delete();
        }
        cursor.continue();
      };
    } catch {
      // Ignore pruning errors.
    }
  }
}
