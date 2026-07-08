import fs from "node:fs";
import path from "node:path";

import { env } from "../config/env";
import type { StorageProvider, StorageRange } from "./StorageProvider";

export class LocalDiskStorage implements StorageProvider {
  constructor(private readonly root: string = env.uploadsDir) {
    fs.mkdirSync(this.root, { recursive: true });
  }

  private resolve(key: string): string {
    const root = path.resolve(this.root);
    const resolved = path.resolve(root, key);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      throw new Error("Invalid storage key");
    }
    return resolved;
  }

  async save(key: string, data: Buffer): Promise<void> {
    const filePath = this.resolve(key);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, data);
  }

  getReadStream(key: string, range?: StorageRange) {
    return fs.createReadStream(this.resolve(key), range);
  }

  async getSize(key: string): Promise<number> {
    const stat = await fs.promises.stat(this.resolve(key));
    return stat.size;
  }

  async delete(key: string): Promise<void> {
    await fs.promises.rm(this.resolve(key), { force: true });
  }
}
