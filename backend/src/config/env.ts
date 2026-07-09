import dotenv from "dotenv";

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function normalizeClientUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

const nodeEnv = process.env.NODE_ENV ?? "development";
const isProduction = nodeEnv === "production";
const jwtAccessSecret = required("JWT_ACCESS_SECRET");
const jwtRefreshSecret = required("JWT_REFRESH_SECRET");

if (isProduction) {
  const weakSecrets = [
    "change_this_access_secret_in_production",
    "change_this_refresh_secret_in_production",
  ];
  if (weakSecrets.includes(jwtAccessSecret) || weakSecrets.includes(jwtRefreshSecret)) {
    throw new Error(
      "JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be strong unique values in production"
    );
  }
  if (!process.env.CLIENT_URL?.trim()) {
    throw new Error("CLIENT_URL is required in production (your frontend origin, no trailing slash)");
  }
}

export const env = {
  port: parseInt(process.env.PORT ?? "4000", 10),
  nodeEnv,
  clientUrl: normalizeClientUrl(process.env.CLIENT_URL ?? "http://localhost:5173"),

  databaseUrl: required("DATABASE_URL"),
  /**
   * Optional explicit database plan limit (bytes or with unit suffix: MB/GB/TB).
   * Used only as a fallback when the hosting provider capacity cannot be detected
   * automatically. When unset and no provider capacity is available, the Database
   * panel reports the maximum as "Not available" instead of estimating.
   */
  databaseStorageLimit: process.env.DATABASE_STORAGE_LIMIT ?? "",
  /**
   * Render API key used to auto-detect the PostgreSQL plan's allocated disk size
   * via GET /v1/postgres/{id}. When unset, provider auto-detection is skipped.
   */
  renderApiKey: process.env.RENDER_API_KEY ?? "",
  /**
   * Optional Render Postgres instance id (e.g. "dpg-..."). When unset, it is parsed
   * from the DATABASE_URL host.
   */
  renderPostgresId: process.env.RENDER_POSTGRES_ID ?? "",

  jwtAccessSecret,
  jwtRefreshSecret,
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? "15m",
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? "7d",

  adminEmployeeId: process.env.ADMIN_EMPLOYEE_ID ?? "OZNADMIN",
  adminName: process.env.ADMIN_NAME ?? "System Administrator",
  adminEmail: process.env.ADMIN_EMAIL ?? "admin@ozoneaircon.com",
  adminPassword: process.env.ADMIN_PASSWORD ?? "ChangeMe@123",

  companyName: process.env.COMPANY_NAME ?? "Ozone Aircon",
  companyLogoPath: process.env.COMPANY_LOGO_PATH ?? "assets/logo.png",

  storageDriver: (process.env.STORAGE_DRIVER as "local" | "s3") ?? "local",
  uploadDir: process.env.UPLOAD_DIR ?? "uploads",
  maxUploadSizeMb: parseInt(process.env.MAX_UPLOAD_SIZE_MB ?? "8", 10),

  geocodeProvider: process.env.GEOCODE_PROVIDER ?? "google",
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? "",

  // Legacy dashboard "late arrival" cut-off — kept for backward compat
  officeStartTime: process.env.OFFICE_START_TIME ?? "09:30:00",
  timezone: process.env.TZ ?? "UTC",

  // Attendance timing rules (HH:MM, 24-hour, in the server timezone)
  checkinOpenTime:      process.env.CHECKIN_OPEN_TIME       ?? "09:45",   // before this → 'early'
  checkinOntimeEnd:     process.env.CHECKIN_ONTIME_END      ?? "10:07",   // on-time window end
  halfDayCutoff:        process.env.HALF_DAY_CUTOFF         ?? "11:30",   // at or after → half-day
  checkoutStandardTime: process.env.CHECKOUT_STANDARD_TIME  ?? "18:30",   // before → 'early' checkout

  isProduction,
  /** Enable SSL for managed Postgres (Neon, Render, Supabase, etc.) */
  databaseSsl:
    process.env.DATABASE_SSL === "true" ||
    (isProduction &&
      /neon\.tech|render\.com|supabase\.co|rds\.amazonaws/i.test(process.env.DATABASE_URL ?? "")),
};
