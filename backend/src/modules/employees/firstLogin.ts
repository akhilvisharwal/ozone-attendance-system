/** True when the account still needs the one-time first-login password change screen. */
export function requiresFirstLoginPasswordChange(employee: {
  first_login_completed: boolean;
}): boolean {
  return !employee.first_login_completed;
}
