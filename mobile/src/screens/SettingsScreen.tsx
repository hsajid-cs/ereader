import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { pendingCount, syncNow } from "../offline/store";
import { useAuth } from "../store/auth";
import { palettes, useSettings, usePalette } from "../theme";

export default function SettingsScreen() {
  const p = usePalette();
  const qc = useQueryClient();
  const { user, signOut, updateProfile } = useAuth();
  const { theme, fontSize, serif, setTheme, setFontSize, setSerif } = useSettings();
  const [name, setName] = useState(user?.displayName ?? "");
  const [syncing, setSyncing] = useState(false);
  const pending = useQuery({ queryKey: ["pending"], queryFn: pendingCount, refetchInterval: 5000 });

  useEffect(() => setName(user?.displayName ?? ""), [user?.displayName]);

  async function saveName() {
    try {
      await updateProfile(name.trim());
      Alert.alert("Saved");
    } catch (e) {
      Alert.alert("Could not save", e instanceof Error ? e.message : undefined);
    }
  }

  async function sync() {
    setSyncing(true);
    await syncNow();
    await qc.invalidateQueries();
    setSyncing(false);
  }

  return (
    <ScrollView style={{ backgroundColor: p.background }} contentContainerStyle={styles.container}>
      <Text style={[styles.heading, { color: p.text }]}>Settings</Text>
      <Text style={{ color: p.muted }}>Signed in as {user?.email}</Text>

      <Text style={[styles.label, { color: p.text }]}>Display name</Text>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, { borderColor: p.border, color: p.text }]}
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor={p.muted}
        />
        <Pressable onPress={saveName}>
          <Text style={[styles.step, { color: p.accent }]}>Save</Text>
        </Pressable>
      </View>

      <Text style={[styles.label, { color: p.text }]}>Sync</Text>
      <View style={styles.row}>
        <Text style={{ color: p.muted, flex: 1 }}>
          {pending.data
            ? `${pending.data} change${pending.data === 1 ? "" : "s"} waiting to sync`
            : "Everything is synced"}
        </Text>
        <Pressable onPress={sync} disabled={syncing}>
          <Text style={[styles.step, { color: p.accent }]}>
            {syncing ? "Syncing…" : "Sync now"}
          </Text>
        </Pressable>
      </View>

      <Text style={[styles.label, { color: p.text }]}>Theme</Text>
      <View style={styles.row}>
        {(["light", "sepia", "dark"] as const).map((t) => (
          <Pressable
            key={t}
            onPress={() => setTheme(t)}
            style={[
              styles.chip,
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

      <Text style={[styles.label, { color: p.text }]}>Font size: {fontSize}</Text>
      <View style={styles.row}>
        <Pressable onPress={() => setFontSize(fontSize - 2)}>
          <Text style={[styles.step, { color: p.accent }]}>A−</Text>
        </Pressable>
        <Pressable onPress={() => setFontSize(fontSize + 2)}>
          <Text style={[styles.step, { color: p.accent }]}>A+</Text>
        </Pressable>
        <Pressable onPress={() => setSerif(!serif)}>
          <Text style={[styles.step, { color: p.accent }]}>{serif ? "Serif" : "Sans"}</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={() =>
          Alert.alert(
            "Sign out?",
            pending.data ? "Changes not yet synced will be lost." : undefined,
            [
              { text: "Cancel", style: "cancel" },
              { text: "Sign out", style: "destructive", onPress: () => void signOut() },
            ],
          )
        }
        style={styles.signOut}
      >
        <Text style={{ color: "#d33", fontSize: 16 }}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 52, paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  heading: { fontSize: 28, fontWeight: "700" },
  label: { fontSize: 16, fontWeight: "600", marginTop: 12 },
  row: { flexDirection: "row", gap: 16, alignItems: "center" },
  input: { flex: 1, borderWidth: 1, borderRadius: 8, padding: 10 },
  chip: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8, borderWidth: 2 },
  step: { fontSize: 18, padding: 6 },
  signOut: { marginTop: 32 },
});
