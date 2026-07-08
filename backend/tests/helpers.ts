import { prisma } from "../src/db/prisma";

export async function resetDb() {
  await prisma.$transaction([
    prisma.collectionBook.deleteMany(),
    prisma.collection.deleteMany(),
    prisma.annotation.deleteMany(),
    prisma.readingProgress.deleteMany(),
    prisma.readingSession.deleteMany(),
    prisma.readingGoal.deleteMany(),
    prisma.book.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}
