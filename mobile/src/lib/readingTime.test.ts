import { formatTimeLeft, minutesLeft } from "./readingTime";

test("minutesLeft rounds up and never goes negative", () => {
  expect(minutesLeft(13_500, 0)).toBe(10);
  expect(minutesLeft(13_500, 13_000)).toBe(1);
  expect(minutesLeft(13_500, 14_000)).toBe(0);
});

test("formatTimeLeft", () => {
  expect(formatTimeLeft(0)).toBe("Finished");
  expect(formatTimeLeft(45)).toBe("45 min left");
  expect(formatTimeLeft(60)).toBe("1 h left");
  expect(formatTimeLeft(135)).toBe("2 h 15 min left");
});
