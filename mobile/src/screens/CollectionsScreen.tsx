import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { api } from "../api/client";
import { usePalette } from "../theme";

export default function CollectionsScreen() {
  const p = usePalette();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const { data, error } = useQuery({ queryKey: ["collections"], queryFn: api.listCollections });
  const refresh = () => qc.invalidateQueries({ queryKey: ["collections"] });

  const create = useMutation({
    mutationFn: () => api.createCollection(name.trim()),
    onSuccess: () => {
      setName("");
      return refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteCollection(id),
    onSuccess: refresh,
  });

  return (
    <View style={[styles.container, { backgroundColor: p.background }]}>
      <Text style={[styles.heading, { color: p.text }]}>Collections</Text>
      <View style={styles.header}>
        <TextInput
          style={[styles.input, { borderColor: p.border, color: p.text }]}
          placeholder="New collection"
          placeholderTextColor={p.muted}
          value={name}
          onChangeText={setName}
        />
        <Pressable
          disabled={!name.trim()}
          style={[styles.add, { backgroundColor: name.trim() ? p.accent : p.border }]}
          onPress={() => create.mutate()}
        >
          <Text style={styles.addText}>Add</Text>
        </Pressable>
      </View>
      {error && <Text style={styles.error}>{error.message}</Text>}
      <FlatList
        data={data}
        keyExtractor={(c) => c.id}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: p.muted }]}>
            Group books into collections, then add them from a book's long-press menu in the
            Library.
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={[styles.row, { borderColor: p.border }]}
            onLongPress={() =>
              Alert.alert(item.name, undefined, [
                { text: "Delete", style: "destructive", onPress: () => remove.mutate(item.id) },
                { text: "Cancel", style: "cancel" },
              ])
            }
          >
            <Text style={{ color: p.text, fontSize: 16 }}>{item.name}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 52, paddingHorizontal: 16 },
  heading: { fontSize: 28, fontWeight: "700", marginBottom: 12 },
  header: { flexDirection: "row", gap: 10, marginBottom: 12 },
  input: { flex: 1, borderWidth: 1, borderRadius: 8, padding: 10 },
  add: { borderRadius: 8, paddingHorizontal: 16, justifyContent: "center" },
  addText: { color: "#fff", fontWeight: "600" },
  row: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  empty: { textAlign: "center", marginTop: 40 },
  error: { color: "#c00" },
});
