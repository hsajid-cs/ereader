import type {
  Annotation,
  AuthResponse,
  AuthTokens,
  Book,
  Collection,
  CreateAnnotationRequest,
  CreateReadingSessionRequest,
  ReadingGoal,
  ReadingProgress,
  StatsSummary,
  UpdateAnnotationRequest,
  UpdateProgressRequest,
  User,
} from "@ereader/shared";
import * as SecureStore from "expo-secure-store";

/** Server root, e.g. http://192.168.1.10:4000 (no trailing slash, no /api). */
export const SERVER_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000").replace(
  /\/+$/,
  "",
);
export const API_URL = `${SERVER_URL}/api`;

/** Image source for a book cover, authenticated; null when the book has none. */
export function coverSource(book: Book): { uri: string; headers: Record<string, string> } | null {
  if (!book.coverUrl) return null;
  return {
    uri: `${SERVER_URL}${book.coverUrl}`,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  };
}

const REFRESH_KEY = "ereader.refreshToken";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

let accessToken: string | null = null;
let onSignedOut: (() => void) | null = null;
let refreshing: Promise<boolean> | null = null;

export function setSignedOutHandler(handler: () => void) {
  onSignedOut = handler;
}

export async function storeTokens(tokens: AuthTokens) {
  accessToken = tokens.accessToken;
  await SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken);
}

export async function clearTokens() {
  accessToken = null;
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}

export async function getStoredRefreshToken() {
  return SecureStore.getItemAsync(REFRESH_KEY);
}

async function refreshTokens(): Promise<boolean> {
  const refreshToken = await getStoredRefreshToken();
  if (!refreshToken) return false;
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return false;
  await storeTokens((await res.json()) as AuthTokens);
  return true;
}

export async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });

  if (res.status === 401 && retry) {
    refreshing ??= refreshTokens().finally(() => {
      refreshing = null;
    });
    if (await refreshing) return request<T>(path, init, false);
    await clearTokens();
    onSignedOut?.();
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
      message?: string;
    } | null;
    throw new ApiError(res.status, body?.error ?? "unknown", body?.message ?? res.statusText);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/** Downloads a binary resource with auth (and one refresh retry). */
export async function fetchBinary(path: string, retry = true): Promise<ArrayBuffer> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  if (
    res.status === 401 &&
    retry &&
    (await (refreshing ??= refreshTokens().finally(() => (refreshing = null))))
  ) {
    return fetchBinary(path, false);
  }
  if (!res.ok) throw new ApiError(res.status, "download_failed", res.statusText);
  return res.arrayBuffer();
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});

export const api = {
  register: (email: string, password: string, displayName?: string) =>
    request<AuthResponse>("/auth/register", json("POST", { email, password, displayName })),
  login: (email: string, password: string) =>
    request<AuthResponse>("/auth/login", json("POST", { email, password })),
  logout: (refreshToken: string) => request<void>("/auth/logout", json("POST", { refreshToken })),
  me: () => request<User>("/users/me"),
  updateMe: (patch: { displayName?: string }) => request<User>("/users/me", json("PATCH", patch)),

  listBooks: (opts: { search?: string; collectionId?: string } = {}) => {
    const q = new URLSearchParams();
    if (opts.search) q.set("search", opts.search);
    if (opts.collectionId) q.set("collectionId", opts.collectionId);
    const qs = q.toString();
    return request<Book[]>(`/books${qs ? `?${qs}` : ""}`);
  },
  uploadBook: (
    file: { uri: string; name: string; mimeType?: string },
    title?: string,
    author?: string,
  ) => {
    const form = new FormData();
    if (title) form.append("title", title);
    if (author) form.append("author", author);
    // React Native's FormData accepts { uri, name, type } descriptors in place of Blobs.
    form.append("file", {
      uri: file.uri,
      name: file.name,
      type: file.mimeType ?? "application/octet-stream",
    } as unknown as Blob);
    return request<Book>("/books", { method: "POST", body: form });
  },
  updateBook: (id: string, patch: { title?: string; author?: string }) =>
    request<Book>(`/books/${id}`, json("PATCH", patch)),
  deleteBook: (id: string) => request<void>(`/books/${id}`, { method: "DELETE" }),
  downloadBook: (id: string) => fetchBinary(`/books/${id}/file`),

  getProgress: async (bookId: string): Promise<ReadingProgress | null> => {
    try {
      return await request<ReadingProgress>(`/books/${bookId}/progress`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  },
  putProgress: (bookId: string, body: UpdateProgressRequest) =>
    request<ReadingProgress>(`/books/${bookId}/progress`, json("PUT", body)),

  listAnnotations: (bookId: string) => request<Annotation[]>(`/books/${bookId}/annotations`),
  createAnnotation: (bookId: string, body: CreateAnnotationRequest) =>
    request<Annotation>(`/books/${bookId}/annotations`, json("POST", body)),
  updateAnnotation: (id: string, body: UpdateAnnotationRequest) =>
    request<Annotation>(`/annotations/${id}`, json("PATCH", body)),
  deleteAnnotation: (id: string) => request<void>(`/annotations/${id}`, { method: "DELETE" }),

  listCollections: () => request<Collection[]>("/collections"),
  createCollection: (name: string) => request<Collection>("/collections", json("POST", { name })),
  renameCollection: (id: string, name: string) =>
    request<Collection>(`/collections/${id}`, json("PATCH", { name })),
  deleteCollection: (id: string) => request<void>(`/collections/${id}`, { method: "DELETE" }),
  addToCollection: (id: string, bookId: string) =>
    request<void>(`/collections/${id}/books/${bookId}`, { method: "POST" }),
  removeFromCollection: (id: string, bookId: string) =>
    request<void>(`/collections/${id}/books/${bookId}`, { method: "DELETE" }),

  statsSummary: () => request<StatsSummary>("/stats/summary"),
  setGoal: (dailyMinutesGoal: number) =>
    request<ReadingGoal>("/stats/goal", json("PUT", { dailyMinutesGoal })),
  logSession: (body: CreateReadingSessionRequest) =>
    request<unknown>("/stats/sessions", json("POST", body)),
};
