import type { AuthResponse, AuthTokens, Book } from "@ereader/shared";
import * as SecureStore from "expo-secure-store";

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";

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

export const api = {
  register: (email: string, password: string, displayName?: string) =>
    request<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, displayName }),
    }),
  login: (email: string, password: string) =>
    request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: (refreshToken: string) =>
    request<void>("/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken }) }),
  listBooks: (search?: string) =>
    request<Book[]>(`/books${search ? `?search=${encodeURIComponent(search)}` : ""}`),
};
