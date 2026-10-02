import { currentStreak, dailyMinutes, dayIndex, sumSeconds } from "../src/modules/stats/days";

const at = (iso: string, seconds = 600) => ({ startedAt: new Date(iso), durationSeconds: seconds });

describe("stats day bucketing", () => {
  it("assigns a late-evening session to the user's local day, not the UTC day", () => {
    // 2026-03-10 04:30 UTC is still March 9th at 20:30 in UTC-8.
    const s = at("2026-03-10T04:30:00Z");
    expect(dayIndex(s.startedAt, 0)).not.toBe(dayIndex(s.startedAt, -8 * 60));
    const now = new Date("2026-03-10T05:00:00Z"); // March 9th, 21:00 local
    expect(sumSeconds([s], dayIndex(now, -480), dayIndex(now, -480), -480)).toBe(600);
    expect(sumSeconds([s], dayIndex(now, 0), dayIndex(now, 0), 0)).toBe(600);
  });

  it("zero-fills daily minutes oldest first", () => {
    const now = new Date("2026-03-10T12:00:00Z");
    const out = dailyMinutes(
      [at("2026-03-10T08:00:00Z", 1800), at("2026-03-08T08:00:00Z", 60)],
      4,
      now,
      0,
    );
    expect(out).toEqual([
      { date: "2026-03-07", minutes: 0 },
      { date: "2026-03-08", minutes: 1 },
      { date: "2026-03-09", minutes: 0 },
      { date: "2026-03-10", minutes: 30 },
    ]);
  });

  it("keeps the streak alive until the end of today", () => {
    const now = new Date("2026-03-10T09:00:00Z");
    const sessions = [
      at("2026-03-09T10:00:00Z"),
      at("2026-03-08T10:00:00Z"),
      at("2026-03-06T10:00:00Z"),
    ];
    expect(currentStreak(sessions, now, 0)).toBe(2); // nothing yet today, yesterday + day before
    expect(currentStreak([...sessions, at("2026-03-10T08:00:00Z")], now, 0)).toBe(3);
    expect(currentStreak([at("2026-03-01T10:00:00Z")], now, 0)).toBe(0);
  });
});
