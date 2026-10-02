export interface Definition {
  word: string;
  phonetic?: string;
  meanings: { partOfSpeech: string; definitions: string[] }[];
}

interface RawEntry {
  word?: string;
  phonetic?: string;
  meanings?: { partOfSpeech?: string; definitions?: { definition?: string }[] }[];
}

export function parseDictionary(raw: unknown): Definition | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const entry = raw[0] as RawEntry;
  const meanings = (entry.meanings ?? [])
    .map((m) => ({
      partOfSpeech: m.partOfSpeech ?? "",
      definitions: (m.definitions ?? [])
        .map((d) => d.definition ?? "")
        .filter(Boolean)
        .slice(0, 3),
    }))
    .filter((m) => m.definitions.length > 0);
  if (!entry.word || meanings.length === 0) return null;
  return { word: entry.word, phonetic: entry.phonetic, meanings };
}

export async function lookup(
  word: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Definition | null> {
  const res = await fetchImpl(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Dictionary unavailable");
  return parseDictionary(await res.json());
}
