import type { MobileSettings } from "@/types/settings";

const MOBILE_UA_PATTERN =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i;

export function isMobileUserAgent(userAgent = navigator.userAgent): boolean {
  return MOBILE_UA_PATTERN.test(userAgent);
}

export function isDesktopClient(userAgent = navigator.userAgent): boolean {
  return !isMobileUserAgent(userAgent);
}

export function desktopCheckInBlocked(mobile: MobileSettings | undefined): boolean {
  return Boolean(mobile && !mobile.allowDesktopCheckIn && isDesktopClient());
}

export const OFFLINE_BLOCKED_MESSAGE =
  "You are offline. Connect to the internet to mark attendance, or ask your administrator to enable offline mode.";

export function offlineCheckInBlocked(mobile: MobileSettings | undefined, online = navigator.onLine): boolean {
  return !online && !(mobile?.allowOfflineMode ?? false);
}
