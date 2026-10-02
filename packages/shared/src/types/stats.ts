export interface ReadingSession {
  id: string;
  userId: string;
  bookId: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
}

export interface CreateReadingSessionRequest {
  bookId: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
}

export interface ReadingGoal {
  userId: string;
  dailyMinutesGoal: number;
}

export interface StatsSummary {
  todayMinutes: number;
  weekMinutes: number;
  currentStreakDays: number;
  goal: ReadingGoal;
}

export interface DailyReading {
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  minutes: number;
}
