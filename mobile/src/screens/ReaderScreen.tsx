import type { Annotation } from "@ereader/shared";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  LayoutChangeEvent,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { api } from "../api/client";
import type { RootStackParamList } from "../navigation/types";
import { loadBook } from "../reader/bookCache";
import {
  estimateCharsPerPage,
  pageIndexForOffset,
  paginate,
  totalLength,
} from "../reader/paginate";
import {
  paragraphSpans,
  segmentParagraph,
  type Mark,
  type ParagraphSpan,
} from "../reader/segments";
import { highlightColors, palettes, useSettings } from "../theme";

const LINE_HEIGHT = 1.5;
const PAD = 24;

export default function ReaderScreen() {
  const { book } = useRoute<RouteProp<RootStackParamList, "Reader">>().params;
  const navigation = useNavigation();
  const qc = useQueryClient();
  const { theme, fontSize, serif, setTheme, setFontSize, setSerif } = useSettings();
  const p = palettes[theme];

  const [area, setArea] = useState({ width: 0, height: 0 });
  const [offset, setOffset] = useState<number | null>(null);
  const [chrome, setChrome] = useState(false);
  const [panel, setPanel] = useState<"none" | "toc" | "settings">("none");
  const [tocTab, setTocTab] = useState<"contents" | "bookmarks" | "highlights">("contents");
  const [selected, setSelected] = useState<ParagraphSpan | null>(null);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);

  const bookQuery = useQuery({
    queryKey: ["bookText", book.id],
    queryFn: () => loadBook(book.id, book.format),
    staleTime: Infinity,
  });
  const annotationsQuery = useQuery({
    queryKey: ["annotations", book.id],
    queryFn: () => api.listAnnotations(book.id),
  });
  const progressQuery = useQuery({
    queryKey: ["progress", book.id],
    queryFn: () => api.getProgress(book.id),
  });

  const parsed = bookQuery.data;
  const textHeight = Math.max(0, area.height - PAD * 2);
  const textWidth = Math.max(0, area.width - PAD * 2);

  const pages = useMemo(() => {
    if (!parsed || textWidth === 0) return [];
    return paginate(parsed, estimateCharsPerPage(textWidth, textHeight, fontSize, LINE_HEIGHT));
  }, [parsed, textWidth, textHeight, fontSize]);
  const total = useMemo(() => (parsed ? totalLength(parsed) : 0), [parsed]);

  // Resume from saved progress once everything has loaded.
  useEffect(() => {
    if (offset === null && progressQuery.isSuccess && parsed) {
      setOffset(progressQuery.data ? Number(progressQuery.data.location) || 0 : 0);
    }
  }, [offset, progressQuery.isSuccess, progressQuery.data, parsed]);

  const pageIndex = pages.length && offset !== null ? pageIndexForOffset(pages, offset) : 0;
  const page = pages[pageIndex];

  const goTo = useCallback(
    (index: number) => {
      const target = pages[Math.min(pages.length - 1, Math.max(0, index))];
      if (target) setOffset(target.start);
    },
    [pages],
  );

  // Debounced progress sync.
  const latest = useRef({ start: 0, percentage: 0 });
  const syncTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (!page || total === 0) return;
    latest.current = { start: page.start, percentage: Math.min(100, (page.start / total) * 100) };
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => flushProgress(), 1500);
    return () => clearTimeout(syncTimer.current);
  }, [page?.start, total]);

  const flushProgress = useCallback(() => {
    const { start, percentage } = latest.current;
    if (start === 0 && percentage === 0 && !progressQuery.data) return;
    api.putProgress(book.id, { location: String(start), percentage }).then(
      () => qc.invalidateQueries({ queryKey: ["progress", book.id] }),
      () => undefined,
    );
  }, [book.id, qc, progressQuery.data]);

  // Reading-session tracking.
  const sessionStart = useRef(new Date());
  const logSession = useCallback(() => {
    const end = new Date();
    const seconds = Math.round((end.getTime() - sessionStart.current.getTime()) / 1000);
    if (seconds >= 5) {
      api
        .logSession({
          bookId: book.id,
          startedAt: sessionStart.current.toISOString(),
          endedAt: end.toISOString(),
          durationSeconds: seconds,
        })
        .then(
          () => qc.invalidateQueries({ queryKey: ["stats"] }),
          () => undefined,
        );
    }
    sessionStart.current = end;
  }, [book.id, qc]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") sessionStart.current = new Date();
      else {
        logSession();
        flushProgress();
      }
    });
    return () => {
      sub.remove();
      logSession();
      flushProgress();
      qc.invalidateQueries({ queryKey: ["books"] });
    };
  }, [logSession, flushProgress, qc]);

  // Annotations -> marks & bookmarks.
  const annotations = annotationsQuery.data ?? [];
  const marks: Mark[] = useMemo(
    () =>
      annotations
        .filter((a) => (a.type === "HIGHLIGHT" || a.type === "NOTE") && a.locationEnd)
        .map((a) => ({
          id: a.id,
          start: Number(a.locationStart),
          end: Number(a.locationEnd),
          color: a.type === "HIGHLIGHT" ? (a.color ?? highlightColors[0]) : null,
          isNote: a.type === "NOTE" || !!a.noteText,
        })),
    [annotations],
  );
  const bookmarkHere = page
    ? annotations.find(
        (a) =>
          a.type === "BOOKMARK" &&
          Number(a.locationStart) >= page.start &&
          Number(a.locationStart) < page.end,
      )
    : undefined;

  const refreshAnnotations = () => qc.invalidateQueries({ queryKey: ["annotations", book.id] });

  async function toggleBookmark() {
    if (!page) return;
    if (bookmarkHere) await api.deleteAnnotation(bookmarkHere.id);
    else
      await api.createAnnotation(book.id, { type: "BOOKMARK", locationStart: String(page.start) });
    await refreshAnnotations();
  }

  async function highlight(color: string) {
    if (!selected) return;
    await api.createAnnotation(book.id, {
      type: "HIGHLIGHT",
      locationStart: String(selected.start),
      locationEnd: String(selected.end),
      color,
    });
    setSelected(null);
    await refreshAnnotations();
  }

  async function saveNote() {
    if (!selected || !noteDraft?.trim()) return;
    await api.createAnnotation(book.id, {
      type: "NOTE",
      locationStart: String(selected.start),
      locationEnd: String(selected.end),
      noteText: noteDraft.trim(),
    });
    setNoteDraft(null);
    setSelected(null);
    await refreshAnnotations();
  }

  async function removeMarksIn(span: ParagraphSpan) {
    const hits = marks.filter((m) => m.start < span.end && m.end > span.start);
    await Promise.all(hits.map((m) => api.deleteAnnotation(m.id)));
    setSelected(null);
    await refreshAnnotations();
  }

  const fontFamily = serif ? "serif" : undefined;
  const onLayout = (e: LayoutChangeEvent) => setArea(e.nativeEvent.layout);

  function onTap(x: number) {
    if (chrome) return setChrome(false);
    if (x < area.width * 0.3) goTo(pageIndex - 1);
    else if (x > area.width * 0.7) goTo(pageIndex + 1);
    else setChrome(true);
  }

  const toc = useMemo(() => {
    if (!parsed || !pages.length) return [];
    return parsed.chapters
      .map((c, i) => ({ title: c.title, index: pages.findIndex((pg) => pg.chapterIndex === i) }))
      .filter((t) => t.index >= 0);
  }, [parsed, pages]);

  const error = bookQuery.error as Error | null;

  return (
    <View style={[styles.root, { backgroundColor: p.background }]}>
      <View style={styles.flex} onLayout={onLayout}>
        {error ? (
          <Text style={[styles.center, { color: p.text }]}>{error.message}</Text>
        ) : !page ? (
          <ActivityIndicator style={styles.center} color={p.accent} />
        ) : (
          <Pressable
            style={[styles.flex, { padding: PAD }]}
            onPress={(e) => onTap(e.nativeEvent.locationX)}
          >
            {paragraphSpans(page.text, page.start).map((span) => (
              <Text
                key={span.start}
                onLongPress={() => setSelected(span)}
                style={{
                  color: p.text,
                  fontSize,
                  lineHeight: fontSize * LINE_HEIGHT,
                  fontFamily,
                  marginBottom: fontSize * 0.5,
                }}
              >
                {segmentParagraph(span, marks).map((seg, i) => (
                  <Text
                    key={i}
                    style={
                      seg.mark
                        ? {
                            backgroundColor: seg.mark.color ? seg.mark.color + "aa" : undefined,
                            textDecorationLine: seg.mark.isNote ? "underline" : "none",
                            color: seg.mark.color ? "#111" : p.text,
                          }
                        : undefined
                    }
                  >
                    {seg.text}
                  </Text>
                ))}
              </Text>
            ))}
          </Pressable>
        )}
      </View>

      {page && (
        <Text style={[styles.footer, { color: p.muted }]}>
          {parsed?.chapters[page.chapterIndex]?.title} ·{" "}
          {Math.round((page.start / Math.max(1, total)) * 100)}% · Page {pageIndex + 1} of{" "}
          {pages.length}
        </Text>
      )}

      {chrome && (
        <View style={[styles.topBar, { backgroundColor: p.surface, borderColor: p.border }]}>
          <Pressable onPress={() => navigation.goBack()}>
            <Text style={[styles.bar, { color: p.accent }]}>‹ Back</Text>
          </Pressable>
          <Text numberOfLines={1} style={[styles.barTitle, { color: p.text }]}>
            {book.title}
          </Text>
          <Pressable onPress={() => setPanel("toc")}>
            <Text style={[styles.bar, { color: p.accent }]}>☰</Text>
          </Pressable>
          <Pressable onPress={toggleBookmark}>
            <Text style={[styles.bar, { color: p.accent }]}>{bookmarkHere ? "★" : "☆"}</Text>
          </Pressable>
          <Pressable onPress={() => setPanel("settings")}>
            <Text style={[styles.bar, { color: p.accent }]}>Aa</Text>
          </Pressable>
        </View>
      )}

      {/* Paragraph actions */}
      <Modal
        visible={!!selected && noteDraft === null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelected(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setSelected(null)}>
          <View style={[styles.sheet, { backgroundColor: p.surface }]}>
            <Text style={[styles.sheetTitle, { color: p.muted }]} numberOfLines={2}>
              {selected?.text}
            </Text>
            <View style={styles.row}>
              {highlightColors.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => highlight(c)}
                  style={[styles.swatch, { backgroundColor: c }]}
                />
              ))}
            </View>
            <Pressable onPress={() => setNoteDraft("")}>
              <Text style={[styles.action, { color: p.accent }]}>Add note</Text>
            </Pressable>
            {selected && marks.some((m) => m.start < selected.end && m.end > selected.start) && (
              <Pressable onPress={() => removeMarksIn(selected)}>
                <Text style={[styles.action, { color: "#d33" }]}>Remove highlights & notes</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={noteDraft !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setNoteDraft(null)}
      >
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: p.surface }]}>
            <TextInput
              autoFocus
              multiline
              placeholder="Write a note"
              placeholderTextColor={p.muted}
              value={noteDraft ?? ""}
              onChangeText={setNoteDraft}
              style={[styles.noteInput, { color: p.text, borderColor: p.border }]}
            />
            <View style={styles.row}>
              <Pressable onPress={() => setNoteDraft(null)}>
                <Text style={[styles.action, { color: p.muted }]}>Cancel</Text>
              </Pressable>
              <Pressable onPress={saveNote}>
                <Text style={[styles.action, { color: p.accent }]}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Contents / bookmarks / highlights */}
      <Modal
        visible={panel === "toc"}
        animationType="slide"
        onRequestClose={() => setPanel("none")}
      >
        <View style={[styles.root, { backgroundColor: p.background, paddingTop: 48 }]}>
          <View style={styles.tabs}>
            {(["contents", "bookmarks", "highlights"] as const).map((t) => (
              <Pressable key={t} onPress={() => setTocTab(t)}>
                <Text style={[styles.tab, { color: tocTab === t ? p.accent : p.muted }]}>{t}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setPanel("none")}>
              <Text style={[styles.tab, { color: p.accent }]}>Close</Text>
            </Pressable>
          </View>
          {tocTab === "contents" ? (
            <FlatList
              data={toc}
              keyExtractor={(t) => String(t.index)}
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.listRow, { borderColor: p.border }]}
                  onPress={() => {
                    goTo(item.index);
                    setPanel("none");
                    setChrome(false);
                  }}
                >
                  <Text style={{ color: p.text }}>{item.title}</Text>
                </Pressable>
              )}
            />
          ) : (
            <AnnotationList
              items={annotations.filter((a) =>
                tocTab === "bookmarks"
                  ? a.type === "BOOKMARK"
                  : a.type === "HIGHLIGHT" || a.type === "NOTE",
              )}
              text={(a) => annotationPreview(a, parsedText(parsed), pages)}
              onOpen={(a) => {
                setOffset(Number(a.locationStart));
                setPanel("none");
                setChrome(false);
              }}
              onDelete={async (a) => {
                await api.deleteAnnotation(a.id);
                await refreshAnnotations();
              }}
              palette={p}
            />
          )}
        </View>
      </Modal>

      {/* Display settings */}
      <Modal
        visible={panel === "settings"}
        transparent
        animationType="slide"
        onRequestClose={() => setPanel("none")}
      >
        <Pressable style={styles.backdrop} onPress={() => setPanel("none")}>
          <View style={[styles.sheet, { backgroundColor: p.surface }]}>
            <View style={styles.row}>
              <Pressable onPress={() => setFontSize(fontSize - 2)}>
                <Text style={[styles.action, { color: p.accent }]}>A−</Text>
              </Pressable>
              <Text style={{ color: p.text }}>{fontSize}pt</Text>
              <Pressable onPress={() => setFontSize(fontSize + 2)}>
                <Text style={[styles.action, { color: p.accent }]}>A+</Text>
              </Pressable>
            </View>
            <View style={styles.row}>
              {(["light", "sepia", "dark"] as const).map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setTheme(t)}
                  style={[
                    styles.themeChip,
                    {
                      backgroundColor: palettes[t].background,
                      borderColor: t === theme ? p.accent : p.border,
                    },
                  ]}
                >
                  <Text style={{ color: palettes[t].text }}>{t}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.row}>
              <Pressable onPress={() => setSerif(true)}>
                <Text
                  style={[
                    styles.action,
                    { color: serif ? p.accent : p.muted, fontFamily: "serif" },
                  ]}
                >
                  Serif
                </Text>
              </Pressable>
              <Pressable onPress={() => setSerif(false)}>
                <Text style={[styles.action, { color: !serif ? p.accent : p.muted }]}>Sans</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function parsedText(parsed: { chapters: { text: string }[] } | undefined): string {
  return parsed ? parsed.chapters.map((c) => c.text).join("\n") : "";
}

