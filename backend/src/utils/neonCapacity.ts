import { env } from "../config/env";

const NEON_API_BASE = "https://console.neon.tech/api/v2";
const NEON_API_TIMEOUT_MS = 5000;

export interface NeonStorageInfo {
  /**
   * Neon's "synthetic storage size" for the project, in bytes — the figure the Neon
   * console shows as **Storage** on the project dashboard and meters against the plan.
   *
   * Per Neon's API docs this "combines the logical data size and Write-Ahead Log (WAL)
   * size for all branches in a project", which is why it reads higher than
   * pg_database_size(). Always use this for the headline used/capacity math.
   */
  syntheticStorageBytes: number;
}

/** Subset of Neon's project object that we depend on. */
interface NeonProject {
  synthetic_storage_size?: number;
}

/**
 * Reasons we've already warned about, so a repeatedly-loaded settings panel doesn't
 * spam the logs with the same failure line on every refresh.
 */
const warnedReasons = new Set<string>();

function warnOnce(reason: string, detail?: unknown): void {
  if (warnedReasons.has(reason)) return;
  warnedReasons.add(reason);
  // Surfaced at warn level on purpose: without it, a failed Neon lookup silently
  // degrades to pg_database_size() and the panel quietly shows the wrong number.
  console.warn(
    `[neonCapacity] Falling back to pg_database_size(): ${reason}`,
    detail === undefined ? "" : detail
  );
}

/**
 * Fetch the real storage Neon meters and shows in its console for this project.
 *
 * Returns null when NEON_API_KEY/NEON_PROJECT_ID are not configured or the lookup
 * fails for any reason — callers must fall back to pg_database_size(). Every null
 * return path logs once so a silent fallback is diagnosable in production.
 */
export async function fetchNeonStorageInfo(): Promise<NeonStorageInfo | null> {
  const apiKey = env.neonApiKey.trim();
  const projectId = env.neonProjectId.trim();
  // Not configured at all is the normal non-Neon case — stay quiet.
  if (!apiKey || !projectId) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NEON_API_TIMEOUT_MS);
  try {
    const res = await fetch(`${NEON_API_BASE}/projects/${encodeURIComponent(projectId)}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      warnOnce(
        `Neon API returned HTTP ${res.status} for project ${projectId}` +
          (res.status === 401 || res.status === 403
            ? " (check NEON_API_KEY is valid and has access to this project)"
            : ""),
        await res.text().catch(() => "")
      );
      return null;
    }

    const payload = (await res.json()) as { project?: NeonProject } | null;
    const syntheticStorageBytes = payload?.project?.synthetic_storage_size;

    if (typeof syntheticStorageBytes !== "number" || !Number.isFinite(syntheticStorageBytes)) {
      warnOnce(
        "Neon API response did not contain a numeric project.synthetic_storage_size",
        payload
      );
      return null;
    }

    return { syntheticStorageBytes };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    warnOnce(
      aborted
        ? `Neon API request timed out after ${NEON_API_TIMEOUT_MS}ms`
        : "Neon API request failed",
      error instanceof Error ? error.message : error
    );
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Test seam — lets tests reset the warn-once state between cases. */
export function __resetNeonWarnCacheForTests(): void {
  warnedReasons.clear();
}
