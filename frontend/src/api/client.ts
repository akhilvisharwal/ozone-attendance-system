import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { decodeJwtExpiryMs } from "@/utils/jwt";

let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

const TOKEN_REFRESH_LEAD_MS = 60_000;

/** In production (Vercel), set VITE_API_URL to the backend origin. Dev uses Vite proxy. */
export function getApiOrigin(): string {
  const configured = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, "");
  return configured || "";
}

export function getApiBasePath(): string {
  const origin = getApiOrigin();
  return origin ? `${origin}/api` : "/api";
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
      return "Cannot reach the server. Your session is still active — we'll reconnect automatically when you're back online.";
    }
    const message = (error.response?.data as { error?: { message?: string } } | undefined)?.error?.message;
    if (message) return message;
  }
  return fallback;
}

export async function fetchSecureFileUrl(relativePath: string): Promise<string> {
  const response = await apiClient.get(`/files/${relativePath}`, { responseType: "blob" });
  return URL.createObjectURL(response.data as Blob);
}