function annotationPreview(
  a: Annotation,
  fullText: string,
  pages: { start: number; text: string }[],
): string {
  if (a.noteText) return a.noteText;
  const start = Number(a.locationStart);
  const end = a.locationEnd ? Number(a.locationEnd) : start + 120;
  // Global offsets include one separator per chapter, so fall back to the page text when it is cheaper.
  const page = pages.find(
    (pg, i) => pg.start <= start && (pages[i + 1]?.start ?? Infinity) > start,
  );
  const snippet = page
    ? page.text.slice(Math.max(0, start - page.start), Math.max(0, end - page.start))
    : fullText.slice(start, end);
  return snippet.slice(0, 160) || "Bookmark";
}

function AnnotationList(props: {
  items: Annotation[];
  text: (a: Annotation) => string;
  onOpen: (a: Annotation) => void;
  onDelete: (a: Annotation) => void;
  palette: (typeof palettes)["light"];
}) {
  const { items, text, onOpen, onDelete, palette: p } = props;
  return (
    <FlatList
      data={items}
      keyExtractor={(a) => a.id}
      ListEmptyComponent={
        <Text style={[styles.center, { color: p.muted }]}>Nothing here yet.</Text>
      }
      renderItem={({ item }) => (
        <Pressable
          style={[styles.listRow, { borderColor: p.border }]}
          onPress={() => onOpen(item)}
          onLongPress={() =>
            Alert.alert("Delete?", undefined, [
              { text: "Cancel" },
              { text: "Delete", style: "destructive", onPress: () => onDelete(item) },
            ])
          }
        >
          <Text numberOfLines={3} style={{ color: p.text }}>
            {text(item)}
          </Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  center: { marginTop: 80, textAlign: "center", padding: 24 },
  footer: { textAlign: "center", fontSize: 12, paddingBottom: 14 },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 44,
    paddingBottom: 10,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bar: { fontSize: 18 },
  barTitle: { flex: 1, textAlign: "center", fontWeight: "600" },
  backdrop: { flex: 1, backgroundColor: "#0006", justifyContent: "flex-end" },
  sheet: { padding: 20, gap: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  sheetTitle: { fontStyle: "italic" },
  row: { flexDirection: "row", justifyContent: "space-around", alignItems: "center" },
  swatch: { width: 40, height: 40, borderRadius: 20 },
  action: { fontSize: 17, padding: 6 },
  noteInput: {
    minHeight: 100,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    textAlignVertical: "top",
  },
  themeChip: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8, borderWidth: 2 },
  tabs: { flexDirection: "row", justifyContent: "space-around", paddingBottom: 12 },
  tab: { fontSize: 16, textTransform: "capitalize" },
  listRow: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
});
