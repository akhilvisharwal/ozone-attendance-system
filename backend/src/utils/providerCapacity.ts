import { env } from "../config/env";
import {
  gbToBytes,
  parseStorageLimitBytes,
  type ResolvedCapacity,
} from "./storageCapacity";

/**
 * Automatic database storage capacity detection.
 *
 * Priority (only real, verifiable values — never a hardcoded guess):
 *   1. Hosting provider API (Render Postgres `diskSizeGB`).
 *   2. DATABASE_STORAGE_LIMIT environment variable.
 *   3. Unavailable — the value cannot be determined automatically.
 *
 * The resolved value is cached briefly to avoid calling the provider API on every
 * panel load. The live database size is always measured fresh by the caller.
 */

const CAPACITY_TTL_MS = 5 * 60 * 1000;
const RENDER_API_TIMEOUT_MS = 5000;

let cache: { value: ResolvedCapacity; expiresAt: number } | null = null;

/** Reset the cached capacity (used by tests). */
export function clearProviderCapacityCache(): void {
  cache = null;
}

/**
 * Resolve the Render Postgres instance id. Prefers the explicit RENDER_POSTGRES_ID
 * env var, otherwise parses the `dpg-...` id from the DATABASE_URL host.
 */
function resolveRenderPostgresId(): string | null {
  if (env.renderPostgresId.trim()) return env.renderPostgresId.trim();
  try {
    const host = new URL(env.databaseUrl).hostname;
    const match = /(dpg-[a-z0-9]+)/i.exec(host);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

interface RenderPostgresResponse {
  diskSizeGB?: number;
}

/** Fetch the allocated disk size (GB) from the Render API, or null if unavailable. */
async function fetchRenderDiskSizeGb(): Promise<number | null> {
  const apiKey = env.renderApiKey.trim();
  if (!apiKey) return null;

  const postgresId = resolveRenderPostgresId();
  if (!postgresId) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RENDER_API_TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.render.com/v1/postgres/${postgresId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as RenderPostgresResponse;
    const gb = data.diskSizeGB;
    return typeof gb === "number" && Number.isFinite(gb) && gb > 0 ? gb : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveUncached(): Promise<ResolvedCapacity> {
  // 1. Hosting provider (Render) automatic detection.
  const renderGb = await fetchRenderDiskSizeGb();
  if (renderGb != null) {
    return {
      maxBytes: gbToBytes(renderGb),
      limitSource: "provider",
      limitDescription: `Maximum storage detected automatically from Render (allocated Postgres disk size: ${renderGb} GB).`,
    };
  }

  // 2. Explicit environment override.
  const envBytes = parseStorageLimitBytes(env.databaseStorageLimit || null);
  if (envBytes != null) {
    return {
      maxBytes: envBytes,
      limitSource: "env",
      limitDescription:
        "Maximum storage is taken from the DATABASE_STORAGE_LIMIT environment variable.",
    };
  }

  // 3. Cannot be determined automatically — no estimate.
  return {
    maxBytes: null,
    limitSource: "unavailable",
    limitDescription:
      "Maximum storage capacity could not be determined automatically. The hosting provider does not expose a storage limit to this app, and DATABASE_STORAGE_LIMIT is not configured. Set RENDER_API_KEY (and RENDER_POSTGRES_ID if needed) to auto-detect, or DATABASE_STORAGE_LIMIT to set it explicitly.",
  };
}

/** Resolve the database storage capacity, using a short-lived cache. */
export async function resolveDatabaseCapacity(): Promise<ResolvedCapacity> {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.value;
  }
  const value = await resolveUncached();
  cache = { value, expiresAt: Date.now() + CAPACITY_TTL_MS };
  return value;
}
