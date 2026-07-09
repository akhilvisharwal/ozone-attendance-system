/** Broadcast when employee codes change (e.g. ID prefix migration) so list UIs reload. */
export const EMPLOYEE_CODES_CHANGED_EVENT = "ozone:employee-codes-changed";

export function notifyEmployeeCodesChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EMPLOYEE_CODES_CHANGED_EVENT));
}
