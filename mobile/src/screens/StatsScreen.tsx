import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { api } from "../api/client";
import { toBars } from "../lib/chart";
import { cached } from "../offline/store";
import { usePalette } from "../theme";

export default function StatsScreen() {
  const p = usePalette();
  const qc = useQueryClient();
  const { data, error } = useQuery({
    queryKey: ["stats"],
    queryFn: () => cached("stats", api.statsSummary),
  });
  const daily = useQuery({
    queryKey: ["stats", "daily"],
    queryFn: () => cached("stats-daily", () => api.statsDaily(14)),
  });
  const setGoal = useMutation({
    mutationFn: api.setGoal,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stats"] }),
  });

  const goal = data?.goal.dailyMinutesGoal ?? 30;
  const pct = data ? Math.min(100, Math.round((data.todayMinutes / goal) * 100)) : 0;

  return (
    <View style={[styles.container, { backgroundColor: p.background }]}>
      <Text style={[styles.heading, { color: p.text }]}>Reading</Text>
      {error && <Text style={styles.error}>{error.message}</Text>}
      <View style={[styles.card, { backgroundColor: p.surface }]}>
        <Text style={{ color: p.muted }}>Today</Text>
        <Text style={[styles.big, { color: p.text }]}>
          {data?.todayMinutes ?? 0} / {goal} min
        </Text>
        <View style={[styles.track, { backgroundColor: p.border }]}>
          <View style={{ width: `${pct}%`, height: 8, backgroundColor: p.accent }} />
        </View>
        <View style={styles.goalRow}>
          <Pressable onPress={() => setGoal.mutate(Math.max(5, goal - 5))}>
            <Text style={[styles.step, { color: p.accent }]}>− 5</Text>
          </Pressable>
          <Text style={{ color: p.muted }}>Daily goal</Text>
          <Pressable onPress={() => setGoal.mutate(Math.min(1440, goal + 5))}>
            <Text style={[styles.step, { color: p.accent }]}>+ 5</Text>
          </Pressable>
        </View>
      </View>
      <View style={[styles.card, { backgroundColor: p.surface }]}>
        <Text style={{ color: p.muted }}>Last 14 days</Text>
        <View style={styles.chart}>
          {(() => {
            const { bars, goalLine } = toBars(daily.data ?? [], goal);
            return (
              <>
                <View
                  style={[styles.goalLine, { bottom: `${goalLine * 100}%`, borderColor: p.muted }]}
                />
                {bars.map((b, i) => (
                  <View key={i} style={styles.barCol}>
                    <View
                      style={[
                        styles.bar,
                        {
                          height: `${Math.max(b.height * 100, b.minutes > 0 ? 3 : 0)}%`,
                          backgroundColor: b.metGoal ? p.accent : p.muted,
                        },
                      ]}
                    />
                  </View>
                ))}
              </>
            );
          })()}
        </View>
        <View style={styles.axis}>
          {toBars(daily.data ?? [], goal).bars.map((b, i) => (
            <Text key={i} style={[styles.axisLabel, { color: p.muted }]}>
              {b.label}
            </Text>
          ))}
        </View>
        <Text style={{ color: p.muted, fontSize: 12 }}>
          Dashed line is your daily goal; highlighted bars met it.
        </Text>
      </View>
      <View style={styles.tiles}>
        <View style={[styles.card, styles.tile, { backgroundColor: p.surface }]}>
          <Text style={{ color: p.muted }}>This week</Text>
          <Text style={[styles.big, { color: p.text }]}>{data?.weekMinutes ?? 0} min</Text>
        </View>
        <View style={[styles.card, styles.tile, { backgroundColor: p.surface }]}>
          <Text style={{ color: p.muted }}>Streak</Text>
          <Text style={[styles.big, { color: p.text }]}>
            {data?.currentStreakDays ?? 0} {data?.currentStreakDays === 1 ? "day" : "days"}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 52, paddingHorizontal: 16, gap: 12 },
  heading: { fontSize: 28, fontWeight: "700" },
  card: { borderRadius: 12, padding: 16, gap: 8 },
  tiles: { flexDirection: "row", gap: 12 },
  tile: { flex: 1 },
  big: { fontSize: 26, fontWeight: "700" },
  track: { height: 8, borderRadius: 4, overflow: "hidden" },
  goalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  step: { fontSize: 18, padding: 6 },
  error: { color: "#c00" },
  chart: { height: 120, flexDirection: "row", alignItems: "flex-end", gap: 4, marginTop: 8 },
  barCol: { flex: 1, height: "100%", justifyContent: "flex-end" },
  bar: { width: "100%", borderRadius: 3 },
  goalLine: { position: "absolute", left: 0, right: 0, borderTopWidth: 1, borderStyle: "dashed" },
  axis: { flexDirection: "row", gap: 4 },
  axisLabel: { flex: 1, textAlign: "center", fontSize: 10 },
});
