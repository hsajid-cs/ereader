const DAY_MS = 24 * 60 * 60 * 1000;

export interface TimedSession {
  startedAt: Date;
  durationSeconds: number;
}

/** Index of the local calendar day containing `time`; `tzOffsetMinutes` is local time minus UTC. */
export function dayIndex(time: Date | number, tzOffsetMinutes: number): number {
  const ms = typeof time === "number" ? time : time.getTime();
  return Math.floor((ms + tzOffsetMinutes * 60_000) / DAY_MS);
}

export function dayLabel(index: number): string {
  return new Date(index * DAY_MS).toISOString().slice(0, 10);
}

/** Minutes read per local day for the last `days` days, oldest first, zero-filled. */
export function dailyMinutes(
  sessions: TimedSession[],
  days: number,
  now: Date,
  tzOffsetMinutes: number,
) {
  const today = dayIndex(now, tzOffsetMinutes);
  const seconds = new Map<number, number>();
  for (const s of sessions) {
    const idx = dayIndex(s.startedAt, tzOffsetMinutes);
    seconds.set(idx, (seconds.get(idx) ?? 0) + s.durationSeconds);
  }
  return Array.from({ length: days }, (_, i) => {
    const idx = today - (days - 1 - i);
    return { date: dayLabel(idx), minutes: Math.round((seconds.get(idx) ?? 0) / 60) };
  });
}

/**
 * Consecutive days with reading, ending today. If nothing has been read yet today the streak
 * is still alive and counts back from yesterday.
 */
export function currentStreak(
  sessions: TimedSession[],
  now: Date,
  tzOffsetMinutes: number,
): number {
  const days = new Set(sessions.map((s) => dayIndex(s.startedAt, tzOffsetMinutes)));
  const today = dayIndex(now, tzOffsetMinutes);
  let cursor = days.has(today) ? today : today - 1;
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor -= 1;
  }
  return streak;
}

export function sumSeconds(
  sessions: TimedSession[],
  fromDay: number,
  toDay: number,
  tzOffsetMinutes: number,
): number {
  return sessions
    .filter((s) => {
      const d = dayIndex(s.startedAt, tzOffsetMinutes);
      return d >= fromDay && d <= toDay;
    })
    .reduce((sum, s) => sum + s.durationSeconds, 0);
}
