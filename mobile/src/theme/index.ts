import type { ReaderTheme } from "@ereader/shared";
import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

export interface Palette {
  background: string;
  text: string;
  muted: string;
  accent: string;
  surface: string;
  border: string;
}

export const palettes: Record<ReaderTheme, Palette> = {
  light: {
    background: "#ffffff",
    text: "#1a1a1a",
    muted: "#6b6b6b",
    accent: "#0b6fd6",
    surface: "#f3f3f3",
    border: "#dddddd",
  },
  sepia: {
    background: "#f4ecd8",
    text: "#4a3b28",
    muted: "#8a7960",
    accent: "#9c5b1a",
    surface: "#eadfc4",
    border: "#d9cba8",
  },
  dark: {
    background: "#121212",
    text: "#e6e6e6",
    muted: "#9a9a9a",
    accent: "#6cb2ff",
    surface: "#1e1e1e",
    border: "#333333",
  },
};

export const highlightColors = ["#fff176", "#a5d6a7", "#90caf9", "#f48fb1"];

interface SettingsState {
  theme: ReaderTheme;
  fontSize: number;
  serif: boolean;
  lineHeight: number;
  margin: number;
  setLineHeight: (n: number) => void;
  setMargin: (n: number) => void;
  setTheme: (t: ReaderTheme) => void;
  setFontSize: (n: number) => void;
  setSerif: (b: boolean) => void;
  load: () => Promise<void>;
}

const KEY = "ereader.settings";

function persist(get: () => SettingsState) {
  const { theme, fontSize, serif, lineHeight, margin } = get();
  SecureStore.setItemAsync(
    KEY,
    JSON.stringify({ theme, fontSize, serif, lineHeight, margin }),
  ).catch(() => undefined);
}

export const useSettings = create<SettingsState>((set, get) => ({
  theme: "light",
  fontSize: 18,
  serif: true,
  lineHeight: 1.5,
  margin: 24,
  setLineHeight: (lineHeight) => {
    set({ lineHeight });
    persist(get);
  },
  setMargin: (margin) => {
    set({ margin });
    persist(get);
  },
  setTheme: (theme) => {
    set({ theme });
    persist(get);
  },
  setFontSize: (n) => {
    set({ fontSize: Math.min(32, Math.max(12, n)) });
    persist(get);
  },
  setSerif: (serif) => {
    set({ serif });
    persist(get);
  },
  async load() {
    try {
      const raw = await SecureStore.getItemAsync(KEY);
      if (raw) set(JSON.parse(raw) as Partial<SettingsState>);
    } catch {
      /* keep defaults */
    }
  },
}));

export const usePalette = () => palettes[useSettings((s) => s.theme)];
