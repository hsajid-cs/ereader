import supertest from "supertest";

import { app } from "../src/app";
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
});
