import { Injectable } from '@angular/core';
import { HistorySnapshot } from '../../canvas.types';

const MAX_HISTORY_STEPS = 50;

// IndexedDB persistence

const DB_NAME = 'favigon-canvas-history';
const DB_VERSION = 1;
const STORE_NAME = 'undo-stacks';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const DEBOUNCE_MS = 400;
const MAX_PAYLOAD_CHARS = 10 * 1024 * 1024;

interface HistoryRecord {
  projectId: number;
  stack: HistorySnapshot[];
  savedAt: number;
}

@Injectable()
export class CanvasHistoryService {
  private readonly dbReady: Promise<IDBDatabase | null>;
  private readonly debounceTimers = new Map<number, ReturnType<typeof setTimeout>>();

  private undoStack: HistorySnapshot[] = [];
  private redoStack: HistorySnapshot[] = [];
  private pendingGestureSnapshot: HistorySnapshot | null = null;
  private pendingTextEditSnapshot: HistorySnapshot | null = null;
  private isApplying = false;
  private projectId: number | null = null;

  constructor() {
    this.dbReady = this.openDb();
  }

  get isApplyingHistory(): boolean {
    return this.isApplying;
  }

  setProjectId(id: number | null): void {
    this.projectId = id;
  }

  restoreStack(stack: HistorySnapshot[]): void {
    this.undoStack = stack;
    this.redoStack = [];
  }

  async restoreFromDb(projectId: number): Promise<void> {
    const stack = await this.restore(projectId);
    if (stack && stack.length > 0) {
      this.restoreStack(stack);
    }
  }

  // Atomic history

  runWithHistory(createSnapshot: () => HistorySnapshot, action: () => void): void {
    if (this.isApplying) {
      action();
      return;
    }

    const snapshot = createSnapshot();
    action();
    this.pushIfChanged(snapshot, createSnapshot());
  }


  beginGestureHistory(createSnapshot: () => HistorySnapshot): void {
    if (this.isApplying || this.pendingGestureSnapshot) {
      return;
    }

    this.pendingGestureSnapshot = createSnapshot();
  }

  commitGestureHistory(currentSnapshot?: () => HistorySnapshot): void {
    if (!this.pendingGestureSnapshot) {
      return;
    }

    const snapshot = this.pendingGestureSnapshot;
    this.pendingGestureSnapshot = null;

    if (currentSnapshot) {
      this.pushIfChanged(snapshot, currentSnapshot());
    }
  }

  // Text-Edit history

  beginTextEditHistory(createSnapshot: () => HistorySnapshot): void {
    if (this.isApplying || this.pendingTextEditSnapshot) {
      return;
    }

    this.pendingTextEditSnapshot = createSnapshot();
  }

  commitTextEditHistory(currentSnapshot?: () => HistorySnapshot): void {
    if (!this.pendingTextEditSnapshot) {
      return;
    }

    const snapshot = this.pendingTextEditSnapshot;
    this.pendingTextEditSnapshot = null;

    if (currentSnapshot) {
      this.pushIfChanged(snapshot, currentSnapshot());
    }
  }

  // Undo / redo

  undo(
    createSnapshot: () => HistorySnapshot,
    applySnapshot: (snapshot: HistorySnapshot) => void,
  ): void {
    this.commitGestureHistory(createSnapshot);
    this.commitTextEditHistory(createSnapshot);

    const snapshot = this.undoStack.pop();
    if (!snapshot) {
      return;
    }

    this.redoStack.push(createSnapshot());
    this.applySnapshot(snapshot, applySnapshot);
  }

  redo(
    createSnapshot: () => HistorySnapshot,
    applySnapshot: (snapshot: HistorySnapshot) => void,
  ): void {
    this.commitGestureHistory(createSnapshot);
    this.commitTextEditHistory(createSnapshot);

    const snapshot = this.redoStack.pop();
    if (!snapshot) {
      return;
    }

    this.undoStack.push(createSnapshot());
    this.trimUndoStack();
    this.applySnapshot(snapshot, applySnapshot);
  }

  resetHistory(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.pendingGestureSnapshot = null;
    this.pendingTextEditSnapshot = null;
    if (this.projectId !== null) {
      this.clear(this.projectId);
    }
  }

  // Private history helpers

  private applySnapshot(
    snapshot: HistorySnapshot,
    apply: (snapshot: HistorySnapshot) => void,
  ): void {
    this.isApplying = true;
    apply(snapshot);
    this.isApplying = false;
  }

  private pushIfChanged(before: HistorySnapshot, after: HistorySnapshot): void {
    if (this.isApplying || this.areEqual(before, after)) {
      return;
    }

    this.undoStack.push(before);
    this.trimUndoStack();
    this.redoStack = [];

    if (this.projectId !== null) {
      this.persist(this.projectId, [...this.undoStack]);
    }
  }

  private trimUndoStack(): void {
    if (this.undoStack.length > MAX_HISTORY_STEPS) {
      this.undoStack = this.undoStack.slice(-MAX_HISTORY_STEPS);
    }
  }

  private areEqual(left: HistorySnapshot, right: HistorySnapshot): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  // IndexedDB persistence

  private persist(projectId: number, stack: HistorySnapshot[]): void {
    const existing = this.debounceTimers.get(projectId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.debounceTimers.delete(projectId);
      void this.writeStack(projectId, stack);
    }, DEBOUNCE_MS);

    this.debounceTimers.set(projectId, timer);
  }

  private async restore(projectId: number): Promise<HistorySnapshot[] | null> {
    const db = await this.dbReady;
    if (!db) return null;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(projectId);
        req.onsuccess = () => {
          const record = req.result as HistoryRecord | undefined;
          if (!record) {
            resolve(null);
            return;
          }
          if (Date.now() - record.savedAt > MAX_AGE_MS) {
            resolve(null);
            return;
          }
          resolve(record.stack);
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  private clear(projectId: number): void {
    const existing = this.debounceTimers.get(projectId);
    if (existing) {
      clearTimeout(existing);
      this.debounceTimers.delete(projectId);
    }

    void this.dbReady.then((db) => {
      if (!db) return;
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(projectId);
      } catch {}
    });
  }

  private async writeStack(projectId: number, stack: HistorySnapshot[]): Promise<void> {
    const db = await this.dbReady;
    if (!db || stack.length === 0) return;

    try {
      const record: HistoryRecord = { projectId, stack, savedAt: Date.now() };
      const json = JSON.stringify(record);
      if (json.length > MAX_PAYLOAD_CHARS) {
        return;
      }

      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record);
    } catch (err) {
      console.warn('[undo-persist] Failed to write to IndexedDB:', err);
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
        console.warn('[undo-persist] Could not open IndexedDB for history persistence.');
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
        if (!cursor) return;
        const record = cursor.value as HistoryRecord;
        if (record.savedAt < cutoff) cursor.delete();
        cursor.continue();
      };
    } catch {
      // Ignore pruning errors — not critical.
    }
  }
}
