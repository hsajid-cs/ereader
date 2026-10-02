import type { User } from "@ereader/shared";
import { create } from "zustand";

import {
  api,
  clearTokens,
  getStoredRefreshToken,
  setSignedOutHandler,
  storeTokens,
} from "../api/client";
import { claimOffline, resetOffline } from "../offline/store";

interface AuthState {
  user: User | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signOut: () => Promise<void>;
  restore: () => Promise<void>;
  updateProfile: (displayName: string) => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  ready: false,
  async signIn(email, password) {
    const res = await api.login(email, password);
    await storeTokens(res);
    await claimOffline(res.user.id);
    set({ user: res.user });
  },
  async signUp(email, password, displayName) {
    const res = await api.register(email, password, displayName);
    await storeTokens(res);
    await claimOffline(res.user.id);
    set({ user: res.user });
  },
  async signOut() {
    const refreshToken = await getStoredRefreshToken();
    if (refreshToken) await api.logout(refreshToken).catch(() => undefined);
    await clearTokens();
    await resetOffline();
    set({ user: null });
  },
  async updateProfile(displayName) {
    set({ user: await api.updateMe({ displayName }) });
  },
  async restore() {
    // Tokens are refreshed lazily; a successful /users/me confirms the stored session.
    try {
      const user = await api.me();
      await claimOffline(user.id);
      set({ user, ready: true });
    } catch {
      set({ user: null, ready: true });
    }
  },
}));

setSignedOutHandler(() => useAuth.setState({ user: null }));
