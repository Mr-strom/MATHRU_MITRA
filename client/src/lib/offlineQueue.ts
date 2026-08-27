/**
 * MaatruMitra — Typed IndexedDB Offline Queue & Store Adapter.
 *
 * SAFETY & PRIVACY:
 * - Persists strictly synthetic demo fields: local action ID, consent snapshot,
 *   draft metadata, Kannada transcript revisions, administrative fields, and sync state.
 * - NEVER stores auth tokens, cookies, passwords, or real patient identifiers.
 * - Never discards server-confirmed tasks.
 *
 * STATES:
 * - LOCAL_DRAFT: Draft created locally while offline.
 * - WAITING_TO_SYNC: Ready to be sent to server in FIFO sequence.
 * - SYNCING: In-flight request to POST /api/v1/sync/actions.
 * - SYNCED: Authoritatively confirmed and applied by server.
 * - SYNC_FAILED: Server rejection or network failure (retry available).
 * - CONFLICT_REVIEW_REQUIRED: State conflict or stale base version (human review required).
 */

import { nanoid } from "nanoid";

export type SyncState =
  | "LOCAL_DRAFT"
  | "WAITING_TO_SYNC"
  | "SYNCING"
  | "SYNCED"
  | "SYNC_FAILED"
  | "CONFLICT_REVIEW_REQUIRED";

export interface QueuedAction {
  action_id: string;
  idempotency_key: string;
  entity_type: "VOICE_NOTE" | "TRANSCRIPT_REVISION" | "FOLLOW_UP_DRAFT" | "TASK";
  entity_id: string;
  action_type: string;
  base_server_version: number | null;
  payload: Record<string, unknown>;
  created_at: string;
  retry_count: number;
  sync_state: SyncState;
  last_error?: string | null;
  conflict_code?: string | null;
  authoritative_entity?: Record<string, unknown> | null;
}

const DB_NAME = "maatrumitra_offline_v1";
const DB_VERSION = 1;
const STORE_NAME = "queued_actions";

// In-memory fallback for environments where indexedDB is unavailable (e.g. SSR/tests)
const memoryStore = new Map<string, QueuedAction>();

function isIndexedDbAvailable(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window && window.indexedDB !== null;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDbAvailable()) {
      reject(new Error("IndexedDB is not available"));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "action_id" });
        store.createIndex("by_sync_state", "sync_state", { unique: false });
        store.createIndex("by_created_at", "created_at", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Retrieves all queued actions ordered by creation time.
 */
export async function getAllQueuedActions(): Promise<QueuedAction[]> {
  if (!isIndexedDbAvailable()) {
    return Array.from(memoryStore.values()).sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }

  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        const items = (req.result as QueuedAction[]).sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        resolve(items);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return Array.from(memoryStore.values());
  }
}

/**
 * Enqueues a new synthetic workflow action.
 */
export async function queueAction(
  action: Omit<
    QueuedAction,
    "action_id" | "idempotency_key" | "created_at" | "retry_count" | "sync_state" | "base_server_version"
  > & {
    action_id?: string;
    idempotency_key?: string;
    sync_state?: SyncState;
    base_server_version?: number | null;
  }
): Promise<QueuedAction> {
  const item: QueuedAction = {
    action_id: action.action_id ?? `act_${nanoid(16)}`,
    idempotency_key: action.idempotency_key ?? `idem_${nanoid(21)}`,
    entity_type: action.entity_type,
    entity_id: action.entity_id,
    action_type: action.action_type,
    base_server_version: action.base_server_version ?? null,
    payload: action.payload,
    created_at: new Date().toISOString(),
    retry_count: 0,
    sync_state: action.sync_state ?? "WAITING_TO_SYNC",
  };

  if (!isIndexedDbAvailable()) {
    memoryStore.set(item.action_id, item);
    return item;
  }

  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    memoryStore.set(item.action_id, item);
  }

  return item;
}

/**
 * Updates an action's state (e.g. after sync attempt).
 */
export async function updateAction(item: QueuedAction): Promise<void> {
  if (!isIndexedDbAvailable()) {
    memoryStore.set(item.action_id, item);
    return;
  }

  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    memoryStore.set(item.action_id, item);
  }
}

