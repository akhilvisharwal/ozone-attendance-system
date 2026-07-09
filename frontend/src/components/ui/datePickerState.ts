let activeClose: (() => void) | null = null;

/** Ensures only one date picker popup is open at a time. */
export function claimDatePickerOpen(close: () => void): void {
  if (activeClose && activeClose !== close) {
    activeClose();
  }
  activeClose = close;
}

export function releaseDatePickerOpen(close: () => void): void {
  if (activeClose === close) {
    activeClose = null;
  }
}
