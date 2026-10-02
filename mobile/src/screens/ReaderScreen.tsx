import type { Annotation, Book, DrawingStroke } from "@ereader/shared";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Brightness from "expo-brightness";
import { useKeepAwake } from "expo-keep-awake";
import * as Speech from "expo-speech";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from "react-native";

import { createAnnotation, deleteAnnotation, loadAnnotations, loadProgress } from "../offline/data";
import type { RootStackParamList } from "../navigation/types";
import { formatTimeLeft, minutesLeft } from "../lib/readingTime";
import { loadBook } from "../reader/bookCache";
import { lookup } from "../reader/dictionary";
import DrawingLayer from "../reader/DrawingLayer";
import { formatExport } from "../reader/exportNotes";
import {
  charsPerLineFromProbe,
  charsPerPageFromProbe,
  estimateCharsPerPage,
  PROBE_TEXT,
  pageIndexForOffset,
  paginate,
  totalLength,
} from "../reader/paginate";
import PageText from "../reader/PageText";
import { textForRange } from "../reader/range";
import { searchBook } from "../reader/search";
import type { Mark } from "../reader/segments";
import { stripImages } from "../reader/types";
import { useReadingSync } from "../reader/useReadingSync";
import { cleanWord, type Word } from "../reader/words";
import { useAuth } from "../store/auth";
import { highlightColors, palettes, useSettings } from "../theme";
import PdfReaderScreen from "./PdfReaderScreen";

export default function ReaderScreen() {
  const { book } = useRoute<RouteProp<RootStackParamList, "Reader">>().params;
  return book.format === "PDF" ? <PdfReaderScreen book={book} /> : <TextReader book={book} />;
}

const BOTTOM = 36;
const PEN_COLORS = ["#d32f2f", "#1976d2", "#388e3c", "#111111"];

