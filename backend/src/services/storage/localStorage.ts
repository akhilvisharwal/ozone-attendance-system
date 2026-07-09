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

  async renameDirectory(fromRelative: string, toRelative: string): Promise<void> {
    const fromPath = this.resolveSafe(fromRelative);
    const toPath = this.resolveSafe(toRelative);
    if (!fromPath || !toPath || fromPath === toPath) return;

    try {
      await fs.promises.access(fromPath);
    } catch {
      return;
    }

    await fs.promises.mkdir(path.dirname(toPath), { recursive: true });

    try {
      await fs.promises.rename(fromPath, toPath);
      return;
    } catch {
      // Destination may already exist — merge contents then remove source.
    }

    await fs.promises.mkdir(toPath, { recursive: true });
    const entries = await fs.promises.readdir(fromPath, { withFileTypes: true });
    for (const entry of entries) {
      const src = path.join(fromPath, entry.name);
      const dest = path.join(toPath, entry.name);
      if (entry.isDirectory()) {
        await this.renameDirectory(
          path.posix.join(fromRelative, entry.name),
          path.posix.join(toRelative, entry.name)
        );
      } else {
        try {
          await fs.promises.rename(src, dest);
        } catch {
          await fs.promises.copyFile(src, dest);
          await fs.promises.unlink(src);
        }
      }
    }
    try {
      await fs.promises.rmdir(fromPath);
    } catch {
      // ignore non-empty / missing
    }
  }

  /** Prevents path traversal outside the uploads root. */
  private resolveSafe(relativePath: string): string | null {
    const fullPath = path.join(ROOT, relativePath);
    if (!fullPath.startsWith(ROOT)) return null;
    return fullPath;
  }
}
