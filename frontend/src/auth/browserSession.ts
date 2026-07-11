const BROWSER_SESSION_KEY = "ozone.auth.browserSession";

/** Marks this browser tab session as having an authenticated user (not auth proof — backend still verifies). */
export function markBrowserSession(): void {
  sessionStorage.setItem(BROWSER_SESSION_KEY, "1");
}

export function hasBrowserSession(): boolean {
  return sessionStorage.getItem(BROWSER_SESSION_KEY) === "1";
}

export function clearBrowserSession(): void {
  sessionStorage.removeItem(BROWSER_SESSION_KEY);
}
