import type { User } from "@ereader/shared";
import { create } from "zustand";

import {
  api,
  clearTokens,
  getStoredRefreshToken,
  setSignedOutHandler,
  storeTokens,
} from "../api/client";

interface AuthState {
  user: User | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signOut: () => Promise<void>;
  restore: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  ready: false,
  async signIn(email, password) {
    const res = await api.login(email, password);
    await storeTokens(res);
    set({ user: res.user });
  },
  async signUp(email, password, displayName) {
    const res = await api.register(email, password, displayName);
    await storeTokens(res);
    set({ user: res.user });
  },
  async signOut() {
    const refreshToken = await getStoredRefreshToken();
    if (refreshToken) await api.logout(refreshToken).catch(() => undefined);
    await clearTokens();
    set({ user: null });
  },
  async restore() {
    // Tokens are refreshed lazily; a successful /users/me confirms the stored session.
    try {
      const { request } = await import("../api/client");
      const user = await request<User>("/users/me");
      set({ user, ready: true });
    } catch {
      set({ user: null, ready: true });
    }
  },
}));

setSignedOutHandler(() => useAuth.setState({ user: null }));
