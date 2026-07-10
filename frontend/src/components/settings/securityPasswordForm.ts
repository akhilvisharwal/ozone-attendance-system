export type PasswordFormState = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export function emptyPasswordForm(): PasswordFormState {
  return { currentPassword: "", newPassword: "", confirmPassword: "" };
}

/** Current password must never be sourced from settings, storage, or API data. */
export function blankCurrentPassword(form: PasswordFormState): PasswordFormState {
  return { ...form, currentPassword: "" };
}

/**
 * After a successful password change, clear the new-password fields.
 * Current password is also reset to blank — it is never persisted or pre-filled.
 */
export function clearPasswordFieldsAfterSuccess(): PasswordFormState {
  return {
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  };
}

export function validatePasswordForm(
  form: PasswordFormState
): Partial<Record<keyof PasswordFormState, string>> {
  const nextErrors: Partial<Record<keyof PasswordFormState, string>> = {};
  if (!form.currentPassword.trim()) {
    nextErrors.currentPassword = "Current password is required.";
  }
  if (!form.newPassword.trim()) {
    nextErrors.newPassword = "New password is required.";
  }
  if (!form.confirmPassword.trim()) {
    nextErrors.confirmPassword = "Please confirm the new password.";
  } else if (form.newPassword !== form.confirmPassword) {
    nextErrors.confirmPassword = "New password and confirmation do not match.";
  }
  return nextErrors;
}

/** Input attributes that discourage browser/password-manager autofill. */
export const ADMIN_CURRENT_PASSWORD_FIELD = {
  id: "admin-change-current-password",
  name: "admin-change-current-password",
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
  "data-lpignore": "true",
  "data-1p-ignore": "true",
} as const;

export const ADMIN_NEW_PASSWORD_FIELD = {
  id: "admin-change-new-password",
  name: "admin-change-new-password",
  autoComplete: "new-password",
} as const;

export const ADMIN_CONFIRM_PASSWORD_FIELD = {
  id: "admin-change-confirm-password",
  name: "admin-change-confirm-password",
  autoComplete: "new-password",
} as const;
