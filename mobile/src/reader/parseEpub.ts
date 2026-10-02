import JSZip from "jszip";

import { normalizeParagraphs } from "./parseTxt";
import { IMAGE_MARK, type ParsedBook } from "./types";

const MIN_IMAGE_BYTES = 4 * 1024; // smaller images are decorations (dividers, bullets)
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 30 * 1024 * 1024;
const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

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

const IMG_TAG_RE = /<(?:img|image)\b[^>]*>/gi;

function imageSrc(tag: string): string | undefined {
  return attr(tag, "src") ?? attr(tag, "xlink:href") ?? attr(tag, "href");
}

/** Image sources referenced by a chapter, in document order. */
export function imageSources(html: string): string[] {
  return (html.match(IMG_TAG_RE) ?? [])
    .map(imageSrc)
    .filter((s): s is string => !!s && !s.startsWith("data:"));
}

/**
 * Converts XHTML into plain paragraphs; returns the text and the first heading found.
 * `imageId` maps an <img> source to an image id (or null to drop it).
 */
export function htmlToText(
  html: string,
  imageId?: (src: string) => string | null,
): { text: string; heading: string | null } {
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  const heading = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(body)?.[1];
  const stripped = body
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(IMG_TAG_RE, (tag) => {
      const src = imageSrc(tag);
      const id = src && imageId ? imageId(src) : null;
      return id ? `\n\n${IMAGE_MARK}${id}${IMAGE_MARK}\n\n` : "";
    })
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

  const itemMime = new Map<string, string>();
  for (const tag of opf.match(/<item\s[^>]*>/gi) ?? []) {
    const href = attr(tag, "href");
    const type = attr(tag, "media-type");
    if (href && type) itemMime.set(resolvePath(baseDir, href), type);
  }

  const images: Record<string, string> = {};
  const idByPath = new Map<string, string | null>();
  let imageBytes = 0;

  async function registerImage(path: string): Promise<string | null> {
    if (idByPath.has(path)) return idByPath.get(path) ?? null;
    idByPath.set(path, null);
    const mime = itemMime.get(path) ?? MIME_BY_EXT[path.split(".").pop()?.toLowerCase() ?? ""];
    // SVG is not drawable by React Native's Image; skip it rather than show a broken box.
    if (!mime || !mime.startsWith("image/") || mime.includes("svg")) return null;
    const base64 = await zip.file(path)?.async("base64");
    if (!base64) return null;
    const bytes = Math.floor((base64.length * 3) / 4);
    if (
      bytes < MIN_IMAGE_BYTES ||
      bytes > MAX_IMAGE_BYTES ||
      imageBytes + bytes > MAX_TOTAL_IMAGE_BYTES
    )
      return null;
    imageBytes += bytes;
    const id = `img${Object.keys(images).length}`;
    images[id] = `data:${mime};base64,${base64}`;
    idByPath.set(path, id);
    return id;
  }

  const chapters: ParsedBook["chapters"] = [];
  for (const ref of opf.match(/<itemref\s[^>]*>/gi) ?? []) {
    const href = manifest.get(attr(ref, "idref") ?? "");
    if (!href) continue;
    const chapterPath = resolvePath(baseDir, href);
    const html = await zip.file(chapterPath)?.async("string");
    if (!html) continue;
    const chapterDir = chapterPath.includes("/")
      ? chapterPath.slice(0, chapterPath.lastIndexOf("/"))
      : "";
    for (const src of imageSources(html)) await registerImage(resolvePath(chapterDir, src));
    const { text, heading } = htmlToText(
      html,
      (src) => idByPath.get(resolvePath(chapterDir, src)) ?? null,
    );
    if (text.length < 2) continue;
    chapters.push({ title: heading ?? `Section ${chapters.length + 1}`, text });
  }
  if (chapters.length === 0) throw new Error("This EPUB has no readable text");
  return { chapters, images: Object.keys(images).length > 0 ? images : undefined };
}
