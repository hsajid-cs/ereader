import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";

import { logSession, saveProgress } from "../offline/data";

/**
 * Debounced progress saving plus reading-session timing. Everything goes through the
 * offline queue, so it also works with no connection.
 */
export function useReadingSync(bookId: string) {
  const qc = useQueryClient();
  const latest = useRef<{ location: string; percentage: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const sessionStart = useRef(new Date());

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const l = latest.current;
    latest.current = null;
    if (l) void saveProgress(bookId, l.location, l.percentage);
  }, [bookId]);

  const endSession = useCallback(() => {
    const end = new Date();
    const seconds = Math.round((end.getTime() - sessionStart.current.getTime()) / 1000);
    if (seconds >= 5) {
      void logSession({
        bookId,
        startedAt: sessionStart.current.toISOString(),
        endedAt: end.toISOString(),
        durationSeconds: seconds,
      });
    }
    sessionStart.current = end;
  }, [bookId]);

  const report = useCallback(
    (location: string, percentage: number) => {
      latest.current = { location, percentage: Math.min(100, Math.max(0, percentage)) };
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, 1500);
    },
    [flush],
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") sessionStart.current = new Date();
      else {
        endSession();
        flush();
      }
    });
    return () => {
      sub.remove();
      endSession();
      flush();
      void qc.invalidateQueries({ queryKey: ["books"] });
      void qc.invalidateQueries({ queryKey: ["progress-all"] });
    };
  }, [endSession, flush, qc]);

  return { report };
}
