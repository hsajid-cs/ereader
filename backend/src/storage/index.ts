import { LocalDiskStorage } from "./LocalDiskStorage";
import type { StorageProvider } from "./StorageProvider";

export const storage: StorageProvider = new LocalDiskStorage();
export type { StorageProvider };
