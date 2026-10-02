/** ~238 words per minute at ~5.7 characters per word including spaces. */
export const CHARS_PER_MINUTE = 1350;

export function minutesLeft(
  totalChars: number,
  offset: number,
  charsPerMinute = CHARS_PER_MINUTE,
): number {
  return Math.max(0, Math.ceil((totalChars - offset) / charsPerMinute));
}

export function formatTimeLeft(minutes: number): string {
  if (minutes <= 0) return "Finished";
  if (minutes < 60) return `${minutes} min left`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h left` : `${h} h ${m} min left`;
}
