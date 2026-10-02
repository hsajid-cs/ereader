import type { Book } from "@ereader/shared";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useKeepAwake } from "expo-keep-awake";
import { useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { createAnnotation, deleteAnnotation, loadAnnotations, loadProgress } from "../offline/data";
import { bytesToBase64 } from "../reader/base64";
import { loadBookBytes } from "../reader/bookCache";
import { pdfHtml } from "../reader/pdfHtml";
import { useReadingSync } from "../reader/useReadingSync";
import { useAuth } from "../store/auth";
import { palettes, useSettings } from "../theme";
import { useState } from "react";

/** PDF reading: continuous scroll via pdf.js, with synced position and page bookmarks. */
export default function PdfReaderScreen({ book }: { book: Book }) {
  useKeepAwake();
  const navigation = useNavigation();
  const qc = useQueryClient();
  const userId = useAuth((s) => s.user?.id ?? "");
  const p = palettes[useSettings((s) => s.theme)];
  const { report } = useReadingSync(book.id);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const data = useQuery({
    queryKey: ["pdf", book.id],
    staleTime: Infinity,
    queryFn: async () => {
      const [bytes, progress] = await Promise.all([
        loadBookBytes(book.id, "PDF"),
        loadProgress(book.id),
      ]);
      const start = progress?.location.startsWith("pdf:")
        ? Number(progress.location.slice(4)) || 1
        : 1;
      return { base64: bytesToBase64(bytes), start };
    },
  });
  const annotations = useQuery({
    queryKey: ["annotations", book.id],
    queryFn: () => loadAnnotations(book.id, userId),
  });

  const html = useMemo(
    () => (data.data ? pdfHtml(data.data.base64, data.data.start, p) : null),
    [data.data, p],
  );
  const bookmark = annotations.data?.find(
    (a) => a.type === "BOOKMARK" && a.locationStart === `pdf:${page}`,
  );

  function onMessage(e: WebViewMessageEvent) {
    const msg = JSON.parse(e.nativeEvent.data) as {
      type: string;
      page?: number;
      total?: number;
      message?: string;
    };
    if (msg.type === "loaded") setTotal(msg.total ?? 0);
    if (msg.type === "page" && msg.page && msg.total) {
      setPage(msg.page);
      setTotal(msg.total);
      report(`pdf:${msg.page}`, (msg.page / msg.total) * 100);
    }
    if (msg.type === "error") setError(msg.message ?? "Could not open this PDF");
  }

  async function toggleBookmark() {
    if (bookmark) await deleteAnnotation(bookmark.id);
    else await createAnnotation(book.id, { type: "BOOKMARK", locationStart: `pdf:${page}` });
    await qc.invalidateQueries({ queryKey: ["annotations", book.id] });
  }

  const err = error ?? (data.error as Error | null)?.message;

  return (
    <View style={[styles.root, { backgroundColor: p.background }]}>
      <View style={[styles.bar, { backgroundColor: p.surface, borderColor: p.border }]}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={[styles.btn, { color: p.accent }]}>‹ Back</Text>
        </Pressable>
        <Text numberOfLines={1} style={[styles.title, { color: p.text }]}>
          {book.title}
        </Text>
        <Text style={{ color: p.muted }}>{total ? `${page}/${total}` : ""}</Text>
        <Pressable onPress={toggleBookmark}>
          <Text style={[styles.btn, { color: p.accent }]}>{bookmark ? "★" : "☆"}</Text>
        </Pressable>
      </View>
      {err ? (
        <Text style={[styles.msg, { color: p.text }]}>{err}</Text>
      ) : !html ? (
        <ActivityIndicator style={styles.msg} color={p.accent} />
      ) : (
        <WebView
          originWhitelist={["*"]}
          source={{ html, baseUrl: "https://cdnjs.cloudflare.com" }}
          onMessage={onMessage}
          style={{ backgroundColor: p.background }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: {
    paddingTop: 44,
    paddingBottom: 10,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  btn: { fontSize: 18 },
  title: { flex: 1, fontWeight: "600" },
  msg: { marginTop: 80, textAlign: "center", padding: 24 },
});
