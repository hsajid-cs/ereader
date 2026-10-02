import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { api } from "../api/client";
import { useAuth } from "../store/auth";

export default function LibraryScreen() {
  const signOut = useAuth((s) => s.signOut);
  const [search, setSearch] = useState("");
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["books", search],
    queryFn: () => api.listBooks(search || undefined),
  });

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.search}
        placeholder="Search library"
        value={search}
        onChangeText={setSearch}
      />
      {error && <Text style={styles.error}>{error.message}</Text>}
      <FlatList
        data={data}
        keyExtractor={(b) => b.id}
        refreshing={isLoading || isRefetching}
        onRefresh={refetch}
        ListEmptyComponent={!isLoading ? <Text style={styles.empty}>No books yet.</Text> : null}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.bookTitle}>{item.title}</Text>
            <Text style={styles.author}>
              {item.author ?? "Unknown author"} · {item.format}
            </Text>
          </View>
        )}
      />
      <Pressable onPress={signOut}>
        <Text style={styles.signOut}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, paddingTop: 56, backgroundColor: "#fff" },
  search: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, marginBottom: 12 },
  row: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#ddd" },
  bookTitle: { fontSize: 16, fontWeight: "600" },
  author: { color: "#666", marginTop: 2 },
  empty: { textAlign: "center", color: "#888", marginTop: 40 },
  error: { color: "#c00", marginBottom: 8 },
  signOut: { textAlign: "center", color: "#06c", padding: 12 },
});