function TextReader({ book }: { book: Book }) {
  useKeepAwake();
  const navigation = useNavigation();
  const qc = useQueryClient();
  const userId = useAuth((s) => s.user?.id ?? "");
  const settings = useSettings();
  const { theme, fontSize, serif, lineHeight, margin } = settings;
  const p = palettes[theme];
  const { report } = useReadingSync(book.id);

  const [area, setArea] = useState({ width: 0, height: 0 });
  const [offset, setOffset] = useState<number | null>(null);
  const [chrome, setChrome] = useState(false);
  const [panel, setPanel] = useState<"none" | "toc" | "settings" | "search" | "define">("none");
  const [tocTab, setTocTab] = useState<"contents" | "bookmarks" | "highlights">("contents");
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const anchor = useRef<Word | null>(null);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [brightness, setBrightness] = useState(0.6);
  const [pen, setPen] = useState<{ color: string; widthPx: number } | null>(null);
  const [draft, setDraft] = useState<DrawingStroke[]>([]);

  const bookQuery = useQuery({
    queryKey: ["bookText", book.id],
    queryFn: () => loadBook(book.id, book.format),
    staleTime: Infinity,
  });
  const annotationsQuery = useQuery({
    queryKey: ["annotations", book.id],
    queryFn: () => loadAnnotations(book.id, userId),
  });
  const progressQuery = useQuery({
    queryKey: ["progress", book.id],
    queryFn: () => loadProgress(book.id),
  });

  const parsed = bookQuery.data;
  const textHeight = Math.max(0, area.height - margin * 2 - BOTTOM);
  const textWidth = Math.max(0, area.width - margin * 2);

  // Glyph widths vary by font and device, so measure an invisible probe instead of guessing.
  const probeKey = `${textWidth}|${fontSize}|${lineHeight}|${serif}`;
  const [probe, setProbe] = useState<{ key: string; charsPerLine: number } | null>(null);
  const charsPerLine = probe?.key === probeKey ? probe.charsPerLine : null;

  const pages = useMemo(() => {
    if (!parsed || textWidth === 0) return [];
    const perPage =
      charsPerLine !== null
        ? charsPerPageFromProbe(charsPerLine, textHeight, fontSize, lineHeight)
        : estimateCharsPerPage(textWidth, textHeight, fontSize, lineHeight);
    return paginate(parsed, perPage);
  }, [parsed, textWidth, textHeight, fontSize, lineHeight, charsPerLine]);
  const total = useMemo(() => (parsed ? totalLength(parsed) : 0), [parsed]);

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
      if (target) {
        setOffset(target.start);
        setSelection(null);
        anchor.current = null;
      }
    },
    [pages],
  );

  useEffect(() => {
    if (page && total > 0) report(String(page.start), (page.start / total) * 100);
  }, [page, total, report]);

  const annotations = useMemo(() => annotationsQuery.data ?? [], [annotationsQuery.data]);
  const refreshAnnotations = () => qc.invalidateQueries({ queryKey: ["annotations", book.id] });

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
  const inPage = (a: Annotation) =>
    !!page && Number(a.locationStart) >= page.start && Number(a.locationStart) < page.end;
  const bookmarkHere = annotations.find((a) => a.type === "BOOKMARK" && inPage(a));

  const savedStrokes = useMemo(
    () =>
      annotations
        .filter((a) => a.type === "DRAWING" && a.drawingData && inPage(a))
        .filter(
          (a) =>
            a.drawingData!.fontSize === fontSize &&
            a.drawingData!.viewport.width === Math.round(area.width) &&
            a.drawingData!.viewport.height === Math.round(area.height),
        )
        .flatMap((a) => a.drawingData!.strokes),
    [annotations, page, fontSize, area],
  );
  const hiddenDrawings =
    annotations.some((a) => a.type === "DRAWING" && inPage(a)) && savedStrokes.length === 0;

  async function toggleBookmark() {
    if (!page) return;
    if (bookmarkHere) await deleteAnnotation(bookmarkHere.id);
    else await createAnnotation(book.id, { type: "BOOKMARK", locationStart: String(page.start) });
    await refreshAnnotations();
  }

  const selectedText =
    selection && parsed ? textForRange(parsed, selection.start, selection.end) : "";

  async function highlight(color: string) {
    if (!selection) return;
    await createAnnotation(book.id, {
      type: "HIGHLIGHT",
      locationStart: String(selection.start),
      locationEnd: String(selection.end),
      color,
    });
    clearSelection();
    await refreshAnnotations();
  }

  async function saveNote() {
    if (!selection || !noteDraft?.trim()) return;
    await createAnnotation(book.id, {
      type: "NOTE",
      locationStart: String(selection.start),
      locationEnd: String(selection.end),
      noteText: noteDraft.trim(),
    });
    setNoteDraft(null);
    clearSelection();
    await refreshAnnotations();
  }

  async function removeMarksInSelection() {
    if (!selection) return;
    const hits = marks.filter((m) => m.start < selection.end && m.end > selection.start);
    await Promise.all(hits.map((m) => deleteAnnotation(m.id)));
    clearSelection();
    await refreshAnnotations();
  }

  function clearSelection() {
    setSelection(null);
    anchor.current = null;
  }

  function onWordLongPress(w: Word) {
    anchor.current = w;
    setSelection({ start: w.start, end: w.end });
  }

  function onWordPress(w: Word, e: GestureResponderEvent) {
    if (selection && anchor.current) {
      setSelection({
        start: Math.min(anchor.current.start, w.start),
        end: Math.max(anchor.current.end, w.end),
      });
    } else {
      onTap(e.nativeEvent.pageX);
    }
  }

  function onTap(x: number) {
    if (pen) return;
    if (selection) return clearSelection();
    if (chrome) return setChrome(false);
    if (x < area.width * 0.3) goTo(pageIndex - 1);
    else if (x > area.width * 0.7) goTo(pageIndex + 1);
    else setChrome(true);
  }

  // Read aloud: speak the page, then advance when finished.
  useEffect(() => {
    if (!speaking || !page) return;
    Speech.stop();
    const spoken = stripImages(page.text).trim();
    if (!spoken) {
      // Figure page: nothing to read, move on.
      if (pageIndex + 1 < pages.length) goTo(pageIndex + 1);
      else setSpeaking(false);
      return;
    }
    Speech.speak(spoken, {
      onDone: () => {
        if (pageIndex + 1 < pages.length) goTo(pageIndex + 1);
        else setSpeaking(false);
      },
      onError: () => setSpeaking(false),
    });
    return () => {
      Speech.stop();
    };
  }, [speaking, page, pageIndex, pages.length, goTo]);

  function changeBrightness(delta: number) {
    const next = Math.min(1, Math.max(0.05, brightness + delta));
    setBrightness(next);
    Brightness.setBrightnessAsync(next).catch(() => undefined);
  }

  async function saveDrawing() {
    if (!page || draft.length === 0) return setPen(null);
    await createAnnotation(book.id, {
      type: "DRAWING",
      locationStart: String(page.start),
      drawingData: {
        strokes: draft,
        viewport: { width: Math.round(area.width), height: Math.round(area.height) },
        fontSize,
        theme,
      },
    });
    setDraft([]);
    setPen(null);
    await refreshAnnotations();
  }

  async function clearPageDrawings() {
    const hits = annotations.filter((a) => a.type === "DRAWING" && inPage(a));
    await Promise.all(hits.map((a) => deleteAnnotation(a.id)));
    setDraft([]);
    await refreshAnnotations();
  }

  const searchHits = useMemo(
    () => (parsed && panel === "search" ? searchBook(parsed, query) : []),
    [parsed, panel, query],
  );

  const definition = useQuery({
    queryKey: ["define", cleanWord(selectedText.split(" ")[0] ?? "")],
    enabled: panel === "define" && !!cleanWord(selectedText.split(" ")[0] ?? ""),
    queryFn: () => lookup(cleanWord(selectedText.split(" ")[0])),
    staleTime: Infinity,
    retry: false,
  });

  const toc = useMemo(() => {
    if (!parsed || !pages.length) return [];
    return parsed.chapters
      .map((c, i) => ({ title: c.title, index: pages.findIndex((pg) => pg.chapterIndex === i) }))
      .filter((t) => t.index >= 0);
  }, [parsed, pages]);

  async function shareNotes() {
    if (!parsed) return;
    await Share.share({ message: formatExport(book.title, book.author, annotations, parsed) });
  }

  const fontFamily = serif ? "serif" : undefined;
  const error = bookQuery.error as Error | null;
  const percent = page ? Math.round((page.start / Math.max(1, total)) * 100) : 0;

  return (
    <View style={[styles.root, { backgroundColor: p.background }]}>
      {textWidth > 0 && (
        <Text
          key={probeKey}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          onLayout={(e) =>
            setProbe({
              key: probeKey,
              charsPerLine: charsPerLineFromProbe(
                e.nativeEvent.layout.height,
                fontSize,
                lineHeight,
              ),
            })
          }
          style={{
            position: "absolute",
            opacity: 0,
            width: textWidth,
            fontSize,
            lineHeight: fontSize * lineHeight,
            fontFamily,
          }}
        >
          {PROBE_TEXT}
        </Text>
      )}
      <View
        testID="reader-area"
        style={styles.flex}
        onLayout={(e: LayoutChangeEvent) => setArea(e.nativeEvent.layout)}
      >
        {error ? (
          <Text style={[styles.center, { color: p.text }]}>{error.message}</Text>
        ) : !page ? (
          <ActivityIndicator style={styles.center} color={p.accent} />
        ) : (
          <>
            <Pressable
              testID="reader-page"
              style={[styles.flex, { padding: margin, paddingBottom: BOTTOM }]}
              onPress={(e) => onTap(e.nativeEvent.pageX)}
            >
              <PageText
                page={page}
                marks={marks}
                selection={selection}
                color={p.text}
                fontSize={fontSize}
                lineHeight={lineHeight}
                fontFamily={fontFamily}
                images={parsed?.images}
                imageHeight={textHeight}
                onWordPress={onWordPress}
                onWordLongPress={onWordLongPress}
              />
            </Pressable>
            <DrawingLayer
              width={area.width}
              height={area.height}
              strokes={[...savedStrokes, ...draft]}
              drawing={pen ?? undefined}
              onStroke={(s) => setDraft((d) => [...d, s])}
            />
          </>
        )}
      </View>

      {bookmarkHere && (
        <View
          testID="bookmark-ribbon"
          pointerEvents="none"
          style={[styles.ribbon, { backgroundColor: p.accent }]}
        />
      )}

      {page && (
        <Text style={[styles.footer, { color: p.muted }]}>
          {parsed?.chapters[page.chapterIndex]?.title} · {percent}% · Page {pageIndex + 1} of{" "}
          {pages.length} · {formatTimeLeft(minutesLeft(total, page.start))}
          {hiddenDrawings ? " · drawings hidden at this size" : ""}
        </Text>
      )}

      {selection && !pen && (
        <View style={[styles.selectionBar, { backgroundColor: p.surface, borderColor: p.border }]}>
          {highlightColors.map((c) => (
            <Pressable
              key={c}
              testID={`highlight-${c}`}
              onPress={() => highlight(c)}
              style={[styles.swatch, { backgroundColor: c }]}
            />
          ))}
          <Pressable onPress={() => setNoteDraft("")}>
            <Text style={[styles.action, { color: p.accent }]}>Note</Text>
          </Pressable>
          <Pressable onPress={() => setPanel("define")}>
            <Text style={[styles.action, { color: p.accent }]}>Define</Text>
          </Pressable>
          {marks.some((m) => m.start < selection.end && m.end > selection.start) && (
            <Pressable onPress={removeMarksInSelection}>
              <Text style={[styles.action, { color: "#d33" }]}>Remove</Text>
            </Pressable>
          )}
          <Pressable onPress={clearSelection}>
            <Text style={[styles.action, { color: p.muted }]}>✕</Text>
          </Pressable>
        </View>
      )}

      {pen && (
        <View style={[styles.selectionBar, { backgroundColor: p.surface, borderColor: p.border }]}>
          {PEN_COLORS.map((c) => (
            <Pressable
              key={c}
              onPress={() => setPen({ ...pen, color: c })}
              style={[
                styles.swatch,
                { backgroundColor: c, borderWidth: pen.color === c ? 3 : 0, borderColor: p.accent },
              ]}
            />
          ))}
          <Pressable onPress={() => setPen({ ...pen, widthPx: pen.widthPx === 3 ? 7 : 3 })}>
            <Text style={[styles.action, { color: p.accent }]}>
              {pen.widthPx === 3 ? "Thin" : "Thick"}
            </Text>
          </Pressable>
          <Pressable onPress={() => setDraft((d) => d.slice(0, -1))}>
            <Text style={[styles.action, { color: p.accent }]}>Undo</Text>
          </Pressable>
          <Pressable onPress={clearPageDrawings}>
            <Text style={[styles.action, { color: "#d33" }]}>Clear</Text>
          </Pressable>
          <Pressable onPress={saveDrawing}>
            <Text style={[styles.action, { color: p.accent }]}>Done</Text>
          </Pressable>
        </View>
      )}

      {chrome && (
        <View style={[styles.topBar, { backgroundColor: p.surface, borderColor: p.border }]}>
          <Pressable onPress={() => navigation.goBack()}>
            <Text style={[styles.bar, { color: p.accent }]}>‹</Text>
          </Pressable>
          <Text numberOfLines={1} style={[styles.barTitle, { color: p.text }]}>
            {book.title}
          </Text>
          <Pressable onPress={() => setPanel("search")}>
            <Text style={[styles.bar, { color: p.accent }]}>🔍</Text>
          </Pressable>
          <Pressable onPress={() => setPanel("toc")}>
            <Text style={[styles.bar, { color: p.accent }]}>☰</Text>
          </Pressable>
          <Pressable onPress={toggleBookmark}>
            <Text style={[styles.bar, { color: p.accent }]}>{bookmarkHere ? "★" : "☆"}</Text>
          </Pressable>
          <Pressable onPress={() => setSpeaking((s) => !s)}>
            <Text style={[styles.bar, { color: p.accent }]}>{speaking ? "⏹" : "🔊"}</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setPen({ color: PEN_COLORS[0], widthPx: 3 });
              setChrome(false);
            }}
          >
            <Text style={[styles.bar, { color: p.accent }]}>✎</Text>
          </Pressable>
          <Pressable onPress={() => setPanel("settings")}>
            <Text style={[styles.bar, { color: p.accent }]}>Aa</Text>
          </Pressable>
        </View>
      )}

      <Modal
        visible={noteDraft !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setNoteDraft(null)}
      >
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: p.surface }]}>
            <Text numberOfLines={2} style={{ color: p.muted, fontStyle: "italic" }}>
              {selectedText}
            </Text>
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

      <Modal
        visible={panel === "define"}
        transparent
        animationType="slide"
        onRequestClose={() => setPanel("none")}
      >
        <Pressable style={styles.backdrop} onPress={() => setPanel("none")}>
          <View style={[styles.sheet, { backgroundColor: p.surface }]}>
            <Text style={[styles.defWord, { color: p.text }]}>
              {cleanWord(selectedText.split(" ")[0] ?? "")}
            </Text>
            {definition.isLoading && <ActivityIndicator color={p.accent} />}
            {definition.error && (
              <Text style={{ color: p.muted }}>Dictionary unavailable offline.</Text>
            )}
            {definition.isSuccess && !definition.data && (
              <Text style={{ color: p.muted }}>No definition found.</Text>
            )}
            <ScrollView style={{ maxHeight: 280 }}>
              {definition.data?.phonetic && (
                <Text style={{ color: p.muted }}>{definition.data.phonetic}</Text>
              )}
              {definition.data?.meanings.map((m, i) => (
                <View key={i} style={{ marginTop: 10 }}>
                  <Text style={{ color: p.accent, fontStyle: "italic" }}>{m.partOfSpeech}</Text>
                  {m.definitions.map((d, j) => (
                    <Text key={j} style={{ color: p.text, marginTop: 2 }}>
                      {j + 1}. {d}
                    </Text>
                  ))}
                </View>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={panel === "search"}
        animationType="slide"
        onRequestClose={() => setPanel("none")}
      >
        <View style={[styles.root, { backgroundColor: p.background, paddingTop: 48 }]}>
          <View style={styles.searchRow}>
            <TextInput
              autoFocus
              placeholder="Search in book"
              placeholderTextColor={p.muted}
              value={query}
              onChangeText={setQuery}
              style={[styles.searchInput, { color: p.text, borderColor: p.border }]}
            />
            <Pressable onPress={() => setPanel("none")}>
              <Text style={[styles.tab, { color: p.accent }]}>Close</Text>
            </Pressable>
          </View>
          <FlatList
            data={searchHits}
            keyExtractor={(h) => String(h.offset)}
            ListEmptyComponent={
              <Text style={[styles.center, { color: p.muted }]}>
                {query.trim().length < 2 ? "Type at least 2 characters." : "No matches."}
              </Text>
            }
            renderItem={({ item }) => (
              <Pressable
                style={[styles.listRow, { borderColor: p.border }]}
                onPress={() => {
                  setOffset(item.offset);
                  setPanel("none");
                  setChrome(false);
                }}
              >
                <Text style={{ color: p.muted, fontSize: 12 }}>
                  {parsed?.chapters[item.chapterIndex]?.title}
                </Text>
                <Text style={{ color: p.text }}>{item.snippet}</Text>
              </Pressable>
            )}
          />
        </View>
      </Modal>

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
            <>
              {tocTab === "highlights" && (
                <Pressable onPress={shareNotes}>
                  <Text style={[styles.action, { color: p.accent, textAlign: "center" }]}>
                    Share / export highlights
                  </Text>
                </Pressable>
              )}
              <FlatList
                data={annotations.filter((a) =>
                  tocTab === "bookmarks"
                    ? a.type === "BOOKMARK"
                    : a.type === "HIGHLIGHT" || a.type === "NOTE",
                )}
                keyExtractor={(a) => a.id}
                ListEmptyComponent={
                  <Text style={[styles.center, { color: p.muted }]}>Nothing here yet.</Text>
                }
                renderItem={({ item }) => (
                  <Pressable
                    style={[styles.listRow, { borderColor: p.border }]}
                    onPress={() => {
                      setOffset(Number(item.locationStart));
                      setPanel("none");
                      setChrome(false);
                    }}
                    onLongPress={() =>
                      Alert.alert("Delete?", undefined, [
                        { text: "Cancel" },
                        {
                          text: "Delete",
                          style: "destructive",
                          onPress: async () => {
                            await deleteAnnotation(item.id);
                            await refreshAnnotations();
                          },
                        },
                      ])
                    }
                  >
                    <Text numberOfLines={3} style={{ color: p.text }}>
                      {(parsed && item.locationEnd
                        ? textForRange(parsed, Number(item.locationStart), Number(item.locationEnd))
                        : "") ||
                        `Page ${pages.findIndex((pg) => pg.start <= Number(item.locationStart) && pg.end > Number(item.locationStart)) + 1}`}
                    </Text>
                    {item.noteText && (
                      <Text style={{ color: p.accent, marginTop: 4 }}>{item.noteText}</Text>
                    )}
                  </Pressable>
                )}
              />
            </>
          )}
        </View>
      </Modal>

      <Modal
        visible={panel === "settings"}
        transparent
        animationType="slide"
        onRequestClose={() => setPanel("none")}
      >
        <Pressable style={styles.backdrop} onPress={() => setPanel("none")}>
          <View style={[styles.sheet, { backgroundColor: p.surface }]}>
            <View style={styles.row}>
              <Pressable onPress={() => settings.setFontSize(fontSize - 2)}>
                <Text style={[styles.action, { color: p.accent }]}>A−</Text>
              </Pressable>
              <Text style={{ color: p.text }}>{fontSize}pt</Text>
              <Pressable onPress={() => settings.setFontSize(fontSize + 2)}>
                <Text style={[styles.action, { color: p.accent }]}>A+</Text>
              </Pressable>
            </View>
            <View style={styles.row}>
              {(["light", "sepia", "dark"] as const).map((t) => (
                <Pressable
                  key={t}
                  onPress={() => settings.setTheme(t)}
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
              <Text style={{ color: p.muted }}>Spacing</Text>
              {[1.3, 1.5, 1.8].map((v) => (
                <Pressable key={v} onPress={() => settings.setLineHeight(v)}>
                  <Text style={[styles.action, { color: lineHeight === v ? p.accent : p.muted }]}>
                    {v}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.row}>
              <Text style={{ color: p.muted }}>Margins</Text>
              {[
                ["Narrow", 14],
                ["Normal", 24],
                ["Wide", 40],
              ].map(([label, v]) => (
                <Pressable key={label} onPress={() => settings.setMargin(v as number)}>
                  <Text style={[styles.action, { color: margin === v ? p.accent : p.muted }]}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.row}>
              <Pressable onPress={() => settings.setSerif(true)}>
                <Text
                  style={[
                    styles.action,
                    { color: serif ? p.accent : p.muted, fontFamily: "serif" },
                  ]}
                >
                  Serif
                </Text>
              </Pressable>
              <Pressable onPress={() => settings.setSerif(false)}>
                <Text style={[styles.action, { color: !serif ? p.accent : p.muted }]}>Sans</Text>
              </Pressable>
            </View>
            <View style={styles.row}>
              <Pressable onPress={() => changeBrightness(-0.1)}>
                <Text style={[styles.action, { color: p.accent }]}>🔅</Text>
              </Pressable>
              <Text style={{ color: p.text }}>Brightness {Math.round(brightness * 100)}%</Text>
              <Pressable onPress={() => changeBrightness(0.1)}>
                <Text style={[styles.action, { color: p.accent }]}>🔆</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  center: { marginTop: 80, textAlign: "center", padding: 24 },
  ribbon: {
    position: "absolute",
    top: 0,
    right: 28,
    width: 18,
    height: 34,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  footer: {
    position: "absolute",
    bottom: 10,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 12,
  },
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
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bar: { fontSize: 18 },
  barTitle: { flex: 1, fontWeight: "600" },
  selectionBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  backdrop: { flex: 1, backgroundColor: "#0006", justifyContent: "flex-end" },
  sheet: { padding: 20, gap: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  row: { flexDirection: "row", justifyContent: "space-around", alignItems: "center" },
  swatch: { width: 34, height: 34, borderRadius: 17 },
  action: { fontSize: 16, padding: 6 },
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
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 12,
    paddingBottom: 8,
  },
  searchInput: { flex: 1, borderWidth: 1, borderRadius: 8, padding: 10 },
  defWord: { fontSize: 24, fontWeight: "700" },
});
