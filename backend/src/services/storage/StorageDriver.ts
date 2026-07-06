export interface SavedFile {
  /** Relative path used for internal lookups / access control (e.g. selfies/OZN001/uuid.jpg) */
  relativePath: string;
}

export interface StorageDriver {
  /**
   * Persists a file buffer under the given subfolder and returns the relative
   * path that should be stored in the database. Implementations may later be
   * swapped for cloud providers (S3, GCS, Azure Blob) without touching callers.
   */
  save(buffer: Buffer, originalName: string, subfolder: string): Promise<SavedFile>;

  /** Reads back a previously saved file, or null if it does not exist. */
  read(relativePath: string): Promise<Buffer | null>;

  /** Removes a previously saved file. Safe to call on missing files. */
  remove(relativePath: string): Promise<void>;
}
