import type { Readable } from "node:stream";

export interface StorageRange {
  start: number;
  end: number;
}

export interface StorageProvider {
  save(key: string, data: Buffer): Promise<void>;
  getReadStream(key: string, range?: StorageRange): Readable;
  getSize(key: string): Promise<number>;
  delete(key: string): Promise<void>;
}
