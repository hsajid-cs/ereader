// Web test harness only: in-memory stand-in for the parts of expo-file-system the app uses.
const files = new Map<string, Uint8Array>();
const dirs = new Set<string>();

const join = (...parts: (string | { uri: string })[]) =>
  parts
    .map((p) => (typeof p === "string" ? p : p.uri))
    .join("/")
    .replace(/\/+/g, "/");

export class Directory {
  uri: string;
  constructor(...parts: (string | { uri: string })[]) {
    this.uri = join(...parts);
  }
  get exists() {
    return dirs.has(this.uri);
  }
  create() {
    dirs.add(this.uri);
  }
}

export class File {
  uri: string;
  constructor(...parts: (string | { uri: string })[]) {
    this.uri = join(...parts);
  }
  get exists() {
    return files.has(this.uri);
  }
  create() {
    if (!files.has(this.uri)) files.set(this.uri, new Uint8Array());
  }
  write(data: string | Uint8Array) {
    files.set(this.uri, typeof data === "string" ? new TextEncoder().encode(data) : data);
  }
  async bytes() {
    return files.get(this.uri) ?? new Uint8Array();
  }
  async text() {
    return new TextDecoder().decode(files.get(this.uri) ?? new Uint8Array());
  }
  delete() {
    files.delete(this.uri);
  }
}

export const Paths = { document: new Directory("mem:/documents") };
