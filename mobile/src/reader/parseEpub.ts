import JSZip from "jszip";

import { normalizeParagraphs } from "./parseTxt";
import type { ParsedBook } from "./types";

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Converts XHTML into plain paragraphs; returns the text and the first heading found. */
export function htmlToText(html: string): { text: string; heading: string | null } {
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  const heading = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(body)?.[1];
  const stripped = body
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/(p|div|h[1-6]|li|blockquote|tr)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return {
    text: normalizeParagraphs(decodeEntities(stripped)),
    heading: heading
      ? decodeEntities(heading.replace(/<[^>]+>/g, ""))
          .replace(/\s+/g, " ")
          .trim()
      : null,
  };
}

function resolvePath(base: string, rel: string): string {
  const parts = (base ? base.split("/") : []).concat(
    decodeURIComponent(rel.split("#")[0]).split("/"),
  );
  const out: string[] = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else if (p && p !== ".") out.push(p);
  }
  return out.join("/");
}

function attr(tag: string, name: string): string | undefined {
  return new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(tag)?.[1];
}

export async function parseEpub(data: ArrayBuffer | Uint8Array): Promise<ParsedBook> {
  const zip = await JSZip.loadAsync(data);
  const container = await zip.file("META-INF/container.xml")?.async("string");
  const opfPath = container && attr(/<rootfile\s[^>]*>/i.exec(container)?.[0] ?? "", "full-path");
  if (!opfPath) throw new Error("Invalid EPUB: missing package document");

  const opf = await zip.file(opfPath)?.async("string");
  if (!opf) throw new Error("Invalid EPUB: package document not found");
  const baseDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/")) : "";

  const manifest = new Map<string, string>();
  for (const tag of opf.match(/<item\s[^>]*>/gi) ?? []) {
    const id = attr(tag, "id");
    const href = attr(tag, "href");
    if (id && href) manifest.set(id, href);
  }

  const chapters: ParsedBook["chapters"] = [];
  for (const ref of opf.match(/<itemref\s[^>]*>/gi) ?? []) {
    const href = manifest.get(attr(ref, "idref") ?? "");
    if (!href) continue;
    const html = await zip.file(resolvePath(baseDir, href))?.async("string");
    if (!html) continue;
    const { text, heading } = htmlToText(html);
    if (text.length < 2) continue;
    chapters.push({ title: heading ?? `Section ${chapters.length + 1}`, text });
  }
  if (chapters.length === 0) throw new Error("This EPUB has no readable text");
  return { chapters };
}
