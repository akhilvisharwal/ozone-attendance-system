import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { env } from "../../config/env";
import { SavedFile, StorageDriver } from "./StorageDriver";

const ROOT = path.join(process.cwd(), env.uploadDir);

function safeExt(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  const allowed = [".jpg", ".jpeg", ".png", ".webp"];
  return allowed.includes(ext) ? ext : ".jpg";
}

export class LocalStorageDriver implements StorageDriver {
  async save(buffer: Buffer, originalName: string, subfolder: string): Promise<SavedFile> {
    const dir = path.join(ROOT, subfolder);
    await fs.promises.mkdir(dir, { recursive: true });

    const filename = `${uuidv4()}${safeExt(originalName)}`;
    const fullPath = path.join(dir, filename);
    await fs.promises.writeFile(fullPath, buffer);

    const relativePath = path.posix.join(subfolder.split(path.sep).join("/"), filename);
    return { relativePath };
  }

  async read(relativePath: string): Promise<Buffer | null> {
    const fullPath = this.resolveSafe(relativePath);
    if (!fullPath) return null;
    try {
      return await fs.promises.readFile(fullPath);
    } catch {
      return null;
    }
  }

  async remove(relativePath: string): Promise<void> {
    const fullPath = this.resolveSafe(relativePath);
    if (!fullPath) return;
    try {
      await fs.promises.unlink(fullPath);
    } catch {
      // ignore missing files
    }
  }

  /** Prevents path traversal outside the uploads root. */
  private resolveSafe(relativePath: string): string | null {
    const fullPath = path.join(ROOT, relativePath);
    if (!fullPath.startsWith(ROOT)) return null;
    return fullPath;
  }
}
