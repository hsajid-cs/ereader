import JSZip from "jszip";

export interface EpubMeta {
  title?: string;
  author?: string;
  cover?: { data: Buffer; ext: "jpg" | "png" | "gif" | "webp"; contentType: string };
}

const IMAGE_TYPES: Record<string, { ext: "jpg" | "png" | "gif" | "webp"; contentType: string }> = {
  jpg: { ext: "jpg", contentType: "image/jpeg" },
  jpeg: { ext: "jpg", contentType: "image/jpeg" },
  png: { ext: "png", contentType: "image/png" },
  gif: { ext: "gif", contentType: "image/gif" },
  webp: { ext: "webp", contentType: "image/webp" },
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decode(s: string): string {
  return s
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code =
          e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function attr(tag: string, name: string): string | undefined {
  return new RegExp(`(?:^|\\s)${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(tag)?.[1];
}

function textOf(xml: string, tag: string): string | undefined {
  const m = new RegExp(`<(?:dc:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:dc:)?${tag}>`, "i").exec(xml);
  const value = m ? decode(m[1].replace(/<[^>]+>/g, "")) : "";
  return value || undefined;
}

function resolve(base: string, rel: string): string {
  const out: string[] = [];
  for (const part of (base ? base.split("/") : []).concat(
    decodeURIComponent(rel.split("#")[0]).split("/"),
  )) {
    if (part === "..") out.pop();
    else if (part && part !== ".") out.push(part);
  }
  return out.join("/");
}

/** Reads title, author and cover image from an EPUB. Never throws: bad files yield an empty result. */
export async function readEpubMeta(buffer: Buffer): Promise<EpubMeta> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const container = await zip.file("META-INF/container.xml")?.async("string");
    const opfPath = container && attr(/<rootfile\s[^>]*>/i.exec(container)?.[0] ?? "", "full-path");
    if (!opfPath) return {};
    const opf = await zip.file(opfPath)?.async("string");
    if (!opf) return {};
    const baseDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/")) : "";

    const meta: EpubMeta = { title: textOf(opf, "title"), author: textOf(opf, "creator") };

    const items = (opf.match(/<item\s[^>]*>/gi) ?? []).map((tag) => ({
      id: attr(tag, "id"),
      href: attr(tag, "href"),
      type: attr(tag, "media-type"),
      props: attr(tag, "properties") ?? "",
    }));
    const isImage = (i: (typeof items)[number]) =>
      !!i.href && (i.type?.startsWith("image/") ?? /\.(jpe?g|png|gif|webp)$/i.test(i.href));

    const coverId = /<meta\s[^>]*name\s*=\s*["']cover["'][^>]*>/i.exec(opf)?.[0];
    const coverIdValue = coverId ? attr(coverId, "content") : undefined;
    const item =
      items.find((i) => i.props.split(/\s+/).includes("cover-image") && isImage(i)) ??
      items.find((i) => i.id === coverIdValue && isImage(i)) ??
      items.find((i) => isImage(i) && /cover/i.test(`${i.id} ${i.href}`));

    if (item?.href) {
      const data = await zip.file(resolve(baseDir, item.href))?.async("nodebuffer");
      const type = IMAGE_TYPES[item.href.split(".").pop()?.toLowerCase() ?? ""];
      if (data && type) meta.cover = { data, ...type };
    }
    return meta;
  } catch {
    return {};
  }
}
