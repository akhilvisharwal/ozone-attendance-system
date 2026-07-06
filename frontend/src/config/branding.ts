import branding from "@branding/branding.json";
import logoUrl from "@branding/logo.png";

export const COMPANY_NAME = branding.companyName;
export const COMPANY_TAGLINE = branding.companyTagline;
export const SYSTEM_NAME = branding.systemName;
export const APP_TITLE = `${COMPANY_NAME} | ${SYSTEM_NAME}`;
export const LOGO_ALT = `${COMPANY_NAME} ${COMPANY_TAGLINE}`;

export const ADMIN_DASHBOARD_PATH = "/admin";
export const EMPLOYEE_DASHBOARD_PATH = "/";

/** Bundled logo URL — sourced from `branding/logo.png` at the repo root. */
export const LOGO_SRC = logoUrl;

/** Fixed logo dimensions (px) — used app-wide. */
export const LOGO_WIDTH_PX = 165;
export const LOGO_HEIGHT_PX = 40;

/** Width / height of branding/logo.png — update if the logo file changes. */
export const LOGO_ASPECT_RATIO = LOGO_WIDTH_PX / LOGO_HEIGHT_PX;
