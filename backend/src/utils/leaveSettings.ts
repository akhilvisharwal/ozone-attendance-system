import type { LeaveCategoryConfig, LeaveSettings } from "../modules/settings/settings.types";

export function buildDefaultLeaveCategories(): LeaveCategoryConfig[] {
  return [
    { name: "Casual Leave (CL)", enabled: true, yearlyLimit: 6 },
    { name: "Sick Leave (SL)", enabled: true, yearlyLimit: 6 },
    { name: "Earned Leave (EL)", enabled: true, yearlyLimit: 12 },
    { name: "Annual Leave", enabled: true, yearlyLimit: 12 },
    { name: "Emergency Leave", enabled: true, yearlyLimit: 3 },
    { name: "Maternity Leave", enabled: false, yearlyLimit: 180 },
    { name: "Paternity Leave", enabled: false, yearlyLimit: 15 },
    { name: "Bereavement Leave", enabled: true, yearlyLimit: 5 },
    { name: "Marriage Leave", enabled: false, yearlyLimit: 5 },
    { name: "Compensatory Off (Comp Off)", enabled: true, yearlyLimit: 12 },
    { name: "Work From Home (WFH)", enabled: true, yearlyLimit: 24 },
    { name: "Unpaid Leave (LWP)", enabled: true, yearlyLimit: 365 },
    { name: "Official Duty", enabled: true, yearlyLimit: 365 },
    { name: "Training Leave", enabled: false, yearlyLimit: 10 },
    { name: "Other", enabled: true, yearlyLimit: 5 },
  ];
}

function legacyTypeEnabled(leaveTypes: string[], ...needles: string[]): boolean {
  return leaveTypes.some((type) => {
    const value = type.toLowerCase();
    return needles.some((needle) => value.includes(needle));
  });
}

export function normalizeLeaveSettings(raw: unknown): LeaveSettings {
  const base: LeaveSettings = {
    categories: buildDefaultLeaveCategories(),
    approvalRequired: true,
    halfDayAllowed: true,
  };

  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;

  if (Array.isArray(obj.categories) && obj.categories.length > 0) {
    const saved = obj.categories as LeaveCategoryConfig[];
    const merged = buildDefaultLeaveCategories().map((defaultCat) => {
      const match = saved.find((item) => item.name.toLowerCase() === defaultCat.name.toLowerCase());
      return match
        ? {
            name: defaultCat.name,
            enabled: Boolean(match.enabled),
            yearlyLimit: Math.max(0, Number(match.yearlyLimit ?? defaultCat.yearlyLimit)),
          }
        : defaultCat;
    });

    for (const item of saved) {
      if (!merged.some((cat) => cat.name.toLowerCase() === item.name.toLowerCase())) {
        merged.push({
          name: String(item.name),
          enabled: Boolean(item.enabled),
          yearlyLimit: Math.max(0, Number(item.yearlyLimit ?? 0)),
        });
      }
    }

    return {
      categories: merged,
      approvalRequired: obj.approvalRequired !== false,
      halfDayAllowed: obj.halfDayAllowed !== false,
    };
  }

  const leaveTypes = Array.isArray(obj.leaveTypes)
    ? obj.leaveTypes.map((type) => String(type))
    : ["Annual", "Sick", "Casual"];
  const annualLimit = Math.max(0, Number(obj.annualLimit ?? 12));
  const sickLimit = Math.max(0, Number(obj.sickLimit ?? 6));
  const casualLimit = Math.max(0, Number(obj.casualLimit ?? 6));

  const categories = buildDefaultLeaveCategories().map((cat) => {
    const name = cat.name.toLowerCase();
    if (name.includes("casual")) {
      return { ...cat, enabled: legacyTypeEnabled(leaveTypes, "casual"), yearlyLimit: casualLimit };
    }
    if (name.includes("sick")) {
      return { ...cat, enabled: legacyTypeEnabled(leaveTypes, "sick"), yearlyLimit: sickLimit };
    }
    if (name === "annual leave") {
      return { ...cat, enabled: legacyTypeEnabled(leaveTypes, "annual"), yearlyLimit: annualLimit };
    }
    if (name.includes("earned")) {
      return { ...cat, enabled: legacyTypeEnabled(leaveTypes, "earned", "annual"), yearlyLimit: annualLimit };
    }
    return { ...cat, enabled: false };
  });

  for (const type of leaveTypes) {
    const value = type.toLowerCase();
    const match = categories.find(
      (cat) =>
        cat.name.toLowerCase() === value ||
        cat.name.toLowerCase().includes(value) ||
        value.includes(cat.name.toLowerCase().split("(")[0].trim())
    );
    if (match) {
      match.enabled = true;
    } else {
      categories.push({ name: type, enabled: true, yearlyLimit: annualLimit });
    }
  }

  return {
    categories,
    approvalRequired: obj.approvalRequired !== false,
    halfDayAllowed: obj.halfDayAllowed !== false,
  };
}

export function getEnabledLeaveCategories(settings: LeaveSettings): LeaveCategoryConfig[] {
  return settings.categories.filter((cat) => cat.enabled);
}

export function findLeaveCategoryConfig(
  settings: LeaveSettings,
  category: string
): LeaveCategoryConfig | undefined {
  return settings.categories.find((cat) => cat.name.toLowerCase() === category.toLowerCase());
}

export function categoryMatches(configName: string, storedCategory: string): boolean {
  const config = configName.toLowerCase();
  const stored = storedCategory.toLowerCase();
  if (config === stored) return true;

  const configRoot = config.split("(")[0]?.trim() ?? config;
  if (stored === configRoot) return true;
  if (stored.includes(configRoot) || configRoot.includes(stored)) return true;

  if (config.includes("annual") && (stored === "annual" || stored.includes("annual"))) return true;
  if (config.includes("sick") && (stored === "sick" || stored.includes("sick"))) return true;
  if (config.includes("casual") && (stored === "casual" || stored.includes("casual"))) return true;
  if (config.includes("earned") && (stored.includes("earned") || stored === "annual")) return true;

  return false;
}

export function getCategoryMatchValues(categoryName: string): string[] {
  const values = new Set<string>([categoryName]);
  const lower = categoryName.toLowerCase();

  if (lower.includes("annual")) {
    values.add("Annual");
    values.add("Annual Leave");
  }
  if (lower.includes("sick")) {
    values.add("Sick");
    values.add("Sick Leave");
    values.add("Sick Leave (SL)");
  }
  if (lower.includes("casual")) {
    values.add("Casual");
    values.add("Casual Leave");
    values.add("Casual Leave (CL)");
  }
  if (lower.includes("earned")) {
    values.add("Earned Leave");
    values.add("Earned Leave (EL)");
  }

  return [...values];
}
