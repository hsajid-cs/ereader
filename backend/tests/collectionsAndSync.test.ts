import supertest from "supertest";

import { app } from "../src/app";
import { prisma } from "../src/db/prisma";
import { resetDb } from "./helpers";

let accessToken: string;
let bookId: string;

beforeEach(async () => {
  await resetDb();
  const registerRes = await supertest(app)
    .post("/api/auth/register")
    .send({ email: "reader@example.com", password: "password123" });
  accessToken = registerRes.body.accessToken;

  const uploadRes = await supertest(app)
    .post("/api/books")
    .set("Authorization", `Bearer ${accessToken}`)
    .field("title", "Collected Book")
    .attach("file", Buffer.from("content"), "book.txt");
  bookId = uploadRes.body.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

function auth(req: supertest.Test) {
  return req.set("Authorization", `Bearer ${accessToken}`);
}

describe("collections", () => {
  it("creates a collection, adds/removes a book, and filters the library by it", async () => {
    const createRes = await auth(supertest(app).post("/api/collections")).send({
      name: "Favorites",
    });
    expect(createRes.status).toBe(201);
    const collectionId = createRes.body.id;

    const addRes = await auth(
      supertest(app).post(`/api/collections/${collectionId}/books/${bookId}`),
    );
    expect(addRes.status).toBe(204);

    const filteredRes = await auth(supertest(app).get(`/api/books?collectionId=${collectionId}`));
    expect(filteredRes.body).toHaveLength(1);

    const removeRes = await auth(
      supertest(app).delete(`/api/collections/${collectionId}/books/${bookId}`),
    );
    expect(removeRes.status).toBe(204);

    const afterRemoveRes = await auth(
      supertest(app).get(`/api/books?collectionId=${collectionId}`),
    );
    expect(afterRemoveRes.body).toHaveLength(0);
  });
});

describe("stats", () => {
  it("records a session and reflects it in the summary", async () => {
    const now = new Date();
    const sessionRes = await auth(supertest(app).post("/api/stats/sessions")).send({
      bookId,
      startedAt: now.toISOString(),
      endedAt: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
      durationSeconds: 600,
    });
    expect(sessionRes.status).toBe(201);

    const summaryRes = await auth(supertest(app).get("/api/stats/summary"));
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.todayMinutes).toBe(10);
    expect(summaryRes.body.currentStreakDays).toBe(1);

    const dailyRes = await auth(supertest(app).get("/api/stats/daily?days=3"));
    expect(dailyRes.status).toBe(200);
    expect(dailyRes.body).toHaveLength(3);
    expect(dailyRes.body[2].minutes).toBe(10);
    expect(dailyRes.body[0].minutes).toBe(0);

    const goalRes = await auth(supertest(app).put("/api/stats/goal")).send({
      dailyMinutesGoal: 45,
    });
    expect(goalRes.status).toBe(200);
    expect(goalRes.body.dailyMinutesGoal).toBe(45);
  });
});

describe("sync", () => {
  it("returns only rows updated since the given timestamp", async () => {
    const before = new Date().toISOString();

    await auth(supertest(app).post(`/api/books/${bookId}/annotations`)).send({
      type: "BOOKMARK",
      locationStart: "offset:0",
    });

    const syncRes = await auth(supertest(app).get(`/api/sync?since=${before}`));
    expect(syncRes.status).toBe(200);
    expect(syncRes.body.annotations).toHaveLength(1);
    expect(syncRes.body.books).toHaveLength(0);

    const fullSyncRes = await auth(supertest(app).get("/api/sync?since=2020-01-01T00:00:00.000Z"));
    expect(fullSyncRes.body.books).toHaveLength(1);
    expect(fullSyncRes.body.annotations).toHaveLength(1);
  });
});
