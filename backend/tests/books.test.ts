import supertest from "supertest";

import { app } from "../src/app";
import { prisma } from "../src/db/prisma";
import { resetDb } from "./helpers";

let accessToken: string;

beforeEach(async () => {
  await resetDb();
  const res = await supertest(app)
    .post("/api/auth/register")
    .send({ email: "reader@example.com", password: "password123" });
  accessToken = res.body.accessToken;
});

afterAll(async () => {
  await prisma.$disconnect();
});

function auth(req: supertest.Test) {
  return req.set("Authorization", `Bearer ${accessToken}`);
}

describe("books", () => {
  it("uploads, lists, downloads, patches, and deletes a book", async () => {
    const uploadRes = await auth(supertest(app).post("/api/books"))
      .field("title", "Test Book")
      .field("author", "Test Author")
      .attach("file", Buffer.from("hello world"), "book.txt");
    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.format).toBe("TXT");
    const bookId = uploadRes.body.id;

    const listRes = await auth(supertest(app).get("/api/books"));
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);

    const downloadRes = await auth(supertest(app).get(`/api/books/${bookId}/file`));
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.text).toBe("hello world");

    const rangeRes = await auth(supertest(app).get(`/api/books/${bookId}/file`)).set(
      "Range",
      "bytes=0-4",
    );
    expect(rangeRes.status).toBe(206);
    expect(rangeRes.text).toBe("hello");

    const patchRes = await auth(supertest(app).patch(`/api/books/${bookId}`)).send({
      title: "Renamed",
    });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.title).toBe("Renamed");

    const deleteRes = await auth(supertest(app).delete(`/api/books/${bookId}`));
    expect(deleteRes.status).toBe(204);

    const afterDeleteRes = await auth(supertest(app).get(`/api/books/${bookId}`));
    expect(afterDeleteRes.status).toBe(404);
  });

  it("de-dupes re-uploads of the same file for a user", async () => {
    const first = await auth(supertest(app).post("/api/books"))
      .field("title", "Dupe")
      .attach("file", Buffer.from("same content"), "book.txt");
    const second = await auth(supertest(app).post("/api/books"))
      .field("title", "Dupe Again")
      .attach("file", Buffer.from("same content"), "book.txt");
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
  });

  it("rejects unsupported file formats", async () => {
    const res = await auth(supertest(app).post("/api/books"))
      .field("title", "Bad")
      .attach("file", Buffer.from("data"), "book.exe");
    expect(res.status).toBe(400);
  });

  it("does not allow accessing another user's book", async () => {
    const uploadRes = await auth(supertest(app).post("/api/books"))
      .field("title", "Mine")
      .attach("file", Buffer.from("secret"), "book.txt");
    const bookId = uploadRes.body.id;

    const otherRegisterRes = await supertest(app)
      .post("/api/auth/register")
      .send({ email: "other@example.com", password: "password123" });
    const otherToken = otherRegisterRes.body.accessToken;

    const res = await supertest(app)
      .get(`/api/books/${bookId}`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
  });
});

describe("reading progress", () => {
  it("upserts and fetches progress for a book", async () => {
    const uploadRes = await auth(supertest(app).post("/api/books"))
      .field("title", "Progress Book")
      .attach("file", Buffer.from("content"), "book.txt");
    const bookId = uploadRes.body.id;

    const putRes = await auth(supertest(app).put(`/api/books/${bookId}/progress`)).send({
      location: "offset:10",
      percentage: 5,
    });
    expect(putRes.status).toBe(200);

    const updateRes = await auth(supertest(app).put(`/api/books/${bookId}/progress`)).send({
      location: "offset:20",
      percentage: 10,
    });
    expect(updateRes.status).toBe(200);

    const getRes = await auth(supertest(app).get(`/api/books/${bookId}/progress`));
    expect(getRes.status).toBe(200);
    expect(getRes.body.location).toBe("offset:20");
    expect(getRes.body.percentage).toBe(10);
  });
});