/**
 * Retries a failed or conflict-paused action.
 */
export async function retryAction(actionId: string): Promise<void> {
  const actions = await getAllQueuedActions();
  const action = actions.find((a) => a.action_id === actionId);
  if (!action) return;

  action.sync_state = "WAITING_TO_SYNC";
  action.last_error = null;
  action.conflict_code = null;
  await updateAction(action);
}

/**
 * Discards a synthetic local draft with safety guard against deleting server-confirmed tasks.
 */
export async function discardLocalDraft(actionId: string): Promise<boolean> {
  const actions = await getAllQueuedActions();
  const action = actions.find((a) => a.action_id === actionId);
  if (!action) return false;

  // SAFETY GUARD: Never discard a server-confirmed task from the client
  if (action.entity_type === "TASK" && action.sync_state === "SYNCED") {
    throw new Error("Safety violation: Server-confirmed tasks cannot be discarded from the offline queue.");
  }

  if (!isIndexedDbAvailable()) {
    memoryStore.delete(actionId);
    return true;
  }

  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(actionId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    return true;
  } catch {
    memoryStore.delete(actionId);
    return true;
  }
}

/**
 * Clears all non-task SYNCED actions to free local storage.
 */
export async function clearSyncedActions(): Promise<void> {
  const actions = await getAllQueuedActions();
  const synced = actions.filter((a) => a.sync_state === "SYNCED" && a.entity_type !== "TASK");
  for (const item of synced) {
    await discardLocalDraft(item.action_id);
  }
}

/**
 * Sequentially processes pending offline queue items with the provided API sync handler.
 */
export async function processOfflineQueue(
  syncHandler: (action: QueuedAction) => Promise<{
    result: "APPLIED" | "ALREADY_APPLIED" | "CONFLICT" | "REJECTED";
    authoritative_entity: Record<string, unknown> | null;
    audit_event_id: string | null;
    conflict_code: string | null;
  }>
): Promise<{
  syncedCount: number;
  failedCount: number;
  conflictCount: number;
}> {
  const actions = await getAllQueuedActions();
  const pending = actions.filter(
    (a) => a.sync_state === "WAITING_TO_SYNC" || a.sync_state === "LOCAL_DRAFT"
  );

  let syncedCount = 0;
  let failedCount = 0;
  let conflictCount = 0;

  for (const action of pending) {
    action.sync_state = "SYNCING";
    await updateAction(action);

    try {
      const res = await syncHandler(action);

      if (res.result === "APPLIED" || res.result === "ALREADY_APPLIED") {
        action.sync_state = "SYNCED";
        action.authoritative_entity = res.authoritative_entity;
        action.last_error = null;
        action.conflict_code = null;
        syncedCount++;
      } else if (res.result === "CONFLICT") {
        action.sync_state = "CONFLICT_REVIEW_REQUIRED";
        action.authoritative_entity = res.authoritative_entity;
        action.conflict_code = res.conflict_code;
        action.retry_count += 1;
        conflictCount++;
      } else {
        action.sync_state = "SYNC_FAILED";
        action.conflict_code = res.conflict_code;
        action.retry_count += 1;
        failedCount++;
      }
    } catch (err: unknown) {
      action.sync_state = "SYNC_FAILED";
      action.last_error = err instanceof Error ? err.message : "Network error during sync";
      action.retry_count += 1;
      failedCount++;
    }

    await updateAction(action);
  }

  return { syncedCount, failedCount, conflictCount };
}

/**
 * Marks a queued conflict as authoritatively resolved after calling /sync/conflicts/resolve.
 */
export async function resolveQueuedConflict(
  actionId: string,
  resolvedEntity: Record<string, unknown>
): Promise<void> {
  const actions = await getAllQueuedActions();
  const action = actions.find((a) => a.action_id === actionId);
  if (!action) return;

  action.sync_state = "SYNCED";
  action.authoritative_entity = resolvedEntity;
  action.conflict_code = null;
  action.last_error = null;
  await updateAction(action);
}

