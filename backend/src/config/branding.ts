import fs from "fs";
import path from "path";
import { env } from "./env";
import { getSettings } from "../modules/settings/settings.cache";
import { formatPhoneDisplay } from "../utils/phoneCountries";

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
  return env.companyName || branding.companyName;
}

export interface CompanyContactInfo {
  name: string;
  address: string;
  phone: string;
  phoneCountryCode: string;
  secondaryPhone: string;
  secondaryPhoneCountryCode: string;
  email: string;
  additionalEmails: string[];
}

export function getCompanyContactInfo(): CompanyContactInfo {
  try {
    const company = getSettings().company;
    return {
      name: getCompanyName(),
      address: company.address?.trim() ?? "",
      phone: company.phone?.trim() ?? "",
      phoneCountryCode: company.phoneCountryCode ?? "+91",
      secondaryPhone: company.secondaryPhone?.trim() ?? "",
      secondaryPhoneCountryCode: company.secondaryPhoneCountryCode ?? "+91",
      email: company.email?.trim() ?? "",
      additionalEmails: (company.additionalEmails ?? []).map((value) => value.trim()).filter(Boolean),
    };
  } catch {
    return {
      name: getCompanyName(),
      address: "",
      phone: "",
      phoneCountryCode: "+91",
      secondaryPhone: "",
      secondaryPhoneCountryCode: "+91",
      email: env.adminEmail,
      additionalEmails: [],
    };
  }
}

/** Single-line contact details for report headers and footers. */
export function formatCompanyContactLine(): string {
  const info = getCompanyContactInfo();
  const parts: string[] = [];
  if (info.address) parts.push(info.address);
  const phones = [
    formatPhoneDisplay(info.phoneCountryCode, info.phone),
    formatPhoneDisplay(info.secondaryPhoneCountryCode, info.secondaryPhone),
  ].filter(Boolean);
  if (phones.length) parts.push(phones.join(" · "));
  const emails = [info.email, ...info.additionalEmails].filter(Boolean);
  if (emails.length) parts.push(emails.join(" · "));
  return parts.join(" | ");
}

export function getAllCompanyEmails(): string[] {
  const info = getCompanyContactInfo();
  return [info.email, ...info.additionalEmails].filter(Boolean);
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
