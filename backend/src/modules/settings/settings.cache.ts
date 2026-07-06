import {
  AppSettings,
  SettingsCategory,
  buildDefaultSettings,
} from "./settings.types";
import * as repo from "./settings.repository";

let cached: AppSettings | null = null;

export async function initSettingsCache(): Promise<AppSettings> {
  await repo.seedSettingsIfEmpty();
  cached = await repo.getMergedSettings();
  return cached;
}

export async function refreshSettingsCache(): Promise<AppSettings> {
  cached = await repo.getMergedSettings();
  return cached;
}

export function getSettings(): AppSettings {
  return cached ?? buildDefaultSettings();
}

export async function updateCategory<C extends SettingsCategory>(
  category: C,
  value: AppSettings[C],
  updatedBy: string
): Promise<AppSettings> {
  await repo.updateSettingsCategory(category, value, updatedBy);
  return refreshSettingsCache();
}
