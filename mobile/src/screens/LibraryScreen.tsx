import type { Book } from "@ereader/shared";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { api } from "../api/client";
import type { RootStackParamList } from "../navigation/types";
import { evictBook } from "../reader/bookCache";
import { usePalette } from "../theme";

function stripExtension(name: string) {
  return name.replace(/\.(epub|pdf|txt)$/i, "");
}

export default function LibraryScreen() {
  const p = usePalette();
  const qc = useQueryClient();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [search, setSearch] = useState("");
  const [collectionId, setCollectionId] = useState<string | undefined>();

  const books = useQuery({
    queryKey: ["books", search, collectionId],
    queryFn: () => api.listBooks({ search: search || undefined, collectionId }),
  });
  const collections = useQuery({ queryKey: ["collections"], queryFn: api.listCollections });
  const progressMap = useQuery({
    queryKey: ["progress-all", books.data?.map((b) => b.id).join(",")],
    enabled: !!books.data?.length,
    queryFn: async () => {
      const entries = await Promise.all(
        (books.data ?? []).map(
          async (b) => [b.id, (await api.getProgress(b.id))?.percentage ?? 0] as const,
        ),
      );
      return Object.fromEntries(entries) as Record<string, number>;
    },
  });

  const importBook = useMutation({
    mutationFn: async () => {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/epub+zip", "text/plain", "application/pdf"],
        copyToCacheDirectory: true,
      });
      if (res.canceled) return null;
      const asset = res.assets[0];
      return api.uploadBook(asset, stripExtension(asset.name));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["books"] }),
    onError: (e: Error) => Alert.alert("Import failed", e.message),
  });

  const remove = useMutation({
    mutationFn: async (b: Book) => {
      await api.deleteBook(b.id);
      evictBook(b.id, b.format);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["books"] }),
  });

  function bookMenu(b: Book) {
    const cols = collections.data ?? [];
    Alert.alert(b.title, undefined, [
      ...cols.map((c) => ({
        text: `Add to "${c.name}"`,
        onPress: () =>
          api.addToCollection(c.id, b.id).then(() => qc.invalidateQueries({ queryKey: ["books"] })),
      })),
      {
        text: "Rename",
        onPress: () =>
          Platform.OS === "ios"
            ? Alert.prompt(
                "Rename",
                undefined,
                (t) =>
                  t &&
                  api
                    .updateBook(b.id, { title: t })
                    .then(() => qc.invalidateQueries({ queryKey: ["books"] })),
                "plain-text",
                b.title,
              )
            : undefined,
      },
      { text: "Delete", style: "destructive", onPress: () => remove.mutate(b) },
      { text: "Cancel", style: "cancel" },
    ]);
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
          style={[styles.add, { backgroundColor: p.accent }]}
          onPress={() => importBook.mutate()}
          disabled={importBook.isPending}
        >
          <Text style={styles.addText}>{importBook.isPending ? "…" : "+"}</Text>
        </Pressable>
      </View>

      <FlatList
        horizontal
        data={[{ id: undefined, name: "All" }, ...(collections.data ?? [])]}
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

      {books.error && <Text style={styles.error}>{books.error.message}</Text>}
      <FlatList
        data={books.data}
        keyExtractor={(b) => b.id}
        refreshing={books.isFetching}
        onRefresh={() => books.refetch()}
        ListEmptyComponent={
          !books.isLoading ? (
            <Text style={[styles.empty, { color: p.muted }]}>
              No books yet. Tap + to import an EPUB or TXT file.
            </Text>
          ) : null
        }
        renderItem={({ item }) => {
          const pct = Math.round(progressMap.data?.[item.id] ?? 0);
          return (
            <Pressable
              style={[styles.row, { borderColor: p.border }]}
              onPress={() => navigation.navigate("Reader", { book: item })}
              onLongPress={() => bookMenu(item)}
            >
              <View style={[styles.cover, { backgroundColor: p.surface }]}>
                <Text style={{ color: p.muted, fontWeight: "700" }}>
                  {item.title.slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={styles.flex}>
                <Text style={[styles.title, { color: p.text }]} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={{ color: p.muted }}>
                  {item.author ?? "Unknown author"} · {item.format}
                </Text>
                <View style={[styles.bar, { backgroundColor: p.surface }]}>
                  <View style={{ width: `${pct}%`, backgroundColor: p.accent, height: 4 }} />
                </View>
                <Text style={{ color: p.muted, fontSize: 12 }}>
                  {pct === 0 ? "New" : `${pct}% read`}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 52 },
  flex: { flex: 1 },
  header: { flexDirection: "row", paddingHorizontal: 16, gap: 10 },
  search: { flex: 1, borderWidth: 1, borderRadius: 8, padding: 10 },
  add: { width: 44, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  addText: { color: "#fff", fontSize: 24 },
  chips: { flexGrow: 0, paddingHorizontal: 16, marginVertical: 10 },
  chip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginRight: 8,
  },
  row: { flexDirection: "row", gap: 14, padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  cover: { width: 56, height: 80, borderRadius: 4, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 16, fontWeight: "600" },
  bar: { height: 4, marginTop: 8, marginBottom: 2, borderRadius: 2, overflow: "hidden" },
  empty: { textAlign: "center", marginTop: 60, padding: 24 },
  error: { color: "#c00", padding: 16 },
});
