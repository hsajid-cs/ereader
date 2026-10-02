import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAuth } from "../store/auth";
import { palettes, useSettings, usePalette } from "../theme";

export default function SettingsScreen() {
  const p = usePalette();
  const { user, signOut } = useAuth();
  const { theme, fontSize, serif, setTheme, setFontSize, setSerif } = useSettings();

  return (
    <View style={[styles.container, { backgroundColor: p.background }]}>
      <Text style={[styles.heading, { color: p.text }]}>Settings</Text>
      <Text style={{ color: p.muted }}>Signed in as {user?.email}</Text>

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

      <Pressable onPress={signOut} style={styles.signOut}>
        <Text style={{ color: "#d33", fontSize: 16 }}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 52, paddingHorizontal: 16, gap: 12 },
  heading: { fontSize: 28, fontWeight: "700" },
  label: { fontSize: 16, fontWeight: "600", marginTop: 12 },
  row: { flexDirection: "row", gap: 16, alignItems: "center" },
  chip: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8, borderWidth: 2 },
  step: { fontSize: 18, padding: 6 },
  signOut: { marginTop: 32 },
});
