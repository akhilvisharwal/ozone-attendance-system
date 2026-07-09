/** Broadcast when employee roles change so all DesignationSelect instances reload. */
export const DESIGNATIONS_CHANGED_EVENT = "ozone:designations-changed";

export function notifyDesignationsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DESIGNATIONS_CHANGED_EVENT));
}
