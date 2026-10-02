import { File, Paths } from "expo-file-system";

import { ApiError, api } from "../api/client";
import { enqueue, flushQueue, isTempId, newId, type Op } from "./queue";

interface State {
  queue: Op[];
  cache: Record<string, unknown>;
  /** Temporary annotation ids -> server ids, so later ops can still address them. */
  idMap: Record<string, string>;
  /** User who owns the cached data and queue. */
  owner?: string;
}

let state: State = { queue: [], cache: {}, idMap: {} };
let loaded: Promise<void> | null = null;
let flushing: Promise<void> | null = null;
let onSynced: (() => void) | null = null;

const file = () => new File(Paths.document, "offline.json");

function load(): Promise<void> {
  loaded ??= (async () => {
    try {
      const f = file();
      if (f.exists)
        state = {
          queue: [],
          cache: {},
          idMap: {},
          ...(JSON.parse(await f.text()) as Partial<State>),
        };
    } catch {
      /* corrupt or missing file: start empty */
    }
  })();
  return loaded;
}

function save() {
  try {
    const f = file();
    if (!f.exists) f.create();
    f.write(JSON.stringify(state));
  } catch {
    /* best effort */
  }
}

export function setOnSynced(cb: () => void) {
  onSynced = cb;
}

/** Drops all cached data and pending operations (used on sign-out so accounts never mix). */
export async function resetOffline() {
  await load();
  state = { queue: [], cache: {}, idMap: {} };
  try {
    const f = file();
    if (f.exists) f.delete();
  } catch {
    /* best effort */
  }
}

/** Call after authenticating: discards another user's leftover data, keeps the same user's pending changes. */
export async function claimOffline(userId: string) {
  await load();
  if (state.owner && state.owner !== userId) await resetOffline();
  state.owner = userId;
  save();
}

export async function pendingCount(): Promise<number> {
  await load();
  return state.queue.length;
}

export async function getQueue(): Promise<Op[]> {
  await load();
  return state.queue;
}

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  await load();
  return state.cache[key] as T | undefined;
}

export async function cacheSet(key: string, value: unknown) {
  await load();
  state.cache[key] = value;
  save();
}

/** Network-first read that falls back to the last cached value when offline. */
export async function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  try {
    const value = await fetcher();
    await cacheSet(key, value);
    return value;
  } catch (err) {
    const fallback = await cacheGet<T>(key);
    if (fallback !== undefined && isTransient(err)) return fallback;
    throw err;
  }
}

export function isTransient(err: unknown): boolean {
  return (
    !(err instanceof ApiError) || err.status >= 500 || err.status === 408 || err.status === 429
  );
}

export async function addOp(op: Op) {
  await load();
  state.queue = enqueue(state.queue, op);
  save();
  void syncNow();
}

export { isTempId, newId };

async function runOp(op: Op) {
  switch (op.kind) {
    case "createAnnotation": {
      const created = await api.createAnnotation(op.bookId, op.body);
      state.idMap[op.tempId] = created.id;
      return;
    }
    case "deleteAnnotation":
      return api.deleteAnnotation(state.idMap[op.annotationId] ?? op.annotationId);
    case "putProgress":
      await api.putProgress(op.bookId, op.body);
      return;
    case "logSession":
      await api.logSession(op.body);
  }
}

/** Flushes the pending queue. Safe to call often; concurrent calls share one run. */
export function syncNow(): Promise<void> {
  flushing ??= (async () => {
    await load();
    const snapshot = state.queue;
    if (snapshot.length === 0) return;
    const remaining = await flushQueue(snapshot, { run: runOp, isTransient });
    const kept = new Set(remaining.map((o) => o.id));
    // Ops enqueued while flushing are not in the snapshot and are preserved.
    const processed = new Set(snapshot.filter((o) => !kept.has(o.id)).map((o) => o.id));
    state.queue = state.queue.filter((o) => !processed.has(o.id));
    save();
    if (processed.size > 0) onSynced?.();
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}
