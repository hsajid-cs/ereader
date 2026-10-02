import { prisma } from "../../db/prisma";

import { currentStreak, dailyMinutes, dayIndex, sumSeconds } from "./days";

const HISTORY_DAYS_MAX = 90;

async function recentSessions(userId: string, days: number, now: Date) {
  return prisma.readingSession.findMany({
    // One extra day each side covers every timezone.
    where: {
      userId,
      startedAt: { gte: new Date(now.getTime() - (days + 2) * 24 * 60 * 60 * 1000) },
    },
    select: { startedAt: true, durationSeconds: true },
  });
}

export async function getSummary(userId: string, tzOffsetMinutes = 0, now = new Date()) {
  const sessions = await recentSessions(userId, 60, now);
  const today = dayIndex(now, tzOffsetMinutes);

  const goal = await prisma.readingGoal.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });

  return {
    todayMinutes: Math.round(sumSeconds(sessions, today, today, tzOffsetMinutes) / 60),
    weekMinutes: Math.round(sumSeconds(sessions, today - 6, today, tzOffsetMinutes) / 60),
    currentStreakDays: currentStreak(sessions, now, tzOffsetMinutes),
    goal: { userId: goal.userId, dailyMinutesGoal: goal.dailyMinutesGoal },
  };
}

export async function getDaily(
  userId: string,
  days: number,
  tzOffsetMinutes = 0,
  now = new Date(),
) {
  const n = Math.min(HISTORY_DAYS_MAX, Math.max(1, days));
  return dailyMinutes(await recentSessions(userId, n, now), n, now, tzOffsetMinutes);
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
