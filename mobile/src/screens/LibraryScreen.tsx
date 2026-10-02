import type { Book } from "@ereader/shared";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { api } from "../api/client";
import {
  coverColor,
  filterBooks,
  FINISHED_AT,
  sortBooks,
  type FilterKey,
  type SortKey,
} from "../lib/library";
import { loadProgress } from "../offline/data";
import { cached } from "../offline/store";
import type { RootStackParamList, TabParamList } from "../navigation/types";
import { evictBook } from "../reader/bookCache";
import { usePalette } from "../theme";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "added", label: "Recent" },
  { key: "title", label: "Title" },
  { key: "author", label: "Author" },
  { key: "progress", label: "Progress" },
];
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "reading", label: "Reading" },
  { key: "unread", label: "Unread" },
  { key: "finished", label: "Finished" },
];

export default function LibraryScreen() {
  const p = usePalette();
  const qc = useQueryClient();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<TabParamList, "Library">>();
  const [search, setSearch] = useState("");
  const [collectionId, setCollectionId] = useState<string | undefined>();
  const [sort, setSort] = useState<SortKey>("added");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [grid, setGrid] = useState(false);
  const [menuBook, setMenuBook] = useState<Book | null>(null);
  const [editing, setEditing] = useState<Book | null>(null);

  useEffect(() => {
    if (route.params?.collectionId) setCollectionId(route.params.collectionId);
  }, [route.params?.collectionId]);

  const books = useQuery({
    queryKey: ["books", search, collectionId],
    queryFn: () =>
      cached(`books:${search}:${collectionId ?? ""}`, () =>
        api.listBooks({ search: search || undefined, collectionId }),
      ),
  });
  const collections = useQuery({
    queryKey: ["collections"],
    queryFn: () => cached("collections", api.listCollections),
  });
  const ids = books.data?.map((b) => b.id).join(",");
  const progressMap = useQuery({
    queryKey: ["progress-all", ids],
    enabled: !!books.data?.length,
    queryFn: async () => {
      const entries = await Promise.all(
        (books.data ?? []).map(
          async (b) =>
            [b.id, (await loadProgress(b.id).catch(() => null))?.percentage ?? 0] as const,
        ),
      );
      return Object.fromEntries(entries) as Record<string, number>;
    },
  });
  const progress = useMemo(() => progressMap.data ?? {}, [progressMap.data]);
  const visible = useMemo(
    () => sortBooks(filterBooks(books.data ?? [], filter, progress), sort, progress),
    [books.data, filter, sort, progress],
  );

  const refreshBooks = () => qc.invalidateQueries({ queryKey: ["books"] });

  const importBook = useMutation({
    mutationFn: async () => {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/epub+zip", "text/plain", "application/pdf"],
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (res.canceled) return;
      for (const asset of res.assets) await api.uploadBook(asset);
    },
    onSuccess: refreshBooks,
    onError: (e: Error) => Alert.alert("Import failed", e.message),
  });

  const remove = useMutation({
    mutationFn: async (b: Book) => {
      await api.deleteBook(b.id);
      evictBook(b.id, b.format);
    },
    onSuccess: refreshBooks,
  });

  const edit = useMutation({
    mutationFn: ({ id, title, author }: { id: string; title: string; author: string }) =>
      api.updateBook(id, { title, author }),
    onSuccess: () => {
      setEditing(null);
      return refreshBooks();
    },
    onError: (e: Error) => Alert.alert("Could not save", e.message),
  });

  const collectionAction = useMutation({
    mutationFn: async ({ add, id, book }: { add: boolean; id: string; book: Book }) =>
      add ? api.addToCollection(id, book.id) : api.removeFromCollection(id, book.id),
    onSuccess: () => {
      setMenuBook(null);
      return refreshBooks();
    },
  });

  function renderBook({ item }: { item: Book }) {
    const pct = Math.round(progress[item.id] ?? 0);
    const label = pct >= FINISHED_AT ? "Finished" : pct === 0 ? "New" : `${pct}% read`;
    const cover = (
      <View
        style={[
          grid ? styles.coverGrid : styles.cover,
          { backgroundColor: coverColor(item.title) },
        ]}
      >
        <Text style={styles.coverText} numberOfLines={4}>
          {item.title}
        </Text>
      </View>
    );
    return (
      <Pressable
        style={grid ? styles.gridItem : [styles.row, { borderColor: p.border }]}
        onPress={() => navigation.navigate("Reader", { book: item })}
        onLongPress={() => setMenuBook(item)}
      >
        {cover}
        <View style={grid ? undefined : styles.flex}>
          {!grid && (
            <Text style={[styles.title, { color: p.text }]} numberOfLines={2}>
              {item.title}
            </Text>
          )}
          <Text style={{ color: p.muted, fontSize: 12 }} numberOfLines={1}>
            {grid ? label : `${item.author ?? "Unknown author"} · ${item.format}`}
          </Text>
          <View style={[styles.bar, { backgroundColor: p.surface }]}>
            <View style={{ width: `${pct}%`, backgroundColor: p.accent, height: 4 }} />
          </View>
          {!grid && <Text style={{ color: p.muted, fontSize: 12 }}>{label}</Text>}
        </View>
      </Pressable>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: p.background }]}>
      <View style={styles.header}>
        <TextInput
          style={[styles.search, { borderColor: p.border, color: p.text }]}
          placeholder="Search library"
          placeholderTextColor={p.muted}
          value={search}
          onChangeText={setSearch}
        />
        <Pressable
          style={[styles.square, { borderColor: p.border, borderWidth: 1 }]}
          onPress={() => setGrid((g) => !g)}
        >
          <Text style={{ color: p.text }}>{grid ? "☰" : "▦"}</Text>
        </Pressable>
        <Pressable
          style={[styles.square, { backgroundColor: p.accent }]}
          onPress={() => importBook.mutate()}
          disabled={importBook.isPending}
        >
          <Text style={styles.addText}>{importBook.isPending ? "…" : "+"}</Text>
        </Pressable>
      </View>

      <FlatList
        horizontal
        data={[
          { id: undefined as string | undefined, name: "All books" },
          ...(collections.data ?? []),
        ]}
        keyExtractor={(c) => c.id ?? "all"}
        style={styles.chips}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setCollectionId(item.id)}
            style={[styles.chip, { borderColor: collectionId === item.id ? p.accent : p.border }]}
          >
            <Text style={{ color: collectionId === item.id ? p.accent : p.text }}>{item.name}</Text>
          </Pressable>
        )}
      />
      <FlatList
        horizontal
        data={FILTERS}
        keyExtractor={(f) => f.key}
        style={styles.chips}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setFilter(item.key)}
            style={[styles.chip, { borderColor: filter === item.key ? p.accent : p.border }]}
          >
            <Text style={{ color: filter === item.key ? p.accent : p.text }}>{item.label}</Text>
          </Pressable>
        )}
      />
      <View style={styles.sortRow}>
        <Text style={{ color: p.muted }}>Sort:</Text>
        {SORTS.map((s) => (
          <Pressable key={s.key} onPress={() => setSort(s.key)}>
            <Text
              style={{
                color: sort === s.key ? p.accent : p.muted,
                fontWeight: sort === s.key ? "700" : "400",
              }}
            >
              {s.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {books.error && <Text style={styles.error}>{(books.error as Error).message}</Text>}
      <FlatList
        key={grid ? "grid" : "list"}
        numColumns={grid ? 3 : 1}
        data={visible}
        keyExtractor={(b) => b.id}
        refreshing={books.isFetching}
        onRefresh={() => books.refetch()}
        contentContainerStyle={grid ? styles.gridContent : undefined}
        ListEmptyComponent={
          !books.isLoading ? (
            <Text style={[styles.empty, { color: p.muted }]}>
              {books.data?.length
                ? "No books match this filter."
                : "No books yet. Tap + to import EPUB, PDF or TXT files."}
            </Text>
          ) : null
        }
        renderItem={renderBook}
      />

      <Modal
        visible={!!menuBook}
        transparent
        animationType="slide"
        onRequestClose={() => setMenuBook(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setMenuBook(null)}>
          <View style={[styles.sheet, { backgroundColor: p.surface }]}>
            <Text style={[styles.title, { color: p.text }]}>{menuBook?.title}</Text>
            <Pressable
              onPress={() => {
                setEditing(menuBook);
                setMenuBook(null);
              }}
            >
              <Text style={[styles.action, { color: p.accent }]}>Edit title & author</Text>
            </Pressable>
            {(collections.data ?? []).map((c) => (
              <Pressable
                key={c.id}
                onPress={() =>
                  menuBook && collectionAction.mutate({ add: true, id: c.id, book: menuBook })
                }
              >
                <Text style={[styles.action, { color: p.accent }]}>Add to “{c.name}”</Text>
              </Pressable>
            ))}
            {collectionId && (
              <Pressable
                onPress={() =>
                  menuBook &&
                  collectionAction.mutate({ add: false, id: collectionId, book: menuBook })
                }
              >
                <Text style={[styles.action, { color: p.accent }]}>
                  Remove from this collection
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => {
                const b = menuBook;
                setMenuBook(null);
                if (b)
                  Alert.alert("Delete book?", `“${b.title}” and its notes will be removed.`, [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: () => remove.mutate(b) },
                  ]);
              }}
            >
              <Text style={[styles.action, { color: "#d33" }]}>Delete</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <EditDialog
        book={editing}
        onClose={() => setEditing(null)}
        onSave={(title, author) => editing && edit.mutate({ id: editing.id, title, author })}
      />
    </View>
  );
}

function EditDialog({
  book,
  onClose,
  onSave,
}: {
  book: Book | null;
  onClose: () => void;
  onSave: (title: string, author: string) => void;
}) {
  const p = usePalette();
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  useEffect(() => {
    setTitle(book?.title ?? "");
    setAuthor(book?.author ?? "");
  }, [book]);
  return (
    <Modal visible={!!book} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.backdrop, { justifyContent: "center", padding: 24 }]}>
        <View style={[styles.sheet, { backgroundColor: p.surface, borderRadius: 16 }]}>
          <TextInput
            style={[styles.search, { borderColor: p.border, color: p.text }]}
            value={title}
            onChangeText={setTitle}
            placeholder="Title"
            placeholderTextColor={p.muted}
          />
          <TextInput
            style={[styles.search, { borderColor: p.border, color: p.text }]}
            value={author}
            onChangeText={setAuthor}
            placeholder="Author"
            placeholderTextColor={p.muted}
          />
          <View style={styles.sortRow}>
            <Pressable onPress={onClose}>
              <Text style={[styles.action, { color: p.muted }]}>Cancel</Text>
            </Pressable>
            <Pressable disabled={!title.trim()} onPress={() => onSave(title.trim(), author.trim())}>
              <Text style={[styles.action, { color: p.accent }]}>Save</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 52 },
  flex: { flex: 1 },
  header: { flexDirection: "row", paddingHorizontal: 16, gap: 8 },
  search: { flex: 1, borderWidth: 1, borderRadius: 8, padding: 10 },
  square: { width: 44, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  addText: { color: "#fff", fontSize: 24 },
  chips: { flexGrow: 0, paddingHorizontal: 16, marginTop: 10 },
  chip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginRight: 8,
  },
  sortRow: {
    flexDirection: "row",
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: "center",
  },
  row: { flexDirection: "row", gap: 14, padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  cover: { width: 56, height: 80, borderRadius: 4, padding: 4, justifyContent: "center" },
  coverGrid: {
    width: "100%",
    aspectRatio: 0.68,
    borderRadius: 4,
    padding: 8,
    justifyContent: "center",
    marginBottom: 6,
  },
  coverText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  gridContent: { paddingHorizontal: 12 },
  gridItem: { width: "33.33%", padding: 6 },
  title: { fontSize: 16, fontWeight: "600" },
  bar: { height: 4, marginTop: 6, marginBottom: 2, borderRadius: 2, overflow: "hidden" },
  empty: { textAlign: "center", marginTop: 60, padding: 24 },
  error: { color: "#c00", padding: 16 },
  backdrop: { flex: 1, backgroundColor: "#0006", justifyContent: "flex-end" },
  sheet: { padding: 20, gap: 14, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  action: { fontSize: 16, paddingVertical: 4 },
});
