import fs from "node:fs";
import path from "node:path";

import supertest from "supertest";

import { app } from "../src/app";
import { env } from "../src/config/env";
import { prisma } from "../src/db/prisma";
import { resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("auth", () => {
  it("registers, logs in, refreshes, and logs out", async () => {
    const registerRes = await supertest(app)
      .post("/api/auth/register")
      .send({ email: "a@example.com", password: "password123", displayName: "A" });
    expect(registerRes.status).toBe(201);
    expect(registerRes.body.user.email).toBe("a@example.com");
    expect(registerRes.body.accessToken).toBeDefined();
    expect(registerRes.body.refreshToken).toBeDefined();

    const dupeRes = await supertest(app)
      .post("/api/auth/register")
      .send({ email: "a@example.com", password: "password123" });
    expect(dupeRes.status).toBe(409);

    const loginRes = await supertest(app)
      .post("/api/auth/login")
      .send({ email: "a@example.com", password: "password123" });
    expect(loginRes.status).toBe(200);

    const badLoginRes = await supertest(app)
      .post("/api/auth/login")
      .send({ email: "a@example.com", password: "wrong" });
    expect(badLoginRes.status).toBe(401);

    const refreshRes = await supertest(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: loginRes.body.refreshToken });
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.accessToken).toBeDefined();

    const meRes = await supertest(app)
      .get("/api/users/me")
      .set("Authorization", `Bearer ${refreshRes.body.accessToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.email).toBe("a@example.com");

    const logoutRes = await supertest(app)
      .post("/api/auth/logout")
      .send({ refreshToken: refreshRes.body.refreshToken });
    expect(logoutRes.status).toBe(204);

    const reuseRes = await supertest(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: refreshRes.body.refreshToken });
    expect(reuseRes.status).toBe(401);
  });

  it("rejects requests without a bearer token", async () => {
    const res = await supertest(app).get("/api/users/me");
    expect(res.status).toBe(401);
  });

  it("treats email case-insensitively", async () => {
    await supertest(app)
      .post("/api/auth/register")
      .send({ email: " Mixed@Example.COM ", password: "password123" });
    const login = await supertest(app)
      .post("/api/auth/login")
      .send({ email: "MIXED@example.com", password: "password123" });
    expect(login.status).toBe(200);
    expect(login.body.user.email).toBe("mixed@example.com");
    const dupe = await supertest(app)
      .post("/api/auth/register")
      .send({ email: "mixed@example.com", password: "password123" });
    expect(dupe.status).toBe(409);
  });

  it("changes the password, revokes old sessions and returns fresh tokens", async () => {
    const reg = await supertest(app)
      .post("/api/auth/register")
      .send({ email: "p@example.com", password: "password123" });
    const bearer = { Authorization: `Bearer ${reg.body.accessToken}` };

    const wrong = await supertest(app)
      .post("/api/auth/change-password")
      .set(bearer)
      .send({ currentPassword: "nope", newPassword: "newpassword1" });
    expect(wrong.status).toBe(403);
    const weak = await supertest(app)
      .post("/api/auth/change-password")
      .set(bearer)
      .send({ currentPassword: "password123", newPassword: "short" });
    expect(weak.status).toBe(400);

    const ok = await supertest(app)
      .post("/api/auth/change-password")
      .set(bearer)
      .send({ currentPassword: "password123", newPassword: "newpassword1" });
    expect(ok.status).toBe(200);
    expect(ok.body.refreshToken).toBeDefined();

    const oldRefresh = await supertest(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: reg.body.refreshToken });
    expect(oldRefresh.status).toBe(401);
    const newRefresh = await supertest(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: ok.body.refreshToken });
    expect(newRefresh.status).toBe(200);

    expect(
      (
        await supertest(app)
          .post("/api/auth/login")
          .send({ email: "p@example.com", password: "password123" })
      ).status,
    ).toBe(401);
    expect(
      (
        await supertest(app)
          .post("/api/auth/login")
          .send({ email: "p@example.com", password: "newpassword1" })
      ).status,
    ).toBe(200);
  });

  it("deletes the account with its data and files after password confirmation", async () => {
    const reg = await supertest(app)
      .post("/api/auth/register")
      .send({ email: "d@example.com", password: "password123" });
    const bearer = { Authorization: `Bearer ${reg.body.accessToken}` };
    const up = await supertest(app)
      .post("/api/books")
      .set(bearer)
      .attach("file", Buffer.from("some text"), "doc.txt");
    expect(up.status).toBe(201);
    const file = path.resolve(env.uploadsDir, reg.body.user.id, `${up.body.id}.txt`);
    expect(fs.existsSync(file)).toBe(true);

    const wrong = await supertest(app)
      .delete("/api/users/me")
      .set(bearer)
      .send({ password: "wrong-password" });
    expect(wrong.status).toBe(403);
    expect(await prisma.user.count()).toBe(1);

    const del = await supertest(app)
      .delete("/api/users/me")
      .set(bearer)
      .send({ password: "password123" });
    expect(del.status).toBe(204);
    expect(fs.existsSync(file)).toBe(false);
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.book.count()).toBe(0);
    expect(
      (
        await supertest(app)
          .post("/api/auth/login")
          .send({ email: "d@example.com", password: "password123" })
      ).status,
    ).toBe(401);
  });

  it("keeps a just-rotated refresh token valid briefly, then expires it", async () => {
    const reg = await supertest(app)
      .post("/api/auth/register")
      .send({ email: "g@example.com", password: "password123" });
    const first = await supertest(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: reg.body.refreshToken });
    expect(first.status).toBe(200);

    // The client may have been killed before saving the new token and retries with the old one.
    const retry = await supertest(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: reg.body.refreshToken });
    expect(retry.status).toBe(200);

    // Once the grace period has passed the old token is dead.
    await prisma.refreshToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const late = await supertest(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: first.body.refreshToken });
    expect(late.status).toBe(401);
  });
});
