import { getSettings } from "../settings/settings.cache";
import type { AppSettings } from "../settings/settings.types";

export const DEFAULT_EXPENSE_CATEGORY_DEFS = [
  { key: "travel", label: "Travel", enabled: true },
  { key: "food", label: "Food", enabled: true },
  { key: "material", label: "Material", enabled: true },
  { key: "fuel", label: "Fuel", enabled: true },
  { key: "miscellaneous", label: "Miscellaneous", enabled: true },
  { key: "other", label: "Other", enabled: true },
] as const;

export const DEFAULT_EXPENSE_PAYMENT_METHOD_DEFS = [
  { key: "cash", label: "Cash", enabled: true },
  { key: "upi", label: "UPI", enabled: true },
  { key: "bank_transfer", label: "Bank Transfer", enabled: true },
  { key: "card", label: "Card", enabled: true },
  { key: "other", label: "Other", enabled: true },
] as const;

export interface ExpenseOptionDef {
  key: string;
  label: string;
  enabled: boolean;
}

export interface ExpenseSettings {
  cycles: { weekly: boolean; monthly: boolean; custom: boolean };
  categories: ExpenseOptionDef[];
  paymentMethods: ExpenseOptionDef[];
  maxAmountPerExpense: number;
  maxAmountPerRequest: number;
  requireReceiptAbove: number;
  autoArchivePaidDays: number;
  approvalRequired: boolean;
}

export function buildDefaultExpenseSettings(): ExpenseSettings {
  return {
    cycles: { weekly: true, monthly: true, custom: true },
    categories: DEFAULT_EXPENSE_CATEGORY_DEFS.map((item) => ({ ...item })),
    paymentMethods: DEFAULT_EXPENSE_PAYMENT_METHOD_DEFS.map((item) => ({ ...item })),
    maxAmountPerExpense: 100_000,
    maxAmountPerRequest: 500_000,
    requireReceiptAbove: 0,
    autoArchivePaidDays: 0,
    approvalRequired: true,
  };
}

function normalizeOptionList(
  raw: unknown,
  defaults: readonly ExpenseOptionDef[]
): ExpenseOptionDef[] {
  if (!Array.isArray(raw)) return defaults.map((item) => ({ ...item }));
  const map = new Map<string, ExpenseOptionDef>();
  for (const item of defaults) map.set(item.key, { ...item });
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const source = entry as Record<string, unknown>;
    const key = typeof source.key === "string" ? source.key.trim() : "";
    if (!key || !map.has(key)) continue;
    const base = map.get(key)!;
    map.set(key, {
      key,
      label: typeof source.label === "string" && source.label.trim() ? source.label.trim() : base.label,
      enabled: source.enabled === undefined ? base.enabled : Boolean(source.enabled),
    });
  }
  return Array.from(map.values());
}

export function normalizeExpenseSettings(raw: unknown): ExpenseSettings {
  const defaults = buildDefaultExpenseSettings();
  if (!raw || typeof raw !== "object") return defaults;
  const source = raw as Record<string, unknown>;
  const cyclesRaw = source.cycles as Record<string, unknown> | undefined;
  return {
    cycles: {
      weekly: cyclesRaw?.weekly === undefined ? defaults.cycles.weekly : Boolean(cyclesRaw.weekly),
      monthly: cyclesRaw?.monthly === undefined ? defaults.cycles.monthly : Boolean(cyclesRaw.monthly),
      custom: cyclesRaw?.custom === undefined ? defaults.cycles.custom : Boolean(cyclesRaw.custom),
    },
    categories: normalizeOptionList(source.categories, defaults.categories),
    paymentMethods: normalizeOptionList(source.paymentMethods, defaults.paymentMethods),
    maxAmountPerExpense:
      typeof source.maxAmountPerExpense === "number" && source.maxAmountPerExpense > 0
        ? source.maxAmountPerExpense
        : defaults.maxAmountPerExpense,
    maxAmountPerRequest:
      typeof source.maxAmountPerRequest === "number" && source.maxAmountPerRequest > 0
        ? source.maxAmountPerRequest
        : defaults.maxAmountPerRequest,
    requireReceiptAbove:
      typeof source.requireReceiptAbove === "number" && source.requireReceiptAbove >= 0
        ? source.requireReceiptAbove
        : defaults.requireReceiptAbove,
    autoArchivePaidDays:
      typeof source.autoArchivePaidDays === "number" && source.autoArchivePaidDays >= 0
        ? Math.floor(source.autoArchivePaidDays)
        : defaults.autoArchivePaidDays,
    approvalRequired:
      source.approvalRequired === undefined ? defaults.approvalRequired : Boolean(source.approvalRequired),
  };
}

export function getExpenseSettings(): ExpenseSettings {
  const settings = getSettings() as AppSettings & { expenses?: unknown };
  return normalizeExpenseSettings(settings.expenses);
}

export function enabledCategoryKeys(settings: ExpenseSettings): string[] {
  return settings.categories.filter((item) => item.enabled).map((item) => item.key);
}

export function enabledPaymentMethodKeys(settings: ExpenseSettings): string[] {
  return settings.paymentMethods.filter((item) => item.enabled).map((item) => item.key);
}
