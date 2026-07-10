import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { decodeJwtExpiryMs } from "@/utils/jwt";

let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

const TOKEN_REFRESH_LEAD_MS = 60_000;

/**
 * API origin for static assets (logos). Leave VITE_API_URL empty in production so
 * auth cookies stay first-party via the Vercel /api proxy (required for mobile Safari).
 */
export function getApiOrigin(): string {
  const configured = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, "");
  return configured || "";
}

/** True when API requests use same-origin /api (Vercel or Vite proxy). */
export function usesApiProxy(): boolean {
  return getApiOrigin() === "";
}

export function getApiBasePath(): string {
  const origin = getApiOrigin();
  return origin ? `${origin}/api` : "/api";
}

/** Build a URL for backend-hosted static assets (e.g. company logo). */
export function getStaticAssetUrl(relativePath: string): string {
  const normalized = relativePath.replace(/^\/+/, "");
  const origin = getApiOrigin();
  return origin ? `${origin}/${normalized}` : `/${normalized}`;
}

function clearRefreshTimer() {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

function scheduleProactiveRefresh(token: string) {
  clearRefreshTimer();
  const expiryMs = decodeJwtExpiryMs(token);
  if (!expiryMs) return;

  const delay = Math.max(0, expiryMs - Date.now() - TOKEN_REFRESH_LEAD_MS);
  refreshTimer = setTimeout(() => {
    void refreshAccessToken();
  }, delay);
}

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (token) {
    scheduleProactiveRefresh(token);
  } else {
    clearRefreshTimer();
  }
}

export function getAccessToken() {
  return accessToken;
}

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

export const apiClient = axios.create({
  baseURL: getApiBasePath(),
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${getApiBasePath()}/auth/refresh`, {}, { withCredentials: true })
      .then((res) => {
        const token = res.data.accessToken as string;
        setAccessToken(token);
        return token;
      })
      .catch(() => {
        setAccessToken(null);
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export function isNetworkError(error: unknown): boolean {
  return axios.isAxiosError(error) && !error.response;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;

    const url = originalRequest?.url ?? "";
    const isAuthRoute =
      url.includes("/auth/login") ||
      url.includes("/auth/refresh") ||
      url.includes("/auth/heartbeat");
    // Admin password change returns 401 for wrong current password — do not treat as session expiry.
    const isStepUpAuth = url.includes("/security/change-password");

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isAuthRoute &&
      !isStepUpAuth
    ) {
      originalRequest._retry = true;
      const newToken = await refreshAccessToken();
      if (newToken) {
        originalRequest.headers = originalRequest.headers ?? {};
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      }
      onUnauthorized?.();
    }

    return Promise.reject(error);
  }
);

export function extractErrorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return "Cannot reach the server. Check your connection and try again.";
    }
    if (error.response.status === 429) {
      return (
        (error.response?.data as { error?: { message?: string } } | undefined)?.error?.message ??
        "Too many login attempts. Please wait 15 minutes and try again."
      );
    }
    const message = readApiErrorMessage(error.response.data);
    if (message) return message;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

async function parseBlobErrorMessage(data: unknown): Promise<string | null> {
  if (!(data instanceof Blob)) return null;
  if (data.type && !data.type.includes("json") && data.size > 0) return null;
  try {
    const text = await data.text();
    if (!text.trim()) return null;
    const parsed = JSON.parse(text) as { error?: { message?: string }; message?: string };
    return parsed.error?.message ?? parsed.message ?? null;
  } catch {
    return null;
  }
}

function readApiErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const payload = data as { error?: { message?: string }; message?: string };
  return payload.error?.message ?? payload.message ?? null;
}

/** Parse API error bodies returned as blobs (file download endpoints). */
export async function extractBlobErrorMessage(error: unknown): Promise<string | null> {
  if (!axios.isAxiosError(error) || !error.response) return null;
  const fromJson = readApiErrorMessage(error.response.data);
  if (fromJson) return fromJson;
  return parseBlobErrorMessage(error.response.data);
}

export async function fetchSecureFileUrl(relativePath: string): Promise<string> {
  const response = await apiClient.get(`/files/${relativePath}`, { responseType: "blob" });
  return URL.createObjectURL(response.data as Blob);
}
