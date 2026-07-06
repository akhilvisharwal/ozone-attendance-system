import fs from "fs";
import path from "path";
import { env } from "./env";
import { getSettings } from "../modules/settings/settings.cache";

interface BrandingJson {
  companyName: string;
  companyTagline: string;
  systemName: string;
}

const DEFAULTS: BrandingJson = {
  companyName: "Ozone Aircon",
  companyTagline: "HVAC Solutions",
  systemName: "Attendance Management System",
};

function loadBrandingJson(): BrandingJson {
  const candidates = [
    path.join(process.cwd(), "..", "branding", "branding.json"),
    path.join(process.cwd(), "branding", "branding.json"),
    path.join(__dirname, "..", "..", "..", "branding", "branding.json"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(candidate, "utf-8")) };
    }
  }
  return DEFAULTS;
}

const branding = loadBrandingJson();

/** Company name from DB settings, falling back to env / branding.json. */
export function getCompanyName(): string {
  try {
    const name = getSettings().company.name?.trim();
    if (name) return name;
  } catch {
    /* cache not ready */
  }
  return env.companyName || branding.companyName;
}

export const COMPANY_TAGLINE = branding.companyTagline;
export const SYSTEM_NAME = branding.systemName;

export function getAppTitle(): string {
  return `${getCompanyName()} | ${SYSTEM_NAME}`;
}

export function getLogoAlt(): string {
  return `${getCompanyName()} ${COMPANY_TAGLINE}`;
}

export function getDocumentCreator(): string {
  return `${getCompanyName()} ${SYSTEM_NAME}`;
}

/** @deprecated use getCompanyName() */
export const COMPANY_NAME = env.companyName || branding.companyName;
export const APP_TITLE = `${COMPANY_NAME} | ${SYSTEM_NAME}`;
export const LOGO_ALT = `${COMPANY_NAME} ${COMPANY_TAGLINE}`;
export const DOCUMENT_CREATOR = `${COMPANY_NAME} ${SYSTEM_NAME}`;
