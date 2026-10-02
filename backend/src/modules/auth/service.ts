import crypto from "node:crypto";

import bcrypt from "bcrypt";

import { prisma } from "../../db/prisma";
import { ApiError } from "../../middleware/errorHandler";
import { storage } from "../../storage";
import { refreshTokenExpiry, signAccessToken } from "./jwt";

const SALT_ROUNDS = 12;

function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function toUserDto(user: {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt.toISOString(),
  };
}

async function issueTokens(userId: string, email: string) {
  const accessToken = signAccessToken({ sub: userId, email });
  const refreshToken = crypto.randomBytes(48).toString("hex");
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: refreshTokenExpiry(),
    },
  });
  return { accessToken, refreshToken };
}

export async function register(email: string, password: string, displayName?: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new ApiError(409, "email_taken", "Email is already registered");
  }
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: { email, passwordHash, displayName },
  });
  const tokens = await issueTokens(user.id, user.email);
  return { user: toUserDto(user), ...tokens };
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new ApiError(401, "invalid_credentials", "Invalid email or password");
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new ApiError(401, "invalid_credentials", "Invalid email or password");
  }
  const tokens = await issueTokens(user.id, user.email);
  return { user: toUserDto(user), ...tokens };
}

export async function refresh(refreshToken: string) {
  const tokenHash = hashRefreshToken(refreshToken);
  const stored = await prisma.refreshToken.findFirst({ where: { tokenHash } });
  if (!stored || stored.expiresAt < new Date()) {
    throw new ApiError(401, "invalid_refresh_token", "Refresh token is invalid or expired");
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: stored.userId } });
  await prisma.refreshToken.delete({ where: { id: stored.id } });
  return issueTokens(user.id, user.email);
}

export async function logout(refreshToken: string) {
  const tokenHash = hashRefreshToken(refreshToken);
  await prisma.refreshToken.deleteMany({ where: { tokenHash } });
}

async function verifyPassword(userId: string, password: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await bcrypt.compare(password, user.passwordHash))) {
    throw new ApiError(403, "invalid_password", "Password is incorrect");
  }
  return user;
}

/** Changes the password and signs out every other session. Returns fresh tokens for this one. */
export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await verifyPassword(userId, currentPassword);
  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.refreshToken.deleteMany({ where: { userId } }),
  ]);
  return issueTokens(user.id, user.email);
}

/** Permanently deletes the account, its data, and the stored files. */
export async function deleteAccount(userId: string, password: string) {
  await verifyPassword(userId, password);
  const books = await prisma.book.findMany({
    where: { userId },
    select: { storageKey: true, coverStorageKey: true },
  });
  await prisma.user.delete({ where: { id: userId } }); // cascades to all user data
  await Promise.all(
    books.flatMap((b) =>
      [b.storageKey, b.coverStorageKey]
        .filter((k): k is string => !!k)
        .map((k) => storage.delete(k)),
    ),
  );
}

export { toUserDto };
