export interface Bar {
  label: string;
  minutes: number;
  /** 0..1 of the chart height. */
  height: number;
  metGoal: boolean;
}

/** Scales daily minutes to bar heights; the axis always reaches at least the goal. */
export function toBars(
  daily: { date: string; minutes: number }[],
  goalMinutes: number,
): { bars: Bar[]; goalLine: number } {
  const max = Math.max(goalMinutes, ...daily.map((d) => d.minutes), 1);
  return {
    goalLine: goalMinutes / max,
    bars: daily.map((d) => ({
      label: shortDay(d.date),
      minutes: d.minutes,
      height: d.minutes / max,
      metGoal: d.minutes >= goalMinutes,
    })),
  };
}

/** "2026-03-09" -> "M" style weekday initial, computed in UTC to avoid local-time drift. */
export function shortDay(date: string): string {
  return "SMTWTFS"[new Date(`${date}T00:00:00Z`).getUTCDay()];
}
