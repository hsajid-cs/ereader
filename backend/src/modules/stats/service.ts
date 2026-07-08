import { prisma } from "../../db/prisma";

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export async function getSummary(userId: string) {
  const now = new Date();
  const todayStart = startOfUtcDay(now);
  const weekStart = addDays(todayStart, -6);

  const sessions = await prisma.readingSession.findMany({
    where: { userId, startedAt: { gte: addDays(todayStart, -60) } },
    select: { startedAt: true, durationSeconds: true },
  });

  const todaySeconds = sessions
    .filter((s) => s.startedAt >= todayStart)
    .reduce((sum, s) => sum + s.durationSeconds, 0);

  const weekSeconds = sessions
    .filter((s) => s.startedAt >= weekStart)
    .reduce((sum, s) => sum + s.durationSeconds, 0);

  const daysWithReading = new Set(sessions.map((s) => startOfUtcDay(s.startedAt).getTime()));

  let streak = 0;
  let cursor = todayStart;
  while (daysWithReading.has(cursor.getTime())) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  const goal = await prisma.readingGoal.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });

  return {
    todayMinutes: Math.round(todaySeconds / 60),
    weekMinutes: Math.round(weekSeconds / 60),
    currentStreakDays: streak,
    goal: { userId: goal.userId, dailyMinutesGoal: goal.dailyMinutesGoal },
  };
}

export async function getGoal(userId: string) {
  const goal = await prisma.readingGoal.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
  return { userId: goal.userId, dailyMinutesGoal: goal.dailyMinutesGoal };
}

export async function setGoal(userId: string, dailyMinutesGoal: number) {
  const goal = await prisma.readingGoal.upsert({
    where: { userId },
    create: { userId, dailyMinutesGoal },
    update: { dailyMinutesGoal },
  });
  return { userId: goal.userId, dailyMinutesGoal: goal.dailyMinutesGoal };
}

export async function recordSession(
  userId: string,
  bookId: string,
  startedAt: Date,
  endedAt: Date,
  durationSeconds: number,
) {
  const session = await prisma.readingSession.create({
    data: { userId, bookId, startedAt, endedAt, durationSeconds },
  });
  return {
    id: session.id,
    userId: session.userId,
    bookId: session.bookId,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt.toISOString(),
    durationSeconds: session.durationSeconds,
  };
}
