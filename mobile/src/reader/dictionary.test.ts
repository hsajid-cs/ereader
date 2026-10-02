import { lookup, parseDictionary } from "./dictionary";

const sample = [
  {
    word: "cat",
    phonetic: "/kæt/",
    meanings: [{ partOfSpeech: "noun", definitions: [{ definition: "A feline." }, {}] }],
  },
];

test("parseDictionary extracts definitions and drops empties", () => {
  expect(parseDictionary(sample)).toEqual({
    word: "cat",
    phonetic: "/kæt/",
    meanings: [{ partOfSpeech: "noun", definitions: ["A feline."] }],
  });
  expect(parseDictionary({ title: "No Definitions Found" })).toBeNull();
});

test("lookup returns null on 404 and throws on server errors", async () => {
  const f = (status: number, body: unknown = sample) =>
    (async () => ({ status, ok: status < 400, json: async () => body })) as unknown as typeof fetch;
  expect(await lookup("zzz", f(404))).toBeNull();
  expect((await lookup("cat", f(200)))?.word).toBe("cat");
  await expect(lookup("cat", f(500))).rejects.toThrow();
});
