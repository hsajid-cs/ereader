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
    .field("title", "Annotated Book")
    .attach("file", Buffer.from("some book content here"), "book.txt");
  bookId = uploadRes.body.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

function auth(req: supertest.Test) {
  return req.set("Authorization", `Bearer ${accessToken}`);
}

describe("annotations", () => {
  it("creates, lists, updates, and deletes a highlight", async () => {
    const createRes = await auth(supertest(app).post(`/api/books/${bookId}/annotations`)).send({
      type: "HIGHLIGHT",
      locationStart: "offset:0",
      locationEnd: "offset:10",
      color: "#ffff00",
    });
    expect(createRes.status).toBe(201);
    const annotationId = createRes.body.id;

    const listRes = await auth(supertest(app).get(`/api/books/${bookId}/annotations`));
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);

    const patchRes = await auth(supertest(app).patch(`/api/annotations/${annotationId}`)).send({
      color: "#00ff00",
    });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.color).toBe("#00ff00");

    const deleteRes = await auth(supertest(app).delete(`/api/annotations/${annotationId}`));
    expect(deleteRes.status).toBe(204);

    const afterDeleteRes = await auth(supertest(app).get(`/api/books/${bookId}/annotations`));
    expect(afterDeleteRes.body).toHaveLength(0);
  });

  it("round-trips a drawing annotation with normalized stroke data", async () => {
    const drawingData = {
      strokes: [
        {
          points: [
            { x: 0.1, y: 0.2 },
            { x: 0.3, y: 0.4 },
          ],
          color: "#ff0000",
          widthPx: 4,
        },
      ],
      viewport: { width: 390, height: 844 },
      fontSize: 18,
      theme: "dark",
    };

    const createRes = await auth(supertest(app).post(`/api/books/${bookId}/annotations`)).send({
      type: "DRAWING",
      locationStart: "page:3",
      drawingData,
    });
    expect(createRes.status).toBe(201);
    expect(createRes.body.drawingData).toEqual(drawingData);

    const crossBookRes = await auth(supertest(app).get("/api/annotations?type=DRAWING"));
    expect(crossBookRes.status).toBe(200);
    expect(crossBookRes.body).toHaveLength(1);
    expect(crossBookRes.body[0].drawingData).toEqual(drawingData);
  });

  it("rejects malformed drawing data", async () => {
    const res = await auth(supertest(app).post(`/api/books/${bookId}/annotations`)).send({
      type: "DRAWING",
      locationStart: "page:1",
      drawingData: { strokes: "not-an-array" },
    });
    expect(res.status).toBe(400);
  });

  it("scopes annotations to the owning user", async () => {
    const createRes = await auth(supertest(app).post(`/api/books/${bookId}/annotations`)).send({
      type: "NOTE",
      locationStart: "offset:5",
      noteText: "private note",
    });

    const otherRes = await supertest(app)
      .post("/api/auth/register")
      .send({ email: "other2@example.com", password: "password123" });
    const otherToken = otherRes.body.accessToken;

    const res = await supertest(app)
      .patch(`/api/annotations/${createRes.body.id}`)
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ noteText: "hijacked" });
    expect(res.status).toBe(404);
  });
});
