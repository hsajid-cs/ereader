import supertest from "supertest";

import { app } from "../src/app";
import { prisma } from "../src/db/prisma";
import { resetDb } from "./helpers";

let a: { Authorization: string };
let b: { Authorization: string };
let bookId: string;
let annotationId: string;
let collectionId: string;

async function register(email: string) {
  const res = await supertest(app)
    .post("/api/auth/register")
    .send({ email, password: "password123" });
  return { Authorization: `Bearer ${res.body.accessToken}` };
}

beforeAll(async () => {
  await resetDb();
  a = await register("owner@example.com");
  b = await register("intruder@example.com");

  const book = await supertest(app)
    .post("/api/books")
    .set(a)
    .attach("file", Buffer.from("secret text"), "secret.txt");
  bookId = book.body.id;
  annotationId = (
    await supertest(app)
      .post(`/api/books/${bookId}/annotations`)
      .set(a)
      .send({ type: "BOOKMARK", locationStart: "1" })
  ).body.id;
  collectionId = (await supertest(app).post("/api/collections").set(a).send({ name: "Mine" })).body
    .id;
  await supertest(app)
    .put(`/api/books/${bookId}/progress`)
    .set(a)
    .send({ location: "5", percentage: 10 });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("another user cannot touch the owner's data", () => {
  const cases: [string, "get" | "put" | "post" | "patch" | "delete", () => string, object?][] = [
    ["read book", "get", () => `/api/books/${bookId}`],
    ["download book file", "get", () => `/api/books/${bookId}/file`],
    ["read cover", "get", () => `/api/books/${bookId}/cover`],
    ["edit book", "patch", () => `/api/books/${bookId}`, { title: "Hacked" }],
    ["delete book", "delete", () => `/api/books/${bookId}`],
    ["read progress", "get", () => `/api/books/${bookId}/progress`],
    [
      "write progress",
      "put",
      () => `/api/books/${bookId}/progress`,
      { location: "1", percentage: 1 },
    ],
    ["list annotations", "get", () => `/api/books/${bookId}/annotations`],
    [
      "add annotation",
      "post",
      () => `/api/books/${bookId}/annotations`,
      { type: "BOOKMARK", locationStart: "9" },
    ],
    ["edit annotation", "patch", () => `/api/annotations/${annotationId}`, { noteText: "x" }],
    ["delete annotation", "delete", () => `/api/annotations/${annotationId}`],
    ["rename collection", "patch", () => `/api/collections/${collectionId}`, { name: "Hacked" }],
    ["delete collection", "delete", () => `/api/collections/${collectionId}`],
    [
      "add book to someone else's collection",
      "post",
      () => `/api/collections/${collectionId}/books/${bookId}`,
    ],
    [
      "remove from someone else's collection",
      "delete",
      () => `/api/collections/${collectionId}/books/${bookId}`,
    ],
    [
      "log a reading session against their book",
      "post",
      () => "/api/stats/sessions",
      {
        // A getter so the id is read at request time, after beforeAll has created the book.
        get bookId() {
          return bookId;
        },
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        durationSeconds: 60,
      },
    ],
  ];

  // superagent breaks on .send(undefined), so only attach a body when there is one.
  const call = (
    method: (typeof cases)[number][1],
    path: string,
    headers: object,
    body?: object,
  ) => {
    const req = supertest(app)[method](path).set(headers);
    return body ? req.send(body) : req;
  };

  // A rest parameter (not named params) so jest-each does not mistake a missing body for `done`.
  it.each(cases)("cannot %s", async (...row) => {
    const [, method, path, body] = row;
    expect((await call(method, path(), b, body)).status).toBe(404);
  });

  it("only lists their own data", async () => {
    expect((await supertest(app).get("/api/books").set(b)).body).toEqual([]);
    expect((await supertest(app).get("/api/collections").set(b)).body).toEqual([]);
    expect((await supertest(app).get(`/api/annotations?bookId=${bookId}`).set(b)).body).toEqual([]);
    const sync = (await supertest(app).get("/api/sync").set(b)).body;
    expect(
      [sync.books, sync.progress, sync.annotations, sync.collections].every(
        (x: unknown[]) => x.length === 0,
      ),
    ).toBe(true);
  });

  it("the owner's data is untouched", async () => {
    expect((await supertest(app).get(`/api/books/${bookId}`).set(a)).body.title).toBe("secret");
    expect((await supertest(app).get(`/api/books/${bookId}/annotations`).set(a)).body).toHaveLength(
      1,
    );
    expect((await supertest(app).get("/api/collections").set(a)).body[0].name).toBe("Mine");
    expect((await supertest(app).get(`/api/books/${bookId}/progress`).set(a)).body.location).toBe(
      "5",
    );
  });

  it("rejects unauthenticated access", async () => {
    for (const [, method, path, body] of cases) {
      expect((await call(method, path(), {}, body)).status).toBe(401);
    }
  });

  it("returns 400 (not 500) for an unknown annotation type filter", async () => {
    expect((await supertest(app).get("/api/annotations?type=NOPE").set(a)).status).toBe(400);
    expect(
      (await supertest(app).get(`/api/books/${bookId}/annotations?type=NOPE`).set(a)).status,
    ).toBe(400);
  });
});
