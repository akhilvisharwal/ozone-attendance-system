import { env } from "../../config/env";
import { StorageDriver } from "./StorageDriver";
import { LocalStorageDriver } from "./localStorage";

/**
 * Storage driver is chosen based on STORAGE_DRIVER env var.
 * Swap in an S3Driver (implementing the same StorageDriver interface) here
 * when moving to cloud storage — no other code needs to change.
 */
function createStorageDriver(): StorageDriver {
  switch (env.storageDriver) {
    case "local":
    default:
      return new LocalStorageDriver();
  }
}

export const storage = createStorageDriver();
export type { StorageDriver, SavedFile } from "./StorageDriver";
